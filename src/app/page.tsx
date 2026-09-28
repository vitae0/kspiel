"use client";

import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {generateScenario,polylinePath,SCENARIO_PRESETS,terrainAt,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W} from "@/sim/game";
import {botControlledSides,createMatchConfig,defaultArmyGroups,localControlledSides} from "@/sim/session";
import type {AttackPlan,CityState,ConstructionProject,Emplacement,EmplacementKind,FlagStyle,Formation,FormationShape,OrderType,OverlayMode,Scenario,Side,TerrainSample} from "@/sim/types";

const SPEED_MULTIPLIER=[0,1,2.5,6];
const SIM_HOURS_PER_REAL_SECOND=.75;
const MAX_FRAME_SECONDS=.12;
const SIM_TICK_MS=100;
const AI_COMMAND_INTERVAL_SECONDS=.55;
const MOVEMENT_SCALE=4.2;
const RETREAT_SUPPLY_MIN=42;
const DIRECT_COMBAT_KINDS=new Set<Formation["kind"]>(["infantry","mechanized","armor","tank","cavalry","mountaineer","recon","engineer"]);
const CAPTURE_KINDS=new Set<Formation["kind"]>(["infantry","mechanized","tank","cavalry","mountaineer","engineer"]);
const ARTILLERY_KINDS=new Set<Formation["kind"]>(["artillery","heavy_artillery"]);
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

function isInCombat(u:Formation,units:Formation[]){
  return units.some(v=>v.side!==u.side&&DIRECT_COMBAT_KINDS.has(v.kind)&&Math.hypot(v.x-u.x,v.y-u.y)<58);
}

function retreatDestination(u:Formation,units:Formation[],cities:CityState[]){
  const city=cities.filter(c=>c.owner===u.side).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  if(city)return{x:city.x,y:city.y};
  const log=units.filter(v=>v.side===u.side&&v.kind==="logistics").sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  return log?{x:log.x,y:log.y}:{x:u.x,y:u.y};
}

type SupplyNetwork=Map<string,number>;

function routeDistance(route:{x:number;y:number}[],x:number,y:number){
  let best=Infinity;
  for(let i=0;i<route.length-1;i++)best=Math.min(best,segmentContact(route[i].x,route[i].y,route[i+1].x,route[i+1].y,x,y).distance);
  return best;
}

function routeCutForSide(route:{x:number;y:number}[],side:Side,units:Formation[]){
  return units.some(u=>u.side!==side&&DIRECT_COMBAT_KINDS.has(u.kind)&&u.strength>8&&routeDistance(route,u.x,u.y)<88);
}

function nearestCityTo(point:{x:number;y:number},cities:CityState[]){
  return cities.map(c=>({c,d:Math.hypot(c.x-point.x,c.y-point.y)})).sort((a,b)=>a.d-b.d)[0]?.c;
}

function computeSupplyNetwork(scenario:Scenario,units:Formation[],cities:CityState[]):SupplyNetwork{
  const adjacency=new Map<string,Set<string>>();
  for(const city of cities)adjacency.set(city.name,new Set());
  for(const route of scenario.roadRoutes){
    const start=nearestCityTo(route[0],cities),end=nearestCityTo(route[route.length-1],cities);
    if(!start||!end||start.name===end.name||start.owner!==end.owner||routeCutForSide(route,start.owner,units))continue;
    adjacency.get(start.name)?.add(end.name);adjacency.get(end.name)?.add(start.name);
  }
  const out:SupplyNetwork=new Map(),seen=new Set<string>();
  for(const city of cities){
    if(seen.has(city.name))continue;
    const stack=[city.name],component:string[]=[];
    while(stack.length){
      const name=stack.pop()!;if(seen.has(name))continue;
      const node=cities.find(c=>c.name===name);if(!node||node.owner!==city.owner)continue;
      seen.add(name);component.push(name);
      for(const next of adjacency.get(name)??[])if(!seen.has(next))stack.push(next);
    }
    const capacity=Math.min(3,Math.max(1,component.length));
    for(const name of component)out.set(name,capacity);
  }
  return out;
}

