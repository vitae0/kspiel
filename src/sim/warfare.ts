import {terrainAt} from "./game";
import type {CityState,Emplacement,Formation,Scenario,Side} from "./types";
import {frontPathFrame,frontPathPoints,frontVertexFrame,nearestFrontFraction,type FrontPoint} from "./front-path";

export type FrontMode="hold"|"advance"|"push"|"retreat";
export type FrontDirective={
  id:string;side:Side;groupId:string;start:FrontPoint;end:FrontPoint;points?:FrontPoint[];
  mode:FrontMode;lastIssued:number;createdAt:number;reserveFraction:number;facing?:1|-1;
};
export type FrontAssignment={unitId:string;x:number;y:number;role:"line"|"reserve"|"gun"|"relay"};
export type LastSeenContact={id:string;side:Side;kind:Formation["kind"];x:number;y:number;strength:number;seenAt:number;confidence:number};
export type DecoyContact={id:string;owner:Side;x:number;y:number;kind:Formation["kind"];createdAt:number;expiresAt:number};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
export const SIDES:Side[]=["blue","red","green"];

/** Estimate encirclement from independent hostile sectors AND blocked rear-city escape corridors.
 * This deliberately does not mistake a single nearby enemy for a sealed pocket. */
export function isEncircled(unit:Formation,units:Formation[],cities:CityState[]):boolean{
  const friendCities=cities.filter(c=>c.owner===unit.side);
  if(!friendCities.length)return true;
  const hostile=units.filter(u=>u.side!==unit.side&&u.strength>15&&u.organization>14
    &&!["artillery","heavy_artillery","mortar","logistics"].includes(u.kind)&&dist(u,unit)<780);
  if(hostile.length<4)return false;
  const sectors=new Set(hostile.map(u=>Math.floor((Math.atan2(u.y-unit.y,u.x-unit.x)+Math.PI)/(Math.PI/3))));
  if(sectors.size<4)return false;
  const corridorClear=(city:CityState)=>{
    const length=dist(city,unit);
    // Friendly rear cities immediately adjacent to the unit always count as a connection.
    if(length<160)return true;
    for(let i=1;i<=Math.max(2,Math.ceil(length/140));i++){
      const t=i/(Math.max(2,Math.ceil(length/140))+1);
      const x=unit.x+(city.x-unit.x)*t,y=unit.y+(city.y-unit.y)*t;
      const enemyPressure=hostile.reduce((s,e)=>s+(Math.hypot(e.x-x,e.y-y)<150?e.strength:0),0);
      const friendlyPressure=units.reduce((s,f)=>s+(f.side===unit.side&&Math.hypot(f.x-x,f.y-y)<150?f.strength:0),0);
      if(enemyPressure>Math.max(20,friendlyPressure*1.2))return false;
    }
    return true;
  };
  return !friendCities.some(corridorClear);
}

export function applyEncirclement(units:Formation[],cities:CityState[],hours:number):Formation[]{
  return units.filter(u=>{
    const isolated=isEncircled(u,units,cities);
    const duration=clamp((u.isolationHours??0)+(isolated?hours:-hours*3),0,150);
    u.isolationHours=duration;
    if(isolated&&duration>6){
      u.supply=clamp(u.supply-hours*(.48+duration/120),0,100);
      u.organization=clamp(u.organization-hours*(.22+duration/180),0,100);
      u.morale=clamp((u.morale??82)-hours*(.34+duration/160),0,100);
    }
    // A long-isolated force with no stores or cohesion eventually surrenders.
    return !(duration>72&&u.supply<5&&u.organization<6&&(u.morale??80)<12);
  });
}

