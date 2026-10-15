"use client";
import type {Dispatch,SetStateAction} from "react";
const COMMAND_GUIDE=[
  {title:"SELECT YOUR ARMY",body:"Click a unit or drag a selection box. Keys 1–6 select army groups; Ctrl+1–6 assigns selected units. Nearby units start in the same group."},
  {title:"MOVE AND ATTACK",body:"Right-click the map to move. Press A then right-click an enemy to assault; F then an enemy to fire artillery. Shift+right-click queues additional waypoints."},
  {title:"GROUP ATTACK · H",body:"Select an army group, press H, click multiple visible enemy units, then press ENTER or LAUNCH. The command distributes targets and chooses routes and supporting gun positions."},
  {title:"DRAW A FRONT",body:"Select any formation in an army group and Ctrl+left-drag a slanted line, or use FRONT mode. Infantry goes forward, artillery and logistics move behind, engineers build field works."},
  {title:"SUPPLY AND ROADS",body:"Supplied cities anchor supply. Only interrupted road sections turn red. Terrain and unit type change supply consumption; tanks are less hindered by trenches."},
  {title:"ATTRITION AND BARRAGES",body:"Mortars and artillery burn finite AMMO while firing. Engineers and other builders consume MATERIALS on every construction job. Strong connected supply routes refill both faster; isolated guns can run dry. Tracers, shell trails, dust and shock waves show active fire."},
  {title:"COHESIVE MARCH",body:"Select units from multiple army groups, choose MARCH FORMATION (line, column, wedge or echelon) and right-click the map. Combat units keep separate slots and wait for lagging forces; artillery and logistics take rear positions. Army-group memberships stay intact."},
  {title:"MULTIPLAYER SPEED",body:"The host controls the shared clock with 0.5×, 1× and 2× multiplayer speeds. Other commanders receive authoritative snapshots and do not run a separate simulation."},
  {title:"REINFORCEMENTS",body:"In scenario battles, after four in-game days, armies below two-thirds of their initial number receive up to three formations per reserve wave from a safe rear city."}
] as const;
type Props={showTutorial:boolean;battleReport:boolean;tutorialStep:number;setShowTutorial:Dispatch<SetStateAction<boolean>>;setTutorialStep:Dispatch<SetStateAction<number>>};
export function GameTutorial({showTutorial,battleReport,tutorialStep,setShowTutorial,setTutorialStep}:Props){
 return <>{showTutorial&&!battleReport&&<div className="guide-backdrop" role="dialog" aria-modal="true" aria-label="Game tutorial"><div className="guide-card">
      <small>KSPIEL COMMAND ACADEMY · {tutorialStep+1}/{COMMAND_GUIDE.length}</small>
      <h2>{COMMAND_GUIDE[tutorialStep].title}</h2><p>{COMMAND_GUIDE[tutorialStep].body}</p>
      <div className="guide-actions"><button onClick={()=>setShowTutorial(false)}>CLOSE</button><button disabled={tutorialStep===0} onClick={()=>setTutorialStep(s=>Math.max(0,s-1))}>PREVIOUS</button><button onClick={()=>tutorialStep===COMMAND_GUIDE.length-1?setShowTutorial(false):setTutorialStep(s=>s+1)}>{tutorialStep===COMMAND_GUIDE.length-1?"FINISH":"NEXT"}</button></div>
    </div></div>}</>;
}
