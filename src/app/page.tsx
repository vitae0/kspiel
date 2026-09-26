"use client";

import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {INITIAL_FORMATIONS,LAND_PATH,ROAD_ROUTES,RIVER_ROUTES,STRATEGIC_SITES,TERRAIN_FEATURES,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W,polylinePath,terrainAt} from "@/sim/game";
import type {Formation,OrderType,OverlayMode,TerrainSample} from "@/sim/types";

const SPEED_HOURS=[0,.12,.45,1.2];
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}
function pct(v:number){return Math.round(clamp(v,0,100))}
function timeLabel(hour:number){
  const h=Math.floor(hour)%24;
  const m=Math.floor((hour-Math.floor(hour))*60);
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}

function enemyAI(units:Formation[]){
  const blue=units.filter(u=>u.side==="blue");
  const red=units.filter(u=>u.side==="red");
  if(!blue.length)return units;

  return units.map(u=>{
    if(u.side!=="red")return u;

    const nearestBlue=blue
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];
    if(!nearestBlue)return u;

    const nearestRedCombat=red
      .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind as any))
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];

    if(u.kind==="artillery"){
      if(nearestBlue.d<=360&&u.supply>12&&u.organization>18){
        return {...u,order:{type:"fire" as const,targetX:nearestBlue.v.x,targetY:nearestBlue.v.y}};
      }
      const anchor=nearestRedCombat?.v;
      if(anchor){
        const dx=anchor.x-nearestBlue.v.x,dy=anchor.y-nearestBlue.v.y,len=Math.hypot(dx,dy)||1;
        const tx=clamp(anchor.x+dx/len*125,180,WORLD_W-50);
        const ty=clamp(anchor.y+dy/len*125,40,WORLD_H-40);
        if(terrainAt(tx,ty).terrain!=="water")return{...u,order:{type:"move" as const,targetX:tx,targetY:ty}};
      }
      return u;
    }

    if(u.kind==="logistics"||u.kind==="airDefense"){
      const anchor=nearestRedCombat?.v;
      if(!anchor)return u;
      const dx=anchor.x-nearestBlue.v.x,dy=anchor.y-nearestBlue.v.y,len=Math.hypot(dx,dy)||1;
      const spacing=u.kind==="logistics"?180:110;
      const tx=clamp(anchor.x+dx/len*spacing,180,WORLD_W-50);
      const ty=clamp(anchor.y+dy/len*spacing,40,WORLD_H-40);
      if(Math.hypot(tx-u.x,ty-u.y)>55&&terrainAt(tx,ty).terrain!=="water"){
        return{...u,order:{type:"move" as const,targetX:tx,targetY:ty}};
      }
      return{...u,order:{type:u.kind==="logistics"?"resupply":"defend"}};
    }

    if(DIRECT_COMBAT_KINDS.has(u.kind as any)){
      if(u.organization<24||u.strength<38||u.supply<15){
        const dx=u.x-nearestBlue.v.x,dy=u.y-nearestBlue.v.y,len=Math.hypot(dx,dy)||1;
        const tx=clamp(u.x+dx/len*210,180,WORLD_W-45);
        const ty=clamp(u.y+dy/len*210,40,WORLD_H-40);
        if(terrainAt(tx,ty).terrain!=="water")return{...u,order:{type:"move" as const,targetX:tx,targetY:ty}};
        return{...u,order:{type:"defend" as const}};
      }

      const flank=((u.id.charCodeAt(u.id.length-1)%5)-2)*22;
      const dx=nearestBlue.v.x-u.x,dy=nearestBlue.v.y-u.y,len=Math.hypot(dx,dy)||1;
      const tx=clamp(nearestBlue.v.x-dy/len*flank,180,WORLD_W-45);
      const ty=clamp(nearestBlue.v.y+dx/len*flank,40,WORLD_H-40);
      return{...u,order:{type:"assault" as const,targetX:tx,targetY:ty}};
    }

    return u;
  });
}

const DIRECT_COMBAT_KINDS=new Set(["infantry","mechanized","armor","recon","engineer"] as const);

function segmentContact(ax:number,ay:number,bx:number,by:number,px:number,py:number){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  if(!len)return{distance:Math.hypot(px-ax,py-ay),t:0};
  const t=clamp(((px-ax)*dx+(py-ay)*dy)/len,0,1);
  return{distance:Math.hypot(px-(ax+t*dx),py-(ay+t*dy)),t};
}

