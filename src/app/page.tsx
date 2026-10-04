"use client";

import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {generateScenario,polylinePath,SCENARIO_PRESETS,terrainAt,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W} from "@/sim/game";
import {botControlledSides,createMatchConfig,defaultArmyGroups,localControlledSides} from "@/sim/session";
import {addStrategicStructure,advanceOpenWorld,buildStrategicCity,createOpenWorldState,queueRecruitment,UNIT_COST,type OpenWorldBuildKind,type OpenWorldState} from "@/sim/openworld";
import {closeMultiplayerRoom,createPrivateMatch,findQuickPlay,inviteUrl,joinPrivateMatch,supabase,type MultiplayerSession,type MultiplayerSnapshot,type UnitCommandPatch} from "@/lib/multiplayer";
import type {AttackPlan,CityState,ConstructionProject,Emplacement,EmplacementKind,FlagStyle,Formation,FormationShape,OrderType,OverlayMode,Scenario,Side,TerrainSample} from "@/sim/types";

const SPEED_MULTIPLIER=[0,1,2.5,6];
const SIM_HOURS_PER_REAL_SECOND=.75;
const MAX_FRAME_SECONDS=.12;
const SIM_TICK_MS=100;
const AI_COMMAND_INTERVAL_SECONDS=1.05;
const MOVEMENT_SCALE=4.2;
const RETREAT_SUPPLY_MIN=0;
const DIRECT_COMBAT_KINDS=new Set<Formation["kind"]>(["infantry","mechanized","armor","tank","cavalry","mountaineer","special_forces","recon","engineer"]);
const CAPTURE_KINDS=new Set<Formation["kind"]>(["infantry","mechanized","tank","cavalry","mountaineer","special_forces","engineer"]);
const ARTILLERY_KINDS=new Set<Formation["kind"]>(["mortar","artillery","heavy_artillery"]);
const GUN_ARTILLERY_KINDS=new Set<Formation["kind"]>(["artillery","heavy_artillery"]);
const MORTAR_BASE_RANGE=980;
const MORTAR_BASE_DISPERSION=170;
const MOTORIZED_KINDS=new Set<Formation["kind"]>(["armor","tank","mechanized","recon","logistics"]);

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}
function pct(v:number){return Math.round(clamp(v,0,100))}
function timeLabel(hour:number){
  const h=Math.floor(hour)%24;
  const m=Math.floor((hour-Math.floor(hour))*60);
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}

function segmentContact(ax:number,ay:number,bx:number,by:number,px:number,py:number){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  if(!len)return{distance:Math.hypot(px-ax,py-ay),t:0};
  const t=clamp(((px-ax)*dx+(py-ay)*dy)/len,0,1);
  return{distance:Math.hypot(px-(ax+t*dx),py-(ay+t*dy)),t};
}

function segmentsIntersect(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  const orient=(px:number,py:number,qx:number,qy:number,rx:number,ry:number)=>(qx-px)*(ry-py)-(qy-py)*(rx-px);
  const o1=orient(ax,ay,bx,by,cx,cy),o2=orient(ax,ay,bx,by,dx,dy),o3=orient(cx,cy,dx,dy,ax,ay),o4=orient(cx,cy,dx,dy,bx,by);
  return ((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0));
}

function structureSegmentDistance(s:{x:number;y:number;x2?:number;y2?:number},x:number,y:number){
  return s.x2===undefined||s.y2===undefined?Math.hypot(s.x-x,s.y-y):segmentContact(s.x,s.y,s.x2,s.y2,x,y).distance;
}

function isInCombat(u:Formation,units:Formation[]){
  return units.some(v=>v.side!==u.side&&DIRECT_COMBAT_KINDS.has(v.kind)&&Math.hypot(v.x-u.x,v.y-u.y)<58);
}

function retreatDestination(u:Formation,units:Formation[],cities:CityState[]){
  const city=cities.filter(c=>c.owner===u.side).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  if(city)return{x:city.x,y:city.y};
  const log=units.filter(v=>v.side===u.side&&v.kind==="logistics").sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  return log?{x:log.x,y:log.y}:{x:u.x,y:u.y};
}

function visionRange(u:Formation){
  return u.kind==="recon"?650+u.recon*4.6:300+u.recon*2.5;
}


function mortarTerrainProfile(terrain:TerrainSample["terrain"]){
  return {
    water:{dispersion:1.8,effect:.25},
    plains:{dispersion:1,effect:1},
    desert:{dispersion:.94,effect:1.06},
    forest:{dispersion:1.28,effect:.76},
    hills:{dispersion:1.16,effect:.84},
    mountain:{dispersion:1.34,effect:.7},
    highmountain:{dispersion:1.5,effect:.58},
    marsh:{dispersion:1.24,effect:.9},
    urban:{dispersion:1.3,effect:.72}
  }[terrain];
}

function mortarMaxRange(scenario:Scenario,u:Formation){
  const terrain=terrainAt(scenario,u.x,u.y).terrain;
  const terrainFactor=terrain==="mountain"?1.12:terrain==="hills"?1.08:terrain==="highmountain"?1.15:terrain==="forest"?.94:terrain==="marsh"?.92:1;
  return MORTAR_BASE_RANGE*terrainFactor;
}

function mortarDispersion(scenario:Scenario,x:number,y:number,rangeRatio=.5){
  const terrain=mortarTerrainProfile(terrainAt(scenario,x,y).terrain);
  return MORTAR_BASE_DISPERSION*terrain.dispersion*(.82+.42*clamp(rangeRatio,0,1));
}

function movementSupplyFactor(u:Formation){
  const s=clamp(u.supply/100,0,1);
  if(u.kind==="special_forces")return .9+.1*Math.sqrt(s);
  if(u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="engineer")return .72+.28*Math.sqrt(s);
  if(u.kind==="cavalry")return .62+.38*Math.sqrt(s);
  if(ARTILLERY_KINDS.has(u.kind))return .38+.62*s;
  if(MOTORIZED_KINDS.has(u.kind))return .42+.58*s;
  return .58+.42*s;
}

function nearestCityTo(point:{x:number;y:number},cities:CityState[]){
  return cities.map(c=>({c,d:Math.hypot(c.x-point.x,c.y-point.y)})).sort((a,b)=>a.d-b.d)[0]?.c;
}

function cityAtPoint(cities:CityState[],x:number,y:number,radius=105){
  return cities.map(c=>({c,d:Math.hypot(c.x-x,c.y-y)})).filter(v=>v.d<=radius).sort((a,b)=>a.d-b.d)[0]?.c;
}

type RoutePosition={distance:number;point:{x:number;y:number};segment:number;t:number;along:number;total:number};

function routePosition(route:{x:number;y:number}[],x:number,y:number):RoutePosition{
  let best:RoutePosition={distance:Infinity,point:{x,y},segment:0,t:0,along:0,total:0};
  let walked=0,total=0;
  const lengths:number[]=[];
  for(let i=0;i<route.length-1;i++){
    const len=Math.hypot(route[i+1].x-route[i].x,route[i+1].y-route[i].y);
    lengths.push(len);total+=len;
  }
  for(let i=0;i<route.length-1;i++){
    const hit=segmentContact(route[i].x,route[i].y,route[i+1].x,route[i+1].y,x,y);
    if(hit.distance<best.distance){
      best={distance:hit.distance,point:{x:route[i].x+(route[i+1].x-route[i].x)*hit.t,y:route[i].y+(route[i+1].y-route[i].y)*hit.t},segment:i,t:hit.t,along:walked+lengths[i]*hit.t,total};
    }
    walked+=lengths[i];
  }
  return best;
}

function routeDistance(route:{x:number;y:number}[],x:number,y:number){
  return routePosition(route,x,y).distance;
}

function dedupeRoutePoints(points:Array<{x:number;y:number}>){
  const out:Array<{x:number;y:number}>=[];
  for(const point of points){
    const last=out[out.length-1];
    if(!last||Math.hypot(last.x-point.x,last.y-point.y)>2)out.push(point);
  }
  return out;
}

function roadControlPower(u:Formation){
  const role=u.kind==="tank"||u.kind==="armor"||u.kind==="mechanized"?1.2
    :u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="special_forces"||u.kind==="engineer"?1
    :u.kind==="cavalry"||u.kind==="recon"?.82:.45;
  return role*(u.strength/100)*(u.organization/100)*(.45+u.readiness/180)*(.5+u.supply/200);
}

type RoadCutPoint={x:number;y:number;along:number;pressure:number};

function routeInterdictionPoints(route:{x:number;y:number}[],side:Side,units:Formation[]):RoadCutPoint[]{
  const cuts:RoadCutPoint[]=[];
  for(const hostile of units){
    if(hostile.side===side||!DIRECT_COMBAT_KINDS.has(hostile.kind)||hostile.strength<=18||hostile.organization<=20)continue;
    const pos=routePosition(route,hostile.x,hostile.y);
    if(pos.distance>58)continue;
    let hostilePower=0,friendlyPower=0;
    for(const unit of units){
      if(!DIRECT_COMBAT_KINDS.has(unit.kind)||unit.strength<=8||Math.hypot(unit.x-hostile.x,unit.y-hostile.y)>125)continue;
      if(unit.side===side)friendlyPower+=roadControlPower(unit);
      else hostilePower+=roadControlPower(unit);
    }
    const pressure=hostilePower-Math.max(.15,friendlyPower*1.08);
    if(pressure<=.05)continue;
    const existing=cuts.find(c=>Math.abs(c.along-pos.along)<135);
    if(existing){if(pressure>existing.pressure){existing.x=pos.point.x;existing.y=pos.point.y;existing.along=pos.along;existing.pressure=pressure}}
    else cuts.push({x:pos.point.x,y:pos.point.y,along:pos.along,pressure});
  }
  return cuts.sort((a,b)=>a.along-b.along);
}

function routeCutForSide(route:{x:number;y:number}[],side:Side,units:Formation[]){
  return routeInterdictionPoints(route,side,units).length>0;
}

function roadMovementBonus(u:Formation){
  if(ARTILLERY_KINDS.has(u.kind))return 2.5;
  if(u.kind==="logistics")return 2.05;
  if(u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"||u.kind==="recon")return 1.8;
  if(u.kind==="cavalry")return 1.45;
  return 1.55;
}

function movementTerrainFactor(u:Formation,terrain:TerrainSample["terrain"]){
  const base=TERRAIN_RULES[terrain].move;
  if(terrain==="highmountain"&&u.kind==="mountaineer")return .78;
  if(u.kind==="mountaineer"&&(terrain==="mountain"||terrain==="hills"))return base*1.45;
  if(u.kind==="cavalry"&&(terrain==="plains"||terrain==="desert"))return base*1.28;
  return base;
}

// Cheap ETA estimate used only when issuing orders. Runtime movement still uses the
// full terrain/road model. One midpoint sample is deliberately "fake but fast".
function fastSegmentTravelCost(scenario:Scenario,u:Formation,a:{x:number;y:number},b:{x:number;y:number},road:boolean){
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1)return 0;
  const mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5;
  const terrain=terrainAt(scenario,mx,my).terrain;
  const terrainFactor=terrain==="water"?.22:movementTerrainFactor(u,terrain);
  const speed=Math.max(.05,u.speed*terrainFactor*movementSupplyFactor(u)*(road?roadMovementBonus(u):1));
  return length/speed;
}

function fastPolylineTravelCost(scenario:Scenario,u:Formation,points:Array<{x:number;y:number}>,road:boolean){
  let cost=0;
  for(let i=0;i<points.length-1;i++)cost+=fastSegmentTravelCost(scenario,u,points[i],points[i+1],road);
  return cost;
}

function routeSliceBetween(route:{x:number;y:number}[],from:RoutePosition,to:RoutePosition):Array<{x:number;y:number}>{
  if(from.along>to.along)return routeSliceBetween(route,to,from).reverse();
  const points=[from.point];
  for(let i=from.segment+1;i<=to.segment;i++)points.push(route[i]);
  points.push(to.point);
  return dedupeRoutePoints(points);
}

function roadPathBetweenCities(scenario:Scenario,cities:CityState[],u:Formation,start:CityState,goal:CityState){
  if(start.name===goal.name)return{points:[] as Array<{x:number;y:number}>,cost:0};
  type Edge={to:string;route:Array<{x:number;y:number}>;cost:number};
  const graph=new Map<string,Edge[]>();
  for(const city of cities)graph.set(city.name,[]);
  for(const route of scenario.roadRoutes){
    if(route.length<2)continue;
    const a=nearestCityTo(route[0],cities),b=nearestCityTo(route[route.length-1],cities);
    if(!a||!b||a.name===b.name)continue;
    const cost=fastPolylineTravelCost(scenario,u,route,true);
    graph.get(a.name)?.push({to:b.name,route:[...route],cost});
    graph.get(b.name)?.push({to:a.name,route:[...route].reverse(),cost});
  }

  const dist=new Map<string,number>(),prev=new Map<string,{city:string;route:Array<{x:number;y:number}>}>();
  const unvisited=new Set(cities.map(c=>c.name));
  for(const city of cities)dist.set(city.name,Infinity);
  dist.set(start.name,0);
  while(unvisited.size){
    let current:string|undefined,best=Infinity;
    for(const name of unvisited){const d=dist.get(name)??Infinity;if(d<best){best=d;current=name}}
    if(!current||!Number.isFinite(best))break;
    unvisited.delete(current);
    if(current===goal.name)break;
    for(const edge of graph.get(current)??[]){
      if(!unvisited.has(edge.to))continue;
      const next=best+edge.cost;
      if(next<(dist.get(edge.to)??Infinity)){dist.set(edge.to,next);prev.set(edge.to,{city:current,route:edge.route})}
    }
  }
  if(!prev.has(goal.name))return null;
  const segments:Array<Array<{x:number;y:number}>>=[];
  let cursor=goal.name;
  while(cursor!==start.name){
    const step=prev.get(cursor);if(!step)return null;
    segments.push(step.route);cursor=step.city;
  }
  segments.reverse();
  const points:Array<{x:number;y:number}>=[];
  for(const route of segments)for(const point of route.slice(1))points.push(point);
  return{points:dedupeRoutePoints(points),cost:dist.get(goal.name)??Infinity};
}

function movementRoutePlan(
  scenario:Scenario,
  cities:CityState[],
  u:Formation,
  from:{x:number;y:number},
  to:{x:number;y:number},
  openWorld?:OpenWorldState|null
){
  let best:{cost:number;points:Array<{x:number;y:number}>}={
    cost:fastSegmentTravelCost(scenario,u,from,to,false),
    points:[to]
  };
  const consider=(cost:number,points:Array<{x:number;y:number}>)=>{
    if(Number.isFinite(cost)&&cost<best.cost)best={cost,points:dedupeRoutePoints(points)};
  };

  const builtRoads=(openWorld?.structures??[])
    .filter(s=>s.kind==="road"&&s.side===u.side&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined)
    .map(s=>[{x:s.x,y:s.y},{x:s.x2!,y:s.y2!}]);
  const localRoads=[...scenario.roadRoutes,...builtRoads];

  // Fast single-road candidates. This catches most useful "hop onto the road,
  // leave it near the destination" cases without a full path search.
  for(const route of localRoads){
    if(route.length<2)continue;
    const entry=routePosition(route,from.x,from.y),exit=routePosition(route,to.x,to.y);
    const roadPath=routeSliceBetween(route,entry,exit);
    const cost=
      fastSegmentTravelCost(scenario,u,from,entry.point,false)
      +fastPolylineTravelCost(scenario,u,roadPath,true)
      +fastSegmentTravelCost(scenario,u,exit.point,to,false);
    consider(cost,[...(entry.distance>5?[entry.point]:[]),...roadPath.slice(1),...(exit.distance>5?[to]:[])]);
  }

  // For longer trips, only consider a tiny shortlist of road-network entrances
  // and exits. Three by three caps the expensive part at nine tiny Dijkstra runs.
  type Access={city:CityState;cost:number;points:Array<{x:number;y:number}>};
  const entries:Access[]=[];
  const exits:Access[]=[];
  for(const route of scenario.roadRoutes){
    if(route.length<2)continue;
    const a=nearestCityTo(route[0],cities),b=nearestCityTo(route[route.length-1],cities);
    if(!a||!b||a.name===b.name)continue;

    const fromPos=routePosition(route,from.x,from.y);
    const toPos=routePosition(route,to.x,to.y);
    const startPos:RoutePosition={distance:0,point:route[0],segment:0,t:0,along:0,total:fromPos.total};
    const endPos:RoutePosition={distance:0,point:route[route.length-1],segment:route.length-2,t:1,along:fromPos.total,total:fromPos.total};

    for(const endpoint of [{city:a,pos:startPos},{city:b,pos:endPos}]){
      const localIn=routeSliceBetween(route,fromPos,endpoint.pos);
      entries.push({
        city:endpoint.city,
        cost:fastSegmentTravelCost(scenario,u,from,fromPos.point,false)+fastPolylineTravelCost(scenario,u,localIn,true),
        points:[...(fromPos.distance>5?[fromPos.point]:[]),...localIn.slice(1)]
      });

      const localOut=routeSliceBetween(route,endpoint.pos,toPos);
      exits.push({
        city:endpoint.city,
        cost:fastPolylineTravelCost(scenario,u,localOut,true)+fastSegmentTravelCost(scenario,u,toPos.point,to,false),
        points:[...localOut.slice(1),...(toPos.distance>5?[to]:[])]
      });
    }
  }

  const entryShortlist=entries.sort((a,b)=>a.cost-b.cost).slice(0,3);
  const exitShortlist=exits.sort((a,b)=>a.cost-b.cost).slice(0,3);
  const networkCache=new Map<string,ReturnType<typeof roadPathBetweenCities>>();
  for(const entry of entryShortlist)for(const exit of exitShortlist){
    const key=entry.city.name+"\u0000"+exit.city.name;
    let network=networkCache.get(key);
    if(network===undefined){
      network=roadPathBetweenCities(scenario,cities,u,entry.city,exit.city);
      networkCache.set(key,network);
    }
    if(!network)continue;
    consider(entry.cost+network.cost+exit.cost,[...entry.points,...network.points,...exit.points]);
  }

  const result=[...best.points];
  while(result.length>1&&Math.hypot(result[0].x-from.x,result[0].y-from.y)<4)result.shift();
  const last=result[result.length-1];
  if(!last||Math.hypot(last.x-to.x,last.y-to.y)>4)result.push({x:to.x,y:to.y});
  return dedupeRoutePoints(result);
}