export function reconRange(u:Formation,scenario:Scenario){
  const kind=u.kind==="recon"?1080:u.kind==="raider"?770:u.kind==="partisan"?740:u.kind==="special_forces"?760:u.kind==="cavalry"?600:u.kind==="artillery"||u.kind==="heavy_artillery"?340:470;
  const sample=terrainAt(scenario,u.x,u.y).terrain;
  const terrainFactor=sample==="forest"?.7:sample==="mountain"?.84:sample==="highmountain"?.9:sample==="marsh"?.7:1;
  return kind*terrainFactor*(.55+.45*u.organization/100)*(u.supply<12?.7:1);
}
export function isDetected(enemy:Formation,friendly:Formation[],cities:CityState[],emplacements:Emplacement[],scenario:Scenario,side:Side){
  if(enemy.side===side)return true;
  const terrain=terrainAt(scenario,enemy.x,enemy.y).terrain;
  const conceal=terrain==="forest"?.68:terrain==="marsh"?.73:terrain==="mountain"?.85:1;
  const concealKind=enemy.kind==="partisan"?.48:enemy.kind==="raider"?.62:enemy.kind==="militia"?.96:enemy.kind==="special_forces"?.74:enemy.kind==="recon"?.9:1;
  if(friendly.some(u=>u.side===side&&u.strength>6&&dist(u,enemy)<reconRange(u,scenario)*conceal*concealKind))return true;
  if(cities.some(c=>c.owner===side&&dist(c,enemy)<230*conceal))return true;
  return emplacements.some(e=>e.side===side&&e.kind==="observatory"&&e.strength>0&&dist(e,enemy)<e.range*conceal);
}
/** Tracks contacts without leaking live positions once a target disappears into fog. */
export function updateContacts(existing:LastSeenContact[],formations:Formation[],cities:CityState[],emplacements:Emplacement[],scenario:Scenario,observer:Side,hour:number):LastSeenContact[]{
  const cache=new Map(existing.filter(c=>hour-c.seenAt<24).map(c=>[c.id,{...c,confidence:Math.max(0,1-(hour-c.seenAt)/24)}]));
  const existingIds=new Set(formations.map(u=>u.id));
  for(const [id] of cache)if(!existingIds.has(id))cache.delete(id);
  const friendly=formations.filter(v=>v.side===observer);
  for(const u of formations)if(u.side!==observer&&isDetected(u,friendly,cities,emplacements,scenario,observer))
    cache.set(u.id,{id:u.id,side:u.side,kind:u.kind,x:u.x,y:u.y,strength:u.strength,seenAt:hour,confidence:1});
  return [...cache.values()];
}
export function decoyVisibleTo(decoy:DecoyContact,observer:Side,units:Formation[],scenario:Scenario,hour:number){
  if(observer===decoy.owner||hour>=decoy.expiresAt)return false;
  const hunters=units.filter(u=>u.side===observer&&u.kind==="recon"&&dist(u,decoy)<190);
  if(hunters.length)return false;
  return units.some(u=>u.side===observer&&dist(u,decoy)<reconRange(u,scenario))||false;
}

