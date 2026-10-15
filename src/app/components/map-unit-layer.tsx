"use client";
import {memo,type MouseEvent as ReactMouseEvent} from "react";
import type {Formation,Side} from "@/sim/types";
import {UNIT_LABEL} from "@/sim/game";
import {AMMO_TYPES} from "@/sim/attrition";
import {armyGroupColor} from "@/sim/operations";
import {pct} from "@/app/ui-utils";
type Props={
 renderedUnits:Formation[];localSides:Set<Side>;detectedEnemies:Set<string>;
 selected:string[];massTargets:string[];
 selectUnit:(event:ReactMouseEvent,u:Formation)=>void;
 issueUnitTarget:(event:ReactMouseEvent,u:Formation)=>void;
};
/** Interactive world-space units. Fog and command authorization remain parent-owned. */
export const MapUnitLayer=memo(function MapUnitLayer({renderedUnits,localSides,detectedEnemies,selected,massTargets,selectUnit,issueUnitTarget}:Props){
 return <>{renderedUnits.map(u=>{
          const visible=localSides.has(u.side)||detectedEnemies.has(u.id);
          if(!visible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" kind-"+u.kind+" "+(selected.includes(u.id)?"selected ":"")+(massTargets.includes(u.id)?"mass-target ":"")+(u.organization<30||(u.suppression??0)>50||(u.morale??82)<25?"shaken ":"")+(u.isolationHours&&u.isolationHours>6?" encircled ":"")+(u.order?.type==="retreat"?"retreating":"")+(AMMO_TYPES.has(u.kind)&&(u.ammo??100)<12?" low-ammo":"")} style={{left:u.x-16,top:u.y-16,background:"linear-gradient(90deg,"+(u.side==="blue"?"#5f8199":u.side==="red"?"#9c5f59":"#71846a")+" 0 50%,"+armyGroupColor(u.groupId)+" 50% 100%)"}} onPointerDown={e=>{if(e.button===2)e.preventDefault();e.stopPropagation()}} onClick={e=>selectUnit(e,u)} onContextMenuCapture={e=>e.preventDefault()} onContextMenu={e=>issueUnitTarget(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{localSides.has(u.side)?u.groupId?.split("-").pop()??"·":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>
        })}</>;
});
