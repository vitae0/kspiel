"use client";

import {useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {INITIAL_FORMATIONS,LAND_PATH,ROAD_ROUTES,RIVER_ROUTES,STRATEGIC_SITES,TERRAIN_FEATURES,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W,polylinePath,terrainAt} from "@/sim/game";
import type {Formation,OrderType,OverlayMode,TerrainSample} from "@/sim/types";

const SPEED_HOURS=[0,1,4,12];
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}
function pct(v:number){return Math.round(clamp(v,0,100))}

function simulate(units:Formation[],hours:number){
  const next=units.map(u=>{
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
    }else if(u.order&&u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const dx=u.order.targetX-u.x,dy=u.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5){n.x=u.order.targetX;n.y=u.order.targetY;n.order={type:"defend"}}
      else if(n.supply>3){
        const posture=u.order.type==="assault"?.58:u.order.type==="probe"?.74:1;
        const roadBonus=terrainAt(u.x,u.y).road?1.22:1;
        const travel=Math.min(dist,u.speed*terrain.move*roadBonus*posture*hours*2.15);
        const nx=u.x+dx/dist*travel,ny=u.y+dy/dist*travel;
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

  const result=next.map(u=>({...u}));
  for(let i=0;i<result.length;i++){
    for(let j=i+1;j<result.length;j++){
      const a=result[i],b=result[j];
      if(a.side===b.side)continue;
      const dist=Math.hypot(a.x-b.x,a.y-b.y);
      const artilleryRange=a.kind==="artillery"||b.kind==="artillery"?150:48;
      if(dist>artilleryRange)continue;
      const def=TERRAIN_RULES[terrainAt(b.x,b.y).terrain].defense;
      const rangeFactor=dist>55?.28:1;
      const aPower=(a.softAttack*(1-b.hardness)+a.hardAttack*b.hardness)*(a.organization/100)*(a.supply/100)*rangeFactor;
      const bPower=(b.softAttack*(1-a.hardness)+b.hardAttack*a.hardness)*(b.organization/100)*(b.supply/100)*rangeFactor;
      const aLoss=(bPower/Math.max(20,a.defense*def+a.entrenchment*.6))*hours*.13;
      const bLoss=(aPower/Math.max(20,b.defense*def+b.entrenchment*.6))*hours*.13;
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
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
    },900);
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
    if(type==="dig"||type==="resupply"||type==="defend"){
      setUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type}}:u));
      setPendingOrder(null);
    }else setPendingOrder(type);
  }

  function mapPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();
    if(!rect)return null;
    return{x:(clientX-rect.left-pan.x)/zoom,y:(clientY-rect.top-pan.y)/zoom};
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(!pendingOrder||!selected.length)return;
    const point=mapPoint(e.clientX,e.clientY);
    if(!point)return;
    const tx=clamp(point.x,0,WORLD_W),ty=clamp(point.y,0,WORLD_H);
    if(terrainAt(tx,ty).terrain==="water")return;
    setUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type:pendingOrder,targetX:tx,targetY:ty}}:u));
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
      <div className="theater-state"><span>DAY {day}</span><strong>{String(hour).padStart(2,"0")}:00</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span></div>
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
      {pendingOrder&&<div className="target-banner">{pendingOrder.toUpperCase()} ORDER: RIGHT CLICK DESTINATION <button onClick={()=>setPendingOrder(null)}>CANCEL</button></div>}
    </div>

    <aside className="right-panel">
      {primary?<div className="inspector"><div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Hardness" v={Math.round(primary.hardness*100)+"%"}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        <div className="section-title">CURRENT TERRAIN</div>{(()=>{const t=terrainAt(primary.x,primary.y);const r=TERRAIN_RULES[t.terrain];return <div className="terrain-card"><b>{r.label}</b><span>Attack ×{r.attack.toFixed(2)}</span><span>Defense ×{r.defense.toFixed(2)}</span><span>Move ×{r.move.toFixed(2)}</span><span>Supply ×{r.supply.toFixed(2)}</span></div>})()}
        <div className="section-title">ORDERS</div><div className="orders"><button onClick={()=>startOrder("move")}>MOVE</button><button onClick={()=>startOrder("probe")}>PROBE</button><button onClick={()=>startOrder("assault")}>ASSAULT</button><button onClick={()=>startOrder("defend")}>DEFEND</button><button onClick={()=>startOrder("dig")}>DIG IN</button><button onClick={()=>startOrder("resupply")}>RESUPPLY</button></div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>

    <footer className="statusbar"><span>SELECT: LMB / SHIFT+LMB</span><span>PAN: DRAG</span><span>ZOOM: WHEEL</span><span>ORDER TARGET: RMB</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}