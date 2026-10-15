"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {generateScenario,polylinePath,presetRoster,UNIT_LABEL} from "@/sim/game";
import {createOpenWorldState} from "@/sim/openworld";
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
    let cancelled=false,observer:IntersectionObserver|null=null;
    const load=()=>{
      if(cancelled)return;
      // Deferred even when already visible, keeping button response immediate.
      const scenario=previewCache.get(presetId)??generateScenario(PREVIEW_SEED,presetId);
      previewCache.set(presetId,scenario);
      if(!cancelled)setScene(scenario);
      observer?.disconnect();
    };
    if(priority||typeof IntersectionObserver==="undefined")load();
    else if(element.current){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting))load();
      },{rootMargin:"160px"});
      observer.observe(element.current);
    }
    return()=>{cancelled=true;observer?.disconnect()};
  },[presetId,priority]);
  const preview=useMemo(()=>{
    if(!scene)return null;
    return mode==="openworld"
      ?createOpenWorldState(scene,scene.formations,scene.cities)
      :{cities:scene.cities,units:scene.formations};
  },[scene,mode]);
  const w=scene?.worldWidth??8400,h=scene?.worldHeight??5600;
  return <div ref={element} className="theater-thumb" aria-label={"Tactical preview of "+presetId}>
    {scene&&preview?<svg className="theater-thumb-svg" viewBox={"0 0 "+w+" "+h} preserveAspectRatio="xMidYMid meet" role="img" aria-label={"Terrain, roads, objectives and formations of "+scene.title}>
      <rect width={w} height={h} fill="#20353d"/>
      <path d={scene.landPath} fill="#65705a" stroke="#bec2a2" strokeWidth={w*.0018}/>
      {scene.terrainFeatures.map(feature=><path key={feature.id} className={"theater-thumb-terrain theater-thumb-"+feature.terrain} d={feature.path}/>)}
      {scene.riverRoutes.map((route,i)=><path key={"river-"+i} className="theater-thumb-river" d={polylinePath(route)} strokeWidth={w*.0035}/>)}
      {scene.roadRoutes.map((route,i)=><path key={"road-"+i} className="theater-thumb-road" d={polylinePath(route)} strokeWidth={w*.0024}/>)}
      {preview.cities.map(city=><g key={city.name} className={"theater-thumb-city "+city.owner}>
        <circle cx={city.x} cy={city.y} r={w*.0052}/>
        <circle className="theater-thumb-city-core" cx={city.x} cy={city.y} r={w*.0022}/>
      </g>)}
      {preview.units.filter((_,i)=>i%Math.max(1,Math.ceil(preview.units.length/90))===0).map(unit=><rect
        key={unit.id} className={"theater-thumb-unit "+unit.side} x={unit.x-w*.003} y={unit.y-w*.003}
        width={w*.006} height={w*.006} rx={w*.0005}/>)}
    </svg>:<div className="theater-thumb-loading"><span>◈</span><small>TACTICAL MAP PREVIEW</small></div>}
    <div className="theater-thumb-badge"><span className="menu-live-dot"/> {scene?"TACTICAL OVERVIEW":"PREPARING MAP"}</div>
  </div>;
}

export function MapSelection({presets,selectedPresetId,onSelect,mode}:{
  presets:ScenarioPreset[];selectedPresetId:string;onSelect:(id:string)=>void;mode:MapMode;
}){
  if(!presets.length)return <p className="theater-empty">No maps match this filter.</p>;
  return <div className="theater-picker" aria-label="Available battle maps">
    {presets.map(preset=>{
      const chosen=preset.id===selectedPresetId;
      const blue=sideCount(preset.id,"blue",mode),red=sideCount(preset.id,"red",mode);
      const roster=[...new Set([...rosterRows(preset.id,"blue",mode),...rosterRows(preset.id,"red",mode)]
        .map(row=>row.kind))];
      return <button type="button" key={preset.id} disabled={false}
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
            <span className="blue"><b>{blue}</b> BLUE</span><i>VS</i><span className="red"><b>{red}</b> RED</span>
            {mode==="openworld"&&<><i>VS</i><span className="green"><b>{OPENWORLD.green}</b> GREEN</span></>}
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
          <header><span className="theater-side-dot"/><strong>{mode==="openworld"?side.toUpperCase()+" DOMINION":preset.sideNames[side]??side.toUpperCase()}</strong>
            <b>{sideCount(preset.id,side,mode)} UNITS</b></header>
          <div className="theater-roster-rows">
            {rows.map(({kind,count})=><span key={kind}><span>{KIND_NAMES[kind]}</span><b>×{count}</b></span>)}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