type RoadSupplyRoute={
  index:number;
  route:Array<{x:number;y:number}>;
  a:CityState;
  b:CityState;
  cuts:Record<Side,RoadCutPoint[]>;
};
type SupplyNetwork={capacity:Map<string,number>;roads:RoadSupplyRoute[]};

function computeSupplyNetwork(scenario:Scenario,units:Formation[],cities:CityState[]):SupplyNetwork{
  const adjacency=new Map<string,Set<string>>();
  for(const city of cities)adjacency.set(city.name,new Set());
  const roads:RoadSupplyRoute[]=[];
  for(let index=0;index<scenario.roadRoutes.length;index++){
    const route=scenario.roadRoutes[index];if(route.length<2)continue;
    const a=nearestCityTo(route[0],cities),b=nearestCityTo(route[route.length-1],cities);
    if(!a||!b||a.name===b.name)continue;
    const cuts:Record<Side,RoadCutPoint[]>={
      blue:routeInterdictionPoints(route,"blue",units),
      red:routeInterdictionPoints(route,"red",units),
      green:routeInterdictionPoints(route,"green",units)
    };
    roads.push({index,route,a,b,cuts});
    if(a.owner===b.owner&&cuts[a.owner].length===0){
      adjacency.get(a.name)?.add(b.name);adjacency.get(b.name)?.add(a.name);
    }
  }
  const capacity=new Map<string,number>(),seen=new Set<string>();
  for(const city of cities){
    if(seen.has(city.name))continue;
    const stack=[city.name],component:string[]=[];
    while(stack.length){
      const name=stack.pop()!;if(seen.has(name))continue;
      const node=cities.find(c=>c.name===name);if(!node||node.owner!==city.owner)continue;
      seen.add(name);component.push(name);
      for(const next of adjacency.get(name)??[])if(!seen.has(next))stack.push(next);
    }
    const size=Math.max(1,component.length);
    for(const name of component)capacity.set(name,size);
  }
  return{capacity,roads};
}

function roadSupplyAccess(u:{side:Side;x:number;y:number},network:SupplyNetwork){
  let best:{capacity:number;source:CityState;distance:number}|null=null;
  for(const road of network.roads){
    const pos=routePosition(road.route,u.x,u.y);
    if(pos.distance>68)continue;
    const endpoints=[
      {city:road.a,along:0},
      {city:road.b,along:pos.total}
    ];
    for(const endpoint of endpoints){
      if(endpoint.city.owner!==u.side)continue;
      const lo=Math.min(pos.along,endpoint.along),hi=Math.max(pos.along,endpoint.along);
      if(road.cuts[u.side].some(c=>c.along>=lo-4&&c.along<=hi+4))continue;
      const capacity=network.capacity.get(endpoint.city.name)??1;
      const distance=pos.distance+Math.abs(pos.along-endpoint.along);
      if(!best||capacity>best.capacity||(capacity===best.capacity&&distance<best.distance))best={capacity,source:endpoint.city,distance};
    }
  }
  return best;
}

function supplySourceAtPoint(side:Side,point:{x:number;y:number},cities:CityState[],network:SupplyNetwork){
  const city=cities
    .filter(c=>c.owner===side)
    .map(c=>({c,d:Math.hypot(c.x-point.x,c.y-point.y)}))
    .filter(v=>v.d<=560)
    .sort((a,b)=>a.d-b.d)[0]?.c;
  const citySource=city?{capacity:network.capacity.get(city.name)??1,source:city,distance:Math.hypot(city.x-point.x,city.y-point.y)}:null;
  const roadSource=roadSupplyAccess({side,x:point.x,y:point.y},network);
  if(!citySource)return roadSource;
  if(!roadSource)return citySource;
  return roadSource.capacity>citySource.capacity?roadSource:citySource;
}

function builtRoadSupplyAccess(u:Formation,units:Formation[],cities:CityState[],network:SupplyNetwork,openWorld:OpenWorldState|null){
  if(!openWorld)return null;
  let best:{capacity:number;source:CityState;distance:number}|null=null;
  for(const road of openWorld.structures){
    if(road.kind!=="road"||road.side!==u.side||road.strength<=0||road.x2===undefined||road.y2===undefined)continue;
    const route=[{x:road.x,y:road.y},{x:road.x2,y:road.y2}];
    const pos=routePosition(route,u.x,u.y);
    if(pos.distance>62)continue;
    const cuts=routeInterdictionPoints(route,u.side,units);
    const endpoints=[{point:route[0],along:0},{point:route[1],along:pos.total}];
    for(const endpoint of endpoints){
      const source=supplySourceAtPoint(u.side,endpoint.point,cities,network);
      if(!source)continue;
      const lo=Math.min(pos.along,endpoint.along),hi=Math.max(pos.along,endpoint.along);
      if(cuts.some(c=>c.along>=lo-4&&c.along<=hi+4))continue;
      const distance=pos.distance+Math.abs(pos.along-endpoint.along)+source.distance;
      if(!best||source.capacity>best.capacity||(source.capacity===best.capacity&&distance<best.distance))best={capacity:source.capacity,source:source.source,distance};
    }
  }
  return best;
}

type LogisticsLink={from:{x:number;y:number;id:string};to:{x:number;y:number;id:string};unitId:string;depth:number};
type HubLink={from:{x:number;y:number;id:string};to:{x:number;y:number;id:string};hubId:string;active:boolean};

function computeLogisticsLinks(scenario:Scenario,units:Formation[],cities:CityState[],network:SupplyNetwork,emplacements:Emplacement[]=[]){
  const logistics=units.filter(u=>u.kind==="logistics"&&u.strength>8);
  const supplied=new Map<string,{depth:number;source:{x:number;y:number;id:string}}>();
  const links:LogisticsLink[]=[];
  const hubLinks:HubLink[]=[];
  const activeHubs=new Set<string>();
  const cityRange=520,relayRange=620,hubCityRange=1150;

  for(const hub of emplacements.filter(e=>e.kind==="supply_depot"&&e.strength>0)){
    const nearest=cities.filter(c=>c.owner===hub.side).map(c=>({c,d:Math.hypot(c.x-hub.x,c.y-hub.y)})).sort((a,b)=>a.d-b.d)[0];
    if(!nearest)continue;
    const active=nearest.d<=hubCityRange&&(network.capacity.get(nearest.c.name)??0)>0;
    hubLinks.push({from:{x:nearest.c.x,y:nearest.c.y,id:"city:"+nearest.c.name},to:{x:hub.x,y:hub.y,id:hub.id},hubId:hub.id,active});
    if(active)activeHubs.add(hub.id);
  }

  for(const u of logistics){
    const city=cities
      .filter(c=>c.owner===u.side&&(network.capacity.get(c.name)??0)>0)
      .map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)}))
      .filter(x=>x.d<=cityRange)
      .sort((a,b)=>a.d-b.d)[0];
    const depot=emplacements
      .filter(e=>e.side===u.side&&e.kind==="supply_depot"&&e.strength>0&&activeHubs.has(e.id))
      .map(e=>({e,d:Math.hypot(e.x-u.x,e.y-u.y)}))
      .filter(x=>x.d<=x.e.range)
      .sort((a,b)=>a.d-b.d)[0];
    if(city){
      const source={x:city.c.x,y:city.c.y,id:"city:"+city.c.name};
      supplied.set(u.id,{depth:0,source});links.push({from:source,to:{x:u.x,y:u.y,id:u.id},unitId:u.id,depth:0});
    }else if(depot){
      const source={x:depot.e.x,y:depot.e.y,id:depot.e.id};
      supplied.set(u.id,{depth:0,source});links.push({from:source,to:{x:u.x,y:u.y,id:u.id},unitId:u.id,depth:0});
    }
  }

  let changed=true;
  while(changed){
    changed=false;
    for(const u of logistics){
      if(supplied.has(u.id))continue;
      const parent=logistics
        .filter(v=>v.side===u.side&&supplied.has(v.id)&&v.id!==u.id)
        .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),depth:supplied.get(v.id)!.depth}))
        .filter(x=>x.d<=relayRange)
        .sort((a,b)=>a.depth-b.depth||a.d-b.d)[0];
      if(!parent)continue;
      const depth=parent.depth+1;
      supplied.set(u.id,{depth,source:{x:parent.v.x,y:parent.v.y,id:parent.v.id}});
      links.push({from:{x:parent.v.x,y:parent.v.y,id:parent.v.id},to:{x:u.x,y:u.y,id:u.id},unitId:u.id,depth});
      changed=true;
    }
  }
  return{supplied,links,hubLinks,activeHubs,cityRange,relayRange,hubCityRange};
}

function supplyAccess(scenario:Scenario,u:Formation,units:Formation[],cities:CityState[],network=computeSupplyNetwork(scenario,units,cities),emplacements:Emplacement[]=[],logisticsGraph=computeLogisticsLinks(scenario,units,cities,network,emplacements),openWorld:OpenWorldState|null=null){
  const sample=terrainAt(scenario,u.x,u.y);
  const city=sample.objective?cities.find(c=>c.name===sample.objective):undefined;
  const generatedRoadLink=roadSupplyAccess(u,network);
  const builtRoadLink=builtRoadSupplyAccess(u,units,cities,network,openWorld);
  const roadLink=!generatedRoadLink?builtRoadLink:!builtRoadLink?generatedRoadLink
    :builtRoadLink.capacity>generatedRoadLink.capacity?builtRoadLink
    :generatedRoadLink.capacity>builtRoadLink.capacity?generatedRoadLink
    :builtRoadLink.distance<generatedRoadLink.distance?builtRoadLink:generatedRoadLink;
  const depot=emplacements
    .filter(e=>e.side===u.side&&e.kind==="supply_depot"&&e.strength>0&&logisticsGraph.activeHubs.has(e.id))
    .map(e=>({e,d:Math.hypot(e.x-u.x,e.y-u.y)}))
    .filter(x=>x.d<x.e.range)
    .sort((a,b)=>a.d-b.d)[0];
  const relay=units
    .filter(v=>v.side===u.side&&v.kind==="logistics"&&v.id!==u.id&&logisticsGraph.supplied.has(v.id))
    .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),range:420+v.supply*1.5,depth:logisticsGraph.supplied.get(v.id)!.depth}))
    .filter(x=>x.d<x.range)
    .sort((a,b)=>a.depth-b.depth||a.d-b.d)[0];
  const selfRelay=u.kind==="logistics"?logisticsGraph.supplied.get(u.id):undefined;

  if(selfRelay)return{level:Math.max(1,3-Math.min(2,selfRelay.depth)),label:selfRelay.depth===0?"LOGISTICS LINK":"LOGISTICS CHAIN ×"+(selfRelay.depth+1),supplyPerHour:Math.max(.38,1.12-selfRelay.depth*.16),fuelPerHour:Math.max(.26,.78-selfRelay.depth*.12),range:logisticsGraph.relayRange};
  if(depot)return{level:2,label:"FIELD SUPPLY DEPOT",supplyPerHour:1.05,fuelPerHour:.72,range:depot.e.range};
  if(city?.owner===u.side){
    const capacity=network.capacity.get(city.name)??1;
    const throughput=1+Math.log2(capacity);
    return{level:capacity,label:capacity===1?"ISOLATED CITY SUPPLY":"CITY NETWORK ×"+capacity,supplyPerHour:.62+throughput*.56,fuelPerHour:.38+throughput*.4,range:0};
  }
  if(roadLink){
    const throughput=1+Math.log2(roadLink.capacity);
    return{level:Math.max(1,roadLink.capacity),label:(roadLink.capacity===1?"LOCAL ROAD":"CONNECTED ROAD ×"+roadLink.capacity)+" · "+roadLink.source.name,supplyPerHour:.34+throughput*.38,fuelPerHour:.22+throughput*.27,range:68};
  }
  if(relay)return{level:1,label:"MOBILE LOGISTICS RELAY",supplyPerHour:.34,fuelPerHour:.22,range:relay.range};
  return{level:0,label:city?"HOSTILE SUPPLY NODE":"SUPPLY LINE CUT",supplyPerHour:0,fuelPerHour:0,range:0};
}

function updateCities(cities:CityState[],units:Formation[],hours:number):CityState[]{
  return cities.map(city=>{
    const nearby=units.filter(u=>u.strength>5&&Math.hypot(u.x-city.x,u.y-city.y)<118);
    const defenders=nearby.filter(u=>u.side===city.owner&&DIRECT_COMBAT_KINDS.has(u.kind));
    const attackers=nearby.filter(u=>u.side!==city.owner&&CAPTURE_KINDS.has(u.kind));
    if(defenders.length||!attackers.length)return{...city,capture:Math.max(0,city.capture-hours*14)};

    const bySide=new Map<Side,Formation[]>();
    for(const u of attackers)bySide.set(u.side,[...(bySide.get(u.side)??[]),u]);
    const ranked=[...bySide.entries()].sort((a,b)=>b[1].reduce((s,u)=>s+u.readiness,0)-a[1].reduce((s,u)=>s+u.readiness,0));
    if(ranked.length>1)return{...city,capture:Math.max(0,city.capture-hours*5)};

    const [attackingSide,force]=ranked[0];
    const avgReadiness=force.reduce((sum,u)=>sum+u.readiness,0)/force.length;
    const infantryWeight=force.reduce((sum,u)=>sum+(u.kind==="infantry"?1.25:u.kind==="engineer"?1.4:1),0);
    const capture=city.capture+hours*(10+4*Math.sqrt(infantryWeight))*(.5+avgReadiness/210);
    return capture>=100?{...city,owner:attackingSide,capture:0}:{...city,capture};
  });
}

