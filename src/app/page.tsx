"use client";

import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {generateScenario,polylinePath,terrainAt,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W} from "@/sim/game";
import type {CityState,Formation,OrderType,OverlayMode,Scenario,Side,TerrainSample} from "@/sim/types";

const SPEED_MULTIPLIER=[0,1,2.5,6];
const SIM_HOURS_PER_REAL_SECOND=.75;
const MAX_FRAME_SECONDS=.035;
const AI_COMMAND_INTERVAL_SECONDS=.55;
const MOVEMENT_SCALE=2.7;
const RETREAT_SUPPLY_MIN=35;
const DIRECT_COMBAT_KINDS=new Set<Formation["kind"]>(["infantry","mechanized","armor","recon","engineer","reserve"]);

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

function supplyAccess(scenario:Scenario,u:Formation,units:Formation[],cities:CityState[]){
  const sample=terrainAt(scenario,u.x,u.y);
  const city=sample.objective?cities.find(c=>c.name===sample.objective):undefined;
  const connectedCity=cities.some(c=>c.owner===u.side&&Math.hypot(c.x-u.x,c.y-u.y)<900);
  const relay=units
    .filter(v=>v.side===u.side&&v.kind==="logistics"&&v.id!==u.id&&v.supply>20)
    .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),range:250+v.supply*1.6}))
    .filter(x=>x.d<x.range)
    .sort((a,b)=>a.d-b.d)[0];

  if(city?.owner===u.side)return{level:3,label:"OWNED SUPPLY NODE",supplyPerHour:3.4,fuelPerHour:2.25,range:0};
  if(sample.road&&(connectedCity||relay))return{level:2,label:relay&&!connectedCity?"LOGISTICS-EXTENDED LINE":"ACTIVE SUPPLY LINE",supplyPerHour:1.7,fuelPerHour:1.1,range:relay?.range??0};
  if(relay)return{level:1,label:"MOBILE LOGISTICS RELAY",supplyPerHour:.92,fuelPerHour:.58,range:relay.range};
  return{level:0,label:city?"HOSTILE SUPPLY NODE":"OUT OF NETWORK",supplyPerHour:0,fuelPerHour:0,range:0};
}

function updateCities(cities:CityState[],units:Formation[],hours:number):CityState[]{
  return cities.map(city=>{
    const nearby=units.filter(u=>DIRECT_COMBAT_KINDS.has(u.kind)&&u.strength>8&&Math.hypot(u.x-city.x,u.y-city.y)<72);
    const blue=nearby.filter(u=>u.side==="blue");
    const red=nearby.filter(u=>u.side==="red");
    if(blue.length&&red.length)return{...city,capture:Math.max(0,city.capture-hours*8)};

    const attackers=city.owner==="blue"?red:blue;
    const defenders=city.owner==="blue"?blue:red;
    if(defenders.length||!attackers.length)return{...city,capture:Math.max(0,city.capture-hours*12)};

    const avgReadiness=attackers.reduce((sum,u)=>sum+u.readiness,0)/attackers.length;
    const capture=city.capture+hours*(13+5*Math.sqrt(attackers.length))*(.55+avgReadiness/220);
    return capture>=100?{...city,owner:city.owner==="blue"?"red":"blue",capture:0}:{...city,capture};
  });
}

