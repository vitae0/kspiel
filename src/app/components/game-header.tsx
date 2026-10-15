"use client";
import type {Dispatch,SetStateAction} from "react";
import type {Scenario,Side,CityState,Formation} from "@/sim/types";
import type {MultiplayerSession} from "@/lib/multiplayer";
import {SOLO_SPEED,MULTIPLAYER_SPEED} from "@/sim/rules";
import {pct,timeLabel} from "@/app/ui-utils";
import BrandMark from "@/app/brand-mark";
import {Flag} from "./ui-primitives";
type Props={
 activeScenario:Scenario;playerSide:Side;day:number;hour:number;running:boolean;
 multiplayer:MultiplayerSession|null;networkPhase:string;averageSupply:number;averageOrg:number;
 blueCities:number;cities:CityState[];enemy:Formation[];detectedEnemies:Set<string>;
 speed:number;warResult:Side|null;setShowTutorial:Dispatch<SetStateAction<boolean>>;
 setTutorialStep:Dispatch<SetStateAction<number>>;concludeSession:()=>void;returnToSetup:()=>void;
 setRunning:Dispatch<SetStateAction<boolean>>;setSpeed:Dispatch<SetStateAction<number>>;
 unitSymbols:boolean;setUnitSymbols:Dispatch<SetStateAction<boolean>>;
};
export function GameHeader({activeScenario,playerSide,day,hour,running,multiplayer,networkPhase,averageSupply,averageOrg,blueCities,cities,enemy,detectedEnemies,speed,warResult,setShowTutorial,setTutorialStep,concludeSession,returnToSetup,setRunning,setSpeed,unitSymbols,setUnitSymbols}:Props){
 return <header className="topbar">
      <div className="brand"><BrandMark/><div><b>KSPIEL</b><small>{activeScenario.title.toUpperCase()} · #{activeScenario.seed.toString(16).toUpperCase()}</small></div></div>
      <div className="theater-state"><span className="command-side"><Flag styleName={activeScenario.sideFlags[playerSide]??"generic-blue"}/>{activeScenario.sideNames[playerSide]}</span><span>DAY {day}</span><strong>{timeLabel(hour)}</strong><span className={running?"live":"paused"}>{running?"RUNNING":"PAUSED"}</span>{multiplayer&&<span className={"network-badge "+networkPhase}>{multiplayer.teamSize}V{multiplayer.teamSize} · {multiplayer.code}</span>}</div>
      <div className="global-metrics"><div><small>SUPPLY</small><b>{pct(averageSupply)}%</b></div><div><small>ORG</small><b>{pct(averageOrg)}%</b></div><div><small>CITIES</small><b>{blueCities}/{cities.length}</b></div><div><small>CONTACTS</small><b>{enemy.filter(u=>detectedEnemies.has(u.id)).length}</b></div></div>
      <div className="time-controls"><button className="guide-toggle" onClick={()=>{setShowTutorial(true);setTutorialStep(0)}}>GUIDE ?</button>{!multiplayer&&<button className="aar-end" onClick={concludeSession}>END MATCH · REPORT</button>}<button className="setup-return" onClick={returnToSetup}>SETUP</button><button disabled={Boolean(multiplayer&&!multiplayer.isHost)} onClick={()=>setRunning(v=>warResult?v:!v)} className="icon-btn">{running?"Ⅱ":"▶"}</button>{[1,2,3].map(s=><button disabled={Boolean(multiplayer&&!multiplayer.isHost)} key={s} onClick={()=>{if(!warResult){setSpeed(s);setRunning(true)}}} className={speed===s?"active":""}>×{(multiplayer?MULTIPLAYER_SPEED:SOLO_SPEED)[s]}</button>)}<button className={"nato-toggle "+(unitSymbols?"active":"")} type="button" aria-pressed={unitSymbols} title="Toggle NATO unit symbols" onClick={()=>setUnitSymbols(value=>!value)}>{unitSymbols?"SYMBOLS ✓":"NATO SYMBOLS"}</button></div>
    </header>;
}