function simulate(units:Formation[],hours:number){
  const commanded=enemyAI(units);
  const next=commanded.map(u=>{
    const terrain=TERRAIN_RULES[terrainAt(u.x,u.y).terrain];
    const n={...u,order:u.order?{...u.order}:undefined};

    if(u.order?.type==="dig"){
      n.entrenchment=clamp(u.entrenchment+hours*1.15,0,100);
      n.organization=clamp(u.organization+hours*.22,0,100);
      n.supply=clamp(u.supply-hours*.035,0,100);
    }else if(u.order?.type==="resupply"){
      n.supply=clamp(u.supply+hours*2.2,0,100);
      n.fuel=clamp(u.fuel+hours*1.5,0,100);
      n.organization=clamp(u.organization+hours*.7,0,100);
    }else if(u.order?.type==="fire"){
      n.entrenchment=clamp(u.entrenchment+hours*.025,0,100);
    }else if(u.order&&u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const dx=u.order.targetX-u.x,dy=u.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5){
        n.x=u.order.targetX;n.y=u.order.targetY;n.order={type:"defend"};
      }else if(n.supply>3){
        const posture=u.order.type==="assault"?.58:u.order.type==="probe"?.74:1;
        const roadBonus=terrainAt(u.x,u.y).road?1.22:1;
        const travel=Math.min(dist,u.speed*terrain.move*roadBonus*posture*hours*2.15);
        let nx=u.x+dx/dist*travel,ny=u.y+dy/dist*travel;

        if(DIRECT_COMBAT_KINDS.has(u.kind as any)){
          const contact=units
            .filter(v=>v.side!==u.side)
            .map(v=>({v,...segmentContact(u.x,u.y,nx,ny,v.x,v.y)}))
            .filter(c=>c.distance<44)
            .sort((a,b)=>a.t-b.t)[0];
          if(contact){
            const stopDistance=Math.max(0,travel*contact.t-36);
            nx=u.x+dx/dist*stopDistance;
            ny=u.y+dy/dist*stopDistance;
          }
        }

        if(terrainAt(nx,ny).terrain!=="water"){
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

  const result=next.map(u=>({...u,order:u.order?{...u.order}:undefined}));

  // Direct-combat formations engage automatically only when they physically make contact.
  for(let i=0;i<result.length;i++){
    for(let j=i+1;j<result.length;j++){
      const a=result[i],b=result[j];
      if(a.side===b.side)continue;
      const dist=Math.hypot(a.x-b.x,a.y-b.y);
      if(dist>48)continue;

      const aCan=DIRECT_COMBAT_KINDS.has(a.kind as any);
      const bCan=DIRECT_COMBAT_KINDS.has(b.kind as any);
      if(!aCan&&!bCan)continue;

      const aDef=TERRAIN_RULES[terrainAt(a.x,a.y).terrain].defense;
      const bDef=TERRAIN_RULES[terrainAt(b.x,b.y).terrain].defense;
      const aPower=aCan?(a.softAttack*(1-b.hardness)+a.hardAttack*b.hardness)*(a.organization/100)*(a.supply/100):0;
      const bPower=bCan?(b.softAttack*(1-a.hardness)+b.hardAttack*a.hardness)*(b.organization/100)*(b.supply/100):0;
      const aPosture=a.order?.type==="assault"?1.22:a.order?.type==="probe"?.76:1;
      const bPosture=b.order?.type==="assault"?1.22:b.order?.type==="probe"?.76:1;
      const aLoss=(bPower*bPosture/Math.max(20,a.defense*aDef+a.entrenchment*.6))*hours*.72;
      const bLoss=(aPower*aPosture/Math.max(20,b.defense*bDef+b.entrenchment*.6))*hours*.72;
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
  }

  // Artillery never auto-fires. It only attacks while under an explicit FIRE order.
  for(const gun of result){
    if(gun.kind!=="artillery"||gun.order?.type!=="fire"||gun.order.targetX===undefined||gun.order.targetY===undefined)continue;
    const rangeToTarget=Math.hypot(gun.order.targetX-gun.x,gun.order.targetY-gun.y);
    if(rangeToTarget>380||gun.supply<4||gun.organization<8)continue;

    const target=result
      .filter(v=>v.side!==gun.side)
      .map(v=>({v,d:Math.hypot(v.x-gun.order!.targetX!,v.y-gun.order!.targetY!)}))
      .filter(x=>x.d<78)
      .sort((a,b)=>a.d-b.d)[0]?.v;
    if(!target)continue;

    const terrain=TERRAIN_RULES[terrainAt(target.x,target.y).terrain];
    const rangeFactor=clamp(1-(rangeToTarget-80)/520,.38,1);
    const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor;
    const loss=(power/Math.max(24,target.defense*terrain.defense+target.entrenchment*.7))*hours*.52;
    target.strength=clamp(target.strength-loss,0,100);
    target.organization=clamp(target.organization-loss*2.2,0,100);
    gun.supply=clamp(gun.supply-hours*.42,0,100);
    gun.organization=clamp(gun.organization-hours*.04,0,100);
  }

  return result.filter(u=>u.strength>1);
}

export default function Home(){
  const [units,setUnits]=useState<Formation[]>(INITIAL_FORMATIONS);
  const [selected,setSelected]=useState<string[]>(["b3"]);
  const [overlay,setOverlay]=useState<OverlayMode>("terrain");
  const [pendingOrder,setPendingOrder]=useState<OrderType|null>(null);
  const [running,setRunning]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [hour,setHour]=useState(6);
  const [day,setDay]=useState(17);
  const [pan,setPan]=useState({x:-235,y:-180});
  const [zoom,setZoom]=useState(.78);
  const [hovered,setHovered]=useState<TerrainSample|null>(null);
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
  const viewport=useRef<HTMLDivElement>(null);

  const selectedUnits=units.filter(u=>selected.includes(u.id));
  const primary=selectedUnits[0];
  const blue=units.filter(u=>u.side==="blue");
  const enemy=units.filter(u=>u.side==="red");
  const averageSupply=blue.reduce((s,u)=>s+u.supply,0)/Math.max(1,blue.length);
  const averageOrg=blue.reduce((s,u)=>s+u.organization,0)/Math.max(1,blue.length);

  useEffect(()=>{
    if(!running||speed===0)return;
    const id=window.setInterval(()=>{
      const hours=SPEED_HOURS[speed];
      setUnits(prev=>simulate(prev,hours));
      setHour(prev=>{const total=prev+hours;if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}return total});
    },100);
    return()=>window.clearInterval(id);
  },[running,speed]);

  function selectUnit(e:ReactMouseEvent,u:Formation){
    e.stopPropagation();
    if(u.side!=="blue")return;
    if(e.shiftKey)setSelected(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);
    else setSelected([u.id]);
  }

  function startOrder(type:OrderType){
    if(!selected.length)return;
    const selectedNow=units.filter(u=>selected.includes(u.id));
    const hasDirect=selectedNow.some(u=>DIRECT_COMBAT_KINDS.has(u.kind as any));
    const hasArtillery=selectedNow.some(u=>u.kind==="artillery");

    if(type==="move"){setPendingOrder(null);return}
    if((type==="assault"||type==="probe")&&!hasDirect)return;
    if(type==="fire"&&!hasArtillery)return;

    if(type==="dig"||type==="resupply"||type==="defend"){
      setUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type}}:u));
      setPendingOrder(null);
    }else setPendingOrder(type);
  }

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;
      if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      const key=e.key.toLowerCase();
      if(key==="escape"){setPendingOrder(null);return}
      if(key==="m")startOrder("move");
      else if(key==="a")startOrder("assault");
      else if(key==="p")startOrder("probe");
      else if(key==="f")startOrder("fire");
      else if(key==="d")startOrder("defend");
      else if(key==="g")startOrder("dig");
      else if(key==="r")startOrder("resupply");
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[selected,units]);

  function mapPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();
    if(!rect)return null;
    return{x:(clientX-rect.left-pan.x)/zoom,y:(clientY-rect.top-pan.y)/zoom};
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(!selected.length)return;
    const point=mapPoint(e.clientX,e.clientY);
    if(!point)return;
    const tx=clamp(point.x,0,WORLD_W),ty=clamp(point.y,0,WORLD_H);
    if(terrainAt(tx,ty).terrain==="water")return;

    const requested=pendingOrder;
    setUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;

      // RMB is always movement unless the player deliberately armed an attack order.
      if(!requested)return{...u,order:{type:"move",targetX:tx,targetY:ty}};

      if(requested==="fire"){
        return u.kind==="artillery"?{...u,order:{type:"fire",targetX:tx,targetY:ty}}:u;
      }

      if(requested==="assault"||requested==="probe"){
        // Artillery attached to an explicit attack order provides fire support instead of walking into the target.
        if(u.kind==="artillery")return{...u,order:{type:"fire",targetX:tx,targetY:ty}};
        if(DIRECT_COMBAT_KINDS.has(u.kind as any))return{...u,order:{type:requested,targetX:tx,targetY:ty}};
        return u;
      }

      return{...u,order:{type:"move",targetX:tx,targetY:ty}};
    }));
    setPendingOrder(null);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();
    const rect=viewport.current?.getBoundingClientRect();
    if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const next=clamp(zoom*(e.deltaY>0?.9:1.1),.38,1.8);
    const wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setPan({x:mx-wx*next,y:my-wy*next});setZoom(next);
  }
  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button>1)return;
    drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const p=mapPoint(e.clientX,e.clientY);
    if(p)setHovered(terrainAt(p.x,p.y));
    if(!drag.current)return;
    setPan({x:drag.current.px+e.clientX-drag.current.x,y:drag.current.py+e.clientY-drag.current.y});
  }
  function onPointerUp(){drag.current=null}

  function orderLabel(u:Formation){
    if(!u.order)return"NO ORDERS";
    if(u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const km=Math.round(Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y)/8);
      return u.order.type.toUpperCase()+" · "+km+" KM";
    }
    return u.order.type.toUpperCase();
  }

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>NORTHERN FRONT / OPERATION IRON VEIL</small></div></div>
      <div className="theater-state"><span>DAY {day}</span><strong>{timeLabel(hour)}</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span></div>
      <div className="global-metrics">
        <div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div><div><small>ORG</small><b>{pct(averageOrg)}%</b></div><div><small>CP</small><b>47</b></div><div><small>INTEL</small><b>62%</b></div>
      </div>
      <div className="time-controls"><button onClick={()=>setRunning(v=>!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>{[1,2,3].map(s=><button key={s} onClick={()=>{setSpeed(s);setRunning(true)}} className={speed===s?"active":""}>×{s}</button>)}</div>
    </header>

    <aside className="left-panel">
      <section><div className="section-title">MAP LAYERS</div><div className="segmented">{(["terrain","supply","intel"] as OverlayMode[]).map(m=><button key={m} onClick={()=>setOverlay(m)} className={overlay===m?"active":""}>{m.toUpperCase()}</button>)}</div></section>
      <section><div className="section-title">ORDER OF BATTLE</div><div className="oob-list">{blue.map(u=><button key={u.id} onClick={()=>setSelected([u.id])} className={selected.includes(u.id)?"selected":""}><span className="oob-code">{UNIT_LABEL[u.kind]}</span><span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span></button>)}</div></section>
    </aside>

    <div ref={viewport} className={pendingOrder?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={issueTarget}>
      <div className="world" style={{width:WORLD_W,height:WORLD_H,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={WORLD_W} height={WORLD_H} viewBox={"0 0 "+WORLD_W+" "+WORLD_H}>
          <defs>
            <linearGradient id="sea" x1="0" x2="1"><stop offset="0" stopColor="#1c313c"/><stop offset="1" stopColor="#29424b"/></linearGradient>
            <linearGradient id="intelShade" x1="0" x2="1"><stop offset="0" stopColor="#71846a" stopOpacity=".08"/><stop offset=".55" stopColor="#151b18" stopOpacity=".22"/><stop offset="1" stopColor="#050806" stopOpacity=".68"/></linearGradient>
            <filter id="paperNoise"><feTurbulence baseFrequency=".016" numOctaves="3" seed="18" result="noise"/><feBlend in="SourceGraphic" in2="noise" mode="soft-light"/></filter>
          </defs>
          <rect width={WORLD_W} height={WORLD_H} fill="url(#sea)"/>
          <path d={LAND_PATH} className="land-base"/>
          {TERRAIN_FEATURES.map(f=><path key={f.id} d={f.path} className={"terrain-region "+f.terrain}/>)}
          {RIVER_ROUTES.map((route,i)=><path key={"river"+i} d={polylinePath(route)} className="river"/>)}
          {ROAD_ROUTES.map((route,i)=><path key={"road"+i} d={polylinePath(route)} className="road"/>)}
          {STRATEGIC_SITES.map(s=><g key={s.name} className="site-label"><circle cx={s.x} cy={s.y} r="5"/><circle cx={s.x} cy={s.y} r="24" className="site-ring"/><text x={s.x+10} y={s.y-10}>{s.name.toUpperCase()}</text></g>)}
          <path d="M 250 575 C 480 525 670 650 865 590 S 1220 510 1450 650 S 1770 690 1985 615" className="front-line"/>
          {overlay==="supply"&&<g className="supply-overlay">{ROAD_ROUTES.map((route,i)=><path key={i} d={polylinePath(route)} className="supply-route"/>)}{STRATEGIC_SITES.map(s=><circle key={s.name} cx={s.x} cy={s.y} r="78" className="supply-node"/>)}</g>}
          {overlay==="intel"&&<path d={LAND_PATH} fill="url(#intelShade)" className="intel-overlay"/>}
        </svg>

        {units.map(u=>{const isSelected=selected.includes(u.id);const intelVisible=u.side==="blue"||u.x<1560||overlay==="intel";if(!intelVisible)return null;return <button key={u.id} className={"unit-counter "+u.side+" "+(isSelected?"selected ":"")+(u.organization<30?"shaken":"")} style={{left:u.x-16,top:u.y-16}} onPointerDown={e=>e.stopPropagation()} onClick={e=>selectUnit(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{u.side==="blue"?"Ⅰ":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>})}

        {primary?.order?.targetX!==undefined&&primary.order.targetY!==undefined&&<svg className="order-line" width={WORLD_W} height={WORLD_H}><line x1={primary.x} y1={primary.y} x2={primary.order.targetX} y2={primary.order.targetY}/><circle cx={primary.order.targetX} cy={primary.order.targetY} r="10"/></svg>}
      </div>

      <div className="map-hud"><div><span className="dot friendly"/>FRIENDLY {blue.length}</div><div><span className="dot hostile"/>CONTACTS {enemy.length}</div><div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · ELEV "+Math.round(hovered.elevation*920)+"m"+(hovered.road?" · ROAD":""):"MOVE CURSOR OVER MAP"}</div><div>ZOOM {Math.round(zoom*100)}%</div></div>
      {pendingOrder&&<div className="target-banner">{pendingOrder.toUpperCase()} ARMED · RMB TARGET <button onClick={()=>setPendingOrder(null)}>ESC / CANCEL</button></div>}
    </div>

    <aside className="right-panel">
      {primary?<div className="inspector"><div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Hardness" v={Math.round(primary.hardness*100)+"%"}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        <div className="section-title">CURRENT TERRAIN</div>{(()=>{const t=terrainAt(primary.x,primary.y);const r=TERRAIN_RULES[t.terrain];return <div className="terrain-card"><b>{r.label}</b><span>Attack ×{r.attack.toFixed(2)}</span><span>Defense ×{r.defense.toFixed(2)}</span><span>Move ×{r.move.toFixed(2)}</span><span>Supply ×{r.supply.toFixed(2)}</span></div>})()}
        <div className="section-title">ORDERS</div><div className="orders">
          <button className={!pendingOrder?"active":""} onClick={()=>startOrder("move")}>MOVE <kbd>M</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind as any))} className={pendingOrder==="assault"?"active":""} onClick={()=>startOrder("assault")}>ASSAULT <kbd>A</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind as any))} className={pendingOrder==="probe"?"active":""} onClick={()=>startOrder("probe")}>PROBE <kbd>P</kbd></button>
          <button disabled={!selectedUnits.some(u=>u.kind==="artillery")} className={pendingOrder==="fire"?"active":""} onClick={()=>startOrder("fire")}>FIRE <kbd>F</kbd></button>
          <button onClick={()=>startOrder("defend")}>DEFEND <kbd>D</kbd></button>
          <button onClick={()=>startOrder("dig")}>DIG IN <kbd>G</kbd></button>
          <button onClick={()=>startOrder("resupply")}>RESUPPLY <kbd>R</kbd></button>
        </div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>

    <footer className="statusbar"><span>SELECT: LMB / SHIFT+LMB</span><span>PAN: DRAG</span><span>ZOOM: WHEEL</span><span>RMB: MOVE</span><span>A/P/F: ATTACK ORDERS</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}