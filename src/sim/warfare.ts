import {terrainAt} from "./game";
import type {CityState,Emplacement,Formation,Scenario,Side} from "./types";

export type FrontMode="hold"|"advance"|"push"|"retreat";
export type FrontDirective={
  id:string;side:Side;groupId:string;start:{x:number;y:number};end:{x:number;y:number};
  mode:FrontMode;lastIssued:number;createdAt:number;reserveFraction:number;
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
  const kind=u.kind==="recon"?1080:u.kind==="special_forces"?760:u.kind==="cavalry"?600:u.kind==="artillery"||u.kind==="heavy_artillery"?340:470;
  const sample=terrainAt(scenario,u.x,u.y).terrain;
  const terrainFactor=sample==="forest"?.7:sample==="mountain"?.84:sample==="highmountain"?.9:sample==="marsh"?.7:1;
  return kind*terrainFactor*(.55+.45*u.organization/100)*(u.supply<12?.7:1);
}
export function isDetected(enemy:Formation,friendly:Formation[],cities:CityState[],emplacements:Emplacement[],scenario:Scenario,side:Side){
  if(enemy.side===side)return true;
  const terrain=terrainAt(scenario,enemy.x,enemy.y).terrain;
  const conceal=terrain==="forest"?.68:terrain==="marsh"?.73:terrain==="mountain"?.85:1;
  const concealKind=enemy.kind==="special_forces"?.74:enemy.kind==="recon"?.9:1;
  if(friendly.some(u=>u.side===side&&u.strength>6&&dist(u,enemy)<reconRange(u,scenario)*conceal*concealKind))return true;
  if(cities.some(c=>c.owner===side&&dist(c,enemy)<230*conceal))return true;
  return emplacements.some(e=>e.side===side&&e.kind==="observatory"&&e.strength>0&&dist(e,enemy)<e.range*conceal);
}
/** Tracks contacts without leaking live positions once a target disappears into fog. */
export function updateContacts(existing:LastSeenContact[],formations:Formation[],cities:CityState[],emplacements:Emplacement[],scenario:Scenario,observer:Side,hour:number):LastSeenContact[]{
  const cache=new Map(existing.filter(c=>hour-c.seenAt<24).map(c=>[c.id,{...c,confidence:Math.max(0,1-(hour-c.seenAt)/24)}]));
  const existingIds=new Set(formations.map(u=>u.id));
  for(const [id] of cache)if(!existingIds.has(id))cache.delete(id);
  for(const u of formations)if(u.side!==observer&&isDetected(u,formations.filter(v=>v.side===observer),cities,emplacements,scenario,observer))
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
  const dx=front.end.x-front.start.x,dy=front.end.y-front.start.y,length=Math.max(1,Math.hypot(dx,dy));
  const tangent={x:dx/length,y:dy/length},middle={x:(front.start.x+front.end.x)/2,y:(front.start.y+front.end.y)/2};
  const hostile=units.filter(u=>u.side!==front.side&&u.strength>12);
  const nearest=[...hostile].sort((a,b)=>dist(a,middle)-dist(b,middle))[0];
  const sign=nearest&&((nearest.x-middle.x)*(-tangent.y)+(nearest.y-middle.y)*tangent.x)<0?-1:1;
  const normal={x:-tangent.y*sign,y:tangent.x*sign};
  const isCombat=(u:Formation)=>!["artillery","heavy_artillery","mortar","logistics"].includes(u.kind);
  const combat=group.filter(isCombat).sort((a,b)=>b.strength*a.organization-a.strength*b.organization);
  const reserveCount=clamp(Math.round(combat.length*front.reserveFraction),combat.length>4?1:0,Math.max(1,combat.length-1));
  const reserveUnits=new Set(combat.slice(0,reserveCount).map(u=>u.id));
  const line=group.filter(u=>isCombat(u)&&!reserveUnits.has(u.id)).sort((a,b)=>((a.x-front.start.x)*tangent.x+(a.y-front.start.y)*tangent.y)-((b.x-front.start.x)*tangent.x+(b.y-front.start.y)*tangent.y));
  const exposure=[0,1,2,3].map(i=>{
    const point={x:front.start.x+dx*(i+.5)/4,y:front.start.y+dy*(i+.5)/4};
    const strength=hostile.filter(u=>dist(u,point)<510).reduce((s,u)=>s+u.strength*(u.kind==="tank"?1.4:1),0);
    const defenders=line.filter(u=>dist(u,point)<460).reduce((s,u)=>s+u.strength,0);
    return{point,threat:strength/Math.max(30,defenders)};
  }).sort((a,b)=>b.threat-a.threat);
  const weakest=exposure[0].point;
  const safe=(x:number,y:number)=>{
    const px=clamp(x,4,scenario.worldWidth-4),py=clamp(y,4,scenario.worldHeight-4);
    const t=terrainAt(scenario,px,py).terrain;
    if(t!=="water"&&t!=="highmountain")return{x:px,y:py};
    return middle;
  };
  const lines:FrontAssignment[]=line.map((u,i)=>{
    const t=(i+.5)/line.length;
    return{unitId:u.id,...safe(front.start.x+dx*t+normal.x*20,front.start.y+dy*t+normal.y*20),role:"line"};
  });
  const reserves=group.filter(u=>reserveUnits.has(u.id)).map((u,i)=>{
    const offset=(i-(reserveCount-1)/2)*68;
    return{unitId:u.id,...safe(weakest.x-normal.x*240+tangent.x*offset,weakest.y-normal.y*240+tangent.y*offset),role:"reserve" as const};
  });
  const support=group.filter(u=>!isCombat(u)&&u.kind!=="logistics").map((u,i)=>{
    const depth=u.kind==="heavy_artillery"?340:u.kind==="artillery"?260:185;
    const t=(i+.5)/Math.max(1,group.filter(v=>!isCombat(v)&&v.kind!=="logistics").length);
    return{unitId:u.id,...safe(front.start.x+dx*t-normal.x*depth,front.start.y+dy*t-normal.y*depth),role:"gun" as const};
  });
  const logistics=group.filter(u=>u.kind==="logistics");
  const rear=cities.filter(c=>c.owner===front.side).sort((a,b)=>dist(a,middle)-dist(b,middle))[0];
  const relay=logistics.map((u,i)=>{
    const base=rear??middle,target={x:middle.x-normal.x*290,y:middle.y-normal.y*290};
    const t=(i+1)/(logistics.length+1);
    return{unitId:u.id,...safe(base.x+(target.x-base.x)*t,base.y+(target.y-base.y)*t),role:"relay" as const};
  });
  return [...lines,...reserves,...support,...relay];
}
/** Advance exactly one tactical increment after the minimum order interval. */
export function advanceDirective(plan:FrontDirective,hours:number,units:Formation[],cities:CityState[],scenario:Scenario){
  if(plan.mode==="hold")return plan;
  const step=plan.mode==="push"?170:plan.mode==="advance"?85:-130;
  const dx=plan.end.x-plan.start.x,dy=plan.end.y-plan.start.y;
  const mid={x:(plan.start.x+plan.end.x)/2,y:(plan.start.y+plan.end.y)/2};
  const nearest=units.filter(u=>u.side!==plan.side).sort((a,b)=>dist(a,mid)-dist(b,mid))[0];
  const tangent={x:dx/Math.max(1,Math.hypot(dx,dy)),y:dy/Math.max(1,Math.hypot(dx,dy))};
  const sign=nearest&&((nearest.x-mid.x)*(-tangent.y)+(nearest.y-mid.y)*tangent.x)<0?-1:1;
  const normal={x:-tangent.y*sign,y:tangent.x*sign};
  const friendly=units.filter(u=>u.side===plan.side&&u.groupId===plan.groupId);
  const nearbyEnemy=units.filter(u=>u.side!==plan.side&&dist(u,mid)<520);
  const power=(xs:Formation[])=>xs.reduce((s,u)=>s+u.strength*(.3+.7*u.organization/100)*(.3+.7*u.supply/100),0);
  const ratio=power(friendly)/Math.max(1,power(nearbyEnemy));
  // Controlled advance pauses when overwhelmingly outnumbered; push is explicitly riskier.
  if(plan.mode==="advance"&&ratio<.75)return plan;
  const move=(p:{x:number;y:number})=>({x:clamp(p.x+normal.x*step,3,scenario.worldWidth-3),y:clamp(p.y+normal.y*step,3,scenario.worldHeight-3)});
  const a=move(plan.start),b=move(plan.end);
  if(terrainAt(scenario,a.x,a.y).terrain==="water"||terrainAt(scenario,b.x,b.y).terrain==="water")return plan;
  return {...plan,start:a,end:b};
}