function enemyAI(scenario:Scenario,units:Formation[],cities:CityState[],side:Side):Formation[]{
  const friendly=units.filter(u=>u.side===side);
  const hostile=units.filter(u=>u.side!==side);
  const hostileCities=cities.filter(c=>c.owner!==side);
  const friendlyCities=cities.filter(c=>c.owner===side);
  if(!hostile.length)return units;

  const hash=(id:string)=>{let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const combatPower=(u:Formation)=>(u.softAttack+u.hardAttack*.65+u.defense*.45)*(u.strength/100)*(u.organization/100)*(.55+u.supply/220);
  const localPower=(x:number,y:number,force:Formation[],radius:number)=>force.filter(v=>DIRECT_COMBAT_KINDS.has(v.kind)&&Math.hypot(v.x-x,v.y-y)<radius).reduce((sum,v)=>sum+combatPower(v),0);
  const currentTargetUnit=(u:Formation)=>u.order?.targetUnitId?units.find(v=>v.id===u.order?.targetUnitId&&v.side!==u.side&&v.strength>1):undefined;
  const currentTargetCity=(u:Formation)=>u.order?.targetX!==undefined&&u.order?.targetY!==undefined
    ?hostileCities.find(c=>Math.hypot(c.x-u.order!.targetX!,c.y-u.order!.targetY!)<90)
    :undefined;
  const safeDestination=(u:Formation,p:{x:number;y:number})=>terrainAt(scenario,p.x,p.y).terrain!=="water"&&Math.hypot(p.x-u.x,p.y-u.y)>75;

  const hostilePressure=(x:number,y:number)=>localPower(x,y,hostile,280);
  const friendlyPressure=(x:number,y:number)=>localPower(x,y,friendly,280);
  const cityScore=(u:Formation,c:CityState,current?:CityState)=>{
    const d=Math.hypot(c.x-u.x,c.y-u.y);
    const defenders=hostilePressure(c.x,c.y);
    const support=friendlyPressure(c.x,c.y);
    const crowd=friendly.filter(v=>v.id!==u.id&&v.order?.targetX!==undefined&&v.order?.targetY!==undefined&&Math.hypot(v.order.targetX-c.x,v.order.targetY-c.y)<110).length;
    const roleBias=u.kind==="recon"?1.18:u.kind==="cavalry"||u.kind==="mechanized"||u.kind==="tank"?1.08:1;
    const stick=current?.name===c.name?1.42:1;
    const spread=1/(1+crowd*.17);
    return roleBias*stick*spread*(1+support*.0045)/(1+d/950)/(1+defenders*.007);
  };

  return units.map((u):Formation=>{
    if(u.side!==side)return u;
    const nearestHostile=hostile.map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
    if(!nearestHostile)return u;

    const nearestFriendlyCombat=friendly
      .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind))
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];

    // A retreat is a commitment, not a mood swing. Recover before reconsidering.
    if(u.order?.type==="retreat"&&u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const retreatLeft=Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y);
      if(retreatLeft>80&&(u.organization<62||u.strength<68||u.supply<34))return u;
    }

    if(ARTILLERY_KINDS.has(u.kind)){
      const maxRange=u.kind==="mortar"?mortarMaxRange(scenario,u):u.kind==="heavy_artillery"?820:540;
      const current=currentTargetUnit(u);
      if(current){
        const d=Math.hypot(current.x-u.x,current.y-u.y);
        if(d<=maxRange*1.08&&u.supply>16&&u.organization>20){
          return u.kind==="mortar"?{...u,order:{type:"fire",targetX:current.x,targetY:current.y}}:{...u,order:{type:"fire",targetUnitId:current.id}};
        }
      }
      const candidates=hostile.map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),score:combatPower(v)/(1+Math.hypot(v.x-u.x,v.y-u.y)/maxRange)}))
        .filter(x=>x.d<=maxRange).sort((a,b)=>b.score-a.score);
      if(candidates.length&&u.supply>20&&u.organization>24){
        const target=candidates[0].v;
        return u.kind==="mortar"?{...u,order:{type:"fire",targetX:target.x,targetY:target.y}}:{...u,order:{type:"fire",targetUnitId:target.id}};
      }
      const anchor=nearestFriendlyCombat?.v;
      if(anchor){
        const enemy=current??nearestHostile.v;
        const dx=anchor.x-enemy.x,dy=anchor.y-enemy.y,len=Math.hypot(dx,dy)||1;
        const standoff=u.kind==="mortar"?340:245;
        const tx=clamp(anchor.x+dx/len*standoff,20,scenario.worldWidth-20),ty=clamp(anchor.y+dy/len*standoff,20,scenario.worldHeight-20);
        if(safeDestination(u,{x:tx,y:ty})){
          if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-tx,u.order.targetY-ty)<130)return u;
          return{...u,order:{type:"move",targetX:tx,targetY:ty}};
        }
      }
      return u.order?.type==="defend"?u:{...u,order:{type:"defend"}};
    }

    if(u.kind==="logistics"){
      const movingAnchor=u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined
        ?friendly.filter(v=>DIRECT_COMBAT_KINDS.has(v.kind)).map(v=>({v,d:Math.hypot(v.x-u.order!.targetX!,v.y-u.order!.targetY!)})).sort((a,b)=>a.d-b.d)[0]?.v
        :undefined;
      const anchor=movingAnchor??nearestFriendlyCombat?.v;
      if(!anchor)return u.order?.type==="resupply"?u:{...u,order:{type:"resupply"}};
      const enemy=hostile.map(v=>({v,d:Math.hypot(v.x-anchor.x,v.y-anchor.y)})).sort((a,b)=>a.d-b.d)[0]?.v??nearestHostile.v;
      const dx=anchor.x-enemy.x,dy=anchor.y-enemy.y,len=Math.hypot(dx,dy)||1;
      const tx=clamp(anchor.x+dx/len*390,20,scenario.worldWidth-20),ty=clamp(anchor.y+dy/len*390,20,scenario.worldHeight-20);
      if(Math.hypot(tx-u.x,ty-u.y)>145&&terrainAt(scenario,tx,ty).terrain!=="water"){
        if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-tx,u.order.targetY-ty)<170)return u;
        return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      }
      return u.order?.type==="resupply"?u:{...u,order:{type:"resupply"}};
    }

    if(DIRECT_COMBAT_KINDS.has(u.kind)){
      const friendlyPower=localPower(u.x,u.y,friendly,280)+combatPower(u);
      const enemyPower=localPower(u.x,u.y,hostile,280);
      const ratio=friendlyPower/Math.max(1,enemyPower);

      // Hysteresis prevents advance/retreat thrashing around a single threshold.
      const retreating=u.order?.type==="retreat";
      const shouldRetreat=u.organization<(retreating?58:34)||u.strength<(retreating?64:46)||u.supply<(retreating?30:10)||(nearestHostile.d<170&&ratio<(retreating?.98:.72));
      if(shouldRetreat){
        if(retreating&&u.order?.targetX!==undefined&&u.order?.targetY!==undefined)return u;
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }

      const currentEnemy=currentTargetUnit(u);
      if(currentEnemy){
        const d=Math.hypot(currentEnemy.x-u.x,currentEnemy.y-u.y);
        const targetLocalEnemy=localPower(currentEnemy.x,currentEnemy.y,hostile,220);
        const targetLocalFriendly=localPower(currentEnemy.x,currentEnemy.y,friendly,220)+combatPower(u);
        const targetRatio=targetLocalFriendly/Math.max(1,targetLocalEnemy);
        if(d<430&&targetRatio>.7&&u.organization>36&&u.supply>12){
          if(d<220)return{...u,order:{type:targetRatio>=1.16&&u.organization>46?"assault":"probe",targetUnitId:currentEnemy.id}};
          return u;
        }
      }

      if(nearestHostile.d<210){
        if(ratio>=1.18&&u.organization>46&&u.supply>18)return{...u,order:{type:"assault",targetUnitId:nearestHostile.v.id}};
        if(ratio>=.8)return{...u,order:{type:"probe",targetUnitId:nearestHostile.v.id}};
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }

      const currentCity=currentTargetCity(u);
      const scoredCities=hostileCities.map(c=>({c,score:cityScore(u,c,currentCity),d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>b.score-a.score);
      if(currentCity){
        const currentScore=cityScore(u,currentCity,currentCity);
        const best=scoredCities[0];
        const remaining=Math.hypot(currentCity.x-u.x,currentCity.y-u.y);
        if(remaining>110&&(!best||best.c.name===currentCity.name||best.score<currentScore*1.32))return u;
      }

      const nearestFriendlyCity=friendlyCities.map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
      if(ratio<.9&&nearestFriendlyCity&&nearestFriendlyCity.d>140){
        if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-nearestFriendlyCity.c.x,u.order.targetY-nearestFriendlyCity.c.y)<90)return u;
        return{...u,order:{type:"move",targetX:nearestFriendlyCity.c.x,targetY:nearestFriendlyCity.c.y}};
      }

      if(scoredCities.length&&ratio>.98){
        const top=scoredCities.slice(0,Math.min(3,scoredCities.length));
        const slot=hash(u.id)%top.length;
        const chosen=(u.kind==="recon"?top[Math.min(slot,top.length-1)]:top[slot]).c;
        if(u.kind==="recon"&&nearestHostile.d>360)return{...u,order:{type:"probe",targetX:chosen.x,targetY:chosen.y}};
        return{...u,order:{type:"move",targetX:chosen.x,targetY:chosen.y}};
      }

      // Hold useful ground instead of constantly searching for another destination.
      if(u.order?.type==="defend"||u.order?.type==="dig")return u;
      return{...u,order:{type:"defend"}};
    }
    return u;
  });
}
function resolveReliefs(units:Formation[],cities:CityState[]):Formation[]{
  const out=units.map(u=>({...u,order:u.order?{...u.order}:undefined}));
  for(const relief of out){
    if(relief.order?.type!=="relieve"||!relief.order.targetUnitId)continue;
    const target=out.find(v=>v.id===relief.order?.targetUnitId&&v.side===relief.side);
    if(!target){relief.order={type:"defend"};continue}
    if(Math.hypot(relief.x-target.x,relief.y-target.y)>54)continue;

    const inheritedEnemy=target.order?.targetUnitId
      ?out.find(v=>v.id===target.order?.targetUnitId&&v.side!==target.side)
      :out.filter(v=>v.side!==target.side&&DIRECT_COMBAT_KINDS.has(v.kind)).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];

    if(inheritedEnemy)relief.order={type:"assault",targetUnitId:inheritedEnemy.id};
    else relief.order={type:"defend"};

    const d=retreatDestination(target,out,cities);
    target.order={type:"retreat",targetX:d.x,targetY:d.y};
    target.organization=clamp(target.organization+6,0,100);
  }
  return out;
}

function forageSupply(u:Formation,terrain:TerrainSample["terrain"],inCombat:boolean){
  if(inCombat)return 0;
  if(u.kind==="special_forces"){
    const rate={forest:.42,hills:.38,mountain:.34,highmountain:.22,marsh:.28,plains:.18,desert:.08,urban:.12,water:0}[terrain];
    return rate;
  }
  if(u.kind==="mountaineer"){
    const rate={forest:.14,hills:.22,mountain:.3,highmountain:.24,marsh:.08,plains:.07,desert:.03,urban:.06,water:0}[terrain];
    return rate;
  }
  return 0;
}

