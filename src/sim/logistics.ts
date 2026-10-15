/** logistics mechanics. Extracted without changing game rules. */
import {type OpenWorldState} from "@/sim/openworld";
import {type CityState,type Emplacement,type Formation,type Scenario,type Side} from "@/sim/types";
import {clamp,segmentContact,segmentsIntersect,segmentIntersectionPoint,nearestCityTo,cityAtPoint,routePosition} from "@/sim/geometry";
import {DIRECT_COMBAT_KINDS} from "@/sim/rules";

export function roadControlPower(u:Formation){
  const role=u.kind==="tank"||u.kind==="armor"||u.kind==="mechanized"?1.2
    :u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="special_forces"||u.kind==="engineer"?1
    :u.kind==="partisan"||u.kind==="raider"?1.2:u.kind==="militia"?.78
    :u.kind==="cavalry"||u.kind==="recon"?.82:.45;
  return role*(u.strength/100)*(u.organization/100)*(.45+u.readiness/180)*(.5+u.supply/200);
}

export type RoadCutPoint={x:number;y:number;along:number;pressure:number};

export function routeInterdictionPoints(route:{x:number;y:number}[],side:Side,units:Formation[]):RoadCutPoint[]{
  const cuts:RoadCutPoint[]=[];
  for(const hostile of units){
    if(hostile.side===side||!DIRECT_COMBAT_KINDS.has(hostile.kind)||hostile.strength<=18||hostile.organization<=20)continue;
    const pos=routePosition(route,hostile.x,hostile.y);
    if(pos.distance>(hostile.kind==="raider"?125:hostile.kind==="partisan"?98:58))continue;
    let hostilePower=0,friendlyPower=0;
    for(const unit of units){
      if(!DIRECT_COMBAT_KINDS.has(unit.kind)||unit.strength<=8||Math.hypot(unit.x-hostile.x,unit.y-hostile.y)>155)continue;
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

export function routeCutForSide(route:{x:number;y:number}[],side:Side,units:Formation[]){
  return routeInterdictionPoints(route,side,units).length>0;
}


export type RoadSupplyRoute={
  index:number;
  route:Array<{x:number;y:number}>;
  a:CityState;
  b:CityState;
  cuts:Record<Side,RoadCutPoint[]>;
};
export type SupplyNetwork={capacity:Map<string,number>;roads:RoadSupplyRoute[]};

export function computeSupplyNetwork(scenario:Scenario,units:Formation[],cities:CityState[]):SupplyNetwork{
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

export function roadSupplyAccess(u:{side:Side;x:number;y:number},network:SupplyNetwork){
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

export function supplySourceAtPoint(side:Side,point:{x:number;y:number},cities:CityState[],network:SupplyNetwork){
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

type BuiltRoad={route:Array<{x:number;y:number}>;side:Side};
type RoadSource={capacity:number;source:CityState;distance:number};
type BuiltRoadContext={
  cities:CityState[];network:SupplyNetwork;emplacements:Emplacement[];openWorld:OpenWorldState|null;
  roads:BuiltRoad[];adjacency:Array<Set<number>>;
  usable:Map<Side,boolean[]>;sources:Map<Side,Map<number,RoadSource[]>>;
};
/** One context per immutable unit snapshot. Geometry/topology is shared by all unit supply queries. */
const roadContexts=new WeakMap<Formation[],BuiltRoadContext>();
function builtRoadContext(units:Formation[],cities:CityState[],network:SupplyNetwork,emplacements:Emplacement[],openWorld:OpenWorldState|null){
  const old=roadContexts.get(units);
  if(old&&old.cities===cities&&old.network===network&&old.emplacements===emplacements&&old.openWorld===openWorld)return old;
  const roads:BuiltRoad[]=[
    ...emplacements.filter(e=>e.kind==="road"&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined)
      .map(e=>({route:[{x:e.x,y:e.y},{x:e.x2!,y:e.y2!}],side:e.side})),
    ...(openWorld?.structures??[]).filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined)
      .map(s=>({route:[{x:s.x,y:s.y},{x:s.x2!,y:s.y2!}],side:s.side}))
  ];
  const adjacency=roads.map(()=>new Set<number>());
  for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){
    const a=roads[i].route,b=roads[j].route;
    const crosses=segmentsIntersect(a[0].x,a[0].y,a[1].x,a[1].y,b[0].x,b[0].y,b[1].x,b[1].y);
    const close=Math.min(
      segmentContact(a[0].x,a[0].y,a[1].x,a[1].y,b[0].x,b[0].y).distance,
      segmentContact(a[0].x,a[0].y,a[1].x,a[1].y,b[1].x,b[1].y).distance,
      segmentContact(b[0].x,b[0].y,b[1].x,b[1].y,a[0].x,a[0].y).distance,
      segmentContact(b[0].x,b[0].y,b[1].x,b[1].y,a[1].x,a[1].y).distance
    )<=34;
    if(crosses||close){adjacency[i].add(j);adjacency[j].add(i)}
  }
  const next:BuiltRoadContext={cities,network,emplacements,openWorld,roads,adjacency,usable:new Map(),sources:new Map()};
  roadContexts.set(units,next);
  return next;
}

export function builtRoadSupplyAccess(u:Pick<Formation,"side"|"x"|"y">,units:Formation[],cities:CityState[],network:SupplyNetwork,emplacements:Emplacement[],openWorld:OpenWorldState|null){
  const context=builtRoadContext(units,cities,network,emplacements,openWorld);
  const {roads,adjacency}=context;
  if(!roads.length)return null;
  const near=roads.map((road,index)=>({road,index,pos:routePosition(road.route,u.x,u.y)})).filter(x=>x.pos.distance<=62);
  if(!near.length)return null;
  let usable=context.usable.get(u.side);
  if(!usable){
    usable=roads.map(road=>routeInterdictionPoints(road.route,u.side,units).length===0);
    context.usable.set(u.side,usable);
  }
  let sources=context.sources.get(u.side);
  if(!sources){sources=new Map();context.sources.set(u.side,sources)}
  const roadSources=(index:number):RoadSource[]=>{
    const cached=sources!.get(index);
    if(cached)return cached;
    const route=roads[index].route;
    const candidates:RoadSource[]=[];
    for(const point of route){
      const source=supplySourceAtPoint(u.side,point,cities,network);
      if(source)candidates.push(source);
    }
    for(const generated of network.roads){
      for(let s=0;s<generated.route.length-1;s++){
        const p=segmentIntersectionPoint(route[0].x,route[0].y,route[1].x,route[1].y,
          generated.route[s].x,generated.route[s].y,generated.route[s+1].x,generated.route[s+1].y);
        if(!p)continue;
        const source=supplySourceAtPoint(u.side,p,cities,network);
        if(source)candidates.push(source);
      }
    }
    sources!.set(index,candidates);
    return candidates;
  };
  let best:RoadSource|null=null;
  for(const entry of near){
    const queue=[{index:entry.index,distance:entry.pos.distance}],seen=new Set<number>();
    while(queue.length){
      const current=queue.shift()!;
      if(seen.has(current.index)||!usable[current.index])continue;
      seen.add(current.index);
      for(const source of roadSources(current.index)){
        const distance=current.distance+source.distance;
        if(!best||source.capacity>best.capacity||(source.capacity===best.capacity&&distance<best.distance))
          best={capacity:source.capacity,source:source.source,distance};
      }
      const len=Math.hypot(roads[current.index].route[1].x-roads[current.index].route[0].x,
        roads[current.index].route[1].y-roads[current.index].route[0].y);
      for(const next of adjacency[current.index])if(!seen.has(next))queue.push({index:next,distance:current.distance+len*.5});
    }
  }
  return best;
}

export type LogisticsLink={from:{x:number;y:number;id:string};to:{x:number;y:number;id:string};unitId:string;depth:number};
export type HubLink={from:{x:number;y:number;id:string};to:{x:number;y:number;id:string};hubId:string;active:boolean};

export function logisticsDistributionRange(u:Formation){
  return 780+clamp(u.supply/100,0,1)*220;
}

export function computeLogisticsLinks(scenario:Scenario,units:Formation[],cities:CityState[],network:SupplyNetwork,emplacements:Emplacement[]=[]){
  const logistics=units.filter(u=>u.kind==="logistics"&&u.strength>8);
  const supplied=new Map<string,{depth:number;source:{x:number;y:number;id:string}}>();
  const links:LogisticsLink[]=[];
  const hubLinks:HubLink[]=[];
  const activeHubs=new Set<string>();
  const cityRange=850,relayRange=1000,hubCityRange=1450;

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
      .filter(x=>x.d<=Math.max(x.e.range,cityRange))
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
        .filter(x=>x.d<=Math.min(relayRange,logisticsDistributionRange(x.v)))
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

export function supplyAccess(scenario:Scenario,u:Pick<Formation,"id"|"side"|"kind"|"x"|"y">,units:Formation[],cities:CityState[],network=computeSupplyNetwork(scenario,units,cities),emplacements:Emplacement[]=[],logisticsGraph=computeLogisticsLinks(scenario,units,cities,network,emplacements),openWorld:OpenWorldState|null=null){
  // Newly founded Dominion cities are also real supply hubs.
  const city=cityAtPoint(cities,u.x,u.y,70);
  const generatedRoadLink=roadSupplyAccess(u,network);
  const builtRoadLink=builtRoadSupplyAccess(u,units,cities,network,emplacements,openWorld);
  const roadLink=!generatedRoadLink?builtRoadLink:!builtRoadLink?generatedRoadLink
    :builtRoadLink.capacity>generatedRoadLink.capacity?builtRoadLink
    :generatedRoadLink.capacity>builtRoadLink.capacity?generatedRoadLink
    :builtRoadLink.distance<generatedRoadLink.distance?builtRoadLink:generatedRoadLink;
  const depot=emplacements
    .filter(e=>e.side===u.side&&e.kind==="supply_depot"&&e.strength>0&&logisticsGraph.activeHubs.has(e.id))
    .map(e=>({e,d:Math.hypot(e.x-u.x,e.y-u.y)}))
    .filter(x=>x.d<(u.kind==="logistics"?Math.max(x.e.range,logisticsGraph.cityRange):x.e.range))
    .sort((a,b)=>a.d-b.d)[0];
  const relay=units
    .filter(v=>v.side===u.side&&v.kind==="logistics"&&v.id!==u.id&&logisticsGraph.supplied.has(v.id))
    .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),range:logisticsDistributionRange(v),depth:logisticsGraph.supplied.get(v.id)!.depth}))
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

