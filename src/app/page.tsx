"use client";

import {useEffect,useMemo,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {generateMap,INITIAL_FORMATIONS,MAP_H,MAP_W,STRATEGIC_SITES,TERRAIN_RULES,TILE,UNIT_LABEL} from "@/sim/game";
import type {Formation,MapTile,OrderType,OverlayMode,TerrainKind} from "@/sim/types";

const TERRAIN_COLOR:Record<TerrainKind,string>={
  water:"#243b49",plains:"#646b4a",forest:"#334936",hills:"#756a4f",mountain:"#625e59",marsh:"#4b5f53",urban:"#77736b"
};
const SPEED_HOURS=[0,1,4,12];

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}
function pct(v:number){return Math.round(clamp(v,0,100))}
function terrainFill(tile:MapTile,overlay:OverlayMode){
  if(overlay==="terrain")return TERRAIN_COLOR[tile.terrain];
  if(overlay==="supply"){
    const score=tile.terrain==="water"?0:(tile.road?1:.35)*TERRAIN_RULES[tile.terrain].supply;
    if(score>.9)return "#4f704f";
    if(score>.55)return "#746c43";
    return "#75494a";
  }
  const intel=(tile.x<24?1:tile.x<34?.62:.24)+(tile.road?.08:0);
  if(tile.terrain==="water")return "#243944";
  return intel>.8?"#53605a":intel>.5?"#414b49":"#303737";
}

function nextStep(u:Formation,targetX:number,targetY:number){
  const dx=targetX-u.x,dy=targetY-u.y;
  if(Math.abs(dx)>=Math.abs(dy))return {x:u.x+Math.sign(dx),y:u.y};
  return {x:u.x,y:u.y+Math.sign(dy)};
}

