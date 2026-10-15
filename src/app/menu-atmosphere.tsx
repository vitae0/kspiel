"use client";

import {useEffect,useMemo,useState} from "react";
import {generateScenario,polylinePath} from "@/sim/game";
import type {Scenario} from "@/sim/types";

const THEATER_IDS=["spain-1937","balkans-1944","eastern-front-1943","italy-1944"] as const;
const THEATER_SECONDS=22;
const SCENE_SEEDS=[1937,1944,1943,1945];

function TheaterScene({scene}:{scene:Scenario}){
  const w=scene.worldWidth,h=scene.worldHeight;
  return <svg className="menu-map-art" viewBox={"0 0 "+w+" "+h} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width={w} height={h} fill="#253c42"/>
    <path d={scene.landPath} className="menu-map-land"/>
    {scene.terrainFeatures.map(feature=><path key={feature.id} className={"menu-map-terrain menu-map-"+feature.terrain} d={feature.path}/>)}
    {scene.riverRoutes.map((route,i)=><path className="menu-map-river" key={"river-"+i} d={polylinePath(route)}/>)}
    {scene.roadRoutes.map((route,i)=><path className="menu-map-road" key={"road-"+i} d={polylinePath(route)}/>)}
    {scene.cities.map(city=><g key={city.name} className={"menu-map-city "+city.owner}>
      <circle cx={city.x} cy={city.y} r={w*.0045} className="menu-map-city-ring"/>
      <circle cx={city.x} cy={city.y} r={w*.0024} className="menu-map-city-dot"/>
      <text x={city.x+w*.006} y={city.y-w*.005} fontSize={w*.009}>{city.name.toUpperCase()}</text>
    </g>)}
    {scene.formations.filter((_,i)=>i%2===0).map(unit=><rect key={unit.id} className={"menu-map-unit "+unit.side} x={unit.x-w*.003} y={unit.y-h*.004} width={w*.006} height={h*.008} rx={1.5}/>)}
  </svg>;
}

/** Real generated KSpiel theaters, gently drifting and cross-fading behind the setup UI. */
export default function MenuAtmosphere(){
  const [active,setActive]=useState(0);
  const scenes=useMemo(()=>THEATER_IDS.map((id,i)=>generateScenario(SCENE_SEEDS[i],id)),[]);
  useEffect(()=>{
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    if(reduced.matches)return;
    const timer=window.setInterval(()=>{
      if(!document.hidden)setActive(previous=>(previous+1)%scenes.length);
    },THEATER_SECONDS*1000);
    return()=>window.clearInterval(timer);
  },[scenes.length]);
  return <div className="menu-atmosphere" aria-hidden="true">
    {scenes.map((scene,i)=><div className={"menu-theater-scene "+(i===active?"is-active":"")+" menu-scene-"+i} key={scene.presetId}>
      <TheaterScene scene={scene}/>
    </div>)}
    <div className="menu-atmosphere-wash"/>
    <div className="menu-map-index">
      <span className="menu-live-dot"/> FIELD INTELLIGENCE / {scenes[active].title.toUpperCase()}
      <span className="menu-map-index-count">{String(active+1).padStart(2,"0")} / {String(scenes.length).padStart(2,"0")}</span>
    </div>
  </div>;
}
