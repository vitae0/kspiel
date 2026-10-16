/** navigation mechanics. Extracted without changing game rules. */
import {terrainAt} from "@/sim/game";
import {type OpenWorldState} from "@/sim/openworld";
import {type CityState,type Emplacement,type Formation,type Scenario} from "@/sim/types";
import {segmentContact,nearestCityTo,type RoutePosition,routePosition,dedupeRoutePoints} from "@/sim/geometry";
import {movementSupplyFactor,roadMovementBonus,movementTerrainFactor} from "@/sim/rules";
import {territoryOwnerAt} from "@/sim/territory";

/** Check the entire leg rather than only its midpoint: a blocked leg must not win routing. */
export function traversableLeg(scenario:Scenario,u:Formation,a:{x:number;y:number},b:{x:number;y:number}):boolean{
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  const samples=Math.max(1,Math.ceil(length/75));
  for(let i=1;i<=samples;i++){
    const t=i/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    if(x<1||x>scenario.worldWidth-1||y<1||y>scenario.worldHeight-1)return false;
    const terrain=terrainAt(scenario,x,y).terrain;
    if(terrain==="water"||(terrain==="highmountain"&&u.kind!=="mountaineer"))return false;
  }
  return true;
}

/** Bounded A* search only used when normal direct/road routes cannot be traversed. */
export function terrainDetour(scenario:Scenario,u:Formation,from:{x:number;y:number},to:{x:number;y:number}){
  const step=90,maxVisited=3500;
  type Node={key:string;x:number;y:number;g:number;f:number;parent?:string};
  const nodes=new Map<string,Node>(),open=new Set<string>(),closed=new Set<string>();
  const goalHeuristic=(x:number,y:number)=>Math.hypot(to.x-x,to.y-y)/Math.max(.5,u.speed*movementSupplyFactor(u));
  const start:Node={key:"start",x:from.x,y:from.y,g:0,f:goalHeuristic(from.x,from.y)};
  nodes.set(start.key,start);open.add(start.key);
  let visited=0;
  const padding=Math.max(430,Math.min(1800,Math.hypot(to.x-from.x,to.y-from.y)*.28));
  const xMin=Math.max(1,Math.min(from.x,to.x)-padding),xMax=Math.min(scenario.worldWidth-1,Math.max(from.x,to.x)+padding);
  const yMin=Math.max(1,Math.min(from.y,to.y)-padding),yMax=Math.min(scenario.worldHeight-1,Math.max(from.y,to.y)+padding);
  while(open.size&&visited++<maxVisited){
    let selected:string|undefined,low=Infinity;
    for(const key of open){const score=nodes.get(key)!.f;if(score<low){low=score;selected=key}}
    if(!selected)break;
    open.delete(selected);closed.add(selected);
    const current=nodes.get(selected)!;
    if(Math.hypot(current.x-to.x,current.y-to.y)<step*2.5&&traversableLeg(scenario,u,current,to)){
      const path=[{x:to.x,y:to.y}];
      let cursor:Node|undefined=current;
      while(cursor&&cursor.parent){path.unshift({x:cursor.x,y:cursor.y});cursor=nodes.get(cursor.parent)}
      return dedupeRoutePoints(path);
    }
    const baseX=Math.round(current.x/step),baseY=Math.round(current.y/step);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const ix=baseX+dx,iy=baseY+dy,x=ix*step,y=iy*step,key=ix+":"+iy;
      if(x<xMin||x>xMax||y<yMin||y>yMax||closed.has(key))continue;
      const travel=fastSegmentTravelCost(scenario,u,current,{x,y},false);
      if(!Number.isFinite(travel))continue;
      const g=current.g+travel,old=nodes.get(key);
      if(!old||g<old.g){nodes.set(key,{key,x,y,g,f:g+goalHeuristic(x,y),parent:current.key});open.add(key)}
    }
  }
  return null;
}

export function fastSegmentTravelCost(scenario:Scenario,u:Formation,a:{x:number;y:number},b:{x:number;y:number},road:boolean){
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1)return 0;
  if(!traversableLeg(scenario,u,a,b))return Infinity;
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