function enemyAI(scenario:Scenario,units:Formation[],cities:CityState[]):Formation[]{
  const blue=units.filter(u=>u.side==="blue");
  const red=units.filter(u=>u.side==="red");
  const blueCities=cities.filter(c=>c.owner==="blue");
  if(!blue.length)return units;

  return units.map((u):Formation=>{
    if(u.side!=="red")return u;

    const nearestBlue=blue.map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
    if(!nearestBlue)return u;

    if(u.kind==="reserve"){
      const weakFront=red
        .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind)&&v.kind!=="reserve"&&isInCombat(v,units)&&(v.strength<68||v.organization<45))
        .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
      if(weakFront)return{...u,order:{type:"relieve",targetUnitId:weakFront.id}};
    }

    const nearestRedCombat=red
      .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind)&&v.kind!=="reserve")
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];

    if(u.kind==="artillery"){
      if(nearestBlue.d<=375&&u.supply>12&&u.organization>18)return{...u,order:{type:"fire",targetUnitId:nearestBlue.v.id}};
      const anchor=nearestRedCombat?.v;
      if(anchor){
        const dx=anchor.x-nearestBlue.v.x,dy=anchor.y-nearestBlue.v.y,len=Math.hypot(dx,dy)||1;
        const tx=clamp(anchor.x+dx/len*135,20,WORLD_W-20),ty=clamp(anchor.y+dy/len*135,20,WORLD_H-20);
        if(terrainAt(scenario,tx,ty).terrain!=="water")return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      }
      return u;
    }

    if(u.kind==="logistics"){
      const anchor=nearestRedCombat?.v;
      if(!anchor)return u;
      const dx=anchor.x-nearestBlue.v.x,dy=anchor.y-nearestBlue.v.y,len=Math.hypot(dx,dy)||1;
      const tx=clamp(anchor.x+dx/len*210,20,WORLD_W-20),ty=clamp(anchor.y+dy/len*210,20,WORLD_H-20);
      if(Math.hypot(tx-u.x,ty-u.y)>65&&terrainAt(scenario,tx,ty).terrain!=="water")return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      return{...u,order:{type:"resupply"}};
    }

    if(DIRECT_COMBAT_KINDS.has(u.kind)){
      if((u.organization<24||u.strength<38||u.supply<15)&&u.supply>=18){
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }

      const nearestCity=blueCities.map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
      const n=Number(u.id.replace(/\D/g,""))||0;
      if(nearestCity&&(nearestCity.d<nearestBlue.d*1.2||n%3===0))return{...u,order:{type:"move",targetX:nearestCity.c.x,targetY:nearestCity.c.y}};
      return{...u,order:{type:"assault",targetUnitId:nearestBlue.v.id}};
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
  const next=units.map(u=>{
    const sample=terrainAt(scenario,u.x,u.y);
    const terrain=TERRAIN_RULES[sample.terrain];
    const access=supplyAccess(scenario,u,units,cities);
    const n:Formation={...u,order:u.order?{...u.order}:undefined};

    if(n.order?.targetUnitId){
      const tracked=units.find(v=>v.id===n.order?.targetUnitId&&v.strength>1);
      if(tracked)n.order={...n.order,targetX:tracked.x,targetY:tracked.y};
      else n.order={type:"defend"};
    }

    if(access.level>0){
      n.supply=clamp(n.supply+hours*access.supplyPerHour,0,100);
      if(["armor","mechanized","recon","logistics"].includes(u.kind))n.fuel=clamp(n.fuel+hours*access.fuelPerHour,0,100);
    }

    if(n.order?.type==="dig"){
      n.entrenchment=clamp(n.entrenchment+hours*1.15,0,100);
      n.organization=clamp(n.organization+hours*.22,0,100);
      n.supply=clamp(n.supply-hours*.035,0,100);
    }else if(n.order?.type==="resupply"){
      const orderSupply=access.level===0?.12:access.level===1?.6:access.level===2?1.45:2.4;
      n.supply=clamp(n.supply+hours*orderSupply,0,100);
      n.fuel=clamp(n.fuel+hours*(access.level===0?.04:.85),0,100);
      n.organization=clamp(n.organization+hours*(access.level===0?.12:.5),0,100);
    }else if(n.order?.type==="fire"){
      n.entrenchment=clamp(n.entrenchment+hours*.025,0,100);
    }else if(n.order&&n.order.targetX!==undefined&&n.order.targetY!==undefined){
      const dx=n.order.targetX-u.x,dy=n.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5&&!n.order.targetUnitId){
        n.x=n.order.targetX;n.y=n.order.targetY;n.order={type:"defend"};
      }else if(dist>0&&n.supply>3){
        const posture=n.order.type==="retreat"?1.55:n.order.type==="relieve"?1.12:n.order.type==="assault"?.58:n.order.type==="probe"?.74:1;
        const roadBonus=sample.road
          ?u.kind==="artillery"?2.7
          :u.kind==="logistics"?2.05
          :u.kind==="armor"||u.kind==="mechanized"||u.kind==="recon"?1.8
          :1.55
          :1;
        const travel=Math.min(dist,u.speed*terrain.move*roadBonus*posture*hours*MOVEMENT_SCALE);
        let nx=clamp(u.x+dx/dist*travel,1,WORLD_W-1),ny=clamp(u.y+dy/dist*travel,1,WORLD_H-1);

        if(DIRECT_COMBAT_KINDS.has(u.kind)&&n.order.type!=="retreat"){
          const contact=units.filter(v=>v.side!==u.side).map(v=>({v,...segmentContact(u.x,u.y,nx,ny,v.x,v.y)})).filter(c=>c.distance<44).sort((a,b)=>a.t-b.t)[0];
          if(contact){
            const stopDistance=Math.max(0,travel*contact.t-36);
            nx=clamp(u.x+dx/dist*stopDistance,1,WORLD_W-1);ny=clamp(u.y+dy/dist*stopDistance,1,WORLD_H-1);
          }
        }

        if(terrainAt(scenario,nx,ny).terrain!=="water"){
          n.x=nx;n.y=ny;
          n.supply=clamp(n.supply-travel*(u.kind==="armor"||u.kind==="mechanized"?.012:.006),0,100);
          n.fuel=clamp(n.fuel-travel*(u.kind==="armor"?.019:u.kind==="mechanized"||u.kind==="recon"?.012:.001),0,100);
          n.entrenchment=Math.max(0,n.entrenchment-hours*.7);
          n.organization=clamp(n.organization-hours*.12,0,100);
        }
      }
    }else{
      n.organization=clamp(n.organization+hours*.08,0,100);
      n.entrenchment=clamp(n.entrenchment+hours*.04,0,100);
    }

    if(n.supply<25)n.organization=clamp(n.organization-hours*.4,0,100);
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
      const aLoss=(bPower*bPosture/Math.max(20,a.defense*aDef+a.entrenchment*.6))*hours*2.15*(aRetreat?1.2:1);
      const bLoss=(aPower*aPosture/Math.max(20,b.defense*bDef+b.entrenchment*.6))*hours*2.15*(bRetreat?1.2:1);
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
  }

  for(const gun of result){
    if(gun.kind!=="artillery"||gun.order?.type!=="fire"||!gun.order.targetUnitId)continue;
    const target=result.find(v=>v.id===gun.order?.targetUnitId&&v.side!==gun.side);
    if(!target)continue;
    const range=Math.hypot(target.x-gun.x,target.y-gun.y);
    if(range>390||gun.supply<4||gun.organization<8)continue;
    const terrain=TERRAIN_RULES[terrainAt(scenario,target.x,target.y).terrain];
    const rangeFactor=clamp(1-(range-80)/530,.38,1);
    const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor;
    const loss=(power/Math.max(24,target.defense*terrain.defense+target.entrenchment*.7))*hours*1.45;
    target.strength=clamp(target.strength-loss,0,100);target.organization=clamp(target.organization-loss*2.2,0,100);
    gun.supply=clamp(gun.supply-hours*.42,0,100);gun.organization=clamp(gun.organization-hours*.04,0,100);
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
  const [pan,setPan]=useState({x:-235,y:-180});
  const [zoom,setZoom]=useState(.78);
  const [hovered,setHovered]=useState<TerrainSample|null>(null);
  const [warResult,setWarResult]=useState<Side|null>(null);
  const [selectionBox,setSelectionBox]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [frontPreview,setFrontPreview]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);

  const drag=useRef<{mode:"pan"|"box"|"front";startClientX:number;startClientY:number;px:number;py:number;moved:boolean}|null>(null);
  const suppressContextMenu=useRef(false);
  const viewport=useRef<HTMLDivElement>(null);
  const unitsRef=useRef<Formation[]>([]);
  const citiesRef=useRef<CityState[]>([]);
  const warResultRef=useRef<Side|null>(null);

  useEffect(()=>{
    const seed=typeof crypto!=="undefined"&&"getRandomValues" in crypto?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now()>>>0;
    const generated=generateScenario(seed);
    setScenario(generated);
    setUnits(generated.formations);unitsRef.current=generated.formations;
    setCities(generated.cities);citiesRef.current=generated.cities;
    const first=generated.formations.find(u=>u.side==="blue");
    setSelected(first?[first.id]:[]);
  },[]);

  const commitUnits=(fn:(prev:Formation[])=>Formation[])=>{
    setUnits(prev=>{const next=fn(prev);unitsRef.current=next;return next});
  };

  const selectedUnits=units.filter(u=>selected.includes(u.id));
  const primary=selectedUnits[0];
  const primaryTracked=primary?.order?.targetUnitId?units.find(u=>u.id===primary.order?.targetUnitId):undefined;
  const primaryTargetX=primaryTracked?.x??primary?.order?.targetX,primaryTargetY=primaryTracked?.y??primary?.order?.targetY;
  const blue=units.filter(u=>u.side==="blue"),enemy=units.filter(u=>u.side==="red");
  const blueCities=cities.filter(c=>c.owner==="blue").length;
  const averageSupply=blue.reduce((s,u)=>s+u.supply,0)/Math.max(1,blue.length);
  const averageOrg=blue.reduce((s,u)=>s+u.organization,0)/Math.max(1,blue.length);

  useEffect(()=>{
    if(!scenario||!running||speed===0||warResultRef.current)return;
    let frame=0,last=performance.now(),aiElapsed=AI_COMMAND_INTERVAL_SECONDS;
    const tick=(now:number)=>{
      const realSeconds=Math.min(MAX_FRAME_SECONDS,Math.max(0,(now-last)/1000));last=now;aiElapsed+=realSeconds;
      const simHours=realSeconds*SIM_HOURS_PER_REAL_SECOND*SPEED_MULTIPLIER[speed];

      let working=unitsRef.current;
      if(aiElapsed>=AI_COMMAND_INTERVAL_SECONDS){working=enemyAI(scenario,working,citiesRef.current);aiElapsed=0}
      const nextUnits=simulate(scenario,working,simHours,citiesRef.current);
      const nextCities=updateCities(citiesRef.current,nextUnits,simHours);
      unitsRef.current=nextUnits;citiesRef.current=nextCities;setUnits(nextUnits);setCities(nextCities);

      const blueWon=nextCities.length>0&&nextCities.every(c=>c.owner==="blue"),redWon=nextCities.length>0&&nextCities.every(c=>c.owner==="red");
      if((blueWon||redWon)&&!warResultRef.current){
        const winner:Side=blueWon?"blue":"red";warResultRef.current=winner;setWarResult(winner);setRunning(false);
      }

      setHour(prev=>{const total=prev+simHours;if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}return total});
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[scenario,running,speed]);

  const activeScenario=scenario;\n  if(!activeScenario)return <main className="game-shell loading-theater">GENERATING THEATER...</main>;

  function selectUnit(e:ReactMouseEvent,u:Formation){
    e.stopPropagation();if(u.side!=="blue")return;
    if(e.shiftKey)setSelected(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);else setSelected([u.id]);
  }

  function startOrder(type:OrderType){
    if(!selected.length)return;
    const selectedNow=units.filter(u=>selected.includes(u.id));
    if(type==="move"){setPendingOrder(null);return}
    if((type==="assault"||type==="probe")&&!selectedNow.some(u=>DIRECT_COMBAT_KINDS.has(u.kind)))return;
    if(type==="fire"&&!selectedNow.some(u=>u.kind==="artillery"))return;

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
      if(key==="escape"){setPendingOrder(null);return}
      if(key==="m")startOrder("move");else if(key==="a")startOrder("assault");else if(key==="p")startOrder("probe");
      else if(key==="f")startOrder("fire");else if(key==="d")startOrder("defend");else if(key==="g")startOrder("dig");
      else if(key==="r")startOrder("resupply");else if(key==="t")startOrder("relieve");else if(key==="x")startOrder("retreat");
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[selected,units,cities]);

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
    for(let radius=12;radius<=120;radius+=12)for(let i=0;i<16;i++){
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
    commitUnits(prev=>prev.map(u=>{const target=targets.get(u.id);return target?{...u,order:{type:"move",targetX:target.x,targetY:target.y}}:u}));setPendingOrder(null);
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(suppressContextMenu.current){suppressContextMenu.current=false;return}
    if(!selected.length||pendingOrder==="assault"||pendingOrder==="fire"||pendingOrder==="relieve")return;
    const point=mapPoint(e.clientX,e.clientY);if(!point)return;
    const tx=clamp(point.x,1,WORLD_W-1),ty=clamp(point.y,1,WORLD_H-1);if(terrainAt(activeScenario,tx,ty).terrain==="water")return;
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
      if(target.side!=="blue")return;
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)&&DIRECT_COMBAT_KINDS.has(u.kind)?{...u,order:{type:"relieve",targetUnitId:target.id}}:u));
      setPendingOrder(null);return;
    }

    if((requested==="assault"||requested==="fire"||requested==="probe")&&target.side==="blue")return;
    commitUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;
      if(requested==="fire")return u.kind==="artillery"?{...u,order:{type:"fire",targetUnitId:target.id}}:u;
      if(requested==="assault"||requested==="probe"){
        if(u.kind==="artillery")return{...u,order:{type:"fire",targetUnitId:target.id}};
        if(DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:requested,targetUnitId:target.id}};
        return u;
      }
      return{...u,order:{type:"move",targetUnitId:target.id}};
    }));setPendingOrder(null);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top,next=clamp(zoom*(e.deltaY>0?.9:1.1),.42,1.8),wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setZoom(next);setPan(boundedPan({x:mx-wx*next,y:my-wy*next},next));
  }

  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button>2)return;const screen=viewportPoint(e.clientX,e.clientY);if(!screen)return;
    let mode:"pan"|"box"|"front"="pan";
    if(e.button===2)mode="box";else if(e.button===0&&e.ctrlKey&&selected.length>1)mode="front";else if(e.button!==0)return;
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
    if(d.mode==="pan"){if(!d.moved&&e.button===0&&!e.ctrlKey){setSelected([]);setPendingOrder(null)}return}
    if(d.mode==="box"){
      setSelectionBox(null);if(!d.moved)return;suppressContextMenu.current=true;
      const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(!a||!b)return;
      const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
      setSelected(units.filter(u=>u.side==="blue"&&u.x>=minX&&u.x<=maxX&&u.y>=minY&&u.y<=maxY).map(u=>u.id));setPendingOrder(null);return;
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

  const primaryAccess=primary?supplyAccess(activeScenario,primary,units,cities):null;
  const canRetreat=selectedUnits.some(u=>u.supply>=RETREAT_SUPPLY_MIN&&isInCombat(u,units));

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>THEATER #{activeScenario.seed.toString(16).toUpperCase()}</small></div></div>
      <div className="theater-state"><span>DAY {day}</span><strong>{timeLabel(hour)}</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span></div>
      <div className="global-metrics"><div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div><div><small>ORG</small><b>{pct(averageOrg)}%</b></div><div><small>CITIES</small><b>{blueCities}/{cities.length}</b></div><div><small>CONTACTS</small><b>{enemy.length}</b></div></div>
      <div className="time-controls"><button onClick={()=>setRunning(v=>warResult?v:!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>{[1,2,3].map(s=><button key={s} onClick={()=>{if(!warResult){setSpeed(s);setRunning(true)}}} className={speed===s?"active":""}>×{s}</button>)}</div>
    </header>

    <aside className="left-panel">
      <section><div className="section-title">MAP LAYERS</div><div className="segmented">{(["terrain","supply","intel"] as OverlayMode[]).map(m=><button key={m} onClick={()=>setOverlay(m)} className={overlay===m?"active":""}>{m.toUpperCase()}</button>)}</div></section>
      <section><div className="section-title">ORDER OF BATTLE</div><div className="oob-list">{blue.map(u=><button key={u.id} onClick={()=>setSelected([u.id])} className={selected.includes(u.id)?"selected":""}><span className="oob-code">{UNIT_LABEL[u.kind]}</span><span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span></button>)}</div></section>
    </aside>

    <div ref={viewport} className={pendingOrder?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={issueTarget}>
      <div className="world" style={{width:WORLD_W,height:WORLD_H,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={WORLD_W} height={WORLD_H} viewBox={"0 0 "+WORLD_W+" "+WORLD_H}>
          <defs><linearGradient id="sea" x1="0" x2="1"><stop offset="0" stopColor="#1c313c"/><stop offset="1" stopColor="#29424b"/></linearGradient><linearGradient id="intelShade" x1="0" x2="1"><stop offset="0" stopColor="#71846a" stopOpacity=".08"/><stop offset=".55" stopColor="#151b18" stopOpacity=".22"/><stop offset="1" stopColor="#050806" stopOpacity=".68"/></linearGradient><filter id="paperNoise"><feTurbulence baseFrequency=".016" numOctaves="3" seed={activeScenario.seed%1000} result="noise"/><feBlend in="SourceGraphic" in2="noise" mode="soft-light"/></filter></defs>
          <rect width={WORLD_W} height={WORLD_H} fill="url(#sea)"/><path d={activeScenario.landPath} className="land-base"/>
          {activeScenario.terrainFeatures.map(f=><path key={f.id} d={f.path} className={"terrain-region "+f.terrain}/>)}
          {activeScenario.riverRoutes.map((route,i)=><path key={"river"+i} d={polylinePath(route)} className="river"/>)}
          {activeScenario.roadRoutes.map((route,i)=><path key={"road"+i} d={polylinePath(route)} className="road"/>)}
          {cities.map(s=><g key={s.name} className={"site-label "+s.owner}><circle cx={s.x} cy={s.y} r="6" className="site-core"/><circle cx={s.x} cy={s.y} r="25" className="site-ring"/>{s.capture>0&&<circle cx={s.x} cy={s.y} r="30" className="capture-ring" pathLength="100" strokeDasharray={s.capture+" "+(100-s.capture)} transform={"rotate(-90 "+s.x+" "+s.y+")"}/>}<text x={s.x+11} y={s.y-11}>{s.name.toUpperCase()} · {s.owner==="blue"?"B":"R"}</text></g>)}
          {overlay==="supply"&&<g className="supply-overlay">{activeScenario.roadRoutes.map((route,i)=><path key={i} d={polylinePath(route)} className="supply-route"/>)}{cities.map(s=><circle key={s.name} cx={s.x} cy={s.y} r="78" className={"supply-node "+s.owner}/>)}{units.filter(u=>u.kind==="logistics").map(u=><circle key={u.id} cx={u.x} cy={u.y} r={250+u.supply*1.6} className={"logistics-range "+u.side}/>)}</g>}
          {overlay==="intel"&&<path d={activeScenario.landPath} fill="url(#intelShade)" className="intel-overlay"/>}<rect x="1" y="1" width={WORLD_W-2} height={WORLD_H-2} className="world-boundary"/>
        </svg>

        {units.map(u=>{
          const visible=u.side==="blue"||overlay==="intel"||blue.some(b=>Math.hypot(b.x-u.x,b.y-u.y)<330+b.recon*2);
          if(!visible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" "+(selected.includes(u.id)?"selected ":"")+(u.organization<30?"shaken ":"")+(u.order?.type==="retreat"?"retreating":"")} style={{left:u.x-16,top:u.y-16}} onPointerDown={e=>e.stopPropagation()} onClick={e=>selectUnit(e,u)} onContextMenu={e=>issueUnitTarget(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{u.side==="blue"?"Ⅰ":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>
        })}
        {primary&&primaryTargetX!==undefined&&primaryTargetY!==undefined&&<svg className="order-line" width={WORLD_W} height={WORLD_H}><line x1={primary.x} y1={primary.y} x2={primaryTargetX} y2={primaryTargetY}/><circle cx={primaryTargetX} cy={primaryTargetY} r="10"/></svg>}
      </div>

      {selectionBox&&<div className="selection-box" style={{left:Math.min(selectionBox.x1,selectionBox.x2),top:Math.min(selectionBox.y1,selectionBox.y2),width:Math.abs(selectionBox.x2-selectionBox.x1),height:Math.abs(selectionBox.y2-selectionBox.y1)}}/>}
      {frontPreview&&<svg className="front-preview"><line x1={frontPreview.x1} y1={frontPreview.y1} x2={frontPreview.x2} y2={frontPreview.y2}/></svg>}
      <div className="map-hud"><div><span className="dot friendly"/>FRIENDLY {blue.length}</div><div><span className="dot hostile"/>CONTACTS {enemy.length}</div><div>CITIES {blueCities}/{cities.length}</div><div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · "+(hovered.road?"SUPPLY ROAD":"OFF ROAD"):"THEATER "+activeScenario.seed}</div><div>ZOOM {Math.round(zoom*100)}%</div></div>
      {pendingOrder&&<div className="target-banner">{pendingOrder==="relieve"?"RELIEVE ARMED · RMB FRIENDLY FRONTLINE":pendingOrder==="assault"||pendingOrder==="fire"?pendingOrder.toUpperCase()+" ARMED · RMB ENEMY FORMATION":pendingOrder.toUpperCase()+" ARMED · RMB TARGET"} <button onClick={()=>setPendingOrder(null)}>ESC / CANCEL</button></div>}
      {warResult&&<div className={"war-result "+warResult}><b>{warResult==="blue"?"VICTORY":"DEFEAT"}</b><span>ALL STRATEGIC CITIES CONTROLLED BY {warResult.toUpperCase()} FORCES</span></div>}
    </div>

    <aside className="right-panel">
      {primary?<div className="inspector">
        <div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        <div className="section-title">SUPPLY ACCESS</div>{primaryAccess&&<div className={"supply-access level-"+primaryAccess.level}><b>{primaryAccess.label}</b><span>{primaryAccess.range>0?"Relay range "+Math.round(primaryAccess.range):primaryAccess.level===0?"Resupply severely limited":"Automatic resupply active"}</span></div>}
        <div className="section-title">ORDERS</div><div className="orders">
          <button className={!pendingOrder?"active":""} onClick={()=>startOrder("move")}>MOVE <kbd>M</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="assault"?"active":""} onClick={()=>startOrder("assault")}>ASSAULT <kbd>A</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="probe"?"active":""} onClick={()=>startOrder("probe")}>PROBE <kbd>P</kbd></button>
          <button disabled={!selectedUnits.some(u=>u.kind==="artillery")} className={pendingOrder==="fire"?"active":""} onClick={()=>startOrder("fire")}>FIRE <kbd>F</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="relieve"?"active":""} onClick={()=>startOrder("relieve")}>RELIEVE <kbd>T</kbd></button>
          <button disabled={!canRetreat} onClick={()=>startOrder("retreat")}>RETREAT <kbd>X</kbd></button>
          <button onClick={()=>startOrder("defend")}>DEFEND <kbd>D</kbd></button><button onClick={()=>startOrder("dig")}>DIG IN <kbd>G</kbd></button><button onClick={()=>startOrder("resupply")}>RESUPPLY <kbd>R</kbd></button>
        </div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>

    <footer className="statusbar"><span>LMB EMPTY: DESELECT</span><span>RMB DRAG: BOX SELECT</span><span>CTRL+LMB DRAG: FORM FRONT</span><span>T: RELIEVE · X: RETREAT</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}