function simulate(units:Formation[],tileLookup:Map<string,MapTile>,hours:number){
  let next=units.map(u=>({...u,order:u.order?{...u.order}:undefined}));
  next=next.map(u=>{
    const tile=tileLookup.get(u.x+","+u.y);
    const terrain=tile?TERRAIN_RULES[tile.terrain]:TERRAIN_RULES.plains;
    let n={...u};
    if(u.order?.type==="dig"){
      n.entrenchment=clamp(u.entrenchment+hours*1.15,0,100);
      n.organization=clamp(u.organization+hours*.22,0,100);
      n.supply=clamp(u.supply-hours*.035,0,100);
    }else if(u.order?.type==="resupply"){
      n.supply=clamp(u.supply+hours*2.2,0,100);
      n.fuel=clamp(u.fuel+hours*1.5,0,100);
      n.organization=clamp(u.organization+hours*.7,0,100);
    }else if(u.order&&u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const gain=u.speed*terrain.move*hours/22;
      n.movementProgress+=gain;
      if(n.movementProgress>=1&&n.supply>3){
        const step=nextStep(n,u.order.targetX,u.order.targetY);
        const targetTile=tileLookup.get(step.x+","+step.y);
        if(targetTile&&targetTile.terrain!=="water"){
          n.x=step.x;n.y=step.y;n.movementProgress-=1;
          n.supply=clamp(n.supply-(u.kind==="armor"||u.kind==="mechanized"?1.7:.85),0,100);
          n.fuel=clamp(n.fuel-(u.kind==="armor"?2.4:u.kind==="mechanized"||u.kind==="recon"?1.4:.15),0,100);
          n.entrenchment=Math.max(0,n.entrenchment-4);
          n.organization=clamp(n.organization-.45,0,100);
          if(n.x===u.order.targetX&&n.y===u.order.targetY)n.order={type:"defend"};
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
      if(a.side===b.side||a.x!==b.x||a.y!==b.y)continue;
      const tile=tileLookup.get(a.x+","+a.y);
      const def=TERRAIN_RULES[tile?.terrain||"plains"].defense;
      const aPower=((a.softAttack*(1-b.hardness)+a.hardAttack*b.hardness)*(a.organization/100)*(a.supply/100));
      const bPower=((b.softAttack*(1-a.hardness)+b.hardAttack*a.hardness)*(b.organization/100)*(b.supply/100));
      const aLoss=(bPower/(Math.max(20,a.defense*def+a.entrenchment*.6)))*hours*.22;
      const bLoss=(aPower/(Math.max(20,b.defense*def+b.entrenchment*.6)))*hours*.22;
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
  }
  return result.filter(u=>u.strength>1);
}

export default function Home(){
  const tiles=useMemo(()=>generateMap(),[]);
  const tileLookup=useMemo(()=>new Map(tiles.map(t=>[t.x+","+t.y,t])),[tiles]);
  const [units,setUnits]=useState<Formation[]>(INITIAL_FORMATIONS);
  const [selected,setSelected]=useState<string[]>(["b3"]);
  const [overlay,setOverlay]=useState<OverlayMode>("terrain");
  const [pendingOrder,setPendingOrder]=useState<OrderType|null>(null);
  const [running,setRunning]=useState(false);
  const [speed,setSpeed]=useState(1);
  const [hour,setHour]=useState(6);
  const [day,setDay]=useState(17);
  const [pan,setPan]=useState({x:-245,y:-210});
  const [zoom,setZoom]=useState(.78);
  const [hovered,setHovered]=useState<MapTile|null>(null);
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
      setUnits(prev=>simulate(prev,tileLookup,hours));
      setHour(prev=>{
        const total=prev+hours;
        if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}
        return total;
      });
    },900);
    return()=>window.clearInterval(id);
  },[running,speed,tileLookup]);

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
    return {
      x:(clientX-rect.left-pan.x)/zoom,
      y:(clientY-rect.top-pan.y)/zoom
    };
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(!pendingOrder||!selected.length)return;
    const point=mapPoint(e.clientX,e.clientY);
    if(!point)return;
    const tx=Math.floor(point.x/TILE),ty=Math.floor(point.y/TILE);
    const tile=tileLookup.get(tx+","+ty);
    if(!tile||tile.terrain==="water")return;
    setUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type:pendingOrder,targetX:tx,targetY:ty}}:u));
    setPendingOrder(null);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();
    const rect=viewport.current?.getBoundingClientRect();
    if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const next=clamp(zoom*(e.deltaY>0?.9:1.1),.38,1.7);
    const wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setPan({x:mx-wx*next,y:my-wy*next});
    setZoom(next);
  }

  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button>1)return;
    drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const p=mapPoint(e.clientX,e.clientY);
    if(p){
      const tx=Math.floor(p.x/TILE),ty=Math.floor(p.y/TILE);
      setHovered(tileLookup.get(tx+","+ty)||null);
    }
    if(!drag.current)return;
    setPan({x:drag.current.px+e.clientX-drag.current.x,y:drag.current.py+e.clientY-drag.current.y});
  }
  function onPointerUp(){drag.current=null}

  function orderLabel(u:Formation){
    if(!u.order)return"NO ORDERS";
    if(u.order.targetX!==undefined)return u.order.type.toUpperCase()+" → "+u.order.targetX+","+u.order.targetY;
    return u.order.type.toUpperCase();
  }

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">K</span><div><b>KSPIEL</b><small>NORTHERN FRONT / OPERATION IRON VEIL</small></div></div>
      <div className="theater-state"><span>DAY {day}</span><strong>{String(hour).padStart(2,"0")}:00</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span></div>
      <div className="global-metrics">
        <div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div>
        <div><small>ORG</small><b>{pct(averageOrg)}%</b></div>
        <div><small>CP</small><b>47</b></div>
        <div><small>INTEL</small><b>62%</b></div>
      </div>
      <div className="time-controls">
        <button onClick={()=>setRunning(v=>!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>
        {[1,2,3].map(s=><button key={s} onClick={()=>{setSpeed(s);setRunning(true)}} className={speed===s?"active":""}>×{s}</button>)}
      </div>
    </header>

    <aside className="left-panel">
      <section>
        <div className="section-title">MAP LAYERS</div>
        <div className="segmented">
          {(["terrain","supply","intel"] as OverlayMode[]).map(m=><button key={m} onClick={()=>setOverlay(m)} className={overlay===m?"active":""}>{m.toUpperCase()}</button>)}
        </div>
      </section>
      <section>
        <div className="section-title">ORDER OF BATTLE</div>
        <div className="oob-list">
          {blue.map(u=><button key={u.id} onClick={()=>setSelected([u.id])} className={selected.includes(u.id)?"selected":""}>
            <span className="oob-code">{UNIT_LABEL[u.kind]}</span>
            <span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span>
          </button>)}
        </div>
      </section>
    </aside>

    <div ref={viewport} className={pendingOrder?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={issueTarget}>
      <div className="world" style={{width:MAP_W*TILE,height:MAP_H*TILE,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={MAP_W*TILE} height={MAP_H*TILE} viewBox={"0 0 "+MAP_W*TILE+" "+MAP_H*TILE}>
          {tiles.map(t=><g key={t.x+"-"+t.y}>
            <rect x={t.x*TILE} y={t.y*TILE} width={TILE+.5} height={TILE+.5} fill={terrainFill(t,overlay)} className={"tile "+t.terrain}/>
            {t.road&&<path d={"M "+(t.x*TILE)+" "+(t.y*TILE+TILE*.58)+" L "+((t.x+1)*TILE)+" "+(t.y*TILE+TILE*.42)} className="road"/>}
            {t.terrain==="mountain"&&<path d={"M "+(t.x*TILE+9)+" "+(t.y*TILE+29)+" L "+(t.x*TILE+20)+" "+(t.y*TILE+10)+" L "+(t.x*TILE+31)+" "+(t.y*TILE+29)} className="mountain-mark"/>}
            {t.terrain==="forest"&&<circle cx={t.x*TILE+20} cy={t.y*TILE+20} r="5" className="forest-mark"/>}
          </g>)}
          {STRATEGIC_SITES.map(s=><g key={s.name} className="site-label">
            <circle cx={(s.x+.5)*TILE} cy={(s.y+.5)*TILE} r="4"/>
            <text x={(s.x+.5)*TILE+8} y={(s.y+.5)*TILE-7}>{s.name.toUpperCase()}</text>
          </g>)}
          <path d="M 0 520 C 320 500 500 610 790 560 S 1310 500 1710 610 S 1930 570 2080 620" className="front-line"/>
        </svg>

        {units.map(u=>{
          const isSelected=selected.includes(u.id);
          const intelVisible=u.side==="blue"||u.x<39||overlay==="intel";
          if(!intelVisible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" "+(isSelected?"selected ":"")+(u.organization<30?"shaken":"")} style={{left:u.x*TILE+4,top:u.y*TILE+4}} onPointerDown={e=>e.stopPropagation()} onClick={e=>selectUnit(e,u)}>
            <span className="unit-top">{UNIT_LABEL[u.kind]}<i>{u.side==="blue"?"Ⅰ":"◆"}</i></span>
            <b>{pct(u.strength)}</b>
            <span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span>
          </button>
        })}

        {primary?.order?.targetX!==undefined&&<svg className="order-line" width={MAP_W*TILE} height={MAP_H*TILE}>
          <line x1={(primary.x+.5)*TILE} y1={(primary.y+.5)*TILE} x2={(primary.order.targetX+.5)*TILE} y2={(primary.order.targetY!+.5)*TILE}/>
          <circle cx={(primary.order.targetX+.5)*TILE} cy={(primary.order.targetY!+.5)*TILE} r="10"/>
        </svg>}
      </div>

      <div className="map-hud">
        <div><span className="dot friendly"/>FRIENDLY {blue.length}</div>
        <div><span className="dot hostile"/>CONTACTS {enemy.length}</div>
        <div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · ELEV "+Math.round(hovered.elevation*920)+"m":"MOVE CURSOR OVER MAP"}</div>
        <div>ZOOM {Math.round(zoom*100)}%</div>
      </div>

      {pendingOrder&&<div className="target-banner">{pendingOrder.toUpperCase()} ORDER: RIGHT CLICK DESTINATION <button onClick={()=>setPendingOrder(null)}>CANCEL</button></div>}
    </div>

    <aside className="right-panel">
      {primary?<div className="inspector">
        <div className="unit-heading">
          <div className="big-counter">{UNIT_LABEL[primary.kind]}</div>
          <div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div>
        </div>

        <div className="stat-grid">
          <Stat label="Strength" value={primary.strength}/>
          <Stat label="Organization" value={primary.organization}/>
          <Stat label="Supply" value={primary.supply}/>
          <Stat label="Fuel" value={primary.fuel}/>
          <Stat label="Entrenchment" value={primary.entrenchment}/>
          <Stat label="Readiness" value={primary.readiness}/>
        </div>

        <div className="section-title">COMBAT MODEL</div>
        <div className="numbers">
          <Row k="Manpower" v={primary.manpower.toLocaleString()}/>
          <Row k="Soft attack" v={String(primary.softAttack)}/>
          <Row k="Hard attack" v={String(primary.hardAttack)}/>
          <Row k="Defense" v={String(primary.defense)}/>
          <Row k="Breakthrough" v={String(primary.breakthrough)}/>
          <Row k="Hardness" v={Math.round(primary.hardness*100)+"%"}/>
          <Row k="Recon" v={String(primary.recon)}/>
          <Row k="Speed" v={primary.speed+" km/h"}/>
        </div>

        <div className="section-title">CURRENT TERRAIN</div>
        {(()=>{const t=tileLookup.get(primary.x+","+primary.y);const r=TERRAIN_RULES[t?.terrain||"plains"];return <div className="terrain-card"><b>{r.label}</b><span>Attack ×{r.attack.toFixed(2)}</span><span>Defense ×{r.defense.toFixed(2)}</span><span>Move ×{r.move.toFixed(2)}</span><span>Supply ×{r.supply.toFixed(2)}</span></div>})()}

        <div className="section-title">ORDERS</div>
        <div className="orders">
          <button onClick={()=>startOrder("move")}>MOVE</button>
          <button onClick={()=>startOrder("probe")}>PROBE</button>
          <button onClick={()=>startOrder("assault")}>ASSAULT</button>
          <button onClick={()=>startOrder("defend")}>DEFEND</button>
          <button onClick={()=>startOrder("dig")}>DIG IN</button>
          <button onClick={()=>startOrder("resupply")}>RESUPPLY</button>
        </div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>

    <footer className="statusbar">
      <span>SELECT: LMB / SHIFT+LMB</span>
      <span>PAN: DRAG</span>
      <span>ZOOM: WHEEL</span>
      <span>ORDER TARGET: RMB</span>
      <strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong>
    </footer>
  </main>
}

function Stat({label,value}:{label:string;value:number}){
  return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>
}
function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}