function simulate(scenario:Scenario,units:Formation[],hours:number,cities:CityState[],emplacements:Emplacement[]=[],openWorld:OpenWorldState|null=null){
  const supplyNetwork=computeSupplyNetwork(scenario,units,cities);
  const logisticsGraph=computeLogisticsLinks(scenario,units,cities,supplyNetwork,emplacements);
  const next=units.map(u=>{
    const sample=terrainAt(scenario,u.x,u.y);
    const terrain=TERRAIN_RULES[sample.terrain];
    const access=supplyAccess(scenario,u,units,cities,supplyNetwork,emplacements,logisticsGraph,openWorld);
    const n:Formation={...u,order:u.order?{...u.order}:undefined};

    if(n.order?.targetUnitId){
      const tracked=units.find(v=>v.id===n.order?.targetUnitId&&v.strength>1);
      if(tracked)n.order={...n.order,targetX:tracked.x,targetY:tracked.y};
      else n.order={type:"defend"};
    }

    const inCombat=isInCombat(u,units);
    const supplyBurn=(u.kind==="tank"||u.kind==="armor"?1.12:u.kind==="mechanized"?.86:u.kind==="heavy_artillery"?.96:u.kind==="artillery"?.72:u.kind==="mortar"?.62:u.kind==="logistics"?.58:u.kind==="special_forces"?.26:u.kind==="cavalry"?.38:.5)*(inCombat?1.72:1)*(scenario.presetId==="open-world"?.55:1);
    n.supply=clamp(n.supply-hours*supplyBurn/Math.max(.38,terrain.supply),0,100);
    n.supply=clamp(n.supply+hours*forageSupply(u,sample.terrain,inCombat),0,100);
    if(MOTORIZED_KINDS.has(u.kind))n.fuel=clamp(n.fuel-hours*(inCombat?.42:.18),0,100);

    if(access.level>0){
      n.supply=clamp(n.supply+hours*access.supplyPerHour*(scenario.presetId==="open-world"?1.65:1),0,100);
      if(MOTORIZED_KINDS.has(u.kind))n.fuel=clamp(n.fuel+hours*access.fuelPerHour,0,100);
    }

    const friendlyCity=sample.objective?cities.find(c=>c.name===sample.objective&&c.owner===u.side):undefined;
    if(friendlyCity&&!inCombat&&n.supply>22){
      n.strength=clamp(n.strength+hours*.16,0,100);
      n.organization=clamp(n.organization+hours*.48,0,100);
      n.supply=clamp(n.supply-hours*.12,0,100);
    }

    if(n.order?.type==="dig"){
      n.entrenchment=clamp(n.entrenchment+hours*.42,0,100);
      n.organization=clamp(n.organization+hours*.18,0,100);
      n.supply=clamp(n.supply-hours*.05,0,100);
    }else if(n.order?.type==="resupply"){
      const orderSupply=access.level===0?.12:.45+Math.log2(access.level+1)*.92;
      n.supply=clamp(n.supply+hours*orderSupply,0,100);
      n.fuel=clamp(n.fuel+hours*(access.level===0?.04:.85),0,100);
      n.organization=clamp(n.organization+hours*(access.level===0?.12:.5),0,100);
    }else if(n.order?.type==="fire"){
      n.entrenchment=clamp(n.entrenchment+hours*.01,0,100);
    }else if(n.order&&n.order.targetX!==undefined&&n.order.targetY!==undefined){
      const dx=n.order.targetX-u.x,dy=n.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5&&!n.order.targetUnitId){
        n.x=n.order.targetX;n.y=n.order.targetY;
        const [nextWaypoint,...remaining]=n.order.waypoints??[];
        n.order=nextWaypoint?{type:"move",targetX:nextWaypoint.x,targetY:nextWaypoint.y,waypoints:remaining}:{type:"defend"};
      }else if(dist>0){
        const posture=n.order.type==="retreat"?1.9:n.order.type==="relieve"?1.12:n.order.type==="assault"?.58:n.order.type==="probe"?.74:1;
        const builtRoad=openWorld?.structures.some(s=>s.kind==="road"&&s.side===u.side&&s.strength>0&&structureSegmentDistance(s,u.x,u.y)<34);
        const roadBonus=(sample.road||builtRoad)
          ?ARTILLERY_KINDS.has(u.kind)?2.5
          :u.kind==="logistics"?2.05
          :u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"||u.kind==="recon"?1.8
          :u.kind==="cavalry"?1.45
          :1.55
          :1;
        const terrainMove=(sample.terrain==="highmountain"&&u.kind==="mountaineer")?.78
          :(u.kind==="mountaineer"&&(sample.terrain==="mountain"||sample.terrain==="hills"))?terrain.move*1.45
          :(u.kind==="cavalry"&&(sample.terrain==="plains"||sample.terrain==="desert"))?terrain.move*1.28
          :terrain.move;
        const supplyMove=n.order.type==="retreat"?Math.max(.72,movementSupplyFactor(n)):movementSupplyFactor(n);
        const travel=Math.min(dist,u.speed*terrainMove*roadBonus*posture*supplyMove*hours*MOVEMENT_SCALE);
        let nx=clamp(u.x+dx/dist*travel,1,scenario.worldWidth-1),ny=clamp(u.y+dy/dist*travel,1,scenario.worldHeight-1);

        if(DIRECT_COMBAT_KINDS.has(u.kind)&&n.order.type!=="retreat"){
          const contact=units.filter(v=>v.side!==u.side).map(v=>({v,...segmentContact(u.x,u.y,nx,ny,v.x,v.y)})).filter(c=>c.distance<44).sort((a,b)=>a.t-b.t)[0];
          if(contact){
            const stopDistance=Math.max(0,travel*contact.t-36);
            nx=clamp(u.x+dx/dist*stopDistance,1,scenario.worldWidth-1);ny=clamp(u.y+dy/dist*stopDistance,1,scenario.worldHeight-1);
          }
        }

        const blockingWall=openWorld?.structures.find(s=>s.kind==="wall"&&s.side!==u.side&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined&&segmentsIntersect(u.x,u.y,nx,ny,s.x,s.y,s.x2,s.y2));
        if(blockingWall){
          if(n.order.type==="assault"||n.order.type==="probe"){
            const breachPower=(n.softAttack*.055+n.hardAttack*.08)*(n.organization/100)*Math.max(.25,n.supply/100);
            blockingWall.strength=Math.max(0,blockingWall.strength-hours*breachPower);
            n.organization=clamp(n.organization-hours*.42,0,100);
            n.supply=clamp(n.supply-hours*.22,0,100);
          }
          if(blockingWall.strength>0){nx=u.x;ny=u.y}
        }
        const nextTerrain=terrainAt(scenario,nx,ny).terrain;
        const passable=nextTerrain!=="water"&&(nextTerrain!=="highmountain"||u.kind==="mountaineer");
        if(passable){
          n.x=nx;n.y=ny;
          const movementSupplyCost=sample.road?0:travel*(u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"?.024:u.kind==="heavy_artillery"?.02:.012);
          n.supply=clamp(n.supply-movementSupplyCost,0,100);
          n.fuel=clamp(n.fuel-travel*(u.kind==="armor"||u.kind==="tank"?.021:u.kind==="mechanized"||u.kind==="recon"?.013:.001),0,100);
          n.entrenchment=Math.max(0,n.entrenchment-hours*.7);
          n.organization=clamp(n.organization-hours*.12,0,100);
        }
      }
    }else{
      n.organization=clamp(n.organization+hours*.08,0,100);
      n.entrenchment=clamp(n.entrenchment+hours*.012,0,100);
    }

    const special=u.kind==="special_forces";
    const foot=u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="engineer";
    if(n.supply<25)n.organization=clamp(n.organization-hours*(special?.08:foot?.34:.78),0,100);
    if(n.supply<12){n.organization=clamp(n.organization-hours*(special?.16:foot?.62:1.25),0,100);n.strength=clamp(n.strength-hours*(special?.012:foot?.05:.14),0,100)}
    if(n.supply<4)n.strength=clamp(n.strength-hours*(special?.035:foot?.12:.3),0,100);
    n.readiness=clamp(n.organization*.46+n.supply*.3+n.strength*.24,0,100);
    return n;
  });

  let result=resolveReliefs(next,cities);

  for(let i=0;i<result.length;i++){
    for(let j=i+1;j<result.length;j++){
      const a=result[i],b=result[j];
      if(a.side===b.side)continue;
      const dist=Math.hypot(a.x-b.x,a.y-b.y);
      if(dist>48)continue;

      const aCan=DIRECT_COMBAT_KINDS.has(a.kind),bCan=DIRECT_COMBAT_KINDS.has(b.kind);
      if(!aCan&&!bCan)continue;
      const aWall=openWorld?.structures.some(s=>(s.kind==="wall"||s.kind==="fort")&&s.side===a.side&&Math.hypot(s.x-a.x,s.y-a.y)<150)?1.32:1;
      const bWall=openWorld?.structures.some(s=>(s.kind==="wall"||s.kind==="fort")&&s.side===b.side&&Math.hypot(s.x-b.x,s.y-b.y)<150)?1.32:1;
      const aDef=TERRAIN_RULES[terrainAt(scenario,a.x,a.y).terrain].defense*aWall;
      const bDef=TERRAIN_RULES[terrainAt(scenario,b.x,b.y).terrain].defense*bWall;
      const aRetreat=a.order?.type==="retreat",bRetreat=b.order?.type==="retreat";
      const aPower=aCan&&!aRetreat?(a.softAttack*(1-b.hardness)+a.hardAttack*b.hardness)*(a.organization/100)*(a.supply/100):0;
      const bPower=bCan&&!bRetreat?(b.softAttack*(1-a.hardness)+b.hardAttack*a.hardness)*(b.organization/100)*(b.supply/100):0;
      const aPosture=a.order?.type==="assault"?1.22:a.order?.type==="probe"?.76:1;
      const bPosture=b.order?.type==="assault"?1.22:b.order?.type==="probe"?.76:1;
      const aLoss=(bPower*bPosture/Math.max(20,a.defense*aDef+a.entrenchment*1.35))*hours*2.15*(aRetreat?1.2:1);
      const bLoss=(aPower*aPosture/Math.max(20,b.defense*bDef+b.entrenchment*1.35))*hours*2.15*(bRetreat?1.2:1);
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
  }

  for(const gun of result){
    if(!ARTILLERY_KINDS.has(gun.kind)||gun.order?.type!=="fire")continue;

    if(gun.kind==="mortar"){
      if(gun.order.targetX===undefined||gun.order.targetY===undefined)continue;
      const tx=gun.order.targetX,ty=gun.order.targetY;
      const range=Math.hypot(tx-gun.x,ty-gun.y),maxRange=mortarMaxRange(scenario,gun);
      if(range>maxRange||gun.supply<8||gun.organization<10)continue;
      const targetTerrain=terrainAt(scenario,tx,ty).terrain;
      const profile=mortarTerrainProfile(targetTerrain);
      const dispersion=mortarDispersion(scenario,tx,ty,range/maxRange);
      const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*dispersion;
      const impactX=clamp(tx+Math.cos(angle)*radius,1,scenario.worldWidth-1),impactY=clamp(ty+Math.sin(angle)*radius,1,scenario.worldHeight-1);
      const rangeFactor=clamp(1-range/maxRange*.42,.58,1);
      for(const target of result){
        if(target.id===gun.id)continue;
        const d=Math.hypot(target.x-impactX,target.y-impactY);
        if(d>105)continue;
        const falloff=clamp(1-d/115,.08,1);
        const friendlyFire=target.side===gun.side?.55:1;
        const cover=mortarTerrainProfile(terrainAt(scenario,target.x,target.y).terrain).effect;
        const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor*profile.effect*falloff*friendlyFire;
        const loss=(power/Math.max(22,target.defense*.62+target.entrenchment*1.3))*hours*1.22*cover;
        target.strength=clamp(target.strength-loss,0,100);
        target.organization=clamp(target.organization-loss*3.25,0,100);
      }
      gun.supply=clamp(gun.supply-hours*.82,0,100);gun.organization=clamp(gun.organization-hours*.035,0,100);
      continue;
    }

    if(!gun.order.targetUnitId||!GUN_ARTILLERY_KINDS.has(gun.kind))continue;
    const target=result.find(v=>v.id===gun.order?.targetUnitId&&v.side!==gun.side);
    if(!target)continue;
    const range=Math.hypot(target.x-gun.x,target.y-gun.y);
    const maxRange=gun.kind==="heavy_artillery"?820:540;
    if(range>maxRange||gun.supply<10||gun.organization<10)continue;
    const terrain=TERRAIN_RULES[terrainAt(scenario,target.x,target.y).terrain];
    const rangeFactor=clamp(1-(range-80)/(gun.kind==="heavy_artillery"?880:530),.34,1);
    const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor;
    const loss=(power/Math.max(24,target.defense*terrain.defense+target.entrenchment*1.15))*hours*(gun.kind==="heavy_artillery"?1.65:1.45);
    target.strength=clamp(target.strength-loss,0,100);target.organization=clamp(target.organization-loss*2.2,0,100);
    gun.supply=clamp(gun.supply-hours*(gun.kind==="heavy_artillery"?1.45:.95),0,100);gun.organization=clamp(gun.organization-hours*.04,0,100);
  }

  return result.filter(u=>u.strength>1);
}

function applyEmplacementFire(units:Formation[],emplacements:Emplacement[],cities:CityState[],hours:number){
  const result=units.map(u=>({...u,order:u.order?{...u.order}:undefined}));
  for(const emplacement of emplacements){
    if(emplacement.strength<=0)continue;
    if(emplacement.kind==="field_fortification"){
      for(const u of result)if(u.side===emplacement.side&&Math.hypot(u.x-emplacement.x,u.y-emplacement.y)<=emplacement.range){
        u.entrenchment=clamp(u.entrenchment+hours*.22,0,100);
        u.organization=clamp(u.organization+hours*.06,0,100);
      }
      continue;
    }
    if(emplacement.kind==="supply_depot")continue;
    if(emplacement.kind!=="fixed_artillery")continue;
    const target=result
      .filter(u=>u.side!==emplacement.side&&u.strength>1&&Math.hypot(u.x-emplacement.x,u.y-emplacement.y)<=emplacement.range)
      .sort((a,b)=>Math.hypot(a.x-emplacement.x,a.y-emplacement.y)-Math.hypot(b.x-emplacement.x,b.y-emplacement.y))[0];
    if(!target)continue;
    const supplied=cities.some(c=>c.owner===emplacement.side&&Math.hypot(c.x-emplacement.x,c.y-emplacement.y)<1150);
    const fireFactor=supplied?1:.32;
    target.strength=clamp(target.strength-hours*.34*fireFactor,0,100);
    target.organization=clamp(target.organization-hours*.92*fireFactor,0,100);
  }
  return result.filter(u=>u.strength>1);
}

function advanceConstruction(projects:ConstructionProject[],emplacements:Emplacement[],units:Formation[],hours:number){
  const nextProjects:ConstructionProject[]=[];
  const nextEmplacements=[...emplacements];
  for(const project of projects){
    const builders=units.filter(u=>project.builderIds.includes(u.id)&&u.side===project.side&&u.kind==="engineer"&&u.strength>8);
    const active=builders.filter(u=>Math.hypot(u.x-project.x,u.y-project.y)<78&&u.supply>18&&!isInCombat(u,units));
    const workerPower=Math.min(3,active.length);
    for(const builder of active)builder.supply=clamp(builder.supply-hours*(project.kind==="fixed_artillery"?.34:project.kind==="supply_depot"?.26:.2),0,100);
    const progress=project.progress+hours*workerPower;
    if(progress>=project.requiredHours){
      nextEmplacements.push({
        id:"em-"+project.id,kind:project.kind,side:project.side,x:project.x,y:project.y,strength:100,
        range:project.kind==="observatory"?1100:project.kind==="fixed_artillery"?860:project.kind==="field_fortification"?125:540
      });
    }else nextProjects.push({...project,progress});
  }
  return{projects:nextProjects,emplacements:nextEmplacements};
}

export default function Home(){
  const [scenario,setScenario]=useState<Scenario|null>(null);
  const [units,setUnits]=useState<Formation[]>([]);
  const [cities,setCities]=useState<CityState[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [overlay,setOverlay]=useState<OverlayMode>("terrain");
  const [pendingOrder,setPendingOrder]=useState<OrderType|null>(null);
  const [running,setRunning]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [hour,setHour]=useState(6);
  const [day,setDay]=useState(1);
  const [pan,setPan]=useState({x:-260,y:-190});
  const [zoom,setZoom]=useState(.24);
  const [hovered,setHovered]=useState<TerrainSample|null>(null);
  const [aimPoint,setAimPoint]=useState<{x:number;y:number}|null>(null);
  const [warResult,setWarResult]=useState<Side|null>(null);
  const [selectionBox,setSelectionBox]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [frontPreview,setFrontPreview]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [attackPlans,setAttackPlans]=useState<AttackPlan[]>([]);
  const [pendingPlan,setPendingPlan]=useState(false);
  const [selectedPresetId,setSelectedPresetId]=useState("frontier");
  const [selectedGameMode,setSelectedGameMode]=useState<"scenario"|"openworld">("scenario");
  const [openWorld,setOpenWorld]=useState<OpenWorldState|null>(null);
  const [pendingStrategicBuild,setPendingStrategicBuild]=useState<OpenWorldBuildKind|null>(null);
  const [strategicBuildAnchor,setStrategicBuildAnchor]=useState<{x:number;y:number}|null>(null);
  const [setupCategory,setSetupCategory]=useState<"all"|"fictional"|"historical">("all");
  const [playerSide,setPlayerSide]=useState<Side>("blue");
  const [emplacements,setEmplacements]=useState<Emplacement[]>([]);
  const [constructionProjects,setConstructionProjects]=useState<ConstructionProject[]>([]);
  const [pendingBuild,setPendingBuild]=useState<EmplacementKind|null>(null);
  const [isMobile,setIsMobile]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<"none"|"forces"|"unit">("none");
  const [mobileTool,setMobileTool]=useState<"pan"|"select"|"front">("pan");
  const [multiplayer,setMultiplayer]=useState<MultiplayerSession|null>(null);
  const [networkPhase,setNetworkPhase]=useState<"idle"|"matching"|"waiting"|"connected"|"opponent-left"|"error">("idle");
  const [networkError,setNetworkError]=useState("");
  const [inviteLink,setInviteLink]=useState("");

  const drag=useRef<{mode:"pan"|"box"|"front"|"select"|"target";startClientX:number;startClientY:number;px:number;py:number;moved:boolean}|null>(null);
  const touchPoints=useRef<Map<number,{x:number;y:number}>>(new Map());
  const pinch=useRef<{distance:number;zoom:number;worldX:number;worldY:number}|null>(null);
  const suppressContextMenu=useRef(false);
  const viewport=useRef<HTMLDivElement>(null);
  const unitsRef=useRef<Formation[]>([]);
  const citiesRef=useRef<CityState[]>([]);
  const warResultRef=useRef<Side|null>(null);
  const planCounter=useRef(1);
  const buildCounter=useRef(1);
  const emplacementsRef=useRef<Emplacement[]>([]);
  const projectsRef=useRef<ConstructionProject[]>([]);
  const openWorldRef=useRef<OpenWorldState|null>(null);
  const multiplayerRef=useRef<MultiplayerSession|null>(null);
  const networkChannelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const networkStartedRef=useRef(false);
  const lastSnapshotSeqRef=useRef(0);
  const snapshotSeqRef=useRef(0);
  const latestSnapshotRef=useRef<MultiplayerSnapshot|null>(null);
  latestSnapshotRef.current={seq:0,units,cities,attackPlans,emplacements,constructionProjects,hour,day,running,speed,warResult};

  useEffect(()=>{
    const code=new URLSearchParams(window.location.search).get("join")?.trim().toUpperCase();
    if(!code)return;
    let cancelled=false;
    setNetworkPhase("matching");setNetworkError("");
    joinPrivateMatch(code).then(session=>{
      if(cancelled)return;
      multiplayerRef.current=session;setMultiplayer(session);setPlayerSide(session.side);setSelectedPresetId(session.presetId);setSelectedGameMode("scenario");
      setNetworkPhase("waiting");
      window.history.replaceState(null,"",window.location.pathname+window.location.hash);
    }).catch(error=>{
      if(cancelled)return;
      setNetworkError(error instanceof Error?error.message:"Could not join match");setNetworkPhase("error");
    });
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    if(!multiplayer)return;
    multiplayerRef.current=multiplayer;
    networkStartedRef.current=false;
    lastSnapshotSeqRef.current=0;
    snapshotSeqRef.current=0;
    const channel=supabase.channel("kspiel:"+multiplayer.roomId,{
      config:{presence:{key:multiplayer.playerToken},broadcast:{ack:false,self:false}}
    });
    networkChannelRef.current=channel;

    const applySnapshot=(snapshot:MultiplayerSnapshot)=>{
      if(multiplayer.isHost||!snapshot||snapshot.seq<=lastSnapshotSeqRef.current)return;
      lastSnapshotSeqRef.current=snapshot.seq;
      unitsRef.current=snapshot.units;setUnits(snapshot.units);
      citiesRef.current=snapshot.cities;setCities(snapshot.cities);
      projectsRef.current=snapshot.constructionProjects;setConstructionProjects(snapshot.constructionProjects);
      emplacementsRef.current=snapshot.emplacements;setEmplacements(snapshot.emplacements);
      setAttackPlans(snapshot.attackPlans);
      warResultRef.current=snapshot.warResult;setWarResult(snapshot.warResult);
      setHour(snapshot.hour);setDay(snapshot.day);setRunning(snapshot.running);setSpeed(snapshot.speed);
    };

    channel
      .on("broadcast",{event:"snapshot"},({payload})=>applySnapshot(payload as MultiplayerSnapshot))
      .on("broadcast",{event:"unit-patch"},({payload})=>{
        if(!multiplayer.isHost)return;
        const patches=Array.isArray(payload?.patches)?payload.patches as UnitCommandPatch[]:[];
        if(!patches.length)return;
        const byId=new Map(patches.filter(p=>p&&typeof p.id==="string").map(p=>[p.id,p]));
        setUnits(prev=>{
          const next=prev.map(unit=>{
            const patch=byId.get(unit.id);
            if(!patch||unit.side!==multiplayer.opponentSide)return unit;
            const safeSupply=typeof patch.supply==="number"?Math.min(unit.supply,Math.max(0,Math.min(100,patch.supply))):unit.supply;
            return{...unit,supply:safeSupply,...("order" in patch?{order:patch.order}:{}),...("groupId" in patch?{groupId:patch.groupId}:{}),...("formationShape" in patch?{formationShape:patch.formationShape}:{})};
          });
          unitsRef.current=next;return next;
        });
      })
      .on("broadcast",{event:"plan-upsert"},({payload})=>{
        if(!multiplayer.isHost)return;
        const plan=payload?.plan as AttackPlan|undefined;
        if(!plan||plan.side!==multiplayer.opponentSide)return;
        setAttackPlans(prev=>prev.some(p=>p.id===plan.id)?prev.map(p=>p.id===plan.id?plan:p):[...prev,plan]);
      })
      .on("broadcast",{event:"plan-delete"},({payload})=>{
        if(!multiplayer.isHost||typeof payload?.id!=="string")return;
        setAttackPlans(prev=>prev.filter(plan=>!(plan.id===payload.id&&plan.side===multiplayer.opponentSide)));
      })
      .on("broadcast",{event:"construction-create"},({payload})=>{
        if(!multiplayer.isHost)return;
        const project=payload?.project as ConstructionProject|undefined;
        if(!project||project.side!==multiplayer.opponentSide)return;
        if(projectsRef.current.some(p=>p.id===project.id))return;
        const next=[...projectsRef.current,project];projectsRef.current=next;setConstructionProjects(next);
      })
      .on("presence",{event:"sync"},()=>{
        const count=Object.values(channel.presenceState()).reduce((sum,entries)=>sum+entries.length,0);
        if(count>=2){
          setNetworkPhase("connected");
          if(!networkStartedRef.current){
            networkStartedRef.current=true;
            startGame(multiplayer);
          }
        }else if(networkStartedRef.current){
          setNetworkPhase("opponent-left");
          if(multiplayer.isHost)setRunning(false);
        }else setNetworkPhase("waiting");
      })
      .subscribe(async status=>{
        if(status==="SUBSCRIBED")await channel.track({role:multiplayer.role,side:multiplayer.side,onlineAt:new Date().toISOString()});
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          setNetworkError("Realtime connection failed");setNetworkPhase("error");
        }
      });

    return()=>{
      if(networkChannelRef.current===channel)networkChannelRef.current=null;
      void supabase.removeChannel(channel);
    };
  },[multiplayer]);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const sync=()=>setIsMobile(media.matches);
    sync();media.addEventListener?.("change",sync);
    return()=>media.removeEventListener?.("change",sync);
  },[]);

  useEffect(()=>{
    if(isMobile&&(pendingOrder||pendingPlan||pendingBuild))setMobilePanel("none");
  },[isMobile,pendingOrder,pendingPlan,pendingBuild]);

  useEffect(()=>{
    const el=viewport.current;
    if(!el)return;
    const block=(event:Event)=>event.preventDefault();
    el.addEventListener("contextmenu",block,{capture:true});
    return()=>el.removeEventListener("contextmenu",block,{capture:true});
  },[scenario]);

  useEffect(()=>{
    const togglePause=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;
      if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      if(e.code!=="Space")return;
      e.preventDefault();e.stopPropagation();
      if(multiplayerRef.current&&!multiplayerRef.current.isHost)return;
      setRunning(v=>warResultRef.current?v:!v);
    };
    window.addEventListener("keydown",togglePause,true);
    return()=>window.removeEventListener("keydown",togglePause,true);
  },[]);

  const sendNetwork=(event:string,payload:Record<string,unknown>)=>{
    const channel=networkChannelRef.current;
    if(!channel)return;
    void channel.send({type:"broadcast",event,payload});
  };

  const commitUnits=(fn:(prev:Formation[])=>Formation[])=>{
    setUnits(prev=>{
      const next=fn(prev);unitsRef.current=next;
      const session=multiplayerRef.current;
      if(session&&!session.isHost){
        const previous=new Map(prev.map(unit=>[unit.id,unit]));
        const patches:UnitCommandPatch[]=[];
        for(const unit of next){
          if(unit.side!==session.side)continue;
          const before=previous.get(unit.id);
          if(!before)continue;
          if(JSON.stringify([before.order,before.groupId,before.formationShape,before.supply])!==JSON.stringify([unit.order,unit.groupId,unit.formationShape,unit.supply])){
            patches.push({id:unit.id,order:unit.order,groupId:unit.groupId,formationShape:unit.formationShape,supply:unit.supply});
          }
        }
        if(patches.length)sendNetwork("unit-patch",{patches});
      }
      return next;
    });
  };

  const localPlayerId=multiplayer?.playerToken??"local";
  const matchConfig=createMatchConfig(multiplayer?"pvp":"singleplayer",localPlayerId,playerSide);
  const localSides=new Set(localControlledSides(matchConfig,localPlayerId));
  const botSides=multiplayer?[]:openWorld?(["blue","red","green"] as Side[]).filter(side=>!localSides.has(side)):botControlledSides(matchConfig);
  const armyGroups=defaultArmyGroups(playerSide);

  const selectedUnits=units.filter(u=>selected.includes(u.id));
  const primary=selectedUnits[0];
  const primaryTracked=primary?.order?.targetUnitId?units.find(u=>u.id===primary.order?.targetUnitId):undefined;
  const primaryTargetX=primaryTracked?.x??primary?.order?.targetX,primaryTargetY=primaryTracked?.y??primary?.order?.targetY;
  const blue=units.filter(u=>localSides.has(u.side)),enemy=units.filter(u=>!localSides.has(u.side));
  const blueCities=cities.filter(c=>localSides.has(c.owner)).length;
  const averageSupply=blue.reduce((s,u)=>s+u.supply,0)/Math.max(1,blue.length);
  const averageOrg=blue.reduce((s,u)=>s+u.organization,0)/Math.max(1,blue.length);

  useEffect(()=>{
    if(!scenario||!running||speed===0||warResultRef.current)return;
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)return;
    let last=performance.now(),aiElapsed=AI_COMMAND_INTERVAL_SECONDS;
    const tick=()=>{
      const now=performance.now();
      const realSeconds=Math.min(MAX_FRAME_SECONDS,Math.max(0,(now-last)/1000));last=now;aiElapsed+=realSeconds;
      const simHours=realSeconds*SIM_HOURS_PER_REAL_SECOND*SPEED_MULTIPLIER[speed];

      let working=unitsRef.current;
      if(aiElapsed>=AI_COMMAND_INTERVAL_SECONDS){for(const side of botSides)working=enemyAI(scenario,working,citiesRef.current,side);aiElapsed=0}
      let nextUnits=simulate(scenario,working,simHours,citiesRef.current,emplacementsRef.current,openWorldRef.current);
      if(openWorldRef.current){
        const ow=advanceOpenWorld(scenario,openWorldRef.current,nextUnits,citiesRef.current,simHours);
        openWorldRef.current=ow.state;setOpenWorld(ow.state);
        if(ow.spawned.length)nextUnits=[...nextUnits,...ow.spawned];
        if(ow.newCities.length){citiesRef.current=[...citiesRef.current,...ow.newCities];setCities(citiesRef.current)}
      }
      nextUnits=applyEmplacementFire(nextUnits,emplacementsRef.current,citiesRef.current,simHours);
      const built=advanceConstruction(projectsRef.current,emplacementsRef.current,nextUnits,simHours);
      projectsRef.current=built.projects;emplacementsRef.current=built.emplacements;
      setConstructionProjects(built.projects);setEmplacements(built.emplacements);
      const nextCities=updateCities(citiesRef.current,nextUnits,simHours);
      unitsRef.current=nextUnits;citiesRef.current=nextCities;setUnits(nextUnits);setCities(nextCities);

      const owners=new Set(nextCities.map(c=>c.owner));
      if(!openWorldRef.current&&nextCities.length>0&&owners.size===1&&!warResultRef.current){
        const winner=nextCities[0].owner;warResultRef.current=winner;setWarResult(winner);setRunning(false);
      }

      setHour(prev=>{const total=prev+simHours;if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}return total});
    };
    const timer=window.setInterval(tick,SIM_TICK_MS);
    return()=>window.clearInterval(timer);
  },[scenario,running,speed]);

  useEffect(()=>{
    if(!scenario||!multiplayer?.isHost)return;
    const publish=()=>{
      const current=latestSnapshotRef.current;if(!current)return;
      sendNetwork("snapshot",{...current,seq:++snapshotSeqRef.current});
    };
    publish();
    const timer=window.setInterval(publish,300);
    return()=>window.clearInterval(timer);
  },[scenario,multiplayer?.roomId,multiplayer?.isHost]);

  function selectUnit(e:ReactMouseEvent,u:Formation){
    e.stopPropagation();
    if(!localSides.has(u.side)){
      if(pendingOrder==="assault"||pendingOrder==="fire"||pendingOrder==="probe")issueUnitTargetCore(u,false);
      return;
    }
    if(pendingOrder==="relieve"&&primary&&u.id!==primary.id){issueUnitTargetCore(u,false);return}
    if(e.shiftKey)setSelected(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);else setSelected([u.id]);
  }

  function startOrder(type:OrderType){
    if(!selected.length)return;
    setPendingBuild(null);
    const selectedNow=units.filter(u=>selected.includes(u.id));
    if(type==="move"){setPendingOrder("move");setPendingPlan(false);return}
    if((type==="assault"||type==="probe")&&!selectedNow.some(u=>DIRECT_COMBAT_KINDS.has(u.kind)))return;
    if(type==="fire"&&!selectedNow.some(u=>ARTILLERY_KINDS.has(u.kind)))return;

    if(type==="retreat"){
      commitUnits(prev=>prev.map(u=>{
        if(!selected.includes(u.id)||u.supply<RETREAT_SUPPLY_MIN||!isInCombat(u,prev))return u;
        const d=retreatDestination(u,prev,citiesRef.current);
        return{...u,supply:clamp(u.supply-10,0,100),order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }));
      setPendingOrder(null);return;
    }

    if(type==="dig"||type==="resupply"||type==="defend"){
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type}}:u));setPendingOrder(null);
    }else setPendingOrder(type);
  }

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      const key=e.key.toLowerCase();
      if(key==="escape"){setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);return}
      const digit=/^Digit([1-6])$/.exec(e.code);
      if(digit){
        const group=armyGroups[Number(digit[1])-1];
        if(e.ctrlKey){e.preventDefault();assignGroup(group.id)}else if(!e.metaKey&&!e.altKey){e.preventDefault();selectGroup(group.id)}
        return;
      }
      if(key==="b"){setPendingPlan(true);setPendingOrder(null);setPendingBuild(null);return}
      if(key==="m")startOrder("move");else if(key==="a")startOrder("assault");else if(key==="p")startOrder("probe");
      else if(key==="f")startOrder("fire");else if(key==="d")startOrder("defend");else if(key==="g")startOrder("dig");
      else if(key==="r")startOrder("resupply");else if(key==="t")startOrder("relieve");else if(key==="x")startOrder("retreat");
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[selected,units,cities]);

  function startGame(network?:MultiplayerSession){
    const seed=network?.seed??(typeof crypto!=="undefined"&&"getRandomValues" in crypto?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now()>>>0);
    const presetId=network?.presetId??selectedPresetId;
    const gameMode=network?"scenario":selectedGameMode;
    const activeSide=network?.side??playerSide;
    if(network){setPlayerSide(network.side);setSelectedPresetId(network.presetId);setSelectedGameMode("scenario")}
    let generated=generateScenario(seed,presetId);
    if(gameMode==="openworld")generated={...generated,presetId:"open-world",title:"Open World Dominion",historical:false,sideNames:{blue:"Blue Dominion",red:"Red Dominion",green:"Green Dominion"},sideFlags:{blue:"generic-blue",red:"generic-red",green:"generic-blue"}};
    warResultRef.current=null;setWarResult(null);setAttackPlans([]);setPendingPlan(false);setPendingOrder(null);setPendingBuild(null);setStrategicBuildAnchor(null);
    setEmplacements([]);emplacementsRef.current=[];setConstructionProjects([]);projectsRef.current=[];setMobilePanel("none");
    if(gameMode==="openworld"){
      const ow=createOpenWorldState(generated,generated.formations,generated.cities);openWorldRef.current=ow.state;setOpenWorld(ow.state);
      setScenario(generated);setUnits(ow.units);unitsRef.current=ow.units;setCities(ow.cities);citiesRef.current=ow.cities;
    }else{
      openWorldRef.current=null;setOpenWorld(null);setScenario(generated);setUnits(generated.formations);unitsRef.current=generated.formations;
      setCities(generated.cities);citiesRef.current=generated.cities;
    }
    const first=generated.formations.find(u=>u.side===activeSide);setSelected(first?[first.id]:[]);
    const mapScale=generated.worldWidth/WORLD_W;setRunning(true);setSpeed(1);setHour(6);setDay(1);setPan({x:-260,y:-190});setZoom((isMobile ? .34 : .24)/mapScale);setMobilePanel("none");setMobileTool("pan");
  }

  function activateMultiplayer(session:MultiplayerSession){
    multiplayerRef.current=session;setMultiplayer(session);setPlayerSide(session.side);setSelectedPresetId(session.presetId);setSelectedGameMode("scenario");
    setNetworkPhase("waiting");setNetworkError("");
    setInviteLink(session.kind==="invite"&&session.isHost?inviteUrl(session.code):"");
  }

  async function beginQuickPlay(){
    if(selectedGameMode!=="scenario"||networkPhase==="matching")return;
    setNetworkPhase("matching");setNetworkError("");
    try{activateMultiplayer(await findQuickPlay(selectedPresetId,playerSide))}
    catch(error){setNetworkError(error instanceof Error?error.message:"Quick Play failed");setNetworkPhase("error")}
  }

  async function beginPrivateMatch(){
    if(selectedGameMode!=="scenario"||networkPhase==="matching")return;
    setNetworkPhase("matching");setNetworkError("");
    try{activateMultiplayer(await createPrivateMatch(selectedPresetId,playerSide))}
    catch(error){setNetworkError(error instanceof Error?error.message:"Could not create private match");setNetworkPhase("error")}
  }

  function cancelMultiplayer(){
    const session=multiplayerRef.current;
    if(session)void closeMultiplayerRoom(session);
    multiplayerRef.current=null;setMultiplayer(null);networkStartedRef.current=false;setNetworkPhase("idle");setNetworkError("");setInviteLink("");
    window.history.replaceState(null,"",window.location.pathname+window.location.hash);
  }

  function returnToSetup(){
    if(multiplayerRef.current)cancelMultiplayer();
    setRunning(false);setScenario(null);setUnits([]);unitsRef.current=[];setCities([]);citiesRef.current=[];
    setSelected([]);setAttackPlans([]);setWarResult(null);warResultRef.current=null;setPendingBuild(null);
    setEmplacements([]);emplacementsRef.current=[];setConstructionProjects([]);projectsRef.current=[];setOpenWorld(null);openWorldRef.current=null;setPendingStrategicBuild(null);setStrategicBuildAnchor(null);
  }

  if(!scenario){
    const presets=SCENARIO_PRESETS.filter(p=>setupCategory==="all"||setupCategory==="historical"===p.historical);
    const selectedPreset=SCENARIO_PRESETS.find(p=>p.id===selectedPresetId)??SCENARIO_PRESETS[0];
    return <main className="setup-shell">
      <div className="setup-panel">
        <div className="setup-brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>OPERATIONAL COMMAND SIMULATION</small></div></div>
        <div className="setup-grid">
          <section className="setup-main">
            <div className="setup-heading"><small>CREATE GAME</small><h1>{selectedGameMode==="openworld"?"Build a dominion":"Choose a theater"}</h1><p>{selectedGameMode==="openworld"?"Expand territory, exploit resources automatically, build infrastructure and raise new armies against multiple rivals.":"Terrain now changes the roster, mobility, visibility and logistics. Historical presets are stylized scenarios, not exact order-of-battle reconstructions."}</p></div>
            <div className="setup-tabs"><button disabled={Boolean(multiplayer)} className={selectedGameMode==="scenario"?"active":""} onClick={()=>setSelectedGameMode("scenario")}>SCENARIO WAR</button><button disabled={Boolean(multiplayer)} className={selectedGameMode==="openworld"?"active":""} onClick={()=>{setSelectedGameMode("openworld");setSelectedPresetId("frontier")}}>OPEN WORLD</button></div>
            <div className="setup-tabs"><button className={setupCategory==="all"?"active":""} onClick={()=>setSetupCategory("all")}>ALL</button><button className={setupCategory==="fictional"?"active":""} onClick={()=>setSetupCategory("fictional")}>FICTIONAL</button><button className={setupCategory==="historical"?"active":""} onClick={()=>setSetupCategory("historical")}>HISTORICAL</button></div>
            {selectedGameMode==="scenario"&&<div className="scenario-grid">{presets.map(preset=><button key={preset.id} disabled={Boolean(multiplayer)} className={"scenario-card theme-"+preset.theme+" "+(selectedPresetId===preset.id?"selected":"")} onClick={()=>{setSelectedPresetId(preset.id);setPlayerSide("blue")}}>
              <span className="scenario-theme">{preset.theme.toUpperCase()} · {preset.era.replace("_"," ").toUpperCase()}</span><b>{preset.title}</b><small>{preset.location}{preset.year?" · "+preset.year:""}</small><p>{preset.subtitle}</p>
              <span className="scenario-side-line"><span><Flag styleName={preset.sideFlags.blue}/>{preset.sideNames.blue}</span><i>VS</i><span><Flag styleName={preset.sideFlags.red}/>{preset.sideNames.red}</span></span>
            </button>)}</div>}
            {selectedGameMode==="openworld"&&<div className="openworld-intro"><b>OPEN WORLD DOMINION</b><p>Three rival powers. No fixed front. Territory itself is the objective.</p><span>Automatic regional resources · 3 barracks families · dynamic settlements · roads · walls · forts · generous supply · minimap</span></div>}
          </section>
          <aside className="setup-side">
            <div className="section-title">{selectedGameMode==="openworld"?"WORLD RULESET":"SELECTED THEATER"}</div><h2>{selectedGameMode==="openworld"?"Open World Dominion":selectedPreset.title}</h2><p>{selectedGameMode==="openworld"?"Procedural continental theater · three factions":selectedPreset.location+(selectedPreset.year?" · "+selectedPreset.year:"")}</p>
            <div className="setup-facts"><span><small>THEME</small><b>{selectedPreset.theme.toUpperCase()}</b></span><span><small>ERA</small><b>{selectedPreset.era.replace("_"," ").toUpperCase()}</b></span><span><small>MAP</small><b>{Math.round(WORLD_W*(selectedPreset.mapScale??1))} × {Math.round(WORLD_H*(selectedPreset.mapScale??1))}</b></span><span><small>FOG</small><b>ENABLED</b></span></div>
            <div className="section-title">PLAY AS</div><div className="side-choice">
              {(["blue","red"] as Side[]).map(side=><button key={side} disabled={Boolean(multiplayer)} className={playerSide===side?"active":""} onClick={()=>setPlayerSide(side)}><Flag styleName={selectedPreset.sideFlags[side]??"generic-blue"}/><span><b>{selectedPreset.sideNames[side]}</b><small>{selectedPreset.id==="spain-1937"?(side==="blue"?"REPUBLICAN COMMAND":"NATIONALIST COMMAND"):(side==="blue"?"LEFT / BLUE DEPLOYMENT":"RIGHT / RED DEPLOYMENT")}</small></span></button>)}
            </div>
            <div className="section-title">GAME MODE</div><div className="mode-list">
              <button disabled={Boolean(multiplayer)} className={!multiplayer?"active":""}><b>SINGLE PLAYER</b><small>You command {selectedPreset.sideNames[playerSide]}</small></button>
              <button disabled={selectedGameMode==="openworld"||Boolean(multiplayer)||networkPhase==="matching"} onClick={()=>void beginQuickPlay()}><b>QUICK PLAY · PVP</b><small>{selectedGameMode==="openworld"?"Scenario mode only":"Match with the next available commander"}</small></button>
              <button disabled={selectedGameMode==="openworld"||Boolean(multiplayer)||networkPhase==="matching"} onClick={()=>void beginPrivateMatch()}><b>PRIVATE MATCH</b><small>{selectedGameMode==="openworld"?"Scenario mode only":"Create a room and share its link"}</small></button>
            </div>
            {multiplayer&&<div className={"network-lobby "+networkPhase}><div><b>{networkPhase==="connected"?"OPPONENT CONNECTED":networkPhase==="opponent-left"?"OPPONENT DISCONNECTED":multiplayer.kind==="quickplay"?"QUICK PLAY QUEUE":"PRIVATE ROOM"}</b><small>ROOM {multiplayer.code} · YOU ARE {multiplayer.side.toUpperCase()}</small></div>{inviteLink&&<div className="invite-link"><input aria-label="Invite link" readOnly value={inviteLink}/><button onClick={()=>void navigator.clipboard.writeText(inviteLink)}>COPY LINK</button></div>}<button className="cancel-network" onClick={cancelMultiplayer}>CANCEL</button></div>}
            {networkPhase==="matching"&&<div className="network-lobby matching"><b>CONNECTING TO MATCHMAKING…</b><small>Preparing Supabase Realtime session.</small></div>}
            {networkError&&<div className="network-error">{networkError}</div>}
            <button className="launch-button" disabled={Boolean(multiplayer)||networkPhase==="matching"} onClick={()=>startGame()}>{selectedGameMode==="openworld"?"FOUND DOMINION":"DEPLOY TO THEATER"}</button>
          </aside>
        </div>
      </div>
    </main>;
  }
  const activeScenario:Scenario=scenario;
  const mapW=activeScenario.worldWidth,mapH=activeScenario.worldHeight;
  const currentSupplyNetwork=computeSupplyNetwork(activeScenario,units,cities);

  function mapPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return null;
    return{x:(clientX-rect.left-pan.x)/zoom,y:(clientY-rect.top-pan.y)/zoom};
  }

  function viewportPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();return rect?{x:clientX-rect.left,y:clientY-rect.top}:null;
  }

  function boundedPan(next:{x:number;y:number},z=zoom){
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return next;
    const worldW=mapW*z,worldH=mapH*z;
    return{x:worldW<=rect.width?(rect.width-worldW)/2:clamp(next.x,rect.width-worldW,0),y:worldH<=rect.height?(rect.height-worldH)/2:clamp(next.y,rect.height-worldH,0)};
  }

  function nearestLandPoint(x:number,y:number){
    const cx=clamp(x,2,mapW-2),cy=clamp(y,2,mapH-2);if(terrainAt(activeScenario,cx,cy).terrain!=="water")return{x:cx,y:cy};
    for(let radius=18;radius<=270;radius+=18)for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2,nx=clamp(cx+Math.cos(a)*radius,2,mapW-2),ny=clamp(cy+Math.sin(a)*radius,2,mapH-2);
      if(terrainAt(activeScenario,nx,ny).terrain!=="water")return{x:nx,y:ny};
    }
    return{x:cx,y:cy};
  }

  function deployFront(start:{x:number;y:number},end:{x:number;y:number}){
    if(selected.length<2)return;
    const dx=end.x-start.x,dy=end.y-start.y,len2=dx*dx+dy*dy;if(len2<100)return;
    const ordered=units.filter(u=>selected.includes(u.id)).sort((a,b)=>(((a.x-start.x)*dx+(a.y-start.y)*dy)-((b.x-start.x)*dx+(b.y-start.y)*dy))/len2);
    const targets=new Map<string,{x:number;y:number}>();
    ordered.forEach((u,i)=>{const t=ordered.length===1?.5:i/(ordered.length-1);targets.set(u.id,nearestLandPoint(start.x+dx*t,start.y+dy*t))});
    commitUnits(prev=>prev.map(u=>{const target=targets.get(u.id);return target?{...u,formationShape:"line",order:{type:"move",targetX:target.x,targetY:target.y}}:u}));setPendingOrder(null);
  }

  function assignGroup(groupId:string){
    if(!selected.length)return;
    commitUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,groupId}:u));
  }

  function selectGroup(groupId:string){
    setSelected(units.filter(u=>localSides.has(u.side)&&u.groupId===groupId).map(u=>u.id));
    setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);
  }

  function arrangeFormation(shape:FormationShape){
    const chosen=units.filter(u=>selected.includes(u.id));if(chosen.length<2)return;
    const cx=chosen.reduce((s,u)=>s+u.x,0)/chosen.length,cy=chosen.reduce((s,u)=>s+u.y,0)/chosen.length;
    const nearest=enemy.map(v=>({v,d:Math.hypot(v.x-cx,v.y-cy)})).sort((a,b)=>a.d-b.d)[0]?.v;
    const hx=nearest?(nearest.x-cx)/(Math.hypot(nearest.x-cx,nearest.y-cy)||1):1;
    const hy=nearest?(nearest.y-cy)/(Math.hypot(nearest.x-cx,nearest.y-cy)||1):0;
    const px=-hy,py=hx;
    const targets=new Map<string,{x:number;y:number}>();
    chosen.forEach((u,i)=>{
      const centered=i-(chosen.length-1)/2;let along=0,lateral=0;
      if(shape==="line")lateral=centered*95;
      else if(shape==="column")along=centered*82;
      else if(shape==="echelon"){lateral=centered*82;along=-centered*48}
      else{
        const rank=Math.floor(Math.sqrt(i)),rankStart=rank*rank,pos=i-rankStart;
        lateral=(pos-rank/2)*105;along=-rank*90;
      }
      targets.set(u.id,nearestLandPoint(cx+hx*along+px*lateral,cy+hy*along+py*lateral));
    });
    commitUnits(prev=>prev.map(u=>{const t=targets.get(u.id);return t?{...u,formationShape:shape,order:{type:"move",targetX:t.x,targetY:t.y}}:u}));
  }

  function createAttackPlan(tx:number,ty:number){
    const chosen=units.filter(u=>selected.includes(u.id));if(!chosen.length)return;
    const side=chosen[0].side,id="plan-"+side+"-"+planCounter.current++;
    const plan:AttackPlan={id,name:"OP "+String(planCounter.current-1).padStart(2,"0"),side,formationIds:chosen.map(u=>u.id),targetX:tx,targetY:ty,status:"draft"};
    setAttackPlans(prev=>[...prev,plan]);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-upsert",{plan});
    setPendingPlan(false);setPendingBuild(null);
  }

  function executePlan(id:string){
    const plan=attackPlans.find(p=>p.id===id);if(!plan)return;
    const chosen=plan.formationIds;
    commitUnits(prev=>prev.map(u=>{
      if(!chosen.includes(u.id))return u;
      const i=chosen.indexOf(u.id),angle=(i%7)/7*Math.PI*2,r=35+18*Math.floor(i/7);
      const t=nearestLandPoint(plan.targetX+Math.cos(angle)*r,plan.targetY+Math.sin(angle)*r);
      return{...u,order:{type:DIRECT_COMBAT_KINDS.has(u.kind)?"assault":"move",targetX:t.x,targetY:t.y}};
    }));
    const executing:AttackPlan={...plan,status:"executing"};
    setAttackPlans(prev=>prev.map(p=>p.id===id?executing:p));
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-upsert",{plan:executing});
  }

  function cancelPlan(id:string){
    const plan=attackPlans.find(p=>p.id===id);
    setAttackPlans(prev=>prev.filter(p=>p.id!==id));
    if(plan&&multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-delete",{id});
  }

  function planOrigin(plan:AttackPlan){
    const force=units.filter(u=>plan.formationIds.includes(u.id));
    return force.length?{x:force.reduce((s,u)=>s+u.x,0)/force.length,y:force.reduce((s,u)=>s+u.y,0)/force.length}:{x:plan.targetX,y:plan.targetY};
  }

  function armConstruction(kind:EmplacementKind){
    const engineers=selectedUnits.filter(u=>u.kind==="engineer"&&localSides.has(u.side));
    if(!engineers.length)return;
    setPendingBuild(kind);setPendingOrder(null);setPendingPlan(false);
  }

  function createConstruction(tx:number,ty:number){
    if(!pendingBuild)return;
    const engineers=selectedUnits.filter(u=>u.kind==="engineer"&&localSides.has(u.side));
    if(!engineers.length){setPendingBuild(null);return}
    const terrain=terrainAt(activeScenario,tx,ty).terrain;
    if(terrain==="water"||terrain==="highmountain")return;
    const id="build-"+playerSide+"-"+buildCounter.current++;
    const project:ConstructionProject={
      id,kind:pendingBuild,side:engineers[0].side,x:tx,y:ty,builderIds:engineers.map(u=>u.id),progress:0,
      requiredHours:pendingBuild==="observatory"?26:pendingBuild==="fixed_artillery"?50:pendingBuild==="field_fortification"?18:34
    };
    const next=[...projectsRef.current,project];projectsRef.current=next;setConstructionProjects(next);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("construction-create",{project});
    commitUnits(prev=>prev.map(u=>project.builderIds.includes(u.id)?{...u,order:{type:"move",targetX:tx,targetY:ty}}:u));
    setPendingBuild(null);
  }

  function issueMapTargetAt(clientX:number,clientY:number,append=false){
    if(!selected.length&&!pendingStrategicBuild)return;
    if((pendingOrder==="assault"||pendingOrder==="relieve")&&!pendingStrategicBuild)return;
    const point=mapPoint(clientX,clientY);if(!point)return;
    const tx=clamp(point.x,1,mapW-1),ty=clamp(point.y,1,mapH-1);if(terrainAt(activeScenario,tx,ty).terrain==="water")return;
    if(pendingStrategicBuild&&openWorldRef.current){
      if(pendingStrategicBuild==="city"){
        if(citiesRef.current.some(c=>Math.hypot(c.x-tx,c.y-ty)<360))return;
        const built=buildStrategicCity(openWorldRef.current,playerSide);
        if(!built.built)return;
        const city:CityState={name:"Founded "+built.state.serial,x:tx,y:ty,owner:playerSide,capture:0};
        openWorldRef.current=built.state;setOpenWorld(built.state);citiesRef.current=[...citiesRef.current,city];setCities(citiesRef.current);
        setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return;
      }
      if(pendingStrategicBuild==="road"||pendingStrategicBuild==="wall"){
        if(!strategicBuildAnchor){setStrategicBuildAnchor({x:tx,y:ty});return}
        if(Math.hypot(tx-strategicBuildAnchor.x,ty-strategicBuildAnchor.y)<60)return;
        const next=addStrategicStructure(openWorldRef.current,playerSide,pendingStrategicBuild,strategicBuildAnchor.x,strategicBuildAnchor.y,tx,ty);
        openWorldRef.current=next;setOpenWorld(next);setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return;
      }
      const next=addStrategicStructure(openWorldRef.current,playerSide,pendingStrategicBuild,tx,ty);
      openWorldRef.current=next;setOpenWorld(next);setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return
    }
    if(pendingBuild){createConstruction(tx,ty);return}
    if(pendingPlan){createAttackPlan(tx,ty);return}
    const requested=pendingOrder;
    commitUnits(prev=>{
      return prev.map(u=>{
        if(!selected.includes(u.id))return u;
        if(append&&u.order?.targetX!==undefined&&u.order?.targetY!==undefined&&!u.order.targetUnitId){
          const tail=u.order.waypoints?.length?u.order.waypoints[u.order.waypoints.length-1]:{x:u.order.targetX,y:u.order.targetY};
          const leg=movementRoutePlan(activeScenario,cities,u,tail,{x:tx,y:ty},openWorldRef.current);
          return{...u,order:{...u.order,waypoints:[...(u.order.waypoints??[]),...leg]}};
        }
        if(requested==="fire"){
          if(u.kind!=="mortar")return u;
          const range=Math.hypot(tx-u.x,ty-u.y);
          if(range>mortarMaxRange(activeScenario,u))return u;
          return{...u,order:{type:"fire",targetX:tx,targetY:ty}};
        }
        if(requested==="probe"&&DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:"probe",targetX:tx,targetY:ty}};
        const route=movementRoutePlan(activeScenario,cities,u,{x:u.x,y:u.y},{x:tx,y:ty},openWorldRef.current);
        const [first,...rest]=route;
        return first?{...u,order:{type:"move",targetX:first.x,targetY:first.y,waypoints:rest}}:{...u,order:{type:"move",targetX:tx,targetY:ty}};
      });
    });
    if(!append)setPendingOrder(null);
  }

  function suppressNativeContextMenu(e:ReactMouseEvent){
    e.preventDefault();
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(suppressContextMenu.current){suppressContextMenu.current=false;return}
    issueMapTargetAt(e.clientX,e.clientY,e.shiftKey||e.ctrlKey);
  }

  function issueUnitTargetCore(target:Formation,allowDefaultMove:boolean){
    if(!selected.length||selected.includes(target.id))return;
    const requested=pendingOrder;
    if(!requested&&!allowDefaultMove)return;

    if(requested==="relieve"){
      if(!primary||target.side!==primary.side)return;
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)&&DIRECT_COMBAT_KINDS.has(u.kind)?{...u,order:{type:"relieve",targetUnitId:target.id}}:u));
      setPendingOrder(null);return;
    }

    if((requested==="assault"||requested==="fire"||requested==="probe")&&primary&&target.side===primary.side)return;
    commitUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;
      if(requested==="fire")return u.kind==="mortar"?{...u,order:{type:"fire",targetX:target.x,targetY:target.y}}:GUN_ARTILLERY_KINDS.has(u.kind)?{...u,order:{type:"fire",targetUnitId:target.id}}:u;
      if(requested==="assault"||requested==="probe"){
        if(ARTILLERY_KINDS.has(u.kind))return{...u,order:{type:"fire",targetUnitId:target.id}};
        if(DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:requested,targetUnitId:target.id}};
        return u;
      }
      return{...u,order:{type:"move",targetUnitId:target.id}};
    }));
    setPendingOrder(null);
  }

  function issueUnitTarget(e:ReactMouseEvent,target:Formation){
    e.preventDefault();e.stopPropagation();issueUnitTargetCore(target,true);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top,next=clamp(zoom*(e.deltaY>0?.9:1.1),.1,1.5),wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setZoom(next);setPan(boundedPan({x:mx-wx*next,y:my-wy*next},next));
  }

  function beginPinch(){
    const rect=viewport.current?.getBoundingClientRect();
    const points=[...touchPoints.current.values()];
    if(!rect||points.length<2)return;
    const [a,b]=points;
    const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
    const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
    pinch.current={distance,zoom,worldX:(midX-pan.x)/zoom,worldY:(midY-pan.y)/zoom};
    drag.current=null;setSelectionBox(null);setFrontPreview(null);
  }

  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"){
      e.preventDefault();
      touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      e.currentTarget.setPointerCapture(e.pointerId);
      if(touchPoints.current.size>=2){beginPinch();return}
      const screen=viewportPoint(e.clientX,e.clientY);if(!screen)return;
      const targeting=Boolean(pendingOrder||pendingPlan||pendingBuild||pendingStrategicBuild);
      const mode:"pan"|"box"|"front"|"target"=targeting?"target":mobileTool==="select"?"box":mobileTool==="front"&&selected.length>1?"front":"pan";
      drag.current={mode,startClientX:e.clientX,startClientY:e.clientY,px:pan.x,py:pan.y,moved:false};
      if(mode==="box")setSelectionBox({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
      if(mode==="front")setFrontPreview({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
      return;
    }

    if(e.button>2)return;const screen=viewportPoint(e.clientX,e.clientY);if(!screen)return;
    let mode:"pan"|"box"|"front"|"select"="select";
    if(e.button===1)mode="pan";
    else if(e.button===0&&e.ctrlKey&&selected.length>1)mode="front";
    else if(e.button===0)mode="box";
    else return;
    if(mode==="pan")e.preventDefault();
    drag.current={mode,startClientX:e.clientX,startClientY:e.clientY,px:pan.x,py:pan.y,moved:false};
    if(mode==="box")setSelectionBox({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
    if(mode==="front")setFrontPreview({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const point=mapPoint(e.clientX,e.clientY);if(point){setHovered(terrainAt(activeScenario,point.x,point.y));setAimPoint({x:point.x,y:point.y})}

    if(e.pointerType==="touch"){
      if(touchPoints.current.has(e.pointerId))touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pinch.current&&touchPoints.current.size>=2){
        const rect=viewport.current?.getBoundingClientRect(),points=[...touchPoints.current.values()];if(!rect||points.length<2)return;
        const [a,b]=points,distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
        const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
        const nextZoom=clamp(pinch.current.zoom*(distance/pinch.current.distance),.12,1.5);
        setZoom(nextZoom);
        setPan(boundedPan({x:midX-pinch.current.worldX*nextZoom,y:midY-pinch.current.worldY*nextZoom},nextZoom));
        return;
      }
    }

    const d=drag.current;if(!d)return;
    if(Math.hypot(e.clientX-d.startClientX,e.clientY-d.startClientY)>6)d.moved=true;
    if(d.mode==="pan"){setPan(boundedPan({x:d.px+e.clientX-d.startClientX,y:d.py+e.clientY-d.startClientY}));return}
    if(d.mode==="target"||d.mode==="select")return;
    const screen=viewportPoint(e.clientX,e.clientY),start=viewportPoint(d.startClientX,d.startClientY);if(!screen||!start)return;
    if(d.mode==="box")setSelectionBox({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});
    if(d.mode==="front")setFrontPreview({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});
  }

  function onPointerUp(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"){
      touchPoints.current.delete(e.pointerId);
      if(pinch.current){
        if(touchPoints.current.size<2)pinch.current=null;
        drag.current=null;return;
      }
    }

    const d=drag.current;if(!d)return;drag.current=null;
    if(d.mode==="pan")return;
    if(d.mode==="target"){if(!d.moved)issueMapTargetAt(e.clientX,e.clientY);return}
    if(d.mode==="select"){if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null)}return}
    if(d.mode==="box"){
      setSelectionBox(null);
      if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);return}
      const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(!a||!b)return;
      const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
      setSelected(units.filter(u=>localSides.has(u.side)&&u.x>=minX&&u.x<=maxX&&u.y>=minY&&u.y<=maxY).map(u=>u.id));setPendingOrder(null);return;
    }
    setFrontPreview(null);if(!d.moved)return;const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(a&&b)deployFront(a,b);
  }

  function onPointerCancel(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch")touchPoints.current.delete(e.pointerId);
    if(touchPoints.current.size<2)pinch.current=null;
    drag.current=null;setSelectionBox(null);setFrontPreview(null);
  }

  function orderLabel(u:Formation){
    if(!u.order)return"NO ORDERS";
    if(u.order.targetUnitId){const target=units.find(v=>v.id===u.order?.targetUnitId);return u.order.type.toUpperCase()+" → "+(target?.name??"LOST CONTACT")}
    if(u.order.targetX!==undefined&&u.order.targetY!==undefined)return u.order.type.toUpperCase()+" · "+Math.round(Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y)/8)+" KM";
    return u.order.type.toUpperCase();
  }

  const currentLogisticsGraph=computeLogisticsLinks(activeScenario,units,cities,currentSupplyNetwork,emplacements);
  const primaryAccess=primary?supplyAccess(activeScenario,primary,units,cities,currentSupplyNetwork,emplacements,currentLogisticsGraph,openWorld):null;
  const localSupplyStatus=overlay==="supply"
    ?units.filter(u=>localSides.has(u.side)).map(u=>({u,access:supplyAccess(activeScenario,u,units,cities,currentSupplyNetwork,emplacements,currentLogisticsGraph,openWorld)}))
    :[];
  const canRetreat=selectedUnits.some(u=>isInCombat(u,units));

  return <main className={"game-shell theme-"+activeScenario.theme}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>{activeScenario.title.toUpperCase()} · #{activeScenario.seed.toString(16).toUpperCase()}</small></div></div>
      <div className="theater-state"><span className="command-side"><Flag styleName={activeScenario.sideFlags[playerSide]??"generic-blue"}/>{activeScenario.sideNames[playerSide]}</span><span>DAY {day}</span><strong>{timeLabel(hour)}</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span>{multiplayer&&<span className={"network-badge "+networkPhase}>PVP · {multiplayer.code}</span>}</div>
      <div className="global-metrics"><div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div><div><small>ORG</small><b>{pct(averageOrg)}%</b></div><div><small>CITIES</small><b>{blueCities}/{cities.length}</b></div><div><small>CONTACTS</small><b>{enemy.length}</b></div></div>
      <div className="time-controls"><button className="setup-return" onClick={returnToSetup}>SETUP</button><button disabled={Boolean(multiplayer&&!multiplayer.isHost)} onClick={()=>setRunning(v=>warResult?v:!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>{[1,2,3].map(s=><button disabled={Boolean(multiplayer&&!multiplayer.isHost)} key={s} onClick={()=>{if(!warResult){setSpeed(s);setRunning(true)}}} className={speed===s?"active":""}>×{s}</button>)}</div>
    </header>

    {multiplayer&&networkPhase==="opponent-left"&&<div className="network-status-banner">OPPONENT DISCONNECTED · MATCH PAUSED</div>}
    {isMobile&&mobilePanel!=="none"&&<button className="mobile-backdrop" aria-label="Close panel" onClick={()=>setMobilePanel("none")}/>}
    <aside className={"left-panel "+(mobilePanel==="forces"?"mobile-open":"")}>
      <button className="mobile-panel-close" onClick={()=>setMobilePanel("none")}>CLOSE</button>
      <section><div className="section-title">MAP LAYERS</div><div className="segmented">{(["terrain","supply","intel"] as OverlayMode[]).map(m=><button key={m} onClick={()=>setOverlay(m)} className={overlay===m?"active":""}>{m.toUpperCase()}</button>)}</div></section>
      <section><div className="section-title">ARMY GROUPS · CTRL+1…6 ASSIGN</div><div className="army-group-grid">{armyGroups.map(g=><button key={g.id} onClick={()=>selectGroup(g.id)}><b>{g.hotkey}</b><span>{g.name}<small>{blue.filter(u=>u.groupId===g.id).length} formations</small></span></button>)}</div></section>
      <section><div className="section-title">ATTACK PLANS · B THEN RMB</div><div className="plan-list">{attackPlans.length?attackPlans.map(p=><div className={"plan-row "+p.status} key={p.id}><button onClick={()=>setSelected(p.formationIds)}><b>{p.name}</b><small>{p.formationIds.length} formations · {p.status}</small></button>{p.status==="draft"&&<button onClick={()=>executePlan(p.id)}>GO</button>}<button onClick={()=>cancelPlan(p.id)}>×</button></div>):<small className="muted-line">No plans drafted.</small>}</div></section>
      {openWorld&&<section className="openworld-panel"><div className="section-title">DOMINION</div><div className="resource-strip"><b>MP {Math.floor(openWorld.resources[playerSide].manpower)}</b><b>MAT {Math.floor(openWorld.resources[playerSide].materials)}</b><b>FUEL {Math.floor(openWorld.resources[playerSide].fuel)}</b></div><div className="section-title">RAISE FORMATIONS</div><div className="recruit-grid">{(["infantry","mountaineer","special_forces","engineer","cavalry","recon","mechanized","tank","mortar","artillery","heavy_artillery","logistics"] as Formation["kind"][]).map(kind=>{const cost=UNIT_COST[kind];const barracks=openWorld.structures.find(b=>b.side===playerSide&&b.kind===cost?.family);return <button key={kind} disabled={!cost||!barracks} onClick={()=>{if(!cost||!barracks)return;const next=queueRecruitment(openWorldRef.current!,playerSide,kind,barracks.id);openWorldRef.current=next;setOpenWorld(next)}}><b>{UNIT_LABEL[kind]}</b><small>{cost?cost.manpower+" MP · "+cost.materials+" MAT · "+cost.fuel+" F":"—"}</small></button>})}</div><div className="section-title">BUILD</div><div className="strategic-build-grid">{(["infantry_barracks","mobile_barracks","support_barracks","city","fort","wall","road"] as OpenWorldBuildKind[]).map(kind=><button key={kind} className={pendingStrategicBuild===kind?"active":""} onClick={()=>{setPendingStrategicBuild(kind);setStrategicBuildAnchor(null);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null)}}>{kind.replaceAll("_"," ").toUpperCase()}</button>)}</div><small className="muted-line">Owned territory yields resources automatically. Concentrated armies urbanize empty territory into new cities.</small></section>}
      <section><div className="section-title">ENGINEER WORKS</div><div className="construction-list">{constructionProjects.length?constructionProjects.filter(p=>localSides.has(p.side)).map(project=><div className="construction-row" key={project.id}><b>{project.kind==="observatory"?"OBSERVATORY":project.kind==="fixed_artillery"?"FIXED ARTILLERY":project.kind==="field_fortification"?"FIELD FORTIFICATION":"SUPPLY DEPOT"}</b><span>{Math.round(project.progress/project.requiredHours*100)}%</span><i><em style={{width:Math.min(100,project.progress/project.requiredHours*100)+"%"}}/></i></div>):<small className="muted-line">No active construction.</small>}</div></section>
      <section><div className="section-title">ORDER OF BATTLE</div><div className="oob-list">{blue.map(u=><button key={u.id} onClick={()=>{setSelected([u.id]);if(isMobile)setMobilePanel("unit")}} className={selected.includes(u.id)?"selected":""}><span className="oob-code">{UNIT_LABEL[u.kind]}</span><span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span></button>)}</div></section>
    </aside>

    <div ref={viewport} className={pendingOrder||pendingPlan||pendingBuild||pendingStrategicBuild?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenuCapture={suppressNativeContextMenu} onContextMenu={issueTarget}>
      <div className="world" style={{width:mapW,height:mapH,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={mapW} height={mapH} viewBox={"0 0 "+mapW+" "+mapH}>
          <defs><linearGradient id="sea" x1="0" x2="1"><stop offset="0" stopColor="#1c313c"/><stop offset="1" stopColor="#29424b"/></linearGradient><linearGradient id="intelShade" x1="0" x2="1"><stop offset="0" stopColor="#71846a" stopOpacity=".08"/><stop offset=".55" stopColor="#151b18" stopOpacity=".22"/><stop offset="1" stopColor="#050806" stopOpacity=".68"/></linearGradient><clipPath id="landClip"><path d={activeScenario.landPath}/></clipPath><mask id="fogMask" maskUnits="userSpaceOnUse"><rect width={mapW} height={mapH} fill="white"/>{blue.map(u=><circle key={"fog-u-"+u.id} cx={u.x} cy={u.y} r={visionRange(u)} fill="black"/>)}{cities.filter(c=>localSides.has(c.owner)).map(c=><circle key={"fog-c-"+c.name} cx={c.x} cy={c.y} r="270" fill="black"/>)}{emplacements.filter(e=>localSides.has(e.side)&&e.kind==="observatory").map(e=><circle key={"fog-e-"+e.id} cx={e.x} cy={e.y} r={e.range} fill="black"/>)}</mask></defs>
          <rect width={mapW} height={mapH} fill="url(#sea)"/><path d={activeScenario.landPath} className="land-base"/>
          {activeScenario.terrainFeatures.map(f=><path key={f.id} d={f.path} className={"terrain-region "+f.terrain}/>)}
          <g className="territory-layer" clipPath="url(#landClip)">
            {openWorld
              ?(["blue","red","green"] as Side[]).map(side=><g key={"territory-"+side} className={"territory-mass "+side}>
                {openWorld.resourceNodes.filter(cell=>cell.owner===side).map(cell=><circle key={"tn-"+cell.id} className={cell.contested>.52?"contested":""} cx={cell.x} cy={cell.y} r={345+cell.control*85} opacity={Math.max(.24,.3+cell.control*.62-cell.contested*.1)}/>)}
              </g>)
              :(["blue","red","green"] as Side[]).map(side=><g key={"territory-"+side} className={"territory-mass "+side}>
                {cities.filter(c=>c.owner===side).map(c=><circle key={"tc-"+c.name} cx={c.x} cy={c.y} r="520"/>)}
                {units.filter(u=>u.side===side&&u.strength>18).map(u=><circle key={"tu-"+u.id} cx={u.x} cy={u.y} r={150+Math.min(105,u.strength)}/>)}
              </g>)}
          </g>
          {activeScenario.riverRoutes.map((route,i)=><path key={"river"+i} d={polylinePath(route)} className="river"/>)}
          {activeScenario.roadRoutes.map((route,i)=><path key={"road"+i} d={polylinePath(route)} className="road"/>)}{activeScenario.roadNodes.map(node=><circle key={node.id} cx={node.x} cy={node.y} r="7" className="road-node"/>)}
          {openWorld?.structures.filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined).map(s=><path key={s.id} d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2} className={"built-road "+s.side}/>)}
          {openWorld?.structures.filter(s=>s.kind==="wall"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined).map(s=><g key={s.id} className={"built-wall "+s.side} opacity={.45+.55*s.strength/160}><path d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2}/><path className="wall-cap" d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2}/></g>)}
          {cities.map(s=><g key={s.name} className={"site-label "+s.owner+(overlay==="supply"?(localSides.has(s.owner)?" supply-city friendly-supply-city":" supply-city hostile-supply-city"):"")}><circle cx={s.x} cy={s.y} r="6" className="site-core"/><circle cx={s.x} cy={s.y} r="25" className="site-ring"/>{s.capture>0&&<circle cx={s.x} cy={s.y} r="30" className="capture-ring" pathLength="100" strokeDasharray={s.capture+" "+(100-s.capture)} transform={"rotate(-90 "+s.x+" "+s.y+")"}/>}<text x={s.x+11} y={s.y-11}>{s.name.toUpperCase()} · {s.owner==="blue"?"B":s.owner==="red"?"R":"G"}</text></g>)}
          {overlay==="supply"&&<g className="city-supply-ranges">{cities.map(s=><circle key={"range-"+s.name} cx={s.x} cy={s.y} r={currentLogisticsGraph.cityRange} className={"city-supply-range "+s.owner}/>)}</g>}
          {overlay==="supply"&&<g className="supply-overlay">
            <rect width={mapW} height={mapH} className="supply-map-wash"/>
            {currentSupplyNetwork.roads.map(road=>{
              const friendlyA=localSides.has(road.a.owner),friendlyB=localSides.has(road.b.owner);
              const hostile=!friendlyA&&!friendlyB;
              const cuts=road.cuts[playerSide];
              const state=cuts.length?"cut":friendlyA&&friendlyB?"friendly":friendlyA||friendlyB?"local":hostile?"hostile":"contested";
              return <g key={"supply-road-"+road.index}>
                <path d={polylinePath(road.route)} className={"supply-route "+state}/>
                {cuts.map((cut,i)=><g key={"cut-"+road.index+"-"+i} className="supply-cut-marker" transform={"translate("+cut.x+" "+cut.y+")"}>
                  <circle r="24"/><line x1="-14" y1="-14" x2="14" y2="14"/><line x1="-14" y1="14" x2="14" y2="-14"/>
                </g>)}
              </g>
            })}
            {openWorld?.structures.filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined).map(s=>{
              const route=[{x:s.x,y:s.y},{x:s.x2!,y:s.y2!}],cuts=routeInterdictionPoints(route,playerSide,units);
              const connected=s.side===playerSide&&(Boolean(supplySourceAtPoint(playerSide,route[0],cities,currentSupplyNetwork))||Boolean(supplySourceAtPoint(playerSide,route[1],cities,currentSupplyNetwork)));
              const state=s.side!==playerSide?"hostile":cuts.length?"cut":connected?"local":"contested";
              return <g key={"built-supply-"+s.id}><path d={polylinePath(route)} className={"supply-route built "+state}/>{cuts.map((cut,i)=><g key={"built-cut-"+s.id+"-"+i} className="supply-cut-marker" transform={"translate("+cut.x+" "+cut.y+")"}><circle r="24"/><line x1="-14" y1="-14" x2="14" y2="14"/><line x1="-14" y1="14" x2="14" y2="-14"/></g>)}</g>
            })}
            {cities.map(s=><g key={s.name} className={localSides.has(s.owner)?"supply-city-node friendly":"supply-city-node hostile"}>
              <circle cx={s.x} cy={s.y} r={localSides.has(s.owner)?88:70} className={"supply-node "+s.owner}/>
              {localSides.has(s.owner)&&<text x={s.x+30} y={s.y+34} className="supply-capacity">×{currentSupplyNetwork.capacity.get(s.name)??1}</text>}
            </g>)}
            {currentLogisticsGraph.hubLinks.filter(link=>emplacements.some(e=>e.id===link.hubId&&localSides.has(e.side))).map(link=><line key={"hub-link-"+link.hubId} x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} className={"hub-link "+(link.active?"active":"cut")}/>)}
            {currentLogisticsGraph.links.filter(link=>units.find(u=>u.id===link.unitId&&localSides.has(u.side))).map(link=><line key={"log-link-"+link.unitId} x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} className={"logistics-link depth-"+Math.min(3,link.depth)}/>)}
            {units.filter(u=>u.kind==="logistics"&&localSides.has(u.side)).map(u=><circle key={u.id} cx={u.x} cy={u.y} r={currentLogisticsGraph.relayRange} className={"logistics-range "+u.side}/>)}
            {localSupplyStatus.map(({u,access})=><g key={"supply-state-"+u.id} className={"unit-supply-state "+(access.level<=0?"cut":access.level===1?"strained":"supplied")}>
              <circle cx={u.x} cy={u.y} r="46"/>
              {selected.includes(u.id)&&<text x={u.x+52} y={u.y+5}>{access.level<=0?"NO SUPPLY":access.label}</text>}
            </g>)}
          </g>}
          {overlay==="intel"&&<path d={activeScenario.landPath} fill="url(#intelShade)" className="intel-overlay"/>}<rect width={mapW} height={mapH} className="fog-dark" mask="url(#fogMask)"/><rect x="1" y="1" width={mapW-2} height={mapH-2} className="world-boundary"/>
        </svg>

        {selectedUnits.some(u=>ARTILLERY_KINDS.has(u.kind))&&<svg className="artillery-ranges" width={mapW} height={mapH}>{selectedUnits.filter(u=>ARTILLERY_KINDS.has(u.kind)).map(u=>{const r=u.kind==="mortar"?mortarMaxRange(activeScenario,u):u.kind==="heavy_artillery"?820:540;return <g key={"range-"+u.id}><circle cx={u.x} cy={u.y} r={r}/><text x={u.x+10} y={u.y-r+22}>{Math.round(r)} RANGE</text></g>})}</svg>}
        {pendingOrder==="fire"&&aimPoint&&selectedUnits.some(u=>u.kind==="mortar")&&<svg className="mortar-aim" width={mapW} height={mapH}><circle cx={aimPoint.x} cy={aimPoint.y} r={mortarDispersion(activeScenario,aimPoint.x,aimPoint.y,Math.min(1,Math.min(...selectedUnits.filter(u=>u.kind==="mortar").map(u=>Math.hypot(aimPoint.x-u.x,aimPoint.y-u.y)/mortarMaxRange(activeScenario,u)))))} /><circle className="mortar-aim-core" cx={aimPoint.x} cy={aimPoint.y} r="7"/></svg>}
        {units.map(u=>{
          const visible=localSides.has(u.side)||blue.some(b=>Math.hypot(b.x-u.x,b.y-u.y)<visionRange(b))||cities.some(c=>localSides.has(c.owner)&&Math.hypot(c.x-u.x,c.y-u.y)<270)||emplacements.some(e=>localSides.has(e.side)&&e.kind==="observatory"&&Math.hypot(e.x-u.x,e.y-u.y)<e.range);
          if(!visible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" kind-"+u.kind+" "+(selected.includes(u.id)?"selected ":"")+(u.organization<30?"shaken ":"")+(u.order?.type==="retreat"?"retreating":"")} style={{left:u.x-16,top:u.y-16}} onPointerDown={e=>{if(e.button===2)e.preventDefault();e.stopPropagation()}} onClick={e=>selectUnit(e,u)} onContextMenuCapture={e=>e.preventDefault()} onContextMenu={e=>issueUnitTarget(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{localSides.has(u.side)?"Ⅰ":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>
        })}
        {openWorld?.structures.filter(s=>s.kind!=="road"&&s.kind!=="wall").map(s=><div key={s.id} className={"ow-structure "+s.kind+" "+s.side} style={{left:s.x-16,top:s.y-16}} title={s.kind}><b>{s.kind==="infantry_barracks"?"INF":s.kind==="mobile_barracks"?"MOB":s.kind==="support_barracks"?"SUP":"FORT"}</b></div>)}
        {emplacements.map(e=>{
          return <div key={e.id} className={"emplacement "+e.kind+" "+e.side} style={{left:e.x-18,top:e.y-18}} title={e.kind==="observatory"?"Observatory tower":e.kind==="fixed_artillery"?"Stationary artillery battery":e.kind==="field_fortification"?"Field fortification":"Supply depot"}><b>{e.kind==="observatory"?"OBS":e.kind==="fixed_artillery"?"BAT":e.kind==="field_fortification"?"FORT":"DEP"}</b><small>{Math.round(e.strength)}</small></div>
        })}
        {constructionProjects.filter(project=>localSides.has(project.side)).map(project=><div key={project.id} className={"construction-site "+project.kind} style={{left:project.x-15,top:project.y-15}}><b>{project.kind==="observatory"?"OBS":project.kind==="fixed_artillery"?"BAT":project.kind==="field_fortification"?"FORT":"DEP"}</b><span>{Math.round(project.progress/project.requiredHours*100)}%</span></div>)}
        {primary&&primaryTargetX!==undefined&&primaryTargetY!==undefined&&<svg className="order-line" width={mapW} height={mapH}><polyline points={[{x:primary.x,y:primary.y},{x:primaryTargetX,y:primaryTargetY},...(primary.order?.waypoints??[])].map(point=>point.x+","+point.y).join(" ")} /><circle cx={primaryTargetX} cy={primaryTargetY} r="10"/>{(primary.order?.waypoints??[]).map((point,i)=><circle key={i} cx={point.x} cy={point.y} r="8"/>)}</svg>}
        {attackPlans.length>0&&<svg className="attack-plans" width={mapW} height={mapH}>{attackPlans.map(plan=>{const o=planOrigin(plan);return <g key={plan.id} className={plan.status}><line x1={o.x} y1={o.y} x2={plan.targetX} y2={plan.targetY}/><circle cx={plan.targetX} cy={plan.targetY} r="18"/><text x={plan.targetX+24} y={plan.targetY-18}>{plan.name}</text></g>})}</svg>}
      </div>

      {overlay==="supply"&&<div className="supply-legend"><b>SUPPLY CONTROL</b><span><i className="connected"/>CONNECTED ROAD</span><span><i className="local"/>LOCAL FEED</span><span><i className="cut"/>INTERDICTED / CUT</span><span><i className="unit"/>UNIT SUPPLIED</span></div>}
      {selectionBox&&<div className="selection-box" style={{left:Math.min(selectionBox.x1,selectionBox.x2),top:Math.min(selectionBox.y1,selectionBox.y2),width:Math.abs(selectionBox.x2-selectionBox.x1),height:Math.abs(selectionBox.y2-selectionBox.y1)}}/>}
      {frontPreview&&<svg className="front-preview"><line x1={frontPreview.x1} y1={frontPreview.y1} x2={frontPreview.x2} y2={frontPreview.y2}/></svg>}
      {(openWorld||mapW>WORLD_W)&&<div className="minimap"><svg viewBox={"0 0 "+mapW+" "+mapH}>{openWorld?.resourceNodes.filter(cell=>cell.owner).map(cell=><circle key={"mt-"+cell.id} cx={cell.x} cy={cell.y} r="390" className={"territory-mini "+cell.owner}/>) }{cities.map(city=><circle key={"mc-"+city.name} cx={city.x} cy={city.y} r="52" className={city.owner}/>) }{units.map(u=><circle key={u.id} cx={u.x} cy={u.y} r="32" className={u.side}/>)}</svg></div>}
      <div className="map-hud"><div><span className="dot friendly"/>FRIENDLY {blue.length}</div><div><span className="dot hostile"/>CONTACTS {enemy.length}</div><div>CITIES {blueCities}/{cities.length}</div><div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · "+(hovered.road?"SUPPLY ROAD":"OFF ROAD"):activeScenario.location.toUpperCase()}</div><div>ZOOM {Math.round(zoom*100)}%</div></div>
      {pendingStrategicBuild&&<div className="target-banner">BUILD {pendingStrategicBuild.replaceAll("_"," ").toUpperCase()} · {(pendingStrategicBuild==="road"||pendingStrategicBuild==="wall")?(strategicBuildAnchor?"SELECT END POINT":"SELECT START POINT"):(isMobile?"TAP":"RMB")+" LOCATION"} <button onClick={()=>{setPendingStrategicBuild(null);setStrategicBuildAnchor(null)}}>CANCEL</button></div>}
      {pendingBuild&&<div className="target-banner">{pendingBuild==="observatory"?"OBSERVATORY TOWER":pendingBuild==="fixed_artillery"?"FIXED ARTILLERY":pendingBuild==="field_fortification"?"FIELD FORTIFICATION":"SUPPLY DEPOT"} · {isMobile?"TAP CONSTRUCTION SITE":"RMB CONSTRUCTION SITE"} <button onClick={()=>setPendingBuild(null)}>CANCEL</button></div>}
      {pendingPlan&&<div className="target-banner">ATTACK PLAN · {isMobile?"TAP OBJECTIVE":"RMB OBJECTIVE"} <button onClick={()=>setPendingPlan(false)}>CANCEL</button></div>}
      {pendingOrder&&<div className="target-banner">{pendingOrder==="relieve"?"RELIEVE ARMED · "+(isMobile?"TAP FRIENDLY":"RMB FRIENDLY FRONTLINE"):pendingOrder==="fire"&&selectedUnits.some(u=>u.kind==="mortar")?"MORTAR FIRE · "+(isMobile?"TAP IMPACT AREA":"RMB IMPACT AREA"):pendingOrder==="assault"||pendingOrder==="fire"?pendingOrder.toUpperCase()+" ARMED · "+(isMobile?"TAP ENEMY":"RMB ENEMY FORMATION"):pendingOrder.toUpperCase()+" ARMED · "+(isMobile?"TAP TARGET":"RMB TARGET")} <button onClick={()=>setPendingOrder(null)}>CANCEL</button></div>}
      {warResult&&<div className={"war-result "+warResult}><b>{localSides.has(warResult)?"VICTORY":"DEFEAT"}</b><span>ALL STRATEGIC CITIES CONTROLLED BY {activeScenario.sideNames[warResult]??warResult.toUpperCase()}</span></div>}
    </div>

    <aside className={"right-panel "+(mobilePanel==="unit"?"mobile-open":"")}>
      <button className="mobile-panel-close" onClick={()=>setMobilePanel("none")}>CLOSE</button>
      {openWorld&&!primary?<div className="openworld-inspector"><div className="section-title">OPEN WORLD</div><b>{cities.filter(c=>c.owner===playerSide).length} CONTROLLED CITIES</b><span>{openWorld.recruitment.filter(q=>q.side===playerSide).length} formations recruiting</span><span>Keep forces concentrated on empty land to urbanize it into a permanent city.</span></div>:primary?<div className="inspector">
        <div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        <div className="section-title">SUPPLY ACCESS</div>{primaryAccess&&<div className={"supply-access level-"+primaryAccess.level}><b>{primaryAccess.label}</b><span>{primaryAccess.range>0?"Relay range "+Math.round(primaryAccess.range):primaryAccess.level===0?"Resupply severely limited":"Automatic resupply active"}</span></div>}
        <div className="section-title">ENGINEER CONSTRUCTION</div><div className="build-controls"><button disabled={!selectedUnits.some(u=>u.kind==="engineer")} className={pendingBuild==="observatory"?"active":""} onClick={()=>armConstruction("observatory")}><b>OBSERVATORY</b><small>26 engineer-hours · long-range vision</small></button><button disabled={!selectedUnits.some(u=>u.kind==="engineer")} className={pendingBuild==="fixed_artillery"?"active":""} onClick={()=>armConstruction("fixed_artillery")}><b>FIXED ARTILLERY</b><small>50 engineer-hours · stationary fire support</small></button><button disabled={!selectedUnits.some(u=>u.kind==="engineer")} className={pendingBuild==="field_fortification"?"active":""} onClick={()=>armConstruction("field_fortification")}><b>FIELD FORT</b><small>18 engineer-hours · entrenchment support</small></button><button disabled={!selectedUnits.some(u=>u.kind==="engineer")} className={pendingBuild==="supply_depot"?"active":""} onClick={()=>armConstruction("supply_depot")}><b>SUPPLY DEPOT</b><small>34 engineer-hours · local resupply hub</small></button></div>
        <div className="section-title">FORMATION</div><div className="formation-controls">{(["line","column","wedge","echelon"] as FormationShape[]).map(shape=><button key={shape} onClick={()=>arrangeFormation(shape)} disabled={selectedUnits.length<2}>{shape.toUpperCase()}</button>)}</div>
        <div className="section-title">ARMY GROUP</div><div className="group-assign">{armyGroups.map(g=><button key={g.id} className={selectedUnits.length>0&&selectedUnits.every(u=>u.groupId===g.id)?"active":""} onClick={()=>assignGroup(g.id)}>{g.hotkey}</button>)}</div>
        <div className="section-title">ORDERS</div><div className="orders">
          <button className={pendingPlan?"active plan-button":""} onClick={()=>{setPendingPlan(true);setPendingOrder(null)}}>ATTACK PLAN <kbd>B</kbd></button>
          <button className={!pendingOrder?"active":""} onClick={()=>startOrder("move")}>MOVE <kbd>M</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="assault"?"active":""} onClick={()=>startOrder("assault")}>ASSAULT <kbd>A</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="probe"?"active":""} onClick={()=>startOrder("probe")}>PROBE <kbd>P</kbd></button>
          <button disabled={!selectedUnits.some(u=>ARTILLERY_KINDS.has(u.kind))} className={pendingOrder==="fire"?"active":""} onClick={()=>startOrder("fire")}>FIRE <kbd>F</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="relieve"?"active":""} onClick={()=>startOrder("relieve")}>RELIEVE <kbd>T</kbd></button>
          <button disabled={!canRetreat} onClick={()=>startOrder("retreat")}>RETREAT <kbd>X</kbd></button>
          <button onClick={()=>startOrder("defend")}>DEFEND <kbd>D</kbd></button><button onClick={()=>startOrder("dig")}>DIG IN <kbd>G</kbd></button><button onClick={()=>startOrder("resupply")}>RESUPPLY <kbd>R</kbd></button>
        </div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>

    <nav className="mobile-toolbar" aria-label="Mobile controls">
      <button className={mobileTool==="pan"?"active":""} onClick={()=>{setMobileTool("pan");setMobilePanel("none")}}><b>✥</b><span>PAN</span></button>
      <button className={mobileTool==="select"?"active":""} onClick={()=>{setMobileTool("select");setMobilePanel("none")}}><b>▧</b><span>SELECT</span></button>
      <button disabled={selected.length<2} className={mobileTool==="front"?"active":""} onClick={()=>{setMobileTool("front");setMobilePanel("none")}}><b>╱</b><span>FRONT</span></button>
      <button className={mobilePanel==="forces"?"active":""} onClick={()=>setMobilePanel(v=>v==="forces"?"none":"forces")}><b>☷</b><span>FORCES</span></button>
      <button disabled={!primary} className={mobilePanel==="unit"?"active":""} onClick={()=>setMobilePanel(v=>v==="unit"?"none":"unit")}><b>⌖</b><span>ORDERS</span></button>
      <button disabled={Boolean(multiplayer&&!multiplayer.isHost)} onClick={()=>setRunning(v=>warResult?v:!v)}><b>{running?"Ⅱ":"▶"}</b><span>{running?"PAUSE":"PLAY"}</span></button>
    </nav>

    <footer className="statusbar">{multiplayer&&<span className="status-room">PVP ROOM {multiplayer.code}</span>}<span>SPACE: PAUSE</span><span>MMB DRAG: PAN</span><span>RMB: MOVE · SHIFT/CTRL+RMB: QUEUE</span><span>LMB DRAG: BOX SELECT</span><span>CTRL+LMB: FORM FRONT</span><span>CTRL+1…6: ASSIGN GROUP</span><span>B: ATTACK PLAN</span><span>ENGINEERS: BUILD WORKS</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}
function Flag({styleName}:{styleName:FlagStyle}){return <span className={"flag flag-"+styleName} aria-label={styleName}><i/><em/></span>}