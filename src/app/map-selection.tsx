"use client";

import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {generateScenario,polylinePath,presetRoster,UNIT_LABEL} from "@/sim/game";
import {createOpenWorldState} from "@/sim/openworld";
import {scenarioTerritoryCells} from "@/sim/territory";
import {organicTerritoryBoundaryPath} from "@/sim/organic-territory";
import {Flag} from "@/app/components/ui-primitives";
import type {Scenario,ScenarioPreset,Side,UnitKind} from "@/sim/types";

type MapMode="scenario"|"openworld";
const SIDES:Side[]=["blue","red"];
const OPENWORLD:Record<Side,number>={blue:10,red:10,green:8};
const PREVIEW_SEED=19370217;
const previewCache=new Map<string,Scenario>();
const KIND_NAMES:Record<UnitKind,string>={
  infantry:"Infantry",militia:"Militia",partisan:"Partisans",raider:"Raiders",
  mechanized:"Mechanized",armor:"Armored",tank:"Tanks",cavalry:"Cavalry",
  mountaineer:"Mountaineers",special_forces:"Special Forces",mortar:"Mortars",
  artillery:"Field Artillery",heavy_artillery:"Heavy Artillery",
  recon:"Recon",engineer:"Engineers",logistics:"Logistics"
};
type RosterRow={kind:UnitKind;count:number};

function rosterRows(presetId:string,side:Side,mode:MapMode):RosterRow[]{
  // Dominion starts with the first ten formations of each conventional side
  // and eight copies from the red side for the green faction.
  const source=presetRoster(presetId,side==="green"?"red":side);
  const roster=mode==="openworld"?source.slice(0,OPENWORLD[side]):source;
  const counts=new Map<UnitKind,number>();
  for(const kind of roster)counts.set(kind,(counts.get(kind)??0)+1);
  return [...counts].map(([kind,count])=>({kind,count}));
}
function sideCount(presetId:string,side:Side,mode:MapMode){
  return rosterRows(presetId,side,mode).reduce((sum,row)=>sum+row.count,0);
}

/** Draws a real generated theater, without blocking the initial selection render.
 * Only visible thumbnails are generated; subsequent visits reuse cached geometry. */
