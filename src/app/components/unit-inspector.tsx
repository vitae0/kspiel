"use client";
import type {Dispatch,SetStateAction} from "react";
import type {ArmyGroup,CityState,EmplacementKind,Formation,FormationShape,OrderType,Side} from "@/sim/types";
import type {FrontDirective,FrontMode} from "@/sim/warfare";
import type {OpenWorldState} from "@/sim/openworld";
import type {supplyAccess} from "@/sim/logistics";
import {AMMO_TYPES} from "@/sim/attrition";
import {DIRECT_COMBAT_KINDS,ARTILLERY_KINDS} from "@/sim/rules";
import {UNIT_LABEL} from "@/sim/game";
import {Stat,Row} from "./ui-primitives";
type Props={
 openWorld:OpenWorldState|null;primary:Formation|undefined;cities:CityState[];playerSide:Side;
 orderLabel:(unit:Formation)=>string;
 primaryAccess:ReturnType<typeof supplyAccess>|null;selectedUnits:Formation[];
 pendingBuild:EmplacementKind|null;armConstruction:(kind:EmplacementKind)=>void;
 marchShape:FormationShape;setMarchShape:Dispatch<SetStateAction<FormationShape>>;
 armyGroups:ArmyGroup[];assignGroup:(groupId:string)=>void;
 frontToolActive:boolean;setFrontToolActive:Dispatch<SetStateAction<boolean>>;
 setPendingMassAttack:Dispatch<SetStateAction<boolean>>;setPendingOrder:Dispatch<SetStateAction<OrderType|null>>;
 activeFront:FrontDirective|undefined;changeFrontMode:(groupId:string,mode:FrontMode|"stop")=>void;
 pendingDecoy:boolean;setPendingDecoy:Dispatch<SetStateAction<boolean>>;
 setPendingPlan:Dispatch<SetStateAction<boolean>>;
 pendingMassAttack:boolean;setMassTargets:Dispatch<SetStateAction<string[]>>;
 pendingPlan:boolean;startOrder:(type:OrderType)=>void;canRetreat:boolean;
 arrangeFormation:(shape:FormationShape)=>void;
 IRREGULAR_TRAITS:Partial<Record<Formation["kind"],string>>;
};
/** Selected unit details and command controls, isolated from map renderer internals. */
export function UnitInspector({openWorld,primary,cities,playerSide,orderLabel,primaryAccess,selectedUnits,
pendingBuild,armConstruction,marchShape,setMarchShape,armyGroups,assignGroup,frontToolActive,
setFrontToolActive,setPendingMassAttack,setPendingOrder,activeFront,changeFrontMode,pendingDecoy,
setPendingDecoy,setPendingPlan,pendingMassAttack,setMassTargets,pendingPlan,startOrder,canRetreat,
arrangeFormation,IRREGULAR_TRAITS}:Props){
 return <aside className="right-panel">
      {openWorld&&!primary?<div className="openworld-inspector"><div className="section-title">OPEN WORLD</div><b>{cities.filter(c=>c.owner===playerSide).length} CONTROLLED CITIES</b><span>{openWorld.recruitment.filter(q=>q.side===playerSide).length} formations recruiting</span><span>Keep forces concentrated on empty land to urbanize it into a permanent city.</span></div>:primary?<div className="inspector">
        <div className="unit-heading"><div className="big-counter">{UNIT_LABEL[primary.kind]}</div><div><small>{primary.kind.toUpperCase()} FORMATION</small><h2>{primary.name}</h2><span>{orderLabel(primary)}</span></div></div>
        {IRREGULAR_TRAITS[primary.kind]&&<div className="irregular-doctrine">{IRREGULAR_TRAITS[primary.kind]}</div>}
        <div className="stat-grid"><Stat label="Strength" value={primary.strength}/><Stat label="Organization" value={primary.organization}/><Stat label="Supply" value={primary.supply}/><Stat label="Fuel" value={primary.fuel}/>{AMMO_TYPES.has(primary.kind)&&<Stat label="Ammunition" value={primary.ammo??100}/>}<Stat label="Materials" value={primary.materials??100}/><Stat label="Entrenchment" value={primary.entrenchment}/><Stat label="Readiness" value={primary.readiness}/><Stat label="Morale" value={primary.morale??82}/><Stat label="Suppression" value={primary.suppression??0}/><Stat label="Isolation" value={Math.min(100,(primary.isolationHours??0)*1.15)}/></div>
        <div className="section-title">COMBAT MODEL</div><div className="numbers"><Row k="Manpower" v={primary.manpower.toLocaleString()}/><Row k="Soft attack" v={String(primary.softAttack)}/><Row k="Hard attack" v={String(primary.hardAttack)}/><Row k="Defense" v={String(primary.defense)}/><Row k="Breakthrough" v={String(primary.breakthrough)}/><Row k="Recon" v={String(primary.recon)}/><Row k="Speed" v={primary.speed+" km/h"}/></div>
        {AMMO_TYPES.has(primary.kind)&&(primary.ammo??100)<8&&<div className="isolated-warning">AMMUNITION DEPLETED · WAIT FOR SUPPLY DELIVERIES BEFORE FIRING AGAIN</div>}
        {(primary.materials??100)<8&&<div className="isolated-warning">CONSTRUCTION MATERIALS DEPLETED · REPLENISH AT A SUPPLY HUB</div>}
        {(primary.isolationHours??0)>6&&<div className="isolated-warning">ENCIRCLEMENT · {Math.round(primary.isolationHours??0)} HOURS WITHOUT A SAFE CORRIDOR</div>}
        <div className="section-title">SUPPLY ACCESS</div>{primaryAccess&&<div className={"supply-access level-"+primaryAccess.level}><b>{primaryAccess.label}</b><span>{primaryAccess.range>0?"Relay range "+Math.round(primaryAccess.range):primaryAccess.level===0?"Resupply severely limited":"Automatic resupply active"}</span></div>}
        <div className="section-title">FIELD CONSTRUCTION</div><div className="build-controls">
          <button disabled={!selectedUnits.length} className={pendingBuild==="trench"?"active":""} onClick={()=>armConstruction("trench")}><b>TRENCH</b><small>All troops · engineers build ×4 faster</small></button>
          <button disabled={!selectedUnits.length} className={pendingBuild==="barricade"?"active":""} onClick={()=>armConstruction("barricade")}><b>BARRICADE</b><small>All troops · blocks enemy movement until breached</small></button>
          <button disabled={!selectedUnits.some(u=>u.kind==="logistics")} className={pendingBuild==="road"?"active":""} onClick={()=>armConstruction("road")}><b>ROAD</b><small>Logistics only · select start and end · joins on intersection</small></button>
          <button disabled={!selectedUnits.length} className={pendingBuild==="observatory"?"active":""} onClick={()=>armConstruction("observatory")}><b>OBSERVATORY</b><small>26 worker-hours · engineers ×4</small></button>
          <button disabled={!selectedUnits.length} className={pendingBuild==="fixed_artillery"?"active":""} onClick={()=>armConstruction("fixed_artillery")}><b>FIXED ARTILLERY</b><small>50 worker-hours · engineers ×4</small></button>
          <button disabled={!selectedUnits.length} className={pendingBuild==="field_fortification"?"active":""} onClick={()=>armConstruction("field_fortification")}><b>FIELD FORT</b><small>18 worker-hours · engineers ×4</small></button>
          <button disabled={!selectedUnits.length} className={pendingBuild==="supply_depot"?"active":""} onClick={()=>armConstruction("supply_depot")}><b>SUPPLY DEPOT</b><small>34 worker-hours · engineers ×4</small></button>
        </div>
        <div className="section-title">FORMATION</div><div className="formation-controls">{(["line","column","wedge","echelon"] as FormationShape[]).map(shape=><button key={shape} onClick={()=>arrangeFormation(shape)} disabled={selectedUnits.length<2}>{shape.toUpperCase()}</button>)}</div>
        <div className="section-title">MARCH FORMATION · INDEPENDENT OF GROUPS</div>
        <div className="formation-controls">{(["line","column","wedge","echelon"] as FormationShape[]).map(shape=><button key={"march-"+shape} className={marchShape===shape?"active":""} onClick={()=>setMarchShape(shape)}>{shape.toUpperCase()}</button>)}</div>
        <small className="muted-line">Select units from any armies. Right-click to march in separate slots at the slowest combat unit's pace. Guns and logistics follow in the rear.</small>
        <div className="section-title">ARMY GROUP</div><div className="group-assign">{armyGroups.map(g=><button key={g.id} className={selectedUnits.length>0&&selectedUnits.every(u=>u.groupId===g.id)?"active":""} onClick={()=>assignGroup(g.id)}>{g.hotkey}</button>)}</div>
        <div className="section-title">FRONT COMMAND</div><div className="front-command"><button className={frontToolActive?"active":""} onClick={()=>{setFrontToolActive(v=>!v);setPendingMassAttack(false);setPendingOrder(null)}}>DRAW FRONT · CTRL+DRAG</button><small>Deploy group and create a persistent frontline with autonomous reserves.</small>
          {activeFront&&<div className="front-modes">{(["hold","advance","push","retreat","stop"] as const).map(mode=><button key={mode} className={activeFront.mode===mode?"active":""} onClick={()=>changeFrontMode(activeFront.groupId,mode)}>{mode.toUpperCase()}</button>)}</div>}
          {selectedUnits.some(u=>u.kind==="recon")&&<button className={pendingDecoy?"active":""} onClick={()=>{setPendingDecoy(true);setPendingOrder(null);setPendingPlan(false)}}>RECON DECOY · Y + MAP</button>}
        </div>
        <div className="section-title">ORDERS</div><div className="orders">
          <button className={pendingMassAttack?"active plan-button":""} onClick={()=>{setPendingMassAttack(true);setMassTargets([]);setPendingOrder(null);setPendingPlan(false)}}>GROUP ATTACK <kbd>H</kbd></button>
          <button className={pendingPlan?"active plan-button":""} onClick={()=>{setPendingPlan(true);setPendingOrder(null)}}>ATTACK PLAN <kbd>B</kbd></button>
          <button className={!pendingOrder?"active":""} onClick={()=>startOrder("move")}>MOVE <kbd>M</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="assault"?"active":""} onClick={()=>startOrder("assault")}>ASSAULT <kbd>A</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="probe"?"active":""} onClick={()=>startOrder("probe")}>PROBE <kbd>P</kbd></button>
          <button disabled={!selectedUnits.some(u=>ARTILLERY_KINDS.has(u.kind))} className={pendingOrder==="fire"?"active":""} onClick={()=>startOrder("fire")}>FIRE <kbd>F</kbd></button>
          <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="relieve"?"active":""} onClick={()=>startOrder("relieve")}>RELIEVE <kbd>T</kbd></button>
          <button disabled={!canRetreat} onClick={()=>startOrder("retreat")}>RETREAT <kbd>X</kbd></button>
          <button onClick={()=>startOrder("defend")}>DEFEND <kbd>D</kbd></button><button onClick={()=>startOrder("dig")}>DIG IN <kbd>G</kbd></button><button onClick={()=>startOrder("resupply")}>RESUPPLY <kbd>R</kbd></button>
        </div>
      </div>:<div className="empty-inspector"><b>NO FORMATION SELECTED</b><span>Select a friendly counter on the map.</span></div>}
    </aside>;
}
