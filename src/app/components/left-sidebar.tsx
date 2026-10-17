"use client";
import type {Dispatch,SetStateAction} from "react";
import type {ArmyGroup,AttackPlan,ConstructionProject,EmplacementKind,Formation,OrderType,Side} from "@/sim/types";
import type {FrontDirective,FrontMode} from "@/sim/warfare";
import type {OpenWorldState,OpenWorldBuildKind} from "@/sim/openworld";
import {UNIT_COST} from "@/sim/openworld";
import {UNIT_LABEL} from "@/sim/game";
import {UnitTypeMark} from "./unit-type-mark";
import {armyGroupColor} from "@/sim/operations";
import {constructionLabel,pct} from "@/app/ui-utils";

type Panel="none"|"forces"|"unit";
type Point={x:number;y:number};
type Props={
 mobilePanel:Panel;setMobilePanel:Dispatch<SetStateAction<Panel>>;
 armyGroups:ArmyGroup[];blue:Formation[];selected:string[];selectGroup:(groupId:string)=>void;
 unitSymbols:boolean;setUnitSymbols:Dispatch<SetStateAction<boolean>>;
 pendingMassAttack:boolean;setPendingMassAttack:Dispatch<SetStateAction<boolean>>;
 setMassTargets:Dispatch<SetStateAction<string[]>>;setPendingOrder:Dispatch<SetStateAction<OrderType|null>>;
 setPendingPlan:Dispatch<SetStateAction<boolean>>;massTargets:string[];launchGroupAttack:()=>void;
 frontDirectives:FrontDirective[];playerSide:Side;units:Formation[];
 changeFrontMode:(groupId:string,mode:FrontMode|"stop")=>void;
 attackPlans:AttackPlan[];setSelected:Dispatch<SetStateAction<string[]>>;
 executePlan:(id:string)=>void;cancelPlan:(id:string)=>void;
 openWorld:OpenWorldState|null;pendingStrategicBuild:OpenWorldBuildKind|null;
 setPendingStrategicBuild:Dispatch<SetStateAction<OpenWorldBuildKind|null>>;
 setStrategicBuildAnchor:Dispatch<SetStateAction<Point|null>>;
 setPendingBuild:Dispatch<SetStateAction<EmplacementKind|null>>;
 setConstructionAnchor:Dispatch<SetStateAction<Point|null>>;
 localSides:Set<Side>;constructionProjects:ConstructionProject[];isMobile:boolean;
 IRREGULAR_TRAITS:Partial<Record<Formation["kind"],string>>;
 onRecruit:(kind:Formation["kind"],barracksId:string)=>void;
};
export function LeftSidebar({mobilePanel,setMobilePanel,armyGroups,blue,selected,selectGroup,
pendingMassAttack,setPendingMassAttack,setMassTargets,setPendingOrder,setPendingPlan,massTargets,
launchGroupAttack,frontDirectives,playerSide,units,changeFrontMode,attackPlans,setSelected,executePlan,
cancelPlan,openWorld,pendingStrategicBuild,setPendingStrategicBuild,setStrategicBuildAnchor,
setPendingBuild,setConstructionAnchor,localSides,constructionProjects,isMobile,IRREGULAR_TRAITS,onRecruit,unitSymbols,setUnitSymbols}:Props){
 // The selected formation determines the focused army; other formations stay unselected.
 const focusedUnit=units.find(u=>u.id===selected[0]&&localSides.has(u.side));
 const activeGroupId=focusedUnit?.groupId;
 const focusedGroup=armyGroups.find(g=>g.id===activeGroupId);
 const focusedForce=activeGroupId?blue.filter(u=>u.groupId===activeGroupId):blue;
 const focusedFront=frontDirectives.find(f=>f.groupId===activeGroupId&&f.side===playerSide);
 const directOrders=focusedForce.filter(u=>u.order?.manual===true).length;
 return <aside className={"left-panel "+(mobilePanel==="forces"?"mobile-open":"")}>
      <button className="mobile-panel-close" onClick={()=>setMobilePanel("none")}>CLOSE</button>
      <section className="nato-display-settings"><div className="section-title">UNIT DISPLAY</div>
        <button type="button" className={"nato-display-switch "+(unitSymbols?"active":"")}
          aria-pressed={unitSymbols} onClick={()=>setUnitSymbols(value=>!value)}>
          {unitSymbols?"☑ NATO SYMBOLS":"□ NATO SYMBOLS"} <small>{unitSymbols?"SYMBOLS":"TEXT LABELS"}</small>
        </button>
      </section>
      <section><div className="section-title">ARMY GROUPS · CTRL+1…6 ASSIGN</div>
         <div className="army-group-grid">{armyGroups.map(g=><button key={g.id} type="button"
           className={g.id===activeGroupId?"active":""} aria-pressed={g.id===activeGroupId}
           onClick={()=>selectGroup(g.id)} style={{borderLeft:"4px solid "+armyGroupColor(g.id)}}>
           <b>{g.hotkey||"·"}</b><span>{g.name}<small>{blue.filter(u=>u.groupId===g.id).length} formations</small></span>
         </button>)}</div>
         {focusedGroup&&<div className="army-command-summary" style={{borderLeftColor:armyGroupColor(focusedGroup.id)}}>
           <div className="army-command-summary-title"><b>{focusedGroup.name.toUpperCase()}</b><small>SELECTED COMMAND</small></div>
           <div className="army-command-summary-status">
             <span>{focusedForce.length} FORMATIONS</span>
             <span>{focusedFront?focusedFront.mode.toUpperCase()+" FRONT":"NO FRONT"}</span>
             <span>{directOrders} DIRECT</span>
           </div>
           <small>Direct orders take precedence until completed. Group orders then resume.</small>
         </div>}
       </section>
      <section className="combined-order"><div className="section-title">COORDINATED GROUP ATTACK</div>
        <button className={pendingMassAttack?"active":""} disabled={!selected.length} onClick={()=>{setPendingMassAttack(true);setMassTargets([]);setPendingOrder(null);setPendingPlan(false)}}>H · MARK MULTIPLE ENEMIES</button>
        {pendingMassAttack&&<div className="mass-target-tools"><span>{massTargets.length} ENEMY TARGET{massTargets.length===1?"":"S"} MARKED</span><button disabled={!massTargets.length} onClick={launchGroupAttack}>LAUNCH GROUP ATTACK</button><button onClick={()=>{setPendingMassAttack(false);setMassTargets([])}}>CANCEL</button></div>}
      </section>
      <section><div className="section-title">ACTIVE FRONTS · OPERATIONAL ORDERS</div>
        <div className="front-directive-list">{frontDirectives.filter(f=>f.side===playerSide).map(f=><div key={f.id} className="front-directive">
          <b>{f.groupId.replace(playerSide+"-army-","ARMY ")} · {f.mode.toUpperCase()}</b><small>{units.filter(u=>u.groupId===f.groupId&&u.side===f.side).length} FORMATIONS · RESERVE {Math.round(f.reserveFraction*100)}%</small>
          <div className="front-modes">{(["hold","advance","push","retreat","stop"] as const).map(mode=><button key={mode} className={f.mode===mode?"active":""} onClick={()=>changeFrontMode(f.groupId,mode)}>{mode.toUpperCase()}</button>)}</div>
        </div>)}{!frontDirectives.some(f=>f.side===playerSide)&&<small className="muted-line">Draw a front using CTRL + drag to create a persistent army command.</small>}</div>
      </section>
      <section><div className="section-title">ATTACK PLANS · B THEN RMB</div><div className="plan-list">{attackPlans.length?attackPlans.map(p=><div className={"plan-row "+p.status} key={p.id}><button onClick={()=>setSelected(p.formationIds)}><b>{p.name}</b><small>{p.formationIds.length} formations · {p.status}</small></button>{p.status==="draft"&&<button onClick={()=>executePlan(p.id)}>GO</button>}<button onClick={()=>cancelPlan(p.id)}>×</button></div>):<small className="muted-line">No plans drafted.</small>}</div></section>
      {openWorld&&<section className="openworld-panel"><div className="section-title">DOMINION</div><div className="resource-strip"><b>MP {Math.floor(openWorld.resources[playerSide].manpower)}</b><b>MAT {Math.floor(openWorld.resources[playerSide].materials)}</b><b>FUEL {Math.floor(openWorld.resources[playerSide].fuel)}</b></div><div className="section-title">RAISE FORMATIONS</div><div className="recruit-grid">{(["infantry","militia","partisan","raider","mountaineer","special_forces","engineer","cavalry","recon","mechanized","tank","mortar","artillery","heavy_artillery","logistics"] as Formation["kind"][]).map(kind=>{const cost=UNIT_COST[kind];const barracks=openWorld.structures.find(b=>b.side===playerSide&&b.kind===cost?.family);return <button key={kind} title={IRREGULAR_TRAITS[kind]??kind.replace("_"," ")} disabled={!cost||!barracks} onClick={()=>{if(!cost||!barracks)return;onRecruit(kind,barracks.id)}}><b>{unitSymbols?<UnitTypeMark kind={kind}/>:UNIT_LABEL[kind]}</b><small>{cost?cost.manpower+" MP · "+cost.materials+" MAT · "+cost.fuel+" F":"—"}</small></button>})}</div><div className="section-title">BUILD</div><div className="strategic-build-grid">{(["infantry_barracks","mobile_barracks","support_barracks","city","fort","wall"] as OpenWorldBuildKind[]).map(kind=><button key={kind} className={pendingStrategicBuild===kind?"active":""} onClick={()=>{setPendingStrategicBuild(kind);setStrategicBuildAnchor(null);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);setConstructionAnchor(null)}}>{kind.replaceAll("_"," ").toUpperCase()}</button>)}</div><small className="muted-line">Roads are built by logistics formations. Owned territory yields resources automatically.</small></section>}
      <section><div className="section-title">FIELD WORKS</div><div className="construction-list">{constructionProjects.length?constructionProjects.filter(p=>localSides.has(p.side)).map(project=><div className="construction-row" key={project.id}><b>{constructionLabel(project.kind)}</b><span>{Math.round(project.progress/project.requiredHours*100)}%</span><i><em style={{width:Math.min(100,project.progress/project.requiredHours*100)+"%"}}/></i></div>):<small className="muted-line">No active construction.</small>}</div></section>
      <section><div className="section-title">ORDER OF BATTLE{focusedGroup?" · "+focusedGroup.name.toUpperCase():""}</div>
         <div className="oob-list">{focusedForce.map(u=><button key={u.id} onClick={()=>{setSelected([u.id]);if(isMobile)setMobilePanel("unit")}} className={selected.includes(u.id)?"selected":""}>
           <span className="oob-code">{unitSymbols?<UnitTypeMark kind={u.kind}/>:UNIT_LABEL[u.kind]}</span>
           <span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG · {u.order?.manual?"DIRECT":u.order?"GROUP":"IDLE"}</small></span>
         </button>)}</div>
       </section>
    </aside>;
}