function TheaterThumbnail({presetId,mode,priority=false}:{presetId:string;mode:MapMode;priority?:boolean}){
  const element=useRef<HTMLDivElement|null>(null);
  const [scene,setScene]=useState<Scenario|null>(()=>previewCache.get(presetId)??null);
  useEffect(()=>{
    const cached=previewCache.get(presetId);
    if(cached){setScene(cached);return}
    let cancelled=false,observer:IntersectionObserver|null=null,timer:number|null=null;
    const load=()=>{
      if(cancelled||timer!==null)return;
      observer?.disconnect();
      // Stagger expensive world generation and allow the new screen to paint.
      timer=window.setTimeout(()=>{
        timer=null;
        if(cancelled)return;
        try{
          const scenario=previewCache.get(presetId)??generateScenario(PREVIEW_SEED,presetId);
          if(!previewCache.has(presetId)){
            if(previewCache.size>=8)previewCache.delete(previewCache.keys().next().value!);
            previewCache.set(presetId,scenario);
          }
          if(!cancelled)setScene(scenario);
        }catch{
          // A bad optional preview must not prevent map selection or deployment.
        }
      },priority?20:100);
    };
    if(priority||typeof IntersectionObserver==="undefined")load();
    else if(element.current){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting))load();
      },{rootMargin:"120px"});
      observer.observe(element.current);
    }
    return()=>{cancelled=true;observer?.disconnect();if(timer!==null)window.clearTimeout(timer)};
  },[presetId,priority]);
  const preview=useMemo(()=>{
    if(!scene)return null;
    return mode==="openworld"
      ?createOpenWorldState(scene,scene.formations,scene.cities)
      :{cities:scene.cities,units:scene.formations};
  },[scene,mode]);
  const territories=useMemo(()=>{
    if(!scene||!preview)return null;
    const step=mode==="openworld"?560:scene.worldWidth>8400?560:360;
    const cells=mode==="openworld"&&"state" in preview
      ?preview.state.resourceNodes:scenarioTerritoryCells(scene,preview.cities,preview.units,step);
    return {
      blue:organicTerritoryBoundaryPath(cells,"blue",step),
      red:organicTerritoryBoundaryPath(cells,"red",step),
      green:organicTerritoryBoundaryPath(cells,"green",step)
    };
  },[scene,preview,mode]);
  const flags=useMemo(()=>{
    if(!preview)return [];
    const sides:Side[]=mode==="openworld"?["blue","red","green"]:["blue","red"];
    return sides.flatMap(side=>{
      const owned=preview.cities.filter(city=>city.owner===side);
      return [owned[0],owned[Math.floor(owned.length*.72)]]
        .filter((city,index,array)=>city&&array.indexOf(city)===index)
        .map(city=>({...city,side}));
    });
  },[preview,mode]);
  const w=scene?.worldWidth??8400,h=scene?.worldHeight??5600;
  return <div ref={element} className="theater-thumb" aria-label={"Tactical preview of "+presetId}>
    {scene&&preview?<svg className="theater-thumb-svg" viewBox={"0 0 "+w+" "+h} preserveAspectRatio="xMidYMid meet" role="img" aria-label={"Terrain, roads, objectives and formations of "+scene.title}>
      <rect width={w} height={h} fill="#20353d"/>
      <path d={scene.landPath} fill="#65705a" stroke="#bec2a2" strokeWidth={w*.0018}/>
      {scene.terrainFeatures.map(feature=><path key={feature.id} className={"theater-thumb-terrain theater-thumb-"+feature.terrain} d={feature.path}/>)}
      {scene.riverRoutes.map((route,i)=><path key={"river-"+i} className="theater-thumb-river" d={polylinePath(route)} strokeWidth={w*.0035}/>)}
      <defs><clipPath id={"preview-land-"+presetId}><path d={scene.landPath}/></clipPath></defs>
      {territories&&<g className="theater-thumb-control" clipPath={"url(#preview-land-"+presetId+")"}>
        {(["blue","red","green"] as Side[]).map(side=><path key={side} className={"theater-thumb-control-area "+side} d={territories[side]} fillRule="evenodd"/>)}
      </g>}
      {scene.roadRoutes.map((route,i)=><path key={"road-"+i} className="theater-thumb-road" d={polylinePath(route)} strokeWidth={w*.0024}/>)} 
      {preview.cities.map(city=><g key={city.name} className={"theater-thumb-city "+city.owner}>
        <circle cx={city.x} cy={city.y} r={w*.0052}/>
        <circle className="theater-thumb-city-core" cx={city.x} cy={city.y} r={w*.0022}/>
      </g>)}
      {flags.map(city=><foreignObject key={"flag-"+city.name} x={city.x-w*.021} y={city.y-w*.039}
        width={w*.042} height={w*.027} className={"theater-thumb-flag "+city.side}>
        <span className="theater-thumb-flag-surface" style={{transform:"scale("+(w*.042/26)+")"}}><Flag styleName={scene.sideFlags[city.side]??"generic-blue"}/></span>
      </foreignObject>)}
      {preview.units.filter((_,i)=>i%Math.max(1,Math.ceil(preview.units.length/90))===0).map(unit=><rect
        key={unit.id} className={"theater-thumb-unit "+unit.side} x={unit.x-w*.003} y={unit.y-w*.003}
        width={w*.006} height={w*.006} rx={w*.0005}/>)}
    </svg>:<div className="theater-thumb-loading"><span>◈</span><small>TACTICAL MAP PREVIEW</small></div>}
    <div className="theater-thumb-badge"><span className="menu-live-dot"/> {scene?"TACTICAL OVERVIEW":"PREPARING MAP"}</div>
  </div>;
}