function supplyAccess(scenario:Scenario,u:Formation,units:Formation[],cities:CityState[],network=computeSupplyNetwork(scenario,units,cities)){
  const sample=terrainAt(scenario,u.x,u.y);
  const city=sample.objective?cities.find(c=>c.name===sample.objective):undefined;
  const ownedCities=cities.filter(c=>c.owner===u.side);
  const nearest=ownedCities.map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
  const roadAlive=sample.road&&scenario.roadRoutes.some(route=>routeDistance(route,u.x,u.y)<36&&!routeCutForSide(route,u.side,units));
  const relay=units
    .filter(v=>v.side===u.side&&v.kind==="logistics"&&v.id!==u.id&&v.supply>30)
    .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),range:320+v.supply*1.3}))
    .filter(x=>x.d<x.range)
    .sort((a,b)=>a.d-b.d)[0];

  if(city?.owner===u.side){
    const capacity=network.get(city.name)??1;
    return{level:capacity,label:capacity===1?"ISOLATED CITY SUPPLY":"CITY NETWORK ×"+capacity,supplyPerHour:.62+capacity*.56,fuelPerHour:.38+capacity*.4,range:0};
  }
  if(roadAlive&&nearest&&nearest.d<1500){
    const capacity=network.get(nearest.c.name)??1;
    return{level:Math.max(1,capacity),label:capacity===1?"LOCAL ROAD SUPPLY":"CONNECTED ROAD NETWORK ×"+capacity,supplyPerHour:.3+capacity*.36,fuelPerHour:.2+capacity*.25,range:0};
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
  if(!hostile.length)return units;

  return units.map((u):Formation=>{
    if(u.side!==side)return u;
    const nearestHostile=hostile.map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
    if(!nearestHostile)return u;

    const nearestFriendlyCombat=friendly
      .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind))
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];

    if(ARTILLERY_KINDS.has(u.kind)){
      if(nearestHostile.d<=520&&u.supply>20&&u.organization>20)return{...u,order:{type:"fire",targetUnitId:nearestHostile.v.id}};
      const anchor=nearestFriendlyCombat?.v;
      if(anchor){
        const dx=anchor.x-nearestHostile.v.x,dy=anchor.y-nearestHostile.v.y,len=Math.hypot(dx,dy)||1;
        const tx=clamp(anchor.x+dx/len*190,20,WORLD_W-20),ty=clamp(anchor.y+dy/len*190,20,WORLD_H-20);
        if(terrainAt(scenario,tx,ty).terrain!=="water")return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      }
      return u;
    }

    if(u.kind==="logistics"){
      const anchor=nearestFriendlyCombat?.v;
      if(!anchor)return u;
      const dx=anchor.x-nearestHostile.v.x,dy=anchor.y-nearestHostile.v.y,len=Math.hypot(dx,dy)||1;
      const tx=clamp(anchor.x+dx/len*310,20,WORLD_W-20),ty=clamp(anchor.y+dy/len*310,20,WORLD_H-20);
      if(Math.hypot(tx-u.x,ty-u.y)>90&&terrainAt(scenario,tx,ty).terrain!=="water")return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      return{...u,order:{type:"resupply"}};
    }

    if(DIRECT_COMBAT_KINDS.has(u.kind)){
      if((u.organization<30||u.strength<42||u.supply<18)&&u.supply>=RETREAT_SUPPLY_MIN){
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }
      const nearestCity=hostileCities.map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
      const n=Number(u.id.replace(/\D/g,""))||0;
      if(nearestCity&&(nearestCity.d<nearestHostile.d*1.35||n%3===0))return{...u,order:{type:"move",targetX:nearestCity.c.x,targetY:nearestCity.c.y}};
      return{...u,order:{type:"assault",targetUnitId:nearestHostile.v.id}};
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

function simulate(scenario:Scenario,units:Formation[],hours:number,cities:CityState[]){
  const supplyNetwork=computeSupplyNetwork(scenario,units,cities);
  const next=units.map(u=>{
    const sample=terrainAt(scenario,u.x,u.y);
    const terrain=TERRAIN_RULES[sample.terrain];
    const access=supplyAccess(scenario,u,units,cities,supplyNetwork);
    const n:Formation={...u,order:u.order?{...u.order}:undefined};

    if(n.order?.targetUnitId){
      const tracked=units.find(v=>v.id===n.order?.targetUnitId&&v.strength>1);
      if(tracked)n.order={...n.order,targetX:tracked.x,targetY:tracked.y};
      else n.order={type:"defend"};
    }

    const inCombat=isInCombat(u,units);
    const supplyBurn=(u.kind==="tank"||u.kind==="armor"?1.12:u.kind==="mechanized"?.86:u.kind==="heavy_artillery"?.96:u.kind==="artillery"?.72:u.kind==="logistics"?.58:u.kind==="cavalry"?.38:.5)*(inCombat?1.72:1);
    n.supply=clamp(n.supply-hours*supplyBurn/Math.max(.38,terrain.supply),0,100);
    if(MOTORIZED_KINDS.has(u.kind))n.fuel=clamp(n.fuel-hours*(inCombat?.42:.18),0,100);

    if(access.level>0){
      n.supply=clamp(n.supply+hours*access.supplyPerHour,0,100);
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
      const orderSupply=access.level===0?.12:access.level===1?.6:access.level===2?1.45:2.4;
      n.supply=clamp(n.supply+hours*orderSupply,0,100);
      n.fuel=clamp(n.fuel+hours*(access.level===0?.04:.85),0,100);
      n.organization=clamp(n.organization+hours*(access.level===0?.12:.5),0,100);
    }else if(n.order?.type==="fire"){
      n.entrenchment=clamp(n.entrenchment+hours*.01,0,100);
    }else if(n.order&&n.order.targetX!==undefined&&n.order.targetY!==undefined){
      const dx=n.order.targetX-u.x,dy=n.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5&&!n.order.targetUnitId){
        n.x=n.order.targetX;n.y=n.order.targetY;n.order={type:"defend"};
      }else if(dist>0&&n.supply>8){
        const posture=n.order.type==="retreat"?1.55:n.order.type==="relieve"?1.12:n.order.type==="assault"?.58:n.order.type==="probe"?.74:1;
        const roadBonus=sample.road
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
        const travel=Math.min(dist,u.speed*terrainMove*roadBonus*posture*hours*MOVEMENT_SCALE);
        let nx=clamp(u.x+dx/dist*travel,1,WORLD_W-1),ny=clamp(u.y+dy/dist*travel,1,WORLD_H-1);

        if(DIRECT_COMBAT_KINDS.has(u.kind)&&n.order.type!=="retreat"){
          const contact=units.filter(v=>v.side!==u.side).map(v=>({v,...segmentContact(u.x,u.y,nx,ny,v.x,v.y)})).filter(c=>c.distance<44).sort((a,b)=>a.t-b.t)[0];
          if(contact){
            const stopDistance=Math.max(0,travel*contact.t-36);
            nx=clamp(u.x+dx/dist*stopDistance,1,WORLD_W-1);ny=clamp(u.y+dy/dist*stopDistance,1,WORLD_H-1);
          }
        }

        const nextTerrain=terrainAt(scenario,nx,ny).terrain;
        const passable=nextTerrain!=="water"&&(nextTerrain!=="highmountain"||u.kind==="mountaineer");
        if(passable){
          n.x=nx;n.y=ny;
          n.supply=clamp(n.supply-travel*(u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"?.024:u.kind==="heavy_artillery"?.02:.012),0,100);
          n.fuel=clamp(n.fuel-travel*(u.kind==="armor"||u.kind==="tank"?.021:u.kind==="mechanized"||u.kind==="recon"?.013:.001),0,100);
          n.entrenchment=Math.max(0,n.entrenchment-hours*.7);
          n.organization=clamp(n.organization-hours*.12,0,100);
        }
      }
    }else{
      n.organization=clamp(n.organization+hours*.08,0,100);
      n.entrenchment=clamp(n.entrenchment+hours*.012,0,100);
    }

    if(n.supply<25)n.organization=clamp(n.organization-hours*.85,0,100);
    if(n.supply<12){n.organization=clamp(n.organization-hours*1.4,0,100);n.strength=clamp(n.strength-hours*.16,0,100)}
    if(n.supply<4)n.strength=clamp(n.strength-hours*.34,0,100);
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
      const aDef=TERRAIN_RULES[terrainAt(scenario,a.x,a.y).terrain].defense;
      const bDef=TERRAIN_RULES[terrainAt(scenario,b.x,b.y).terrain].defense;
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
    if(!ARTILLERY_KINDS.has(gun.kind)||gun.order?.type!=="fire"||!gun.order.targetUnitId)continue;
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
  const [warResult,setWarResult]=useState<Side|null>(null);
  const [selectionBox,setSelectionBox]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [frontPreview,setFrontPreview]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [attackPlans,setAttackPlans]=useState<AttackPlan[]>([]);
  const [pendingPlan,setPendingPlan]=useState(false);
  const [selectedPresetId,setSelectedPresetId]=useState("frontier");
  const [setupCategory,setSetupCategory]=useState<"all"|"fictional"|"historical">("all");
  const [playerSide,setPlayerSide]=useState<Side>("blue");
  const [emplacements,setEmplacements]=useState<Emplacement[]>([]);
  const [constructionProjects,setConstructionProjects]=useState<ConstructionProject[]>([]);
  const [pendingBuild,setPendingBuild]=useState<EmplacementKind|null>(null);

  const drag=useRef<{mode:"pan"|"box"|"front"|"select";startClientX:number;startClientY:number;px:number;py:number;moved:boolean}|null>(null);
  const suppressContextMenu=useRef(false);
  const viewport=useRef<HTMLDivElement>(null);
  const unitsRef=useRef<Formation[]>([]);
  const citiesRef=useRef<CityState[]>([]);
  const warResultRef=useRef<Side|null>(null);
  const planCounter=useRef(1);
  const buildCounter=useRef(1);
  const emplacementsRef=useRef<Emplacement[]>([]);
  const projectsRef=useRef<ConstructionProject[]>([]);

  useEffect(()=>{
    const togglePause=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;
      if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      if(e.code!=="Space")return;
      e.preventDefault();e.stopPropagation();
      setRunning(v=>warResultRef.current?v:!v);
    };
    window.addEventListener("keydown",togglePause,true);
    return()=>window.removeEventListener("keydown",togglePause,true);
  },[]);

  const commitUnits=(fn:(prev:Formation[])=>Formation[])=>{
    setUnits(prev=>{const next=fn(prev);unitsRef.current=next;return next});
  };

  const matchConfig=createMatchConfig("singleplayer","local",playerSide);
  const localSides=new Set(localControlledSides(matchConfig,"local"));
  const botSides=botControlledSides(matchConfig);
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
    let last=performance.now(),aiElapsed=AI_COMMAND_INTERVAL_SECONDS;
    const tick=()=>{
      const now=performance.now();
      const realSeconds=Math.min(MAX_FRAME_SECONDS,Math.max(0,(now-last)/1000));last=now;aiElapsed+=realSeconds;
      const simHours=realSeconds*SIM_HOURS_PER_REAL_SECOND*SPEED_MULTIPLIER[speed];

      let working=unitsRef.current;
      if(aiElapsed>=AI_COMMAND_INTERVAL_SECONDS){for(const side of botSides)working=enemyAI(scenario,working,citiesRef.current,side);aiElapsed=0}
      const nextUnits=simulate(scenario,working,simHours,citiesRef.current);
      const nextCities=updateCities(citiesRef.current,nextUnits,simHours);
      unitsRef.current=nextUnits;citiesRef.current=nextCities;setUnits(nextUnits);setCities(nextCities);

      const owners=new Set(nextCities.map(c=>c.owner));
      if(nextCities.length>0&&owners.size===1&&!warResultRef.current){
        const winner=nextCities[0].owner;warResultRef.current=winner;setWarResult(winner);setRunning(false);
      }

      setHour(prev=>{const total=prev+simHours;if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}return total});
    };
    const timer=window.setInterval(tick,SIM_TICK_MS);
    return()=>window.clearInterval(timer);
  },[scenario,running,speed]);

  function selectUnit(e:ReactMouseEvent,u:Formation){
    e.stopPropagation();if(!localSides.has(u.side))return;
    if(e.shiftKey)setSelected(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);else setSelected([u.id]);
  }

  function startOrder(type:OrderType){
    if(!selected.length)return;
    const selectedNow=units.filter(u=>selected.includes(u.id));
    if(type==="move"){setPendingOrder(null);return}
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
      if(key==="escape"){setPendingOrder(null);setPendingPlan(false);return}
      const digit=/^Digit([1-6])$/.exec(e.code);
      if(digit){
        const group=armyGroups[Number(digit[1])-1];
        if(e.ctrlKey){e.preventDefault();assignGroup(group.id)}else if(!e.metaKey&&!e.altKey){e.preventDefault();selectGroup(group.id)}
        return;
      }
      if(key==="b"){setPendingPlan(true);setPendingOrder(null);return}
      if(key==="m")startOrder("move");else if(key==="a")startOrder("assault");else if(key==="p")startOrder("probe");
      else if(key==="f")startOrder("fire");else if(key==="d")startOrder("defend");else if(key==="g")startOrder("dig");
      else if(key==="r")startOrder("resupply");else if(key==="t")startOrder("relieve");else if(key==="x")startOrder("retreat");
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[selected,units,cities]);

  function startGame(){
    const seed=typeof crypto!=="undefined"&&"getRandomValues" in crypto?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now()>>>0;
    const generated=generateScenario(seed,selectedPresetId);
    warResultRef.current=null;setWarResult(null);setAttackPlans([]);setPendingPlan(false);setPendingOrder(null);
    setScenario(generated);setUnits(generated.formations);unitsRef.current=generated.formations;
    setCities(generated.cities);citiesRef.current=generated.cities;
    const first=generated.formations.find(u=>u.side==="blue");setSelected(first?[first.id]:[]);
    setRunning(true);setSpeed(1);setHour(6);setDay(1);setPan({x:-260,y:-190});setZoom(.24);
  }

  function returnToSetup(){
    setRunning(false);setScenario(null);setUnits([]);unitsRef.current=[];setCities([]);citiesRef.current=[];
    setSelected([]);setAttackPlans([]);setWarResult(null);warResultRef.current=null;
  }

  if(!scenario){
    const presets=SCENARIO_PRESETS.filter(p=>setupCategory==="all"||setupCategory==="historical"===p.historical);
    const selectedPreset=SCENARIO_PRESETS.find(p=>p.id===selectedPresetId)??SCENARIO_PRESETS[0];
    return <main className="setup-shell">
      <div className="setup-panel">
        <div className="setup-brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>OPERATIONAL COMMAND SIMULATION</small></div></div>
        <div className="setup-grid">
          <section className="setup-main">
            <div className="setup-heading"><small>CREATE GAME</small><h1>Choose a theater</h1><p>Terrain now changes the roster, mobility, visibility and logistics. Historical presets are stylized scenarios, not exact order-of-battle reconstructions.</p></div>
            <div className="setup-tabs"><button className={setupCategory==="all"?"active":""} onClick={()=>setSetupCategory("all")}>ALL</button><button className={setupCategory==="fictional"?"active":""} onClick={()=>setSetupCategory("fictional")}>FICTIONAL</button><button className={setupCategory==="historical"?"active":""} onClick={()=>setSetupCategory("historical")}>HISTORICAL</button></div>
            <div className="scenario-grid">{presets.map(preset=><button key={preset.id} className={"scenario-card theme-"+preset.theme+" "+(selectedPresetId===preset.id?"selected":"")} onClick={()=>setSelectedPresetId(preset.id)}>
              <span className="scenario-theme">{preset.theme.toUpperCase()}</span><b>{preset.title}</b><small>{preset.location}{preset.year?" · "+preset.year:""}</small><p>{preset.subtitle}</p><em>{preset.sideNames.blue} ↔ {preset.sideNames.red}</em>
            </button>)}</div>
          </section>
          <aside className="setup-side">
            <div className="section-title">SELECTED THEATER</div><h2>{selectedPreset.title}</h2><p>{selectedPreset.location}{selectedPreset.year?" · "+selectedPreset.year:""}</p>
            <div className="setup-facts"><span><small>THEME</small><b>{selectedPreset.theme.toUpperCase()}</b></span><span><small>TYPE</small><b>{selectedPreset.historical?"HISTORICAL":"FICTIONAL"}</b></span><span><small>MAP</small><b>6200 × 4200</b></span><span><small>FOG</small><b>ENABLED</b></span></div>
            <div className="section-title">GAME MODE</div><div className="mode-list"><button className="active"><b>SINGLE PLAYER</b><small>You command {selectedPreset.sideNames.blue}</small></button><button disabled><b>CO-OP</b><small>architecture ready · networking later</small></button><button disabled><b>PVP / PVPVE</b><small>architecture ready · networking later</small></button></div>
            <button className="launch-button" onClick={startGame}>DEPLOY TO THEATER</button>
          </aside>
        </div>
      </div>
    </main>;
  }
  const activeScenario:Scenario=scenario;
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
    const worldW=WORLD_W*z,worldH=WORLD_H*z;
    return{x:worldW<=rect.width?(rect.width-worldW)/2:clamp(next.x,rect.width-worldW,0),y:worldH<=rect.height?(rect.height-worldH)/2:clamp(next.y,rect.height-worldH,0)};
  }

  function nearestLandPoint(x:number,y:number){
    const cx=clamp(x,2,WORLD_W-2),cy=clamp(y,2,WORLD_H-2);if(terrainAt(activeScenario,cx,cy).terrain!=="water")return{x:cx,y:cy};
    for(let radius=18;radius<=270;radius+=18)for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2,nx=clamp(cx+Math.cos(a)*radius,2,WORLD_W-2),ny=clamp(cy+Math.sin(a)*radius,2,WORLD_H-2);
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
    setPendingOrder(null);setPendingPlan(false);
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
    const side=chosen[0].side,id="plan-"+planCounter.current++;
    setAttackPlans(prev=>[...prev,{id,name:"OP "+String(planCounter.current-1).padStart(2,"0"),side,formationIds:chosen.map(u=>u.id),targetX:tx,targetY:ty,status:"draft"}]);
    setPendingPlan(false);
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
    setAttackPlans(prev=>prev.map(p=>p.id===id?{...p,status:"executing"}:p));
  }

  function cancelPlan(id:string){setAttackPlans(prev=>prev.filter(p=>p.id!==id))}

  function planOrigin(plan:AttackPlan){
    const force=units.filter(u=>plan.formationIds.includes(u.id));
    return force.length?{x:force.reduce((s,u)=>s+u.x,0)/force.length,y:force.reduce((s,u)=>s+u.y,0)/force.length}:{x:plan.targetX,y:plan.targetY};
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(suppressContextMenu.current){suppressContextMenu.current=false;return}
    if(!selected.length||pendingOrder==="assault"||pendingOrder==="fire"||pendingOrder==="relieve")return;
    const point=mapPoint(e.clientX,e.clientY);if(!point)return;
    const tx=clamp(point.x,1,WORLD_W-1),ty=clamp(point.y,1,WORLD_H-1);if(terrainAt(activeScenario,tx,ty).terrain==="water")return;
    if(pendingPlan){createAttackPlan(tx,ty);return}
    const requested=pendingOrder;
    commitUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;
      if(requested==="probe"&&DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:"probe",targetX:tx,targetY:ty}};
      return{...u,order:{type:"move",targetX:tx,targetY:ty}};
    }));setPendingOrder(null);
  }

  function issueUnitTarget(e:ReactMouseEvent,target:Formation){
    e.preventDefault();e.stopPropagation();if(!selected.length||selected.includes(target.id))return;
    const requested=pendingOrder;

    if(requested==="relieve"){
      if(!primary||target.side!==primary.side)return;
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)&&DIRECT_COMBAT_KINDS.has(u.kind)?{...u,order:{type:"relieve",targetUnitId:target.id}}:u));
      setPendingOrder(null);return;
    }

    if((requested==="assault"||requested==="fire"||requested==="probe")&&primary&&target.side===primary.side)return;
    commitUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;
      if(requested==="fire")return ARTILLERY_KINDS.has(u.kind)?{...u,order:{type:"fire",targetUnitId:target.id}}:u;
      if(requested==="assault"||requested==="probe"){
        if(ARTILLERY_KINDS.has(u.kind))return{...u,order:{type:"fire",targetUnitId:target.id}};
        if(DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:requested,targetUnitId:target.id}};
        return u;
      }
      return{...u,order:{type:"move",targetUnitId:target.id}};
    }));setPendingOrder(null);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top,next=clamp(zoom*(e.deltaY>0?.9:1.1),.1,1.5),wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setZoom(next);setPan(boundedPan({x:mx-wx*next,y:my-wy*next},next));
  }

  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
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
    const p=mapPoint(e.clientX,e.clientY);if(p)setHovered(terrainAt(activeScenario,p.x,p.y));
    const d=drag.current;if(!d)return;
    if(Math.hypot(e.clientX-d.startClientX,e.clientY-d.startClientY)>6)d.moved=true;
    if(d.mode==="pan"){setPan(boundedPan({x:d.px+e.clientX-d.startClientX,y:d.py+e.clientY-d.startClientY}));return}
    const screen=viewportPoint(e.clientX,e.clientY),start=viewportPoint(d.startClientX,d.startClientY);if(!screen||!start)return;
    if(d.mode==="box")setSelectionBox({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});else setFrontPreview({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});
  }

  function onPointerUp(e:ReactPointerEvent<HTMLDivElement>){
    const d=drag.current;if(!d)return;drag.current=null;
    if(d.mode==="pan")return;
    if(d.mode==="select"){if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false)}return}
    if(d.mode==="box"){
      setSelectionBox(null);
      if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false);return}
      const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(!a||!b)return;
      const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
      setSelected(units.filter(u=>localSides.has(u.side)&&u.x>=minX&&u.x<=maxX&&u.y>=minY&&u.y<=maxY).map(u=>u.id));setPendingOrder(null);return;
    }
    setFrontPreview(null);if(!d.moved)return;const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(a&&b)deployFront(a,b);
  }

  function onPointerCancel(){drag.current=null;setSelectionBox(null);setFrontPreview(null)}

  function orderLabel(u:Formation){
    if(!u.order)return"NO ORDERS";
    if(u.order.targetUnitId){const target=units.find(v=>v.id===u.order?.targetUnitId);return u.order.type.toUpperCase()+" → "+(target?.name??"LOST CONTACT")}
    if(u.order.targetX!==undefined&&u.order.targetY!==undefined)return u.order.type.toUpperCase()+" · "+Math.round(Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y)/8)+" KM";
    return u.order.type.toUpperCase();
  }

  const primaryAccess=primary?supplyAccess(activeScenario,primary,units,cities,currentSupplyNetwork):null;
  const canRetreat=selectedUnits.some(u=>u.supply>=RETREAT_SUPPLY_MIN&&isInCombat(u,units));

  return <main className={"game-shell theme-"+activeScenario.theme}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>{activeScenario.title.toUpperCase()} · #{activeScenario.seed.toString(16).toUpperCase()}</small></div></div>
      <div className="theater-state"><span>DAY {day}</span><strong>{timeLabel(hour)}</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span></div>
      <div className="global-metrics"><div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div><div><small>ORG</small><b>{pct(averageOrg)}%</b></div><div><small>CITIES</small><b>{blueCities}/{cities.length}</b></div><div><small>CONTACTS</small><b>{enemy.length}</b></div></div>
      <div className="time-controls"><button className="setup-return" onClick={returnToSetup}>SETUP</button><button onClick={()=>setRunning(v=>warResult?v:!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>{[1,2,3].map(s=><button key={s} onClick={()=>{if(!warResult){setSpeed(s);setRunning(true)}}} className={speed===s?"active":""}>×{s}</button>)}</div>
    </header>

    <aside className="left-panel">
      <section><div className="section-title">MAP LAYERS</div><div className="segmented">{(["terrain","supply","intel"] as OverlayMode[]).map(m=><button key={m} onClick={()=>setOverlay(m)} className={overlay===m?"active":""}>{m.toUpperCase()}</button>)}</div></section>
      <section><div className="section-title">ARMY GROUPS · CTRL+1…6 ASSIGN</div><div className="army-group-grid">{armyGroups.map(g=><button key={g.id} onClick={()=>selectGroup(g.id)}><b>{g.hotkey}</b><span>{g.name}<small>{blue.filter(u=>u.groupId===g.id).length} formations</small></span></button>)}</div></section>
      <section><div className="section-title">ATTACK PLANS · B THEN RMB</div><div className="plan-list">{attackPlans.length?attackPlans.map(p=><div className={"plan-row "+p.status} key={p.id}><button onClick={()=>setSelected(p.formationIds)}><b>{p.name}</b><small>{p.formationIds.length} formations · {p.status}</small></button>{p.status==="draft"&&<button onClick={()=>executePlan(p.id)}>GO</button>}<button onClick={()=>cancelPlan(p.id)}>×</button></div>):<small className="muted-line">No plans drafted.</small>}</div></section>
      <section><div className="section-title">ORDER OF BATTLE</div><div className="oob-list">{blue.map(u=><button key={u.id} onClick={()=>setSelected([u.id])} className={selected.includes(u.id)?"selected":""}><span className="oob-code">{UNIT_LABEL[u.kind]}</span><span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span></button>)}</div></section>
    </aside>

    <div ref={viewport} className={pendingOrder||pendingPlan?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={issueTarget}>
      <div className="world" style={{width:WORLD_W,height:WORLD_H,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={WORLD_W} height={WORLD_H} viewBox={"0 0 "+WORLD_W+" "+WORLD_H}>
          <defs><linearGradient id="sea" x1="0" x2="1"><stop offset="0" stopColor="#1c313c"/><stop offset="1" stopColor="#29424b"/></linearGradient><linearGradient id="intelShade" x1="0" x2="1"><stop offset="0" stopColor="#71846a" stopOpacity=".08"/><stop offset=".55" stopColor="#151b18" stopOpacity=".22"/><stop offset="1" stopColor="#050806" stopOpacity=".68"/></linearGradient><mask id="fogMask" maskUnits="userSpaceOnUse"><rect width={WORLD_W} height={WORLD_H} fill="white"/>{blue.map(u=><circle key={"fog-u-"+u.id} cx={u.x} cy={u.y} r={330+u.recon*3.1} fill="black"/>)}{cities.filter(c=>localSides.has(c.owner)).map(c=><circle key={"fog-c-"+c.name} cx={c.x} cy={c.y} r="270" fill="black"/>)}</mask></defs>
          <rect width={WORLD_W} height={WORLD_H} fill="url(#sea)"/><path d={activeScenario.landPath} className="land-base"/>
          {activeScenario.terrainFeatures.map(f=><path key={f.id} d={f.path} className={"terrain-region "+f.terrain}/>)}
          {activeScenario.riverRoutes.map((route,i)=><path key={"river"+i} d={polylinePath(route)} className="river"/>)}
          {activeScenario.roadRoutes.map((route,i)=><path key={"road"+i} d={polylinePath(route)} className="road"/>)}
          {cities.map(s=><g key={s.name} className={"site-label "+s.owner}><circle cx={s.x} cy={s.y} r="6" className="site-core"/><circle cx={s.x} cy={s.y} r="25" className="site-ring"/>{s.capture>0&&<circle cx={s.x} cy={s.y} r="30" className="capture-ring" pathLength="100" strokeDasharray={s.capture+" "+(100-s.capture)} transform={"rotate(-90 "+s.x+" "+s.y+")"}/>}<text x={s.x+11} y={s.y-11}>{s.name.toUpperCase()} · {s.owner==="blue"?"B":s.owner==="red"?"R":"G"}</text></g>)}
          {overlay==="supply"&&<g className="supply-overlay">{activeScenario.roadRoutes.map((route,i)=><path key={i} d={polylinePath(route)} className={"supply-route "+(routeCutForSide(route,"blue",units)?"cut":"")}/>)}{cities.map(s=><g key={s.name}><circle cx={s.x} cy={s.y} r="78" className={"supply-node "+s.owner}/>{localSides.has(s.owner)&&<text x={s.x+30} y={s.y+34} className="supply-capacity">×{currentSupplyNetwork.get(s.name)??1}</text>}</g>)}{units.filter(u=>u.kind==="logistics").map(u=><circle key={u.id} cx={u.x} cy={u.y} r={320+u.supply*1.3} className={"logistics-range "+u.side}/>)}</g>}
          {overlay==="intel"&&<path d={activeScenario.landPath} fill="url(#intelShade)" className="intel-overlay"/>}<rect width={WORLD_W} height={WORLD_H} className="fog-dark" mask="url(#fogMask)"/><rect x="1" y="1" width={WORLD_W-2} height={WORLD_H-2} className="world-boundary"/>
        </svg>

        {units.map(u=>{
          const visible=localSides.has(u.side)||blue.some(b=>Math.hypot(b.x-u.x,b.y-u.y)<330+b.recon*3.1)||cities.some(c=>localSides.has(c.owner)&&Math.hypot(c.x-u.x,c.y-u.y)<270);
          if(!visible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" "+(selected.includes(u.id)?"selected ":"")+(u.organization<30?"shaken ":"")+(u.order?.type==="retreat"?"retreating":"")} style={{left:u.x-16,top:u.y-16}} onPointerDown={e=>e.stopPropagation()} onClick={e=>selectUnit(e,u)} onContextMenu={e=>issueUnitTarget(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{u.side==="blue"?"Ⅰ":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>
        })}
        {primary&&primaryTargetX!==undefined&&primaryTargetY!==undefined&&<svg className="order-line" width={WORLD_W} height={WORLD_H}><line x1={primary.x} y1={primary.y} x2={primaryTargetX} y2={primaryTargetY}/><circle cx={primaryTargetX} cy={primaryTargetY} r="10"/></svg>}
        {attackPlans.length>0&&<svg className="attack-plans" width={WORLD_W} height={WORLD_H}>{attackPlans.map(plan=>{const o=planOrigin(plan);return <g key={plan.id} className={plan.status}><line x1={o.x} y1={o.y} x2={plan.targetX} y2={plan.targetY}/><circle cx={plan.targetX} cy={plan.targetY} r="18"/><text x={plan.targetX+24} y={plan.targetY-18}>{plan.name}</text></g>})}</svg>}
      </div>

      {selectionBox&&<div className="selection-box" style={{left:Math.min(selectionBox.x1,selectionBox.x2),top:Math.min(selectionBox.y1,selectionBox.y2),width:Math.abs(selectionBox.x2-selectionBox.x1),height:Math.abs(selectionBox.y2-selectionBox.y1)}}/>}
      {frontPreview&&<svg className="front-preview"><line x1={frontPreview.x1} y1={frontPreview.y1} x2={frontPreview.x2} y2={frontPreview.y2}/></svg>}
      <div className="map-hud"><div><span className="dot friendly"/>FRIENDLY {blue.length}</div><div><span className="dot hostile"/>CONTACTS {enemy.length}</div><div>CITIES {blueCities}/{cities.length}</div><div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · "+(hovered.road?"SUPPLY ROAD":"OFF ROAD"):activeScenario.location.toUpperCase()}</div><div>ZOOM {Math.round(zoom*100)}%</div></div>
      {pendingPlan&&<div className="target-banner">ATTACK PLAN · RMB OBJECTIVE <button onClick={()=>setPendingPlan(false)}>ESC / CANCEL</button></div>}
      {pendingOrder&&<div className="target-banner">{pendingOrder==="relieve"?"RELIEVE ARMED · RMB FRIENDLY FRONTLINE":pendingOrder==="assault"||pendingOrder==="fire"?pendingOrder.toUpperCase()+" ARMED · RMB ENEMY FORMATION":pendingOrder.toUpperCase()+" ARMED · RMB TARGET"} <button onClick={()=>setPendingOrder(null)}>ESC / CANCEL</button></div>}
      {warResult&&<div className={"war-result "+warResult}><b>{warResult==="blue"?"VICTORY":"DEFEAT"}</b><span>ALL STRATEGIC CITIES CONTROLLED BY {activeScenario.sideNames[warResult]??warResult.toUpperCase()}</span></div>}
    </div>

    <aside className="right-panel">
      {primary?<div className="inspector">
        <div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        <div className="section-title">SUPPLY ACCESS</div>{primaryAccess&&<div className={"supply-access level-"+primaryAccess.level}><b>{primaryAccess.label}</b><span>{primaryAccess.range>0?"Relay range "+Math.round(primaryAccess.range):primaryAccess.level===0?"Resupply severely limited":"Automatic resupply active"}</span></div>}
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

    <footer className="statusbar"><span>SPACE: PAUSE</span><span>MMB DRAG: PAN</span><span>LMB DRAG: BOX SELECT</span><span>CTRL+LMB: FORM FRONT</span><span>CTRL+1…6: ASSIGN GROUP</span><span>B: ATTACK PLAN</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}