export function roadPathBetweenCities(scenario:Scenario,cities:CityState[],u:Formation,start:CityState,goal:CityState,hostileRoadCost:(route:Array<{x:number;y:number}>)=>number=()=>0){
  if(start.name===goal.name)return{points:[] as Array<{x:number;y:number}>,cost:0};
  type Edge={to:string;route:Array<{x:number;y:number}>;cost:number};
  const graph=new Map<string,Edge[]>();
  for(const city of cities)graph.set(city.name,[]);
  for(const route of scenario.roadRoutes){
    if(route.length<2)continue;
    const a=nearestCityTo(route[0],cities),b=nearestCityTo(route[route.length-1],cities);
    if(!a||!b||a.name===b.name)continue;
    const cost=fastPolylineTravelCost(scenario,u,route,true)+hostileRoadCost(route);
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
  dangerUnits:Formation[]=[],
  attacking=false
){
  // Hostile ownership penalizes a route, but never makes a legitimate assault impossible.
  const valid=(p:{x:number;y:number})=>{
    const t=terrainAt(scenario,p.x,p.y).terrain;
    return t!=="water"&&(t!=="highmountain"||u.kind==="mountaineer");
  };
  let destination=to;
  if(!valid(to)){
    search:for(let radius=30;radius<=300;radius+=30)for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,p={x:to.x+Math.cos(angle)*radius,y:to.y+Math.sin(angle)*radius};
      if(p.x>=1&&p.x<=scenario.worldWidth-1&&p.y>=1&&p.y<=scenario.worldHeight-1&&valid(p)){destination=p;break search}
    }
  }
  const ownerCache=new Map<string,boolean>();
  const hostileRoadCost=(points:Array<{x:number;y:number}>)=>{
    if(!cities.length&&dangerUnits.length===0)return 0;
    let extra=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
      const samples=Math.max(1,Math.ceil(length/260));
      for(let k=0;k<samples;k++){
        const t=(k+.5)/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
        const key=Math.round(x/140)+":"+Math.round(y/140);
        let enemy=ownerCache.get(key);
        if(enemy===undefined){const owner=territoryOwnerAt(scenario,cities,dangerUnits,x,y);enemy=owner!==null&&owner!==u.side;ownerCache.set(key,enemy)}
        if(enemy){
          const remaining=Math.hypot(destination.x-x,destination.y-y);
          const approach=attacking?Math.max(.12,Math.min(1,remaining/380)):1;
          extra+=length/samples/Math.max(.5,u.speed*movementSupplyFactor(u))*1.8*approach;
        }
      }
    }
    return extra;
  };
  const dangerCost=(points:Array<{x:number;y:number}>)=>{
    if(!dangerUnits.length)return 0;
    let extra=0;
    const path=[from,...points];
    for(let i=0;i<path.length-1;i++){
      for(const foe of dangerUnits){
        if(foe.side===u.side||foe.strength<12)continue;
        const hit=segmentContact(path[i].x,path[i].y,path[i+1].x,path[i+1].y,foe.x,foe.y);
        if(hit.distance<180){
          const x=path[i].x+(path[i+1].x-path[i].x)*hit.t,y=path[i].y+(path[i+1].y-path[i].y)*hit.t;
          const approach=attacking?Math.max(.12,Math.min(1,Math.hypot(x-destination.x,y-destination.y)/330)):1;
          extra+=((180-hit.distance)/180)*65*(foe.strength/100)*approach;
        }
      }
    }
    return extra;
  };
  let best:{cost:number;points:Array<{x:number;y:number}>}={
    cost:fastSegmentTravelCost(scenario,u,from,destination,false)+dangerCost([destination]),
    points:[destination]
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
    const entry=routePosition(route,from.x,from.y),exit=routePosition(route,destination.x,destination.y);
    const roadPath=routeSliceBetween(route,entry,exit);
    const cost=
      fastSegmentTravelCost(scenario,u,from,entry.point,false)
      +fastPolylineTravelCost(scenario,u,roadPath,true)+hostileRoadCost(roadPath)
      +fastSegmentTravelCost(scenario,u,exit.point,destination,false);
    consider(cost,[...(entry.distance>5?[entry.point]:[]),...roadPath.slice(1),...(exit.distance>5?[destination]:[])]);
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
    const toPos=routePosition(route,destination.x,destination.y);
    const startPos:RoutePosition={distance:0,point:route[0],segment:0,t:0,along:0,total:fromPos.total};
    const endPos:RoutePosition={distance:0,point:route[route.length-1],segment:route.length-2,t:1,along:fromPos.total,total:fromPos.total};

    for(const endpoint of [{city:a,pos:startPos},{city:b,pos:endPos}]){
      const localIn=routeSliceBetween(route,fromPos,endpoint.pos);
      entries.push({
        city:endpoint.city,
        cost:fastSegmentTravelCost(scenario,u,from,fromPos.point,false)+fastPolylineTravelCost(scenario,u,localIn,true)+hostileRoadCost(localIn),
        points:[...(fromPos.distance>5?[fromPos.point]:[]),...localIn.slice(1)]
      });

      const localOut=routeSliceBetween(route,endpoint.pos,toPos);
      exits.push({
        city:endpoint.city,
        cost:fastPolylineTravelCost(scenario,u,localOut,true)+hostileRoadCost(localOut)+fastSegmentTravelCost(scenario,u,toPos.point,destination,false),
        points:[...localOut.slice(1),...(toPos.distance>5?[destination]:[])]
      });
    }
  }

  const entryShortlist=entries.filter(x=>Number.isFinite(x.cost)).sort((a,b)=>a.cost-b.cost).slice(0,3);
  const exitShortlist=exits.filter(x=>Number.isFinite(x.cost)).sort((a,b)=>a.cost-b.cost).slice(0,3);
  const networkCache=new Map<string,ReturnType<typeof roadPathBetweenCities>>();
  for(const entry of entryShortlist)for(const exit of exitShortlist){
    const key=entry.city.name+"\u0000"+exit.city.name;
    let network=networkCache.get(key);
    if(network===undefined){
      network=roadPathBetweenCities(scenario,cities,u,entry.city,exit.city,hostileRoadCost);
      networkCache.set(key,network);
    }
    if(!network)continue;
    consider(entry.cost+network.cost+exit.cost,[...entry.points,...network.points,...exit.points]);
  }

  const result=Number.isFinite(best.cost)?[...best.points]:terrainDetour(scenario,u,from,destination)??[destination];
  while(result.length>1&&Math.hypot(result[0].x-from.x,result[0].y-from.y)<4)result.shift();
  const last=result[result.length-1];
  if(!last||Math.hypot(last.x-destination.x,last.y-destination.y)>4)result.push({x:destination.x,y:destination.y});
  return dedupeRoutePoints(result);
}