export function MapSelection({presets,selectedPresetId,onSelect,mode,locked=false}:{
  presets:ScenarioPreset[];selectedPresetId:string;onSelect:(id:string)=>void;mode:MapMode;locked?:boolean;
}){
  const strip=useRef<HTMLDivElement|null>(null);
  const drag=useRef<{pointerId:number;startX:number;scrollLeft:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);

  // Mouse wheels browse horizontally over the strip, but native touchpad
  // horizontal gestures and mobile swipes remain handled by the browser.
  useEffect(()=>{
    const element=strip.current;
    if(!element)return;
    const onWheel=(event:WheelEvent)=>{
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      if(Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
      if(element.scrollWidth<=element.clientWidth)return;
      event.preventDefault();
      element.scrollLeft+=event.deltaY;
    };
    element.addEventListener("wheel",onWheel,{passive:false});
    return()=>element.removeEventListener("wheel",onWheel);
  },[presets.length]);

  // Reset horizontal position when the map category/mode changes, without
  // snapping back when a card is selected during free browsing.
  const filterKey=mode+":"+presets.map(preset=>preset.id).join(",");
  useEffect(()=>{
    strip.current?.scrollTo({left:0,behavior:"auto"});
  },[filterKey]);

  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.pointerType!=="mouse"||event.button!==0)return;
    drag.current={pointerId:event.pointerId,startX:event.clientX,scrollLeft:event.currentTarget.scrollLeft,moved:false};
    suppressClick.current=false;
  };
  const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const current=drag.current;
    if(!current||current.pointerId!==event.pointerId)return;
    if(!current.moved&&Math.abs(event.clientX-current.startX)>7){
      current.moved=true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add("is-dragging");
    }
    if(current.moved){
      event.currentTarget.scrollLeft=current.scrollLeft+current.startX-event.clientX;
      event.preventDefault();
    }
  };
  const stopDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const current=drag.current;
    if(!current||current.pointerId!==event.pointerId)return;
    suppressClick.current=current.moved;
    drag.current=null;
    event.currentTarget.classList.remove("is-dragging");
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onClickCapture=(event:ReactMouseEvent<HTMLDivElement>)=>{
    if(!suppressClick.current)return;
    suppressClick.current=false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onStripKeyDown=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
    if(event.target!==event.currentTarget)return;
    if(event.key==="ArrowLeft"||event.key==="ArrowRight"){
      event.preventDefault();
      event.currentTarget.scrollBy({left:(event.key==="ArrowRight"?1:-1)*Math.max(220,event.currentTarget.clientWidth*.55),behavior:"smooth"});
    }
  };

  if(!presets.length)return <p className="theater-empty">No maps match this filter.</p>;
  return <div className="theater-list" aria-label="Available battle maps">
    <div ref={strip} className="theater-picker theater-carousel" role="region"
      aria-roledescription="carousel" aria-label="Browse battle maps horizontally"
      tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={stopDrag} onPointerCancel={stopDrag}
      onClickCapture={onClickCapture} onKeyDown={onStripKeyDown}>
      {presets.map(preset=>{
        const chosen=preset.id===selectedPresetId;
        const blue=sideCount(preset.id,"blue",mode),red=sideCount(preset.id,"red",mode);
        const roster=[...new Set([...rosterRows(preset.id,"blue",mode),...rosterRows(preset.id,"red",mode)]
          .map(row=>row.kind))];
        return <button type="button" key={preset.id} disabled={locked}
          aria-pressed={chosen}
          className={"theater-option theme-"+preset.theme+(chosen?" selected":"")}
          onClick={()=>onSelect(preset.id)}>
          <TheaterThumbnail presetId={preset.id} mode={mode} priority={chosen}/>
          <div className="theater-option-content">
            <div className="theater-option-meta">
              <span>{preset.warfare==="guerrilla"?"GUERRILLA":(preset.mapScale??1)>=2?"MEGA THEATER":preset.historical?"HISTORICAL":"FICTIONAL"}</span>
              <span>{preset.year??preset.era.replace("_"," ").toUpperCase()}</span>
            </div>
            <strong>{preset.title}</strong>
            <p>{preset.subtitle}</p>
            <div className="theater-option-force">
              <span className="blue"><Flag styleName={preset.sideFlags.blue}/><b>{blue}</b> BLUE</span><i>VS</i>
              <span className="red"><Flag styleName={preset.sideFlags.red}/><b>{red}</b> RED</span>
              {mode==="openworld"&&<><i>VS</i><span className="green"><Flag styleName="generic-blue"/><b>{OPENWORLD.green}</b> GREEN</span></>}
            </div>
            <div className="theater-option-unit-types">
              {roster.map(kind=><span key={kind} title={KIND_NAMES[kind]}>{UNIT_LABEL[kind]}</span>)}
            </div>
            <div className="theater-option-footer">
              <span>{preset.location}</span><b>{chosen?"✓ SELECTED":"SELECT MAP →"}</b>
            </div>
          </div>
        </button>;
      })}
    </div>
    <div className="theater-scroll-hint" aria-hidden="true">
      <span>← DRAG · SWIPE · SCROLL →</span>
      <span>{presets.length} THEATERS</span>
    </div>
  </div>;
}

/** Full force-by-force breakdown in the selected theater's briefing panel. */
export function MapDeploymentBrief({preset,mode}:{preset:ScenarioPreset;mode:MapMode}){
  const sides:Side[]=mode==="openworld"?["blue","red","green"]:SIDES;
  return <section className="theater-forces" aria-label="Starting force composition">
    <div className="section-title">INITIAL FORCE COMPOSITION</div>
    <p className="theater-forces-hint">{mode==="openworld"
      ?"Dominion deploys up to 10 / 10 / 8 starting formations, subject to available supply positions."
      :"Exact formations per faction. Map illustration uses a reference generation seed; live deployments can vary in position."}</p>
    <div className="theater-rosters">
      {sides.map(side=>{
        const rows=rosterRows(preset.id,side,mode);
        return <div key={side} className={"theater-roster "+side}>
          <header><span className="theater-side-dot"/><Flag styleName={preset.sideFlags[side]??"generic-blue"}/><strong>{mode==="openworld"?side.toUpperCase()+" DOMINION":preset.sideNames[side]??side.toUpperCase()}</strong>
            <b>{sideCount(preset.id,side,mode)} UNITS</b></header>
          <div className="theater-roster-rows">
            {rows.map(({kind,count})=><span key={kind}><span>{KIND_NAMES[kind]}</span><b>×{count}</b></span>)}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
