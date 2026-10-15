/** navigation mechanics. Extracted without changing game rules. */
import {terrainAt} from "@/sim/game";
import {type OpenWorldState} from "@/sim/openworld";
import {type CityState,type Emplacement,type Formation,type Scenario} from "@/sim/types";
import {segmentContact,nearestCityTo,type RoutePosition,routePosition,dedupeRoutePoints} from "@/sim/geometry";
import {movementSupplyFactor,roadMovementBonus,movementTerrainFactor} from "@/sim/rules";

export function fastSegmentTravelCost(scenario:Scenario,u:Formation,a:{x:number;y:number},b:{x:number;y:number},road:boolean){
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1)return 0;
  const mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5;
  const terrain=terrainAt(scenario,mx,my).terrain;
  const terrainFactor=terrain==="water"?.22:movementTerrainFactor(u,terrain);
  const speed=Math.max(.05,u.speed*terrainFactor*movementSupplyFactor(u)*(road?roadMovementBonus(u):1));
  return length/speed;
}

export function fastPolylineTravelCost(scenario:Scenario,u:Formation,points:Array<{x:number;y:number}>,road:boolean){
  let cost=0;
  for(let i=0;i<points.length-1;i++)cost+=fastSegmentTravelCost(scenario,u,points[i],points[i+1],road);
  return cost;
}

export function routeSliceBetween(route:{x:number;y:number}[],from:RoutePosition,to:RoutePosition):Array<{x:number;y:number}>{
  if(from.along>to.along)return routeSliceBetween(route,to,from).reverse();
  const points=[from.point];
  for(let i=from.segment+1;i<=to.segment;i++)points.push(route[i]);
  points.push(to.point);
  return dedupeRoutePoints(points);
}

export function roadPathBetweenCities(scenario:Scenario,cities:CityState[],u:Formation,start:CityState,goal:CityState){
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

export function movementRoutePlan(
  scenario:Scenario,
  cities:CityState[],
  u:Formation,
  from:{x:number;y:number},
  to:{x:number;y:number},
  emplacements:Emplacement[]=[],
  openWorld?:OpenWorldState|null,
  dangerUnits:Formation[]=[]
){
  const dangerCost=(points:Array<{x:number;y:number}>)=>{
    if(!dangerUnits.length)return 0;
    let extra=0;
    const path=[from,...points];
    for(let i=0;i<path.length-1;i++){
      for(const foe of dangerUnits){
        if(foe.side===u.side||foe.strength<12)continue;
        const hit=segmentContact(path[i].x,path[i].y,path[i+1].x,path[i+1].y,foe.x,foe.y);
        if(hit.distance<180)extra+=((180-hit.distance)/180)*65*(foe.strength/100);
      }
    }
    return extra;
  };
  let best:{cost:number;points:Array<{x:number;y:number}>}={
    cost:fastSegmentTravelCost(scenario,u,from,to,false)+dangerCost([to]),
    points:[to]
  };
  const consider=(cost:number,points:Array<{x:number;y:number}>)=>{
    const adjusted=cost+dangerCost(points);
    if(Number.isFinite(adjusted)&&adjusted<best.cost)best={cost:adjusted,points:dedupeRoutePoints(points)};
  };

  const fieldRoads=emplacements
    .filter(e=>e.kind==="road"&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined)
    .map(e=>[{x:e.x,y:e.y},{x:e.x2!,y:e.y2!}]);
  const strategicRoads=(openWorld?.structures??[])
    .filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined)
    .map(s=>[{x:s.x,y:s.y},{x:s.x2!,y:s.y2!}]);
  const localRoads=[...scenario.roadRoutes,...fieldRoads,...strategicRoads];

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