export function frontAssignments(front:FrontDirective,units:Formation[],cities:CityState[],scenario:Scenario):FrontAssignment[]{
  const group=units.filter(u=>u.groupId===front.groupId&&u.side===front.side&&u.strength>4);
  if(!group.length)return [];
  const path=frontPathPoints(front),middle=frontPathFrame(path,.5);
  const hostile=units.filter(u=>u.side!==front.side&&u.strength>12);
  const nearest=[...hostile].sort((a,b)=>dist(a,middle)-dist(b,middle))[0];
  const sign=front.facing??(nearest&&((nearest.x-middle.x)*middle.nx+(nearest.y-middle.y)*middle.ny)<0?-1:1);
  const at=(t:number)=>{const f=frontPathFrame(path,t);return{...f,nx:f.nx*sign,ny:f.ny*sign}};
  const isCombat=(u:Formation)=>!["artillery","heavy_artillery","mortar","logistics"].includes(u.kind);
  const combat=group.filter(isCombat).sort((a,b)=>b.strength*a.organization-a.strength*b.organization);
  const reserveCount=clamp(Math.round(combat.length*front.reserveFraction),combat.length>4?1:0,Math.max(1,combat.length-1));
  const reserveUnits=new Set(combat.slice(0,reserveCount).map(u=>u.id));
  const line=group.filter(u=>isCombat(u)&&!reserveUnits.has(u.id))
    .sort((a,b)=>nearestFrontFraction(path,a)-nearestFrontFraction(path,b));
  const exposure=[0,1,2,3].map(i=>{
    const frame=at((i+.5)/4),point={x:frame.x,y:frame.y};
    const strength=hostile.filter(u=>dist(u,point)<510).reduce((sum,u)=>sum+u.strength*(u.kind==="tank"?1.4:1),0);
    const defenders=line.filter(u=>dist(u,point)<460).reduce((sum,u)=>sum+u.strength,0);
    return{frame,threat:strength/Math.max(30,defenders)};
  }).sort((a,b)=>b.threat-a.threat);
  const weakest=exposure[0].frame;
  const safe=(x:number,y:number)=>{
    const px=clamp(x,4,scenario.worldWidth-4),py=clamp(y,4,scenario.worldHeight-4);
    const t=terrainAt(scenario,px,py).terrain;
    return t!=="water"&&t!=="highmountain"?{x:px,y:py}:{x:middle.x,y:middle.y};
  };
  const lines:FrontAssignment[]=line.map((u,i)=>{
    const f=at((i+.5)/line.length);
    return{unitId:u.id,...safe(f.x+f.nx*20,f.y+f.ny*20),role:"line"};
  });
  const reserves=group.filter(u=>reserveUnits.has(u.id)).map((u,i)=>{
    const offset=(i-(reserveCount-1)/2)*68;
    return{unitId:u.id,...safe(weakest.x-weakest.nx*240+weakest.tx*offset,weakest.y-weakest.ny*240+weakest.ty*offset),role:"reserve" as const};
  });
  const guns=group.filter(u=>!isCombat(u)&&u.kind!=="logistics");
  const support=guns.map((u,i)=>{
    const depth=u.kind==="heavy_artillery"?340:u.kind==="artillery"?260:185,f=at((i+.5)/guns.length);
    return{unitId:u.id,...safe(f.x-f.nx*depth,f.y-f.ny*depth),role:"gun" as const};
  });
  const logistics=group.filter(u=>u.kind==="logistics");
  const rear=cities.filter(c=>c.owner===front.side).sort((a,b)=>dist(a,middle)-dist(b,middle))[0];
  const relay=logistics.map((u,i)=>{
    const base=rear??middle,target={x:middle.x-middle.nx*sign*290,y:middle.y-middle.ny*sign*290};
    const t=(i+1)/(logistics.length+1);
    return{unitId:u.id,...safe(base.x+(target.x-base.x)*t,base.y+(target.y-base.y)*t),role:"relay" as const};
  });
  return [...lines,...reserves,...support,...relay];
}
/** Advance the entire sketched front along local normals, retaining all bends. */
export function advanceDirective(plan:FrontDirective,hours:number,units:Formation[],cities:CityState[],scenario:Scenario){
  if(plan.mode==="hold")return plan;
  const step=plan.mode==="push"?170:plan.mode==="advance"?85:-130;
  const path=frontPathPoints(plan),mid=frontPathFrame(path,.5);
  const nearest=units.filter(u=>u.side!==plan.side).sort((a,b)=>dist(a,mid)-dist(b,mid))[0];
  const sign=plan.facing??(nearest&&((nearest.x-mid.x)*mid.nx+(nearest.y-mid.y)*mid.ny)<0?-1:1);
  const friendly=units.filter(u=>u.side===plan.side&&u.groupId===plan.groupId);
  const nearbyEnemy=units.filter(u=>u.side!==plan.side&&dist(u,mid)<520);
  const power=(xs:Formation[])=>xs.reduce((sum,u)=>sum+u.strength*(.3+.7*u.organization/100)*(.3+.7*u.supply/100),0);
  if(plan.mode==="advance"&&power(friendly)/Math.max(1,power(nearbyEnemy))<.75)return plan;
  const shifted=path.map((p,i)=>{
    const f=frontVertexFrame(path,i);
    return{x:clamp(p.x+f.nx*sign*step,3,scenario.worldWidth-3),
      y:clamp(p.y+f.ny*sign*step,3,scenario.worldHeight-3)};
  });
  // Check the full new route, not only its endpoints.
  if(shifted.some((p,i)=>{
    if(terrainAt(scenario,p.x,p.y).terrain==="water")return true;
    if(!i)return false;
    const prev=shifted[i-1],steps=Math.max(1,Math.ceil(dist(prev,p)/90));
    for(let k=1;k<steps;k++)if(terrainAt(scenario,prev.x+(p.x-prev.x)*k/steps,prev.y+(p.y-prev.y)*k/steps).terrain==="water")return true;
    return false;
  }))return plan;
  return{...plan,start:shifted[0],end:shifted[shifted.length-1],
    ...(plan.points?{points:shifted}:{}),facing:sign as 1|-1};
}
