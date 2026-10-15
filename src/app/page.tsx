"use client";

import {useEffect,useMemo,useRef,useState,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent,type WheelEvent as ReactWheelEvent} from "react";
import {generateScenario,polylinePath,SCENARIO_PRESETS,terrainAt,TERRAIN_RULES,UNIT_LABEL,WORLD_H,WORLD_W} from "@/sim/game";
import {armyGroupColor,roadVisualPieces} from "@/sim/operations";
import {AMMO_TYPES,SHELL_INTERVAL,constructionWork,fireBudget,marchPaces,marchSlots,replenish,type GunEvent} from "@/sim/attrition";
import {advanceDirective,applyEncirclement,decoyVisibleTo,frontAssignments,isDetected,updateContacts,type FrontDirective,type FrontMode,type LastSeenContact,type DecoyContact} from "@/sim/warfare";
import {startHistory,updateHistory,finishHistory,addBattleEvent,type BattleHistory} from "@/sim/telemetry";
import AfterActionReport from "./after-action";
import BrandMark from "./brand-mark";
import MenuAtmosphere from "./menu-atmosphere";
import MenuScore from "./menu-score";
import {useTerritoryView} from "@/app/hooks/use-territory-view";
import {StaticLand,StaticRoutes} from "@/app/components/static-terrain";
import {useViewportSize} from "@/app/hooks/use-viewport-size";
import {botControlledSides,createMatchConfig,defaultArmyGroups,localControlledSides} from "@/sim/session";
import {addStrategicStructure,advanceOpenWorld,buildStrategicCity,createOpenWorldState,queueRecruitment,UNIT_COST,type OpenWorldBuildKind,type OpenWorldState} from "@/sim/openworld";
import {closeMultiplayerRoom,createPrivateMatch,findQuickPlay,inviteUrl,joinPrivateMatch,supabase,type MultiplayerSession,type MultiplayerSnapshot,type MultiplayerTeamSize,type UnitCommandPatch} from "@/lib/multiplayer";
import {Stat,Row,Flag} from "@/app/components/ui-primitives";
import {GameHeader} from "@/app/components/game-header";
import {GameTutorial} from "@/app/components/game-tutorial";
import {GameMinimap} from "@/app/components/game-minimap";
import {GameMapHud} from "@/app/components/game-map-hud";
import {MobileToolbar} from "@/app/components/mobile-toolbar";
import {GameStatusbar} from "@/app/components/game-statusbar";
import type {AttackPlan,CityState,ConstructionProject,Emplacement,EmplacementKind,FlagStyle,Formation,FormationShape,OrderType,Scenario,Side,TerrainSample} from "@/sim/types";

import {clamp,segmentsIntersect} from "@/sim/geometry";
import {SOLO_SPEED,MULTIPLAYER_SPEED,SIM_HOURS_PER_REAL_SECOND,MAX_FRAME_SECONDS,SIM_TICK_MS,AI_COMMAND_INTERVAL_SECONDS,RETREAT_SUPPLY_MIN,DIRECT_COMBAT_KINDS,ARTILLERY_KINDS,GUN_ARTILLERY_KINDS,isInCombat,retreatDestination,visionRange,mortarMaxRange,mortarDispersion} from "@/sim/rules";
import {movementRoutePlan} from "@/sim/navigation";
import {routeInterdictionPoints,type SupplyNetwork,computeSupplyNetwork,supplySourceAtPoint,logisticsDistributionRange,computeLogisticsLinks,supplyAccess} from "@/sim/logistics";
import {updateCities,enemyAI} from "@/sim/strategy";
import {simulate} from "@/sim/simulation";
import {applyEmplacementFire,advanceConstruction} from "@/sim/construction";
import {pct,timeLabel,constructionLabel,constructionShort,isLinearConstruction} from "@/app/ui-utils";


const IRREGULAR_TRAITS:Partial<Record<Formation["kind"],string>>={
  militia:"LOCAL DEFENSE · Low equipment cost · Strong city garrisons · Weak breakthrough · Modest supply use",
  partisan:"FOREST AMBUSH · Concealment · Rural foraging · Disrupts hostile road supply and favors irregular engagements",
  raider:"FAST RAID · Deep reconnaissance · Strong terrain ambush · Extended road interdiction · Fragile in open battles"
};

export default function Home(){
  const [scenario,setScenario]=useState<Scenario|null>(null);
  const [units,setUnits]=useState<Formation[]>([]);
  const [cities,setCities]=useState<CityState[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [pendingOrder,setPendingOrder]=useState<OrderType|null>(null);
  const [running,setRunning]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [marchShape,setMarchShape]=useState<FormationShape>("line");
  const [gunEffects,setGunEffects]=useState<GunEvent[]>([]);
  const [hour,setHour]=useState(6);
  const [day,setDay]=useState(1);
  const [pan,setPan]=useState({x:-260,y:-190});
  const [zoom,setZoom]=useState(.24);
  const [hovered,setHovered]=useState<TerrainSample|null>(null);
  const [aimPoint,setAimPoint]=useState<{x:number;y:number}|null>(null);
  const [warResult,setWarResult]=useState<Side|null>(null);
  const [selectionBox,setSelectionBox]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [frontPreview,setFrontPreview]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [frontDirectives,setFrontDirectives]=useState<FrontDirective[]>([]);
  const [contacts,setContacts]=useState<LastSeenContact[]>([]);
  const [decoys,setDecoys]=useState<DecoyContact[]>([]);
  const [pendingDecoy,setPendingDecoy]=useState(false);
  const [battleReport,setBattleReport]=useState<BattleHistory|null>(null);
  const [attackPlans,setAttackPlans]=useState<AttackPlan[]>([]);
  const [pendingPlan,setPendingPlan]=useState(false);
  const [pendingMassAttack,setPendingMassAttack]=useState(false);
  const [massTargets,setMassTargets]=useState<string[]>([]);
  const [frontToolActive,setFrontToolActive]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [tutorialStep,setTutorialStep]=useState(0);
  const [selectedPresetId,setSelectedPresetId]=useState("frontier");
  const [selectedGameMode,setSelectedGameMode]=useState<"scenario"|"openworld">("scenario");
  const [openWorld,setOpenWorld]=useState<OpenWorldState|null>(null);
  const [pendingStrategicBuild,setPendingStrategicBuild]=useState<OpenWorldBuildKind|null>(null);
  const [strategicBuildAnchor,setStrategicBuildAnchor]=useState<{x:number;y:number}|null>(null);
  const [setupCategory,setSetupCategory]=useState<"all"|"fictional"|"historical"|"mega"|"guerrilla">("all");
  const [playerSide,setPlayerSide]=useState<Side>("blue");
  const [emplacements,setEmplacements]=useState<Emplacement[]>([]);
  const [constructionProjects,setConstructionProjects]=useState<ConstructionProject[]>([]);
  const [pendingBuild,setPendingBuild]=useState<EmplacementKind|null>(null);
  const [constructionAnchor,setConstructionAnchor]=useState<{x:number;y:number}|null>(null);
  const [isMobile,setIsMobile]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<"none"|"forces"|"unit">("none");
  const [mobileTool,setMobileTool]=useState<"pan"|"front">("pan");
  const [multiplayer,setMultiplayer]=useState<MultiplayerSession|null>(null);
  const [networkPhase,setNetworkPhase]=useState<"idle"|"matching"|"waiting"|"connected"|"opponent-left"|"error">("idle");
  const [networkError,setNetworkError]=useState("");
  const [inviteLink,setInviteLink]=useState("");
  const [nickname,setNickname]=useState("");
  const [multiplayerTeamSize,setMultiplayerTeamSize]=useState<MultiplayerTeamSize>(1);
  const [pendingInviteCode,setPendingInviteCode]=useState("");
  const [onlinePlayers,setOnlinePlayers]=useState<Array<{token:string;nickname:string;side:Side;slot:number}>>([]);

  const drag=useRef<{mode:"pan"|"box"|"front"|"select"|"target";startClientX:number;startClientY:number;px:number;py:number;moved:boolean}|null>(null);
  const touchPoints=useRef<Map<number,{x:number;y:number}>>(new Map());
  const pinch=useRef<{distance:number;zoom:number;worldX:number;worldY:number}|null>(null);
  const longPressTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const suppressContextMenu=useRef(false);
  const viewport=useRef<HTMLDivElement>(null);
  // Derived view caches avoid conditional React hooks after the setup early return.
  const networkViewRef=useRef<{scenario:Scenario;units:Formation[];cities:CityState[];value:SupplyNetwork}|null>(null);
  const linksViewRef=useRef<{network:SupplyNetwork;units:Formation[];cities:CityState[];emplacements:Emplacement[];value:ReturnType<typeof computeLogisticsLinks>}|null>(null);
  const scoutViewRef=useRef<{scenario:Scenario;units:Formation[];cities:CityState[];emplacements:Emplacement[];side:Side;friendly:Formation[];ids:Set<string>}|null>(null);
  const lastPointerSample=useRef(0);
  const unitsRef=useRef<Formation[]>([]);
  const frontsRef=useRef<FrontDirective[]>([]);
  const contactsRef=useRef<LastSeenContact[]>([]);
  const decoysRef=useRef<DecoyContact[]>([]);
  const historyRef=useRef<BattleHistory|null>(null);
  const lastOperationalRef=useRef(0);
  const lastEncirclementRef=useRef(0);
  const lastIntelRef=useRef(0);
  const decoySerialRef=useRef(1);
  const citiesRef=useRef<CityState[]>([]);
  const warResultRef=useRef<Side|null>(null);
  const planCounter=useRef(1);
  const buildCounter=useRef(1);
  const initialRosterRef=useRef<Formation[]>([]);
  const marchSerial=useRef(1);
  const gunEffectsRef=useRef<GunEvent[]>([]);
  const initialCountRef=useRef<Record<Side,number>>({blue:0,red:0,green:0});
  const elapsedHoursRef=useRef(0);
  const lastReserveRef=useRef<Record<Side,number>>({blue:0,red:0,green:0});
  const reserveSerialRef=useRef(1);
  const emplacementsRef=useRef<Emplacement[]>([]);
  const projectsRef=useRef<ConstructionProject[]>([]);
  const openWorldRef=useRef<OpenWorldState|null>(null);
  const multiplayerRef=useRef<MultiplayerSession|null>(null);
  const networkChannelRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const networkStartedRef=useRef(false);
  const lastSnapshotSeqRef=useRef(0);
  const snapshotSeqRef=useRef(0);
  const latestSnapshotRef=useRef<MultiplayerSnapshot|null>(null);
  latestSnapshotRef.current={seq:0,units,cities,attackPlans,emplacements,constructionProjects,hour,day,running,speed,warResult,
    frontDirectives,decoys,combatEffects:gunEffects.slice(-36),battleHistory:battleReport?{
      ...battleReport,
      samples:battleReport.samples.filter((_,i)=>i===battleReport.samples.length-1||i%Math.max(1,Math.ceil(battleReport.samples.length/120))===0),
      events:battleReport.events.slice(-100),
      records:[...battleReport.records].sort((a,b)=>b.damage-a.damage).slice(0,120)
    }:undefined};

  useEffect(()=>{
    const saved=window.localStorage.getItem("kspiel.nickname");
    if(saved)setNickname(saved.slice(0,20));
    const code=new URLSearchParams(window.location.search).get("join")?.trim().toUpperCase();
    if(!code)return;
    setPendingInviteCode(code);
    setSelectedGameMode("scenario");
    window.history.replaceState(null,"",window.location.pathname+window.location.hash);
  },[]);

  useEffect(()=>{
    if(!multiplayer)return;
    multiplayerRef.current=multiplayer;
    networkStartedRef.current=false;
    lastSnapshotSeqRef.current=0;
    snapshotSeqRef.current=0;
    const channel=supabase.channel("kspiel:"+multiplayer.roomId,{
      config:{presence:{key:multiplayer.playerToken},broadcast:{ack:false,self:false}}
    });
    networkChannelRef.current=channel;

    const applySnapshot=(snapshot:MultiplayerSnapshot)=>{
      if(multiplayer.isHost||!snapshot||snapshot.seq<=lastSnapshotSeqRef.current)return;
      lastSnapshotSeqRef.current=snapshot.seq;
      unitsRef.current=snapshot.units;setUnits(snapshot.units);
      citiesRef.current=snapshot.cities;setCities(snapshot.cities);
      projectsRef.current=snapshot.constructionProjects;setConstructionProjects(snapshot.constructionProjects);
      emplacementsRef.current=snapshot.emplacements;setEmplacements(snapshot.emplacements);
      setAttackPlans(snapshot.attackPlans);
      frontsRef.current=snapshot.frontDirectives??[];setFrontDirectives(frontsRef.current);
      decoysRef.current=snapshot.decoys??[];setDecoys(decoysRef.current);
      const syncedEffects=snapshot.combatEffects??[];
      gunEffectsRef.current=syncedEffects;setGunEffects(syncedEffects);
      if(snapshot.battleHistory){historyRef.current=snapshot.battleHistory;setBattleReport(snapshot.battleHistory)}
      warResultRef.current=snapshot.warResult;setWarResult(snapshot.warResult);
      setHour(snapshot.hour);setDay(snapshot.day);setRunning(snapshot.running);setSpeed(snapshot.speed);
    };
    const senderSide=(payload:Record<string,unknown>|null|undefined):Side|null=>{
      const token=typeof payload?.playerToken==="string"?payload.playerToken:"";
      if(!token)return null;
      const state=channel.presenceState() as Record<string,Array<Record<string,unknown>>>;
      const entry=state[token]?.[state[token].length-1];
      return entry?.side==="blue"||entry?.side==="red"?entry.side as Side:null;
    };

    channel
      .on("broadcast",{event:"snapshot"},({payload})=>applySnapshot(payload as MultiplayerSnapshot))
      .on("broadcast",{event:"unit-patch"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const patches=Array.isArray(payload?.patches)?payload.patches as UnitCommandPatch[]:[];
        if(!side||!patches.length)return;
        const byId=new Map(patches.filter(p=>p&&typeof p.id==="string").map(p=>[p.id,p]));
        setUnits(prev=>{
          const next=prev.map(unit=>{
            const patch=byId.get(unit.id);
            if(!patch||unit.side!==side)return unit;
            const safeSupply=typeof patch.supply==="number"?Math.min(unit.supply,Math.max(0,Math.min(100,patch.supply))):unit.supply;
            return{...unit,supply:safeSupply,...("order" in patch?{order:patch.order}:{}),...("groupId" in patch?{groupId:patch.groupId}:{}),...("formationShape" in patch?{formationShape:patch.formationShape}:{})};
          });
          unitsRef.current=next;return next;
        });
      })
      .on("broadcast",{event:"front-upsert"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const front=payload?.front as FrontDirective|undefined;
        if(!side||!front||front.side!==side||!front.groupId.startsWith(side+"-army-"))return;
        const next=[...frontsRef.current.filter(f=>f.id!==front.id&&f.groupId!==front.groupId),front];
        frontsRef.current=next;setFrontDirectives(next);
      })
      .on("broadcast",{event:"front-remove"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const groupId=typeof payload?.groupId==="string"?payload.groupId:"";
        if(!side||!groupId.startsWith(side+"-army-"))return;
        const next=frontsRef.current.filter(f=>f.groupId!==groupId);
        frontsRef.current=next;setFrontDirectives(next);
      })
      .on("broadcast",{event:"decoy-create"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const decoy=payload?.decoy as DecoyContact|undefined;
        if(!side||!decoy||decoy.owner!==side)return;
        const next=[...decoysRef.current.filter(d=>d.id!==decoy.id),decoy].slice(-32);
        decoysRef.current=next;setDecoys(next);
      })
      .on("broadcast",{event:"plan-upsert"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const plan=payload?.plan as AttackPlan|undefined;
        if(!side||!plan||plan.side!==side)return;
        setAttackPlans(prev=>prev.some(p=>p.id===plan.id)?prev.map(p=>p.id===plan.id?plan:p):[...prev,plan]);
      })
      .on("broadcast",{event:"plan-delete"},({payload})=>{
        if(!multiplayer.isHost||typeof payload?.id!=="string")return;
        const side=senderSide(payload as Record<string,unknown>);if(!side)return;
        setAttackPlans(prev=>prev.filter(plan=>!(plan.id===payload.id&&plan.side===side)));
      })
      .on("broadcast",{event:"construction-create"},({payload})=>{
        if(!multiplayer.isHost)return;
        const side=senderSide(payload as Record<string,unknown>);
        const project=payload?.project as ConstructionProject|undefined;
        if(!side||!project||project.side!==side)return;
        if(projectsRef.current.some(p=>p.id===project.id))return;
        const next=[...projectsRef.current,project];projectsRef.current=next;setConstructionProjects(next);
      })
      .on("presence",{event:"sync"},()=>{
        const state=channel.presenceState() as Record<string,Array<Record<string,unknown>>>;
        const roster=Object.entries(state).map(([token,entries])=>{
          const entry=entries[entries.length-1]??{};
          return{token,nickname:typeof entry.nickname==="string"?entry.nickname:"Commander",side:entry.side==="red"?"red" as Side:"blue" as Side,slot:typeof entry.slot==="number"?entry.slot:0};
        });
        setOnlinePlayers(roster);
        if(roster.length>=multiplayer.maxPlayers){
          setNetworkPhase("connected");
          if(!networkStartedRef.current){
            networkStartedRef.current=true;
            startGame(multiplayer);
          }
        }else if(networkStartedRef.current){
          setNetworkPhase("opponent-left");
          if(multiplayer.isHost)setRunning(false);
        }else setNetworkPhase("waiting");
      })
      .subscribe(async status=>{
        if(status==="SUBSCRIBED")await channel.track({role:multiplayer.role,nickname:multiplayer.nickname,side:multiplayer.side,slot:multiplayer.slot,teamSize:multiplayer.teamSize,onlineAt:new Date().toISOString()});
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          setNetworkError("Realtime connection failed");setNetworkPhase("error");
        }
      });

    return()=>{
      if(networkChannelRef.current===channel)networkChannelRef.current=null;
      void supabase.removeChannel(channel);
    };
  },[multiplayer]);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const sync=()=>setIsMobile(media.matches);
    sync();media.addEventListener?.("change",sync);
    return()=>media.removeEventListener?.("change",sync);
  },[]);

  useEffect(()=>{
    if(isMobile&&(pendingOrder||pendingPlan||pendingBuild||pendingDecoy))setMobilePanel("none");
  },[isMobile,pendingOrder,pendingPlan,pendingBuild,pendingDecoy]);
  useEffect(()=>{
    if(!scenario||!multiplayer||multiplayer.isHost)return;
    const observed=updateContacts(contactsRef.current,units,cities,emplacements,scenario,playerSide,(day-1)*24+hour-6);
    contactsRef.current=observed;setContacts(observed);
  },[scenario,multiplayer?.isHost,units,cities,emplacements,playerSide,day,hour]);

  useEffect(()=>{
    const el=viewport.current;
    if(!el)return;
    const block=(event:Event)=>event.preventDefault();
    el.addEventListener("contextmenu",block,{capture:true});
    return()=>el.removeEventListener("contextmenu",block,{capture:true});
  },[scenario]);

  useEffect(()=>{
    const togglePause=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;
      if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      if(e.code!=="Space")return;
      e.preventDefault();e.stopPropagation();
      if(multiplayerRef.current&&!multiplayerRef.current.isHost)return;
      setRunning(v=>warResultRef.current?v:!v);
    };
    window.addEventListener("keydown",togglePause,true);
    return()=>window.removeEventListener("keydown",togglePause,true);
  },[]);

  const sendNetwork=(event:string,payload:Record<string,unknown>)=>{
    const channel=networkChannelRef.current;
    if(!channel)return;
    const session=multiplayerRef.current;
    void channel.send({type:"broadcast",event,payload:session?{...payload,playerToken:session.playerToken}:payload});
  };

  const commitUnits=(fn:(prev:Formation[])=>Formation[])=>{
    setUnits(prev=>{
      const next=fn(prev);unitsRef.current=next;
      const session=multiplayerRef.current;
      if(session&&!session.isHost){
        const previous=new Map(prev.map(unit=>[unit.id,unit]));
        const patches:UnitCommandPatch[]=[];
        for(const unit of next){
          if(unit.side!==session.side)continue;
          const before=previous.get(unit.id);
          if(!before)continue;
          if(JSON.stringify([before.order,before.groupId,before.formationShape,before.supply])!==JSON.stringify([unit.order,unit.groupId,unit.formationShape,unit.supply])){
            patches.push({id:unit.id,order:unit.order,groupId:unit.groupId,formationShape:unit.formationShape,supply:unit.supply});
          }
        }
        if(patches.length)sendNetwork("unit-patch",{patches});
      }
      return next;
    });
  };

  const localPlayerId=multiplayer?.playerToken??"local";
  const matchConfig=createMatchConfig(multiplayer?"pvp":"singleplayer",localPlayerId,playerSide);
  const localSides=new Set(localControlledSides(matchConfig,localPlayerId));
  const botSides=multiplayer?[]:openWorld?(["blue","red","green"] as Side[]).filter(side=>!localSides.has(side)):botControlledSides(matchConfig);
  const armyGroups=defaultArmyGroups(playerSide);

  const selectedUnits=units.filter(u=>selected.includes(u.id));
  const primary=selectedUnits[0];
  const selectedStrength=selectedUnits.reduce((sum,u)=>sum+u.strength,0)/Math.max(1,selectedUnits.length);
  const selectedOrganization=selectedUnits.reduce((sum,u)=>sum+u.organization,0)/Math.max(1,selectedUnits.length);
  const selectedSupply=selectedUnits.reduce((sum,u)=>sum+u.supply,0)/Math.max(1,selectedUnits.length);
  const primaryTracked=primary?.order?.targetUnitId?units.find(u=>u.id===primary.order?.targetUnitId):undefined;
  const primaryTargetX=primaryTracked?.x??primary?.order?.targetX,primaryTargetY=primaryTracked?.y??primary?.order?.targetY;
  const blue=units.filter(u=>localSides.has(u.side)),enemy=units.filter(u=>!localSides.has(u.side));
  const blueCities=cities.filter(c=>localSides.has(c.owner)).length;
  const averageSupply=blue.reduce((s,u)=>s+u.supply,0)/Math.max(1,blue.length);
  const averageOrg=blue.reduce((s,u)=>s+u.organization,0)/Math.max(1,blue.length);

  useEffect(()=>{
    if(!scenario||!running||speed===0||warResultRef.current)return;
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)return;
    let last=performance.now(),aiElapsed=AI_COMMAND_INTERVAL_SECONDS;
    const tick=()=>{
      const now=performance.now();
      const realSeconds=Math.min(MAX_FRAME_SECONDS,Math.max(0,(now-last)/1000));last=now;aiElapsed+=realSeconds;
      const simHours=realSeconds*SIM_HOURS_PER_REAL_SECOND*(multiplayerRef.current?MULTIPLAYER_SPEED:SOLO_SPEED)[speed];

      const beforeUnits=unitsRef.current,beforeCities=citiesRef.current,beforeEmplacements=emplacementsRef.current;
      let working=unitsRef.current;
      if(aiElapsed>=AI_COMMAND_INTERVAL_SECONDS){for(const side of botSides)working=enemyAI(scenario,working,citiesRef.current,side,decoysRef.current,elapsedHoursRef.current);aiElapsed=0}
      const freshEffects:GunEvent[]=[];
      let nextUnits=simulate(scenario,working,simHours,citiesRef.current,emplacementsRef.current,openWorldRef.current,freshEffects,now);
      // Keep the map responsive during mass barrages, including 100+ artillery pieces.
      const activeEffects=[...gunEffectsRef.current.filter(e=>now-e.birth<1350),...freshEffects].slice(-100);
      if(freshEffects.length||activeEffects.length!==gunEffectsRef.current.length){
        gunEffectsRef.current=activeEffects;setGunEffects(activeEffects);
      }
      elapsedHoursRef.current+=simHours;
      if(elapsedHoursRef.current-lastEncirclementRef.current>=1.0){
        nextUnits=applyEncirclement(nextUnits,citiesRef.current,elapsedHoursRef.current-lastEncirclementRef.current);
        lastEncirclementRef.current=elapsedHoursRef.current;
      }
      if(elapsedHoursRef.current-lastOperationalRef.current>=3.5&&frontsRef.current.length){
        const nextPlans:FrontDirective[]=[];
        const ordered=new Map<string,Formation>();
        for(const front of frontsRef.current){
          const moved=advanceDirective(front,elapsedHoursRef.current-lastOperationalRef.current,nextUnits,citiesRef.current,scenario);
          nextPlans.push({...moved,lastIssued:elapsedHoursRef.current});
          const assignments=frontAssignments(moved,nextUnits,citiesRef.current,scenario);
          for(const assignment of assignments){
            const unit=nextUnits.find(u=>u.id===assignment.unitId);
            if(!unit||unit.order?.type==="retreat"||unit.order?.marchId||unit.organization<16||unit.strength<10)continue;
            const objective={x:assignment.x,y:assignment.y};
            const targetEnemies=nextUnits.filter(u=>u.side!==unit.side&&u.strength>5);
            const range=unit.kind==="heavy_artillery"?820:unit.kind==="artillery"?540:unit.kind==="mortar"?mortarMaxRange(scenario,unit):0;
            const shooting=range>0?targetEnemies.filter(e=>Math.hypot(unit.x-e.x,unit.y-e.y)<range*.94)
              .sort((a,b)=>Math.hypot(unit.x-a.x,unit.y-a.y)-Math.hypot(unit.x-b.x,unit.y-b.y))[0]:undefined;
            if(shooting){ordered.set(unit.id,{...unit,order:unit.kind==="mortar"?{type:"fire",targetX:shooting.x,targetY:shooting.y}:{type:"fire",targetUnitId:shooting.id}});continue}
            const gap=Math.hypot(unit.x-objective.x,unit.y-objective.y);
            const tail=unit.order?.waypoints?.at(-1);
            const oldGoal=tail??(unit.order?.targetX!==undefined&&unit.order.targetY!==undefined?{x:unit.order.targetX,y:unit.order.targetY}:null);
            if(gap<60){if(assignment.role==="line"&&moved.mode==="hold")ordered.set(unit.id,{...unit,order:{type:"dig"}});continue}
            if(oldGoal&&Math.hypot(oldGoal.x-objective.x,oldGoal.y-objective.y)<95)continue;
            const route=movementRoutePlan(scenario,citiesRef.current,unit,{x:unit.x,y:unit.y},objective,emplacementsRef.current,openWorldRef.current,
              moved.mode==="retreat"?[]:nextUnits.filter(u=>u.side!==unit.side));
            const [first,...rest]=route;
            ordered.set(unit.id,{...unit,order:first?{type:"move",targetX:first.x,targetY:first.y,waypoints:rest}:{type:"move",targetX:objective.x,targetY:objective.y}});
          }
        }
        if(ordered.size)nextUnits=nextUnits.map(unit=>ordered.get(unit.id)??unit);
        frontsRef.current=nextPlans;setFrontDirectives(nextPlans);
        lastOperationalRef.current=elapsedHoursRef.current;
      }
      if(elapsedHoursRef.current-lastIntelRef.current>=.8){
        const nextContacts=updateContacts(contactsRef.current,nextUnits,citiesRef.current,emplacementsRef.current,scenario,
          multiplayerRef.current?.side??playerSide,elapsedHoursRef.current);
        contactsRef.current=nextContacts;setContacts(nextContacts);
        const activeDecoys=decoysRef.current.filter(decoy=>decoy.expiresAt>elapsedHoursRef.current);
        if(activeDecoys.length!==decoysRef.current.length){decoysRef.current=activeDecoys;setDecoys(activeDecoys)}
        lastIntelRef.current=elapsedHoursRef.current;
      }
      if(!openWorldRef.current&&elapsedHoursRef.current>=96){
        for(const side of ["blue","red"] as Side[]){
          const original=initialCountRef.current[side];
          if(!original||nextUnits.filter(u=>u.side===side).length>=original*2/3)continue;
          if(elapsedHoursRef.current-lastReserveRef.current[side]<36)continue;
          const owned=citiesRef.current.filter(c=>c.owner===side),hostile=citiesRef.current.filter(c=>c.owner!==side);
          const rear=[...owned].sort((a,b)=>{
            const depth=(c:CityState)=>hostile.length?Math.min(...hostile.map(h=>Math.hypot(h.x-c.x,h.y-c.y))):0;
            return depth(b)-depth(a);
          })[0];
          if(!rear)continue;
          const pool=initialRosterRef.current.filter(u=>u.side===side);
          const reserves:Formation[]=[];
          for(let i=0;i<3;i++){
            const template=pool[(reserveSerialRef.current+i)%pool.length];
            const angle=(reserveSerialRef.current+i)*2.399963229728653,radius=16+((reserveSerialRef.current+i)%3)*10;
            const x=rear.x+Math.cos(angle)*radius,y=rear.y+Math.sin(angle)*radius;
            if(terrainAt(scenario,x,y).objective!==rear.name)continue;
            if(nextUnits.some(u=>u.side!==side&&Math.hypot(u.x-x,u.y-y)<170))continue;
            const nearest=nextUnits.filter(u=>u.side===side&&u.groupId).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
            reserves.push({...template,id:side[0]+"-reserve-"+reserveSerialRef.current+"-"+i,name:"Reserve "+template.name,
              x,y,groupId:nearest?.groupId??template.groupId,strength:100,supply:94,organization:85,fuel:94,entrenchment:0,order:{type:"defend"}});
          }
          if(reserves.length){nextUnits=[...nextUnits,...reserves];lastReserveRef.current[side]=elapsedHoursRef.current;reserveSerialRef.current++}
        }
      }
      if(openWorldRef.current){
        // Validate each completed recruit against the same supply state used by
        // the map, including interdicted roads, depots and logistics relays.
        // Cache network calculations lazily: no extra work on empty queues.
        let spawnNetwork:SupplyNetwork|null=null;
        let spawnLinks:ReturnType<typeof computeLogisticsLinks>|null=null;
        const hasSpawnSupply=(side:Side,kind:Formation["kind"],x:number,y:number)=>{
          const network=spawnNetwork??(spawnNetwork=computeSupplyNetwork(scenario,nextUnits,citiesRef.current));
          const links=spawnLinks??(spawnLinks=computeLogisticsLinks(scenario,nextUnits,citiesRef.current,network,emplacementsRef.current));
          return supplyAccess(scenario,{id:"recruitment-spawn-probe",side,kind,x,y},nextUnits,citiesRef.current,network,emplacementsRef.current,links,openWorldRef.current).level>0;
        };
        const ow=advanceOpenWorld(scenario,openWorldRef.current,nextUnits,citiesRef.current,simHours,hasSpawnSupply);
        openWorldRef.current=ow.state;setOpenWorld(ow.state);
        if(ow.spawned.length)nextUnits=[...nextUnits,...ow.spawned];
        if(ow.newCities.length){citiesRef.current=[...citiesRef.current,...ow.newCities];setCities(citiesRef.current)}
      }
      const batteryEffects:GunEvent[]=[];
      nextUnits=applyEmplacementFire(nextUnits,emplacementsRef.current,citiesRef.current,simHours,batteryEffects,now);
      if(batteryEffects.length){
        gunEffectsRef.current=[...gunEffectsRef.current,...batteryEffects].slice(-100);
        setGunEffects(gunEffectsRef.current);
      }
      const built=advanceConstruction(projectsRef.current,emplacementsRef.current,nextUnits,simHours);
      projectsRef.current=built.projects;emplacementsRef.current=built.emplacements;
      setConstructionProjects(built.projects);setEmplacements(built.emplacements);
      const nextCities=updateCities(citiesRef.current,nextUnits,simHours);
      if(historyRef.current){
        const previousIds=new Set(beforeEmplacements.map(e=>e.id));
        const constructed=built.emplacements.filter(e=>!previousIds.has(e.id)).map(e=>({side:e.side,kind:e.kind}));
        updateHistory(historyRef.current,beforeUnits,nextUnits,beforeCities,nextCities,elapsedHoursRef.current,simHours,openWorldRef.current,constructed);
      }
      unitsRef.current=nextUnits;citiesRef.current=nextCities;setUnits(nextUnits);setCities(nextCities);

      const owners=new Set(nextCities.map(c=>c.owner));
      if(!openWorldRef.current&&nextCities.length>0&&owners.size===1&&!warResultRef.current){
        const winner=nextCities[0].owner;warResultRef.current=winner;setWarResult(winner);setRunning(false);
        if(historyRef.current)setBattleReport(finishHistory(historyRef.current,elapsedHoursRef.current,nextUnits,nextCities,openWorldRef.current,"All strategic cities captured"));
      }

      setHour(prev=>{const total=prev+simHours;if(total>=24){setDay(d=>d+Math.floor(total/24));return total%24}return total});
    };
    const timer=window.setInterval(tick,SIM_TICK_MS);
    return()=>window.clearInterval(timer);
  },[scenario,running,speed]);

  useEffect(()=>{
    if(!scenario||!multiplayer?.isHost)return;
    const publish=()=>{
      const current=latestSnapshotRef.current;if(!current)return;
      sendNetwork("snapshot",{...current,seq:++snapshotSeqRef.current});
    };
    publish();
    const timer=window.setInterval(publish,300);
    return()=>window.clearInterval(timer);
  },[scenario,multiplayer?.roomId,multiplayer?.isHost]);

  function selectUnit(e:ReactMouseEvent,u:Formation){
    e.stopPropagation();
    if(!localSides.has(u.side)){
      if(pendingMassAttack){setMassTargets(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);return}
      if(pendingOrder==="assault"||pendingOrder==="fire"||pendingOrder==="probe")issueUnitTargetCore(u,false);
      return;
    }
    if(pendingOrder==="relieve"&&primary&&u.id!==primary.id){issueUnitTargetCore(u,false);return}
    if(e.shiftKey)setSelected(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id]);else setSelected([u.id]);
  }

  function startOrder(type:OrderType){
    if(!selected.length)return;
    setPendingBuild(null);setPendingMassAttack(false);setMassTargets([]);
    const selectedNow=units.filter(u=>selected.includes(u.id));
    if(type==="move"){setPendingOrder("move");setPendingPlan(false);return}
    if((type==="assault"||type==="probe")&&!selectedNow.some(u=>DIRECT_COMBAT_KINDS.has(u.kind)))return;
    if(type==="fire"&&!selectedNow.some(u=>ARTILLERY_KINDS.has(u.kind)))return;

    if(type==="retreat"){
      commitUnits(prev=>prev.map(u=>{
        if(!selected.includes(u.id)||u.supply<RETREAT_SUPPLY_MIN||!isInCombat(u,prev))return u;
        const d=retreatDestination(u,prev,citiesRef.current);
        return{...u,supply:clamp(u.supply-10,0,100),order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }));
      setPendingOrder(null);return;
    }

    if(type==="dig"||type==="resupply"||type==="defend"){
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,order:{type}}:u));setPendingOrder(null);
    }else setPendingOrder(type);
  }

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;if(el?.tagName==="INPUT"||el?.tagName==="TEXTAREA"||el?.isContentEditable)return;
      const key=e.key.toLowerCase();
      if(key==="escape"){setPendingDecoy(false);setPendingOrder(null);setPendingPlan(false);setPendingMassAttack(false);setMassTargets([]);setPendingBuild(null);setConstructionAnchor(null);setFrontToolActive(false);return}
      const digit=/^Digit([1-6])$/.exec(e.code);
      if(digit){
        const group=armyGroups[Number(digit[1])-1];
        if(e.ctrlKey){e.preventDefault();assignGroup(group.id)}else if(!e.metaKey&&!e.altKey){e.preventDefault();selectGroup(group.id)}
        return;
      }
      if(key==="b"){setPendingPlan(true);setPendingOrder(null);setPendingMassAttack(false);setPendingBuild(null);setConstructionAnchor(null);return}
      if(key==="y"&&selected.some(id=>units.some(u=>u.id===id&&u.kind==="recon"&&u.side===playerSide))){setPendingDecoy(true);setPendingOrder(null);setPendingPlan(false);return}
      if(key==="h"&&selected.length){setPendingMassAttack(true);setMassTargets([]);setPendingPlan(false);setPendingOrder(null);return}
      if(key==="enter"&&pendingMassAttack){launchGroupAttack();return}
      if(key==="m")startOrder("move");else if(key==="a")startOrder("assault");else if(key==="p")startOrder("probe");
      else if(key==="f")startOrder("fire");else if(key==="d")startOrder("defend");else if(key==="g")startOrder("dig");
      else if(key==="r")startOrder("resupply");else if(key==="t")startOrder("relieve");else if(key==="x")startOrder("retreat");
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[selected,units,cities,pendingMassAttack,massTargets]);

  function startGame(network?:MultiplayerSession){
    const seed=network?.seed??(typeof crypto!=="undefined"&&"getRandomValues" in crypto?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now()>>>0);
    const presetId=network?.presetId??selectedPresetId;
    const gameMode=network?"scenario":selectedGameMode;
    const activeSide=network?.side??playerSide;
    if(network){setPlayerSide(network.side);setSelectedPresetId(network.presetId);setSelectedGameMode("scenario")}
    let generated=generateScenario(seed,presetId);
    if(gameMode==="openworld")generated={...generated,presetId:"open-world",title:"Open World Dominion",historical:false,sideNames:{blue:"Blue Dominion",red:"Red Dominion",green:"Green Dominion"},sideFlags:{blue:"generic-blue",red:"generic-red",green:"generic-blue"}};
    warResultRef.current=null;setWarResult(null);setAttackPlans([]);setPendingPlan(false);setPendingMassAttack(false);setMassTargets([]);setFrontToolActive(false);setPendingOrder(null);setPendingBuild(null);setConstructionAnchor(null);setStrategicBuildAnchor(null);
    initialRosterRef.current=generated.formations;
    initialCountRef.current={blue:generated.formations.filter(u=>u.side==="blue").length,red:generated.formations.filter(u=>u.side==="red").length,green:0};
    elapsedHoursRef.current=0;lastReserveRef.current={blue:0,red:0,green:0};reserveSerialRef.current=1;
    frontsRef.current=[];setFrontDirectives([]);contactsRef.current=[];setContacts([]);
    decoysRef.current=[];setDecoys([]);setPendingDecoy(false);decoySerialRef.current=1;
    lastOperationalRef.current=0;lastEncirclementRef.current=0;lastIntelRef.current=0;
    setBattleReport(null);historyRef.current=null;
    setEmplacements([]);emplacementsRef.current=[];setConstructionProjects([]);projectsRef.current=[];setMobilePanel("none");
    if(gameMode==="openworld"){
      const ow=createOpenWorldState(generated,generated.formations,generated.cities);openWorldRef.current=ow.state;setOpenWorld(ow.state);
      setScenario(generated);setUnits(ow.units);unitsRef.current=ow.units;setCities(ow.cities);citiesRef.current=ow.cities;
      historyRef.current=startHistory(generated.title,seed,ow.units,ow.cities,ow.state);
    }else{
      openWorldRef.current=null;setOpenWorld(null);setScenario(generated);setUnits(generated.formations);unitsRef.current=generated.formations;
      setCities(generated.cities);citiesRef.current=generated.cities;
      historyRef.current=startHistory(generated.title,seed,generated.formations,generated.cities,null);
    }
    const first=generated.formations.find(u=>u.side===activeSide);setSelected(first?[first.id]:[]);
    const mapScale=generated.worldWidth/WORLD_W;setRunning(true);setSpeed(network?2:1);
    gunEffectsRef.current=[];setGunEffects([]);marchSerial.current=1;setHour(6);setDay(1);setPan({x:-260,y:-190});setZoom((isMobile ? .34 : .24)/mapScale);setMobilePanel("none");setMobileTool("pan");
  }

  function activateMultiplayer(session:MultiplayerSession){
    multiplayerRef.current=session;setMultiplayer(session);setPlayerSide(session.side);setSelectedPresetId(session.presetId);setSelectedGameMode("scenario");
    setMultiplayerTeamSize(session.teamSize);setNickname(session.nickname);setPendingInviteCode("");
    setNetworkPhase("waiting");setNetworkError("");
    setInviteLink(session.kind==="invite"&&session.isHost?inviteUrl(session.code):"");
  }

  async function beginQuickPlay(){
    if(selectedGameMode!=="scenario"||networkPhase==="matching")return;
    const playerName=nickname.trim();if(!playerName){setNetworkError("Choose a nickname");return}
    window.localStorage.setItem("kspiel.nickname",playerName);
    setNetworkPhase("matching");setNetworkError("");
    try{activateMultiplayer(await findQuickPlay(selectedPresetId,playerSide,multiplayerTeamSize,playerName))}
    catch(error){setNetworkError(error instanceof Error?error.message:"Quick Play failed");setNetworkPhase("error")}
  }

  async function beginPrivateMatch(){
    if(selectedGameMode!=="scenario"||networkPhase==="matching")return;
    const playerName=nickname.trim();if(!playerName){setNetworkError("Choose a nickname");return}
    window.localStorage.setItem("kspiel.nickname",playerName);
    setNetworkPhase("matching");setNetworkError("");
    try{activateMultiplayer(await createPrivateMatch(selectedPresetId,playerSide,multiplayerTeamSize,playerName))}
    catch(error){setNetworkError(error instanceof Error?error.message:"Could not create private match");setNetworkPhase("error")}
  }

  async function joinPendingInvite(){
    if(!pendingInviteCode||networkPhase==="matching")return;
    const playerName=nickname.trim();if(!playerName){setNetworkError("Choose a nickname");return}
    window.localStorage.setItem("kspiel.nickname",playerName);
    setNetworkPhase("matching");setNetworkError("");
    try{activateMultiplayer(await joinPrivateMatch(pendingInviteCode,playerSide,playerName))}
    catch(error){setNetworkError(error instanceof Error?error.message:"Could not join match");setNetworkPhase("error")}
  }

  function cancelMultiplayer(){
    const session=multiplayerRef.current;
    if(session)void closeMultiplayerRoom(session);
    multiplayerRef.current=null;setMultiplayer(null);networkStartedRef.current=false;setNetworkPhase("idle");setNetworkError("");setInviteLink("");setOnlinePlayers([]);
    window.history.replaceState(null,"",window.location.pathname+window.location.hash);
  }

  function concludeSession(){
    if(!scenario||multiplayerRef.current||!historyRef.current)return;
    if(!window.confirm("End this match and open the after-action statistics?"))return;
    setRunning(false);
    const completed=finishHistory(historyRef.current,elapsedHoursRef.current,unitsRef.current,citiesRef.current,openWorldRef.current,"Session ended by commander");
    setBattleReport({...completed});
  }

  function returnToSetup(){
    if(multiplayerRef.current)cancelMultiplayer();
    setRunning(false);setScenario(null);setUnits([]);unitsRef.current=[];setCities([]);citiesRef.current=[];
    setSelected([]);setAttackPlans([]);setWarResult(null);warResultRef.current=null;setPendingBuild(null);
    setBattleReport(null);historyRef.current=null;gunEffectsRef.current=[];setGunEffects([]);frontsRef.current=[];setFrontDirectives([]);decoysRef.current=[];setDecoys([]);
    setEmplacements([]);emplacementsRef.current=[];setConstructionProjects([]);projectsRef.current=[];setOpenWorld(null);openWorldRef.current=null;setPendingStrategicBuild(null);setStrategicBuildAnchor(null);
  }

  // Logarithmic zoom mapping keeps the color change perceptible on both
  // regular theaters and huge maps. At 0.1x territories are strong; at
  // 1.5x they are barely visible so units and terrain remain readable.
  const territoryZoomT=clamp(Math.log(Math.max(.1,zoom)/.1)/Math.log(15),0,1);
  const territoryZoomEase=territoryZoomT*territoryZoomT*(3-2*territoryZoomT);
  const territoryLayerOpacity=1-.88*territoryZoomEase;

  const {theaterTerritory,territoryPaths}=useTerritoryView(scenario,cities,units,openWorld);
  const viewportSize=useViewportSize(viewport,Boolean(scenario));

  if(!scenario){
    const presets=SCENARIO_PRESETS.filter(p=>setupCategory==="all"||
      (setupCategory==="historical"&&p.historical)||(setupCategory==="fictional"&&!p.historical)||
      (setupCategory==="mega"&&(p.mapScale??1)>=2)||(setupCategory==="guerrilla"&&p.warfare==="guerrilla"));
    const selectedPreset=SCENARIO_PRESETS.find(p=>p.id===selectedPresetId)??SCENARIO_PRESETS[0];
    return <main className="setup-shell">
      <MenuAtmosphere/>
      <div className="setup-panel">
        <div className="setup-brand"><BrandMark/><div className="setup-brand-identity"><b>KSPIEL</b><small>OPERATIONAL COMMAND SIMULATION</small></div><div className="menu-brand-actions"><span className="menu-build-tag">THE WAR ROOM</span><MenuScore/></div></div>
        <div className="setup-grid">
          <section className="setup-main">
            <div className="setup-heading"><small>FIELD OPERATIONS / NEW CAMPAIGN</small><h1>{selectedGameMode==="openworld"?"Build a dominion":"Choose a theater"}</h1><p>{selectedGameMode==="openworld"?"Expand territory, exploit resources automatically, build infrastructure and raise new armies against multiple rivals.":"Terrain now changes the roster, mobility, visibility and logistics. Historical presets are stylized scenarios, not exact order-of-battle reconstructions."}</p></div>
            <div className="setup-tabs"><button disabled={Boolean(multiplayer)} className={selectedGameMode==="scenario"?"active":""} onClick={()=>setSelectedGameMode("scenario")}>SCENARIO WAR</button><button disabled={Boolean(multiplayer)} className={selectedGameMode==="openworld"?"active":""} onClick={()=>{setSelectedGameMode("openworld");setSelectedPresetId("frontier")}}>OPEN WORLD</button></div>
            <div className="setup-tabs"><button className={setupCategory==="all"?"active":""} onClick={()=>setSetupCategory("all")}>ALL</button><button className={setupCategory==="fictional"?"active":""} onClick={()=>setSetupCategory("fictional")}>FICTIONAL</button><button className={setupCategory==="historical"?"active":""} onClick={()=>setSetupCategory("historical")}>HISTORICAL</button><button className={setupCategory==="mega"?"active":""} onClick={()=>setSetupCategory("mega")}>MEGA MAPS</button><button className={setupCategory==="guerrilla"?"active":""} onClick={()=>setSetupCategory("guerrilla")}>GUERRILLA</button></div>
            {selectedGameMode==="scenario"&&<div className="scenario-grid">{presets.map(preset=><button key={preset.id} disabled={Boolean(multiplayer)} className={"scenario-card theme-"+preset.theme+" "+(selectedPresetId===preset.id?"selected":"")} onClick={()=>{setSelectedPresetId(preset.id);setPlayerSide("blue")}}>
              <span className="scenario-theme">{preset.warfare==="guerrilla"?"⚑ GUERRILLA · ": (preset.mapScale??1)>=2?"◈ MEGA MAP · ":""}{preset.theme.toUpperCase()} · {preset.era.replace("_"," ").toUpperCase()}</span><b>{preset.title}</b><small>{preset.location}{preset.year?" · "+preset.year:""}</small><p>{preset.subtitle}</p>
              <span className="scenario-side-line"><span><Flag styleName={preset.sideFlags.blue}/>{preset.sideNames.blue}</span><i>VS</i><span><Flag styleName={preset.sideFlags.red}/>{preset.sideNames.red}</span></span>
            </button>)}</div>}
            {selectedGameMode==="openworld"&&<div className="openworld-intro"><b>OPEN WORLD DOMINION</b><p>Three rival powers. No fixed front. Territory itself is the objective.</p><span>Automatic regional resources · 3 barracks families · dynamic settlements · roads · walls · forts · generous supply · minimap</span></div>}
          </section>
          <aside className="setup-side">
            <div className="section-title">{selectedGameMode==="openworld"?"WORLD RULESET":"SELECTED THEATER"}</div><h2>{selectedGameMode==="openworld"?"Open World Dominion":selectedPreset.title}</h2><p>{selectedGameMode==="openworld"?"Procedural continental theater · three factions":selectedPreset.location+(selectedPreset.year?" · "+selectedPreset.year:"")}</p>
            <div className="setup-facts"><span><small>THEME</small><b>{selectedPreset.theme.toUpperCase()}</b></span><span><small>ERA</small><b>{selectedPreset.era.replace("_"," ").toUpperCase()}</b></span><span><small>MAP</small><b>{Math.round(WORLD_W*(selectedPreset.mapScale??1))} × {Math.round(WORLD_H*(selectedPreset.mapScale??1))}</b></span><span><small>FOG</small><b>ENABLED</b></span></div>
            <div className="section-title">{pendingInviteCode?"CHOOSE TEAM":"PLAY AS"}</div><div className="side-choice">
              {(["blue","red"] as Side[]).map(side=><button key={side} disabled={Boolean(multiplayer)} className={playerSide===side?"active":""} onClick={()=>setPlayerSide(side)}><Flag styleName={selectedPreset.sideFlags[side]??"generic-blue"}/><span><b>{pendingInviteCode?side.toUpperCase()+" TEAM":selectedPreset.sideNames[side]}</b><small>{pendingInviteCode?"Shared command of the entire "+side+" force":selectedPreset.warfare==="guerrilla"?(side==="blue"?"PARTISANS · MILITIA · RAIDERS":"GARRISONS · PATROLS · ARMOR"):selectedPreset.id==="spain-1937"?(side==="blue"?"REPUBLICAN COMMAND":"NATIONALIST COMMAND"):(side==="blue"?"BLUE THEATER COMMAND":"RED THEATER COMMAND")}</small></span></button>)}
            </div>
            <div className="section-title">COMMANDER</div>
            <div className="nickname-field"><input maxLength={20} placeholder="Nickname" value={nickname} disabled={Boolean(multiplayer)} onChange={e=>{const value=e.target.value;setNickname(value);window.localStorage.setItem("kspiel.nickname",value)}}/><small>1–20 characters · shown to both teams</small></div>
            {!pendingInviteCode&&<><div className="section-title">TEAM SIZE</div><div className="team-size-choice">{([1,2,3] as MultiplayerTeamSize[]).map(size=><button key={size} disabled={Boolean(multiplayer)} className={multiplayerTeamSize===size?"active":""} onClick={()=>setMultiplayerTeamSize(size)}>{size}V{size}</button>)}</div>
            <div className="section-title">GAME MODE</div><div className="mode-list">
              <button disabled={Boolean(multiplayer)} className={!multiplayer?"active":""}><b>SINGLE PLAYER</b><small>You command {selectedPreset.sideNames[playerSide]}</small></button>
              <button disabled={selectedGameMode==="openworld"||Boolean(multiplayer)||networkPhase==="matching"||!nickname.trim()} onClick={()=>void beginQuickPlay()}><b>QUICK PLAY · {multiplayerTeamSize}V{multiplayerTeamSize}</b><small>{selectedGameMode==="openworld"?"Scenario mode only":"Queue for "+multiplayerTeamSize+" commanders on each team"}</small></button>
              <button disabled={selectedGameMode==="openworld"||Boolean(multiplayer)||networkPhase==="matching"||!nickname.trim()} onClick={()=>void beginPrivateMatch()}><b>PRIVATE MATCH · {multiplayerTeamSize}V{multiplayerTeamSize}</b><small>{selectedGameMode==="openworld"?"Scenario mode only":"Create a room and share one link with every player"}</small></button>
            </div></>}
            {pendingInviteCode&&!multiplayer&&<div className="invite-join-card"><b>INVITE ROOM · {pendingInviteCode}</b><small>Pick a nickname and either team. Everyone on a team can command the full army.</small><div className="invite-actions"><button disabled={networkPhase==="matching"||!nickname.trim()} onClick={()=>void joinPendingInvite()}>JOIN ROOM</button><button onClick={()=>{setPendingInviteCode("");setNetworkError("")}}>DISMISS</button></div></div>}
            {multiplayer&&<div className={"network-lobby "+networkPhase}><div><span><b>{networkPhase==="connected"?"ALL COMMANDERS CONNECTED":networkPhase==="opponent-left"?"PLAYER DISCONNECTED":multiplayer.kind==="quickplay"?"QUICK PLAY QUEUE":"PRIVATE ROOM"}</b><small>ROOM {multiplayer.code} · {multiplayer.teamSize}V{multiplayer.teamSize} · {multiplayer.nickname} · {multiplayer.side.toUpperCase()} TEAM</small></span><strong>{onlinePlayers.length}/{multiplayer.maxPlayers}</strong></div><div className="lobby-roster">{(["blue","red"] as Side[]).map(side=><div key={side}><b>{side.toUpperCase()} TEAM</b>{onlinePlayers.filter(player=>player.side===side).sort((a,b)=>a.slot-b.slot).map(player=><small key={player.token}>{player.slot}. {player.nickname}{player.token===multiplayer.playerToken?" · YOU":""}</small>)}{onlinePlayers.filter(player=>player.side===side).length<multiplayer.teamSize&&<small>Waiting for {multiplayer.teamSize-onlinePlayers.filter(player=>player.side===side).length}…</small>}</div>)}</div>{inviteLink&&<div className="invite-link"><input aria-label="Invite link" readOnly value={inviteLink}/><button onClick={()=>void navigator.clipboard.writeText(inviteLink)}>COPY LINK</button></div>}<button className="cancel-network" onClick={cancelMultiplayer}>CANCEL</button></div>}
            {networkPhase==="matching"&&<div className="network-lobby matching"><b>CONNECTING TO MATCHMAKING…</b><small>Preparing Supabase Realtime session.</small></div>}
            {networkError&&<div className="network-error">{networkError==="team_full"?"That team is full. Pick the other team.":networkError==="room_unavailable"?"That room is full, closed, or expired.":networkError}</div>}
            <button className="launch-button" disabled={Boolean(multiplayer)||networkPhase==="matching"||Boolean(pendingInviteCode)} onClick={()=>startGame()}>{selectedGameMode==="openworld"?"FOUND DOMINION":"DEPLOY TO THEATER"}</button>
          </aside>
        </div>
      </div>
    </main>;
  }
  const activeScenario:Scenario=scenario;
  const mapW=activeScenario.worldWidth,mapH=activeScenario.worldHeight;
  const savedNetwork=networkViewRef.current;
  const currentSupplyNetwork=savedNetwork&&savedNetwork.scenario===activeScenario&&savedNetwork.units===units&&savedNetwork.cities===cities
    ?savedNetwork.value:computeSupplyNetwork(activeScenario,units,cities);
  networkViewRef.current={scenario:activeScenario,units,cities,value:currentSupplyNetwork};

  function mapPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return null;
    return{x:(clientX-rect.left-pan.x)/zoom,y:(clientY-rect.top-pan.y)/zoom};
  }

  function viewportPoint(clientX:number,clientY:number){
    const rect=viewport.current?.getBoundingClientRect();return rect?{x:clientX-rect.left,y:clientY-rect.top}:null;
  }

  function boundedPan(next:{x:number;y:number},z=zoom){
    const rect=viewport.current?.getBoundingClientRect();if(!rect)return next;
    const worldW=mapW*z,worldH=mapH*z;
    return{x:worldW<=rect.width?(rect.width-worldW)/2:clamp(next.x,rect.width-worldW,0),y:worldH<=rect.height?(rect.height-worldH)/2:clamp(next.y,rect.height-worldH,0)};
  }

  function nearestLandPoint(x:number,y:number){
    const cx=clamp(x,2,mapW-2),cy=clamp(y,2,mapH-2);if(terrainAt(activeScenario,cx,cy).terrain!=="water")return{x:cx,y:cy};
    for(let radius=18;radius<=270;radius+=18)for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2,nx=clamp(cx+Math.cos(a)*radius,2,mapW-2),ny=clamp(cy+Math.sin(a)*radius,2,mapH-2);
      if(terrainAt(activeScenario,nx,ny).terrain!=="water")return{x:nx,y:ny};
    }
    return{x:cx,y:cy};
  }

  function deployFront(start:{x:number;y:number},end:{x:number;y:number}){
    const lead=units.find(u=>u.id===selected[0]);
    const chosen=lead?.groupId?units.filter(u=>u.side===lead.side&&u.groupId===lead.groupId):units.filter(u=>selected.includes(u.id));
    if(chosen.length<2)return;
    const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);if(length<80)return;
    const tx=dx/length,ty=dy/length,mid={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
    const threat=units.filter(u=>u.side!==chosen[0].side).sort((a,b)=>Math.hypot(a.x-mid.x,a.y-mid.y)-Math.hypot(b.x-mid.x,b.y-mid.y))[0];
    const sign=threat&&((threat.x-mid.x)*(-ty)+(threat.y-mid.y)*tx)<0?-1:1;
    const normal={x:-ty*sign,y:tx*sign};
    const depth=(u:Formation)=>u.kind==="logistics"?-360:u.kind==="heavy_artillery"?-310
      :u.kind==="artillery"?-255:u.kind==="mortar"?-165:u.kind==="engineer"?-85
      :u.kind==="recon"?35:u.kind==="tank"||u.kind==="armor"?-12:u.kind==="mechanized"?8:42;
    const targets=new Map<string,{x:number;y:number}>(),rows=new Map<number,Formation[]>();
    for(const u of chosen){const d=depth(u),row=rows.get(d)??[];row.push(u);rows.set(d,row)}
    for(const [d,row] of rows){
      row.sort((a,b)=>(a.x-b.x)*tx+(a.y-b.y)*ty);
      row.forEach((u,i)=>{const t=(i+1)/(row.length+1);targets.set(u.id,nearestLandPoint(start.x+dx*t+normal.x*d,start.y+dy*t+normal.y*d))});
    }
    // Form a rear-city-to-front relay chain with hops shorter than logistics range.
    const logistics=chosen.filter(u=>u.kind==="logistics");
    const city=cities.filter(c=>c.owner===chosen[0].side).sort((a,b)=>Math.hypot(a.x-mid.x,a.y-mid.y)-Math.hypot(b.x-mid.x,b.y-mid.y))[0];
    if(city&&logistics.length){
      const head=nearestLandPoint(mid.x-normal.x*320,mid.y-normal.y*320);
      const toHead=Math.hypot(head.x-city.x,head.y-city.y);
      if(toHead>1){
        const hop=Math.min(760,toHead/(logistics.length+1));
        logistics.forEach((u,i)=>{
          const part=Math.min(1,(i+1)*hop/toHead);
          targets.set(u.id,nearestLandPoint(city.x+(head.x-city.x)*part,city.y+(head.y-city.y)*part));
        });
      }
    }
    commitUnits(prev=>prev.map(u=>{
      const target=targets.get(u.id);if(!target)return u;
      const route=movementRoutePlan(activeScenario,cities,u,{x:u.x,y:u.y},target,emplacementsRef.current,openWorldRef.current);
      const [first,...rest]=route;
      return{...u,formationShape:"line",order:first?{type:"move",targetX:first.x,targetY:first.y,waypoints:rest}:{type:"move",targetX:target.x,targetY:target.y}};
    }));
    const engineers=chosen.filter(u=>u.kind==="engineer").sort((a,b)=>(a.x-b.x)*tx+(a.y-b.y)*ty);
    const actor=multiplayerRef.current?.playerToken.slice(0,8)??"local",projects:ConstructionProject[]=[];
    engineers.forEach((u,i)=>{
      const t=(i+.5)/engineers.length,center=nearestLandPoint(start.x+dx*t-normal.x*70,start.y+dy*t-normal.y*70);
      const half=Math.min(185,length/Math.max(2,engineers.length*2));
      const a=nearestLandPoint(center.x-tx*half,center.y-ty*half),b=nearestLandPoint(center.x+tx*half,center.y+ty*half);
      if([a,b].some(p=>["water","highmountain"].includes(terrainAt(activeScenario,p.x,p.y).terrain)))return;
      const kind:EmplacementKind=engineers.length>1&&i%2===1?"barricade":"trench";
      projects.push({id:"front-"+chosen[0].side+"-"+actor+"-"+buildCounter.current++,kind,side:u.side,
        x:a.x,y:a.y,x2:b.x,y2:b.y,builderIds:[u.id],progress:0,
        requiredHours:(kind==="trench"?10:12)+half*2*(kind==="trench"?.02:.024)});
    });
    if(projects.length){
      const next=[...projectsRef.current,...projects];projectsRef.current=next;setConstructionProjects(next);
      if(multiplayerRef.current&&!multiplayerRef.current.isHost)for(const project of projects)sendNetwork("construction-create",{project});
    }
    const cx=(start.x+end.x)/2,cy=(start.y+end.y)/2,flen=Math.max(1,Math.hypot(end.x-start.x,end.y-start.y));
    const closest=[...units.filter(u=>u.side!==chosen[0].side)].sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];
    const facing:1|-1=closest&&((closest.x-cx)*(-(end.y-start.y)/flen)+(closest.y-cy)*((end.x-start.x)/flen))<0?-1:1;
    const front:FrontDirective={id:"front-"+chosen[0].side+"-"+(chosen[0].groupId??"field"),side:chosen[0].side,
      groupId:chosen[0].groupId??chosen[0].side+"-army-1",start,end,mode:"hold",facing,
      lastIssued:elapsedHoursRef.current,createdAt:elapsedHoursRef.current,reserveFraction:.22};
    const nextFronts=[...frontsRef.current.filter(f=>f.groupId!==front.groupId),front];
    frontsRef.current=nextFronts;setFrontDirectives(nextFronts);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("front-upsert",{front});
    if(historyRef.current)addBattleEvent(historyRef.current,{hour:elapsedHoursRef.current,side:front.side,kind:"front",title:"Army front established"});
    setPendingOrder(null);setFrontToolActive(false);
  }

  function changeFrontMode(groupId:string,mode:FrontMode|"stop"){
    const current=frontsRef.current.find(front=>front.groupId===groupId&&front.side===playerSide);
    if(!current)return;
    if(mode==="stop"){
      const next=frontsRef.current.filter(front=>front.groupId!==groupId);
      frontsRef.current=next;setFrontDirectives(next);
      if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("front-remove",{groupId});
      return;
    }
    const front={...current,mode,lastIssued:elapsedHoursRef.current-4};
    const next=frontsRef.current.map(f=>f.id===front.id?front:f);
    frontsRef.current=next;setFrontDirectives(next);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("front-upsert",{front});
    if(historyRef.current)addBattleEvent(historyRef.current,{hour:elapsedHoursRef.current,side:front.side,kind:"front",title:"Front posture: "+mode.toUpperCase()});
  }

  function assignGroup(groupId:string){
    if(!selected.length)return;
    commitUnits(prev=>prev.map(u=>selected.includes(u.id)?{...u,groupId}:u));
  }

  function selectGroup(groupId:string){
    setSelected(units.filter(u=>localSides.has(u.side)&&u.groupId===groupId).map(u=>u.id));
    setPendingOrder(null);setPendingPlan(false);setPendingMassAttack(false);setMassTargets([]);setPendingBuild(null);
  }

  function launchGroupAttack(){
    const group=primary?.groupId;
    const force=units.filter(u=>u.side===playerSide&&(group?u.groupId===group:selected.includes(u.id)));
    const targets=units.filter(u=>massTargets.includes(u.id)&&u.side!==playerSide&&u.strength>1);
    if(group&&frontsRef.current.some(f=>f.groupId===group))changeFrontMode(group,"stop");
    if(!force.length||!targets.length)return;
    const load=new Map<string,number>(targets.map(t=>[t.id,0]));
    const assignments=new Map<string,Formation>();
    for(const u of force){
      const target=[...targets].sort((a,b)=>{
        const cost=(t:Formation)=>Math.hypot(t.x-u.x,t.y-u.y)/Math.max(1,u.speed)+(load.get(t.id)??0)*100;
        return cost(a)-cost(b);
      })[0];
      assignments.set(u.id,target);load.set(target.id,(load.get(target.id)??0)+1);
    }
    commitUnits(prev=>prev.map(u=>{
      const target=assignments.get(u.id);if(!target)return u;
      const artillery=ARTILLERY_KINDS.has(u.kind),support=u.kind==="logistics";
      const standOff=support?440:u.kind==="heavy_artillery"?680:u.kind==="artillery"?450:u.kind==="mortar"?750:34;
      const dx=u.x-target.x,dy=u.y-target.y,distance=Math.max(1,Math.hypot(dx,dy));
      const staging=nearestLandPoint(target.x+dx/distance*standOff,target.y+dy/distance*standOff);
      if(artillery&&distance<=standOff*1.08)return{...u,order:{type:"fire",targetUnitId:target.id}};
      const path=movementRoutePlan(activeScenario,cities,u,{x:u.x,y:u.y},staging,emplacementsRef.current,openWorldRef.current,units);
      const [first,...rest]=path;
      const finalType:OrderType=artillery?"fire":support?"resupply":"assault";
      if(!first)return{...u,order:artillery?{type:"fire",targetUnitId:target.id}:support?{type:"resupply"}:{type:"assault",targetUnitId:target.id}};
      return{...u,order:{type:"move",targetX:first.x,targetY:first.y,waypoints:rest,finalType,finalTargetUnitId:support?undefined:target.id}};
    }));
    setMassTargets([]);setPendingMassAttack(false);
  }

  function arrangeFormation(shape:FormationShape){
    const chosen=units.filter(u=>selected.includes(u.id));if(chosen.length<2)return;
    const cx=chosen.reduce((s,u)=>s+u.x,0)/chosen.length,cy=chosen.reduce((s,u)=>s+u.y,0)/chosen.length;
    const nearest=enemy.map(v=>({v,d:Math.hypot(v.x-cx,v.y-cy)})).sort((a,b)=>a.d-b.d)[0]?.v;
    const hx=nearest?(nearest.x-cx)/(Math.hypot(nearest.x-cx,nearest.y-cy)||1):1;
    const hy=nearest?(nearest.y-cy)/(Math.hypot(nearest.x-cx,nearest.y-cy)||1):0;
    const px=-hy,py=hx;
    const targets=new Map<string,{x:number;y:number}>();
    chosen.forEach((u,i)=>{
      const centered=i-(chosen.length-1)/2;let along=0,lateral=0;
      if(shape==="line")lateral=centered*95;
      else if(shape==="column")along=centered*82;
      else if(shape==="echelon"){lateral=centered*82;along=-centered*48}
      else{
        const rank=Math.floor(Math.sqrt(i)),rankStart=rank*rank,pos=i-rankStart;
        lateral=(pos-rank/2)*105;along=-rank*90;
      }
      targets.set(u.id,nearestLandPoint(cx+hx*along+px*lateral,cy+hy*along+py*lateral));
    });
    commitUnits(prev=>prev.map(u=>{const t=targets.get(u.id);return t?{...u,formationShape:shape,order:{type:"move",targetX:t.x,targetY:t.y}}:u}));
  }

  function createAttackPlan(tx:number,ty:number){
    const chosen=units.filter(u=>selected.includes(u.id));if(!chosen.length)return;
    const side=chosen[0].side,actor=multiplayerRef.current?.playerToken.slice(0,8)??"local",id="plan-"+side+"-"+actor+"-"+planCounter.current++;
    const plan:AttackPlan={id,name:"OP "+String(planCounter.current-1).padStart(2,"0"),side,formationIds:chosen.map(u=>u.id),targetX:tx,targetY:ty,status:"draft"};
    setAttackPlans(prev=>[...prev,plan]);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-upsert",{plan});
    setPendingPlan(false);setPendingBuild(null);
  }

  function executePlan(id:string){
    const plan=attackPlans.find(p=>p.id===id);if(!plan)return;
    const chosen=plan.formationIds;
    commitUnits(prev=>prev.map(u=>{
      if(!chosen.includes(u.id))return u;
      const i=chosen.indexOf(u.id),angle=(i%7)/7*Math.PI*2,r=35+18*Math.floor(i/7);
      const t=nearestLandPoint(plan.targetX+Math.cos(angle)*r,plan.targetY+Math.sin(angle)*r);
      return{...u,order:{type:DIRECT_COMBAT_KINDS.has(u.kind)?"assault":"move",targetX:t.x,targetY:t.y}};
    }));
    const executing:AttackPlan={...plan,status:"executing"};
    setAttackPlans(prev=>prev.map(p=>p.id===id?executing:p));
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-upsert",{plan:executing});
  }

  function cancelPlan(id:string){
    const plan=attackPlans.find(p=>p.id===id);
    setAttackPlans(prev=>prev.filter(p=>p.id!==id));
    if(plan&&multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("plan-delete",{id});
  }

  function planOrigin(plan:AttackPlan){
    const force=units.filter(u=>plan.formationIds.includes(u.id));
    return force.length?{x:force.reduce((s,u)=>s+u.x,0)/force.length,y:force.reduce((s,u)=>s+u.y,0)/force.length}:{x:plan.targetX,y:plan.targetY};
  }

  function armConstruction(kind:EmplacementKind){
    const builders=selectedUnits.filter(u=>localSides.has(u.side)&&(kind!=="road"||u.kind==="logistics"));
    if(!builders.length)return;
    setPendingBuild(kind);setConstructionAnchor(null);setPendingOrder(null);setPendingPlan(false);
  }

  function createConstruction(tx:number,ty:number){
    if(!pendingBuild)return;
    const builders=selectedUnits.filter(u=>localSides.has(u.side)&&(pendingBuild!=="road"||u.kind==="logistics"));
    if(!builders.length){setPendingBuild(null);setConstructionAnchor(null);return}
    const terrain=terrainAt(activeScenario,tx,ty).terrain;
    if(terrain==="water"||terrain==="highmountain")return;

    if(isLinearConstruction(pendingBuild)&&!constructionAnchor){
      setConstructionAnchor({x:tx,y:ty});
      return;
    }

    const start=isLinearConstruction(pendingBuild)?constructionAnchor!:{x:tx,y:ty};
    const end=isLinearConstruction(pendingBuild)?{x:tx,y:ty}:undefined;
    const length=end?Math.hypot(end.x-start.x,end.y-start.y):0;
    if(end&&length<70)return;
    if(end){
      const midTerrain=terrainAt(activeScenario,(start.x+end.x)*.5,(start.y+end.y)*.5).terrain;
      if(midTerrain==="water"||midTerrain==="highmountain")return;
    }

    const actor=multiplayerRef.current?.playerToken.slice(0,8)??"local";
    const id="build-"+playerSide+"-"+actor+"-"+buildCounter.current++;
    const requiredHours=pendingBuild==="observatory"?26
      :pendingBuild==="fixed_artillery"?50
      :pendingBuild==="field_fortification"?18
      :pendingBuild==="supply_depot"?34
      :pendingBuild==="trench"?10+length*.02
      :pendingBuild==="barricade"?12+length*.024
      :18+length*.045;
    const project:ConstructionProject={
      id,kind:pendingBuild,side:builders[0].side,x:start.x,y:start.y,x2:end?.x,y2:end?.y,builderIds:builders.map(u=>u.id),progress:0,requiredHours
    };
    const next=[...projectsRef.current,project];projectsRef.current=next;setConstructionProjects(next);
    if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("construction-create",{project});
    const workX=end?(start.x+end.x)*.5:start.x,workY=end?(start.y+end.y)*.5:start.y;
    commitUnits(prev=>prev.map(u=>project.builderIds.includes(u.id)?{...u,order:{type:"move",targetX:workX,targetY:workY}}:u));
    setPendingBuild(null);setConstructionAnchor(null);
  }

  function issueMapTargetAt(clientX:number,clientY:number,append=false){
    if(!selected.length&&!pendingStrategicBuild)return;
    if(pendingMassAttack)return;
    if((pendingOrder==="assault"||pendingOrder==="relieve")&&!pendingStrategicBuild)return;
    const point=mapPoint(clientX,clientY);if(!point)return;
    const tx=clamp(point.x,1,mapW-1),ty=clamp(point.y,1,mapH-1);const targetTerrain=terrainAt(activeScenario,tx,ty).terrain;if(targetTerrain==="water")return;
    if(pendingDecoy){
      const recon=selectedUnits.find(u=>u.side===playerSide&&u.kind==="recon"&&u.supply>8&&Math.hypot(u.x-tx,u.y-ty)<780);
      if(!recon)return;
      const decoy:DecoyContact={id:"decoy-"+playerSide+"-"+decoySerialRef.current++,owner:playerSide,x:tx,y:ty,kind:"infantry",
        createdAt:elapsedHoursRef.current,expiresAt:elapsedHoursRef.current+20};
      const next=[...decoysRef.current,decoy].slice(-32);decoysRef.current=next;setDecoys(next);
      if(multiplayerRef.current&&!multiplayerRef.current.isHost)sendNetwork("decoy-create",{decoy});
      if(historyRef.current)addBattleEvent(historyRef.current,{hour:elapsedHoursRef.current,side:playerSide,kind:"intel",title:"Recon deception deployed"});
      setPendingDecoy(false);return;
    }
    if(pendingStrategicBuild&&openWorldRef.current){
      if(pendingStrategicBuild==="city"){
        if(targetTerrain==="mountain"||targetTerrain==="highmountain"||citiesRef.current.some(c=>Math.hypot(c.x-tx,c.y-ty)<360))return;
        const built=buildStrategicCity(openWorldRef.current,playerSide);
        if(!built.built)return;
        const city:CityState={name:"Founded "+built.state.serial,x:tx,y:ty,owner:playerSide,capture:0};
        openWorldRef.current=built.state;setOpenWorld(built.state);citiesRef.current=[...citiesRef.current,city];setCities(citiesRef.current);
        setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return;
      }
      if(pendingStrategicBuild==="road"||pendingStrategicBuild==="wall"){
        if(!strategicBuildAnchor){setStrategicBuildAnchor({x:tx,y:ty});return}
        if(Math.hypot(tx-strategicBuildAnchor.x,ty-strategicBuildAnchor.y)<60)return;
        const next=addStrategicStructure(openWorldRef.current,playerSide,pendingStrategicBuild,strategicBuildAnchor.x,strategicBuildAnchor.y,tx,ty);
        openWorldRef.current=next;setOpenWorld(next);setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return;
      }
      const next=addStrategicStructure(openWorldRef.current,playerSide,pendingStrategicBuild,tx,ty);
      openWorldRef.current=next;setOpenWorld(next);setPendingStrategicBuild(null);setStrategicBuildAnchor(null);return
    }
    if(pendingBuild){createConstruction(tx,ty);return}
    if(pendingPlan){createAttackPlan(tx,ty);return}
    const requested=pendingOrder;
    // Selected armies march as a temporary cohesive column, not an army-group reassignment.
    const chosen=units.filter(u=>selected.includes(u.id)&&u.side===playerSide);
    const coordinated=!append&&(requested===null||requested==="move")&&
      chosen.filter(u=>!AMMO_TYPES.has(u.kind)&&u.kind!=="logistics").length>=2;
    const slots=coordinated?marchSlots(chosen,{x:tx,y:ty},marchShape):new Map<string,{x:number;y:number}>();
    const marchId=coordinated?"march-"+playerSide+"-"+(multiplayerRef.current?.playerToken.slice(0,8)??"local")+"-"+marchSerial.current++:undefined;
    commitUnits(prev=>{
      return prev.map(u=>{
        if(!selected.includes(u.id))return u;
        if(append&&u.order?.targetX!==undefined&&u.order?.targetY!==undefined&&!u.order.targetUnitId){
          const tail=u.order.waypoints?.length?u.order.waypoints[u.order.waypoints.length-1]:{x:u.order.targetX,y:u.order.targetY};
          const leg=movementRoutePlan(activeScenario,cities,u,tail,{x:tx,y:ty},emplacementsRef.current,openWorldRef.current);
          return{...u,order:{...u.order,waypoints:[...(u.order.waypoints??[]),...leg]}};
        }
        if(requested==="fire"){
          if(u.kind!=="mortar")return u;
          const range=Math.hypot(tx-u.x,ty-u.y);
          if(range>mortarMaxRange(activeScenario,u))return u;
          return{...u,order:{type:"fire",targetX:tx,targetY:ty}};
        }
        if(requested==="probe"&&DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:"probe",targetX:tx,targetY:ty}};
        const slot=slots.get(u.id);
        const candidate=slot?nearestLandPoint(slot.x,slot.y):{x:tx,y:ty};
        const destination=terrainAt(activeScenario,candidate.x,candidate.y).terrain==="water"?{x:tx,y:ty}:candidate;
        const route=movementRoutePlan(activeScenario,cities,u,{x:u.x,y:u.y},destination,emplacementsRef.current,openWorldRef.current);
        const [first,...rest]=route;
        const inColumn=Boolean(marchId)&&!AMMO_TYPES.has(u.kind)&&u.kind!=="logistics";
        const marchMeta=inColumn?{
          marchId,marchGoalX:destination.x,marchGoalY:destination.y,
          marchInitialDistance:Math.max(1,Math.hypot(destination.x-u.x,destination.y-u.y))
        }:{};
        const order:NonNullable<Formation["order"]>=first
          ?{type:"move",targetX:first.x,targetY:first.y,waypoints:rest,...marchMeta}
          :{type:"move",targetX:destination.x,targetY:destination.y,...marchMeta};
        return{...u,order};
      });
    });
    if(!append)setPendingOrder(null);
  }

  function suppressNativeContextMenu(e:ReactMouseEvent){
    e.preventDefault();
  }

  function issueTarget(e:ReactMouseEvent){
    e.preventDefault();
    if(suppressContextMenu.current){suppressContextMenu.current=false;return}
    issueMapTargetAt(e.clientX,e.clientY,e.shiftKey||e.ctrlKey);
  }

  function issueUnitTargetCore(target:Formation,allowDefaultMove:boolean){
    if(!selected.length||selected.includes(target.id))return;
    if(pendingMassAttack&&target.side!==playerSide){setMassTargets(prev=>prev.includes(target.id)?prev.filter(id=>id!==target.id):[...prev,target.id]);return}
    const requested=pendingOrder;
    if(!requested&&!allowDefaultMove)return;

    if(requested==="relieve"){
      if(!primary||target.side!==primary.side)return;
      commitUnits(prev=>prev.map(u=>selected.includes(u.id)&&DIRECT_COMBAT_KINDS.has(u.kind)?{...u,order:{type:"relieve",targetUnitId:target.id}}:u));
      setPendingOrder(null);return;
    }

    if((requested==="assault"||requested==="fire"||requested==="probe")&&primary&&target.side===primary.side)return;
    commitUnits(prev=>prev.map(u=>{
      if(!selected.includes(u.id))return u;
      if(requested==="fire")return u.kind==="mortar"?{...u,order:{type:"fire",targetX:target.x,targetY:target.y}}:GUN_ARTILLERY_KINDS.has(u.kind)?{...u,order:{type:"fire",targetUnitId:target.id}}:u;
      if(requested==="assault"||requested==="probe"){
        if(ARTILLERY_KINDS.has(u.kind))return{...u,order:{type:"fire",targetUnitId:target.id}};
        if(DIRECT_COMBAT_KINDS.has(u.kind))return{...u,order:{type:requested,targetUnitId:target.id}};
        return u;
      }
      return{...u,order:{type:"move",targetUnitId:target.id}};
    }));
    setPendingOrder(null);
  }

  function issueUnitTarget(e:ReactMouseEvent,target:Formation){
    e.preventDefault();e.stopPropagation();issueUnitTargetCore(target,true);
  }

  function onWheel(e:ReactWheelEvent<HTMLDivElement>){
    e.preventDefault();const rect=viewport.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top,next=clamp(zoom*(e.deltaY>0?.9:1.1),.1,1.5),wx=(mx-pan.x)/zoom,wy=(my-pan.y)/zoom;
    setZoom(next);setPan(boundedPan({x:mx-wx*next,y:my-wy*next},next));
  }

  function beginPinch(){
    if(longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null}
    const rect=viewport.current?.getBoundingClientRect();
    const points=[...touchPoints.current.values()];
    if(!rect||points.length<2)return;
    const [a,b]=points;
    const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
    const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
    pinch.current={distance,zoom,worldX:(midX-pan.x)/zoom,worldY:(midY-pan.y)/zoom};
    drag.current=null;setSelectionBox(null);setFrontPreview(null);
  }

  function onPointerDown(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"){
      e.preventDefault();
      touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      e.currentTarget.setPointerCapture(e.pointerId);
      if(touchPoints.current.size>=2){beginPinch();return}
      const screen=viewportPoint(e.clientX,e.clientY);if(!screen)return;
      const targeting=Boolean(pendingOrder||pendingPlan||pendingMassAttack||pendingDecoy||pendingBuild||pendingStrategicBuild);
      const mode:"pan"|"front"|"target"=targeting?"target":mobileTool==="front"&&selected.length>0?"front":"pan";
      drag.current={mode,startClientX:e.clientX,startClientY:e.clientY,px:pan.x,py:pan.y,moved:false};
      if(mode==="front")setFrontPreview({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
      if(mode==="pan"){
        if(longPressTimer.current)clearTimeout(longPressTimer.current);
        longPressTimer.current=setTimeout(()=>{
          const active=drag.current;
          if(!active||active.mode!=="pan"||active.moved||touchPoints.current.size!==1)return;
          active.mode="box";
          setSelectionBox({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
          longPressTimer.current=null;
        },340);
      }
      return;
    }

    if(e.button>2)return;const screen=viewportPoint(e.clientX,e.clientY);if(!screen)return;
    let mode:"pan"|"box"|"front"|"select"="select";
    if(e.button===1)mode="pan";
    else if(e.button===0&&(e.ctrlKey||frontToolActive)&&selected.length>0)mode="front";
    else if(e.button===0)mode="box";
    else return;
    if(mode==="pan")e.preventDefault();
    drag.current={mode,startClientX:e.clientX,startClientY:e.clientY,px:pan.x,py:pan.y,moved:false};
    if(mode==="box")setSelectionBox({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
    if(mode==="front")setFrontPreview({x1:screen.x,y1:screen.y,x2:screen.x,y2:screen.y});
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e:ReactPointerEvent<HTMLDivElement>){
    const now=performance.now();
    if(now-lastPointerSample.current>=70){
      lastPointerSample.current=now;
      const point=mapPoint(e.clientX,e.clientY);
      if(point){setHovered(terrainAt(activeScenario,point.x,point.y));setAimPoint({x:point.x,y:point.y})}
    }

    if(e.pointerType==="touch"){
      if(touchPoints.current.has(e.pointerId))touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pinch.current&&touchPoints.current.size>=2){
        const rect=viewport.current?.getBoundingClientRect(),points=[...touchPoints.current.values()];if(!rect||points.length<2)return;
        const [a,b]=points,distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
        const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
        const nextZoom=clamp(pinch.current.zoom*(distance/pinch.current.distance),.12,1.5);
        setZoom(nextZoom);
        setPan(boundedPan({x:midX-pinch.current.worldX*nextZoom,y:midY-pinch.current.worldY*nextZoom},nextZoom));
        return;
      }
    }

    const d=drag.current;if(!d)return;
    const travel=Math.hypot(e.clientX-d.startClientX,e.clientY-d.startClientY);
    if(travel>6)d.moved=true;
    if(e.pointerType==="touch"&&d.mode==="pan"&&travel>10&&longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null}
    if(d.mode==="pan"){setPan(boundedPan({x:d.px+e.clientX-d.startClientX,y:d.py+e.clientY-d.startClientY}));return}
    if(d.mode==="target"||d.mode==="select")return;
    const screen=viewportPoint(e.clientX,e.clientY),start=viewportPoint(d.startClientX,d.startClientY);if(!screen||!start)return;
    if(d.mode==="box")setSelectionBox({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});
    if(d.mode==="front")setFrontPreview({x1:start.x,y1:start.y,x2:screen.x,y2:screen.y});
  }

  function onPointerUp(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"){
      if(longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null}
      touchPoints.current.delete(e.pointerId);
      if(pinch.current){
        if(touchPoints.current.size<2)pinch.current=null;
        drag.current=null;return;
      }
    }

    const d=drag.current;if(!d)return;drag.current=null;
    if(d.mode==="pan")return;
    if(d.mode==="target"){if(!d.moved)issueMapTargetAt(e.clientX,e.clientY);return}
    if(d.mode==="select"){if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null)}return}
    if(d.mode==="box"){
      setSelectionBox(null);
      if(!d.moved){setSelected([]);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);setConstructionAnchor(null);return}
      const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(!a||!b)return;
      const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
      setSelected(units.filter(u=>localSides.has(u.side)&&u.x>=minX&&u.x<=maxX&&u.y>=minY&&u.y<=maxY).map(u=>u.id));setPendingOrder(null);return;
    }
    setFrontPreview(null);if(!d.moved)return;const a=mapPoint(d.startClientX,d.startClientY),b=mapPoint(e.clientX,e.clientY);if(a&&b)deployFront(a,b);
  }

  function onPointerCancel(e:ReactPointerEvent<HTMLDivElement>){
    if(e.pointerType==="touch"){
      if(longPressTimer.current){clearTimeout(longPressTimer.current);longPressTimer.current=null}
      touchPoints.current.delete(e.pointerId);
    }
    if(touchPoints.current.size<2)pinch.current=null;
    drag.current=null;setSelectionBox(null);setFrontPreview(null);
  }

  function orderLabel(u:Formation){
    if(!u.order)return"NO ORDERS";
    if(u.order.targetUnitId){const target=units.find(v=>v.id===u.order?.targetUnitId);return u.order.type.toUpperCase()+" → "+(target?.name??"LOST CONTACT")}
    if(u.order.targetX!==undefined&&u.order.targetY!==undefined)return u.order.type.toUpperCase()+" · "+Math.round(Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y)/8)+" KM";
    return u.order.type.toUpperCase();
  }

  const savedLinks=linksViewRef.current;
  const currentLogisticsGraph=savedLinks&&savedLinks.network===currentSupplyNetwork&&savedLinks.units===units&&savedLinks.cities===cities&&savedLinks.emplacements===emplacements
    ?savedLinks.value:computeLogisticsLinks(activeScenario,units,cities,currentSupplyNetwork,emplacements);
  linksViewRef.current={network:currentSupplyNetwork,units,cities,emplacements,value:currentLogisticsGraph};
  const primaryAccess=primary?supplyAccess(activeScenario,primary,units,cities,currentSupplyNetwork,emplacements,currentLogisticsGraph,openWorld):null;
  const canRetreat=selectedUnits.some(u=>isInCombat(u,units));
  const activeFront=primary?.groupId?frontDirectives.find(f=>f.groupId===primary.groupId):undefined;
  const savedScout=scoutViewRef.current;
  const scoutFresh=savedScout&&savedScout.scenario===activeScenario&&savedScout.units===units&&savedScout.cities===cities
    &&savedScout.emplacements===emplacements&&savedScout.side===playerSide;
  const observerForces=scoutFresh?savedScout!.friendly:units.filter(u=>u.side===playerSide);
  const detectedEnemies=scoutFresh?savedScout!.ids:new Set(units.filter(u=>u.side!==playerSide
    &&isDetected(u,observerForces,cities,emplacements,activeScenario,playerSide)).map(u=>u.id));
  scoutViewRef.current={scenario:activeScenario,units,cities,emplacements,side:playerSide,friendly:observerForces,ids:detectedEnemies};
  const revealedContacts=contacts.filter(c=>!detectedEnemies.has(c.id));
  // This only reduces DOM nodes, never authoritative units or the minimap.
  const renderedUnits=!viewportSize.width||!viewportSize.height?units:units.filter(u=>{
    const margin=120;
    return u.x>=-pan.x/zoom-margin&&u.x<=(viewportSize.width-pan.x)/zoom+margin
      &&u.y>=-pan.y/zoom-margin&&u.y<=(viewportSize.height-pan.y)/zoom+margin;
  });

  return <main className={"game-shell theme-"+activeScenario.theme}>
    <GameHeader {...{activeScenario,playerSide,day,hour,running,multiplayer,networkPhase,averageSupply,averageOrg,blueCities,cities,enemy,detectedEnemies,speed,warResult,setShowTutorial,setTutorialStep,concludeSession,returnToSetup,setRunning,setSpeed}}/>

    <GameTutorial {...{showTutorial,battleReport,tutorialStep,setShowTutorial,setTutorialStep}}/>
    {multiplayer&&networkPhase==="opponent-left"&&<div className="network-status-banner">PLAYER DISCONNECTED · MATCH PAUSED</div>}
    {isMobile&&mobilePanel!=="none"&&<button className="mobile-backdrop" aria-label="Close panel" onClick={()=>setMobilePanel("none")}/>}
    <aside className={"left-panel "+(mobilePanel==="forces"?"mobile-open":"")}>
      <button className="mobile-panel-close" onClick={()=>setMobilePanel("none")}>CLOSE</button>
      <section><div className="section-title">ARMY GROUPS · CTRL+1…6 ASSIGN</div><div className="army-group-grid">{armyGroups.map(g=><button key={g.id} onClick={()=>selectGroup(g.id)} style={{borderLeft:"4px solid "+armyGroupColor(g.id)}}><b>{g.hotkey}</b><span>{g.name}<small>{blue.filter(u=>u.groupId===g.id).length} formations</small></span></button>)}</div></section>
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
      {openWorld&&<section className="openworld-panel"><div className="section-title">DOMINION</div><div className="resource-strip"><b>MP {Math.floor(openWorld.resources[playerSide].manpower)}</b><b>MAT {Math.floor(openWorld.resources[playerSide].materials)}</b><b>FUEL {Math.floor(openWorld.resources[playerSide].fuel)}</b></div><div className="section-title">RAISE FORMATIONS</div><div className="recruit-grid">{(["infantry","militia","partisan","raider","mountaineer","special_forces","engineer","cavalry","recon","mechanized","tank","mortar","artillery","heavy_artillery","logistics"] as Formation["kind"][]).map(kind=>{const cost=UNIT_COST[kind];const barracks=openWorld.structures.find(b=>b.side===playerSide&&b.kind===cost?.family);return <button key={kind} title={IRREGULAR_TRAITS[kind]??kind.replace("_"," ")} disabled={!cost||!barracks} onClick={()=>{if(!cost||!barracks)return;const next=queueRecruitment(openWorldRef.current!,playerSide,kind,barracks.id);openWorldRef.current=next;setOpenWorld(next)}}><b>{UNIT_LABEL[kind]}</b><small>{cost?cost.manpower+" MP · "+cost.materials+" MAT · "+cost.fuel+" F":"—"}</small></button>})}</div><div className="section-title">BUILD</div><div className="strategic-build-grid">{(["infantry_barracks","mobile_barracks","support_barracks","city","fort","wall"] as OpenWorldBuildKind[]).map(kind=><button key={kind} className={pendingStrategicBuild===kind?"active":""} onClick={()=>{setPendingStrategicBuild(kind);setStrategicBuildAnchor(null);setPendingOrder(null);setPendingPlan(false);setPendingBuild(null);setConstructionAnchor(null)}}>{kind.replaceAll("_"," ").toUpperCase()}</button>)}</div><small className="muted-line">Roads are built by logistics formations. Owned territory yields resources automatically.</small></section>}
      <section><div className="section-title">FIELD WORKS</div><div className="construction-list">{constructionProjects.length?constructionProjects.filter(p=>localSides.has(p.side)).map(project=><div className="construction-row" key={project.id}><b>{constructionLabel(project.kind)}</b><span>{Math.round(project.progress/project.requiredHours*100)}%</span><i><em style={{width:Math.min(100,project.progress/project.requiredHours*100)+"%"}}/></i></div>):<small className="muted-line">No active construction.</small>}</div></section>
      <section><div className="section-title">ORDER OF BATTLE</div><div className="oob-list">{blue.map(u=><button key={u.id} onClick={()=>{setSelected([u.id]);if(isMobile)setMobilePanel("unit")}} className={selected.includes(u.id)?"selected":""}><span className="oob-code">{UNIT_LABEL[u.kind]}</span><span><b>{u.name}</b><small>{pct(u.strength)} STR · {pct(u.organization)} ORG</small></span></button>)}</div></section>
    </aside>

    <div ref={viewport} className={pendingOrder||pendingPlan||pendingMassAttack||pendingDecoy||frontToolActive||pendingBuild||pendingStrategicBuild?"viewport targeting":"viewport"} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenuCapture={suppressNativeContextMenu} onContextMenu={issueTarget}>
      <div className="world" style={{width:mapW,height:mapH,transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
        <svg className="terrain" width={mapW} height={mapH} viewBox={"0 0 "+mapW+" "+mapH}>
          <defs><linearGradient id="sea" x1="0" x2="1"><stop offset="0" stopColor="#1c313c"/><stop offset="1" stopColor="#29424b"/></linearGradient><linearGradient id="intelShade" x1="0" x2="1"><stop offset="0" stopColor="#71846a" stopOpacity=".08"/><stop offset=".55" stopColor="#151b18" stopOpacity=".22"/><stop offset="1" stopColor="#050806" stopOpacity=".68"/></linearGradient><clipPath id="landClip"><path d={activeScenario.landPath}/></clipPath><mask id="fogMask" maskUnits="userSpaceOnUse"><rect width={mapW} height={mapH} fill="white"/>{blue.map(u=><circle key={"fog-u-"+u.id} cx={u.x} cy={u.y} r={visionRange(u)} fill="black"/>)}{cities.filter(c=>localSides.has(c.owner)).map(c=><circle key={"fog-c-"+c.name} cx={c.x} cy={c.y} r="270" fill="black"/>)}{emplacements.filter(e=>localSides.has(e.side)&&e.kind==="observatory").map(e=><circle key={"fog-e-"+e.id} cx={e.x} cy={e.y} r={e.range} fill="black"/>)}</mask></defs>
          <rect width={mapW} height={mapH} fill="url(#sea)"/><StaticLand scenario={activeScenario}/>
          
          <g className="territory-layer" clipPath="url(#landClip)" style={{opacity:territoryLayerOpacity}}>
            {(["blue","red","green"] as Side[]).map(side=><g key={"zone-"+side} className={"territory-mass "+side}>
              <path d={territoryPaths[side]} fillRule="evenodd"/>
            </g>)}
            {(openWorld?openWorld.resourceNodes:theaterTerritory).filter(cell=>cell.contested>.7&&cell.control<.67).map(cell=><circle key={"uncertain-"+cell.x+"-"+cell.y} className="territory-disputed" cx={cell.x} cy={cell.y} r={openWorld?165:105} opacity={Math.min(.26,cell.contested*.24)}/>)}
          </g>
          <StaticRoutes scenario={activeScenario}/>
          
          {emplacements.filter(e=>e.kind==="road"&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined).map(e=><path key={e.id} d={"M "+e.x+" "+e.y+" L "+e.x2+" "+e.y2} className="road"/>)}
          {openWorld?.structures.filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined).map(s=><path key={s.id} d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2} className="road"/>)}
          {emplacements.filter(e=>(e.kind==="trench"||e.kind==="barricade")&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined).map(e=><g key={e.id} className={"field-line "+e.kind+" "+e.side} opacity={.4+.6*e.strength/145}><path d={"M "+e.x+" "+e.y+" L "+e.x2+" "+e.y2}/></g>)}
          {openWorld?.structures.filter(s=>s.kind==="wall"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined).map(s=><g key={s.id} className={"built-wall "+s.side} opacity={.45+.55*s.strength/160}><path d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2}/><path className="wall-cap" d={"M "+s.x+" "+s.y+" L "+s.x2+" "+s.y2}/></g>)}
          {cities.map(s=><g key={s.name} className={"site-label "+s.owner}><circle cx={s.x} cy={s.y} r="6" className="site-core"/><circle cx={s.x} cy={s.y} r="25" className="site-ring"/>{s.capture>0&&<circle cx={s.x} cy={s.y} r="30" className="capture-ring" pathLength="100" strokeDasharray={s.capture+" "+(100-s.capture)} transform={"rotate(-90 "+s.x+" "+s.y+")"}/>}<text x={s.x+11} y={s.y-11}>{s.name.toUpperCase()} · {s.owner==="blue"?"B":s.owner==="red"?"R":"G"}</text></g>)}
          <g className="supply-road-colors">
            {currentSupplyNetwork.roads.map(road=>{
              const friendlyA=localSides.has(road.a.owner),friendlyB=localSides.has(road.b.owner);
              const hostile=!friendlyA&&!friendlyB;
              const cuts=road.cuts[playerSide];
              const state=friendlyA&&friendlyB?"friendly":friendlyA||friendlyB?"local":hostile?"hostile":"contested";
              return <g key={"supply-road-"+road.index}>{roadVisualPieces(road.route,cuts).map((piece,j)=><path key={j} d={polylinePath(piece.points)} className={"supply-route "+(piece.cut?"cut":state)}/>)}</g>;
            })}
            {[...emplacements.filter(e=>e.kind==="road"&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined),...(openWorld?.structures.filter(s=>s.kind==="road"&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined)??[])].map(s=>{
              const route=[{x:s.x,y:s.y},{x:s.x2!,y:s.y2!}],cuts=routeInterdictionPoints(route,playerSide,units);
              const connected=Boolean(supplySourceAtPoint(playerSide,route[0],cities,currentSupplyNetwork))||Boolean(supplySourceAtPoint(playerSide,route[1],cities,currentSupplyNetwork))||currentSupplyNetwork.roads.some(base=>base.route.slice(0,-1).some((p,i)=>segmentsIntersect(route[0].x,route[0].y,route[1].x,route[1].y,p.x,p.y,base.route[i+1].x,base.route[i+1].y)));
              const state=connected?"local":"contested";
              return <g key={"built-supply-"+s.id}>{roadVisualPieces(route,cuts).map((piece,j)=><path key={j} d={polylinePath(piece.points)} className={"supply-route built "+(piece.cut?"cut":state)}/>)}</g>;
            })}
          </g>
          {selectedUnits.filter(u=>u.kind==="logistics").map(u=><g key={"logistics-range-"+u.id} className="logistics-range-display">
            <circle cx={u.x} cy={u.y} r={currentLogisticsGraph.cityRange} className={"logistics-range pull "+u.side}/>
            <circle cx={u.x} cy={u.y} r={logisticsDistributionRange(u)} className={"logistics-range distribute "+u.side}/>
            <text x={u.x+16} y={u.y-currentLogisticsGraph.cityRange+24}>PULL {Math.round(currentLogisticsGraph.cityRange)}</text>
            <text x={u.x+16} y={u.y-logisticsDistributionRange(u)+24}>DISTRIBUTE {Math.round(logisticsDistributionRange(u))}</text>
          </g>)}
          <rect width={mapW} height={mapH} className="fog-dark" mask="url(#fogMask)"/><rect x="1" y="1" width={mapW-2} height={mapH-2} className="world-boundary"/>
        </svg>

        {gunEffects.length>0&&<svg className="combat-effects" width={mapW} height={mapH} aria-hidden="true">
          {gunEffects.filter(e=>localSides.has(e.side)||units.some(u=>u.side===playerSide&&Math.hypot(u.x-e.x,u.y-e.y)<640)).map(e=><g key={e.id} className={"combat-effect effect-"+e.kind}>
            <line className="shell-trace" x1={e.fromX} y1={e.fromY} x2={e.x} y2={e.y}/>
            <circle className="muzzle-flash" cx={e.fromX} cy={e.fromY} r={e.kind==="mortar"?13:23}/>
            <circle className="blast-core" cx={e.x} cy={e.y} r={e.kind==="mortar"?24:e.kind==="heavy_artillery"?51:37}/>
            <circle className="blast-ring" cx={e.x} cy={e.y} r={e.kind==="mortar"?45:e.kind==="heavy_artillery"?105:70}/>
            <circle className="smoke-plume" cx={e.x+9} cy={e.y-10} r={e.kind==="mortar"?31:60}/>
          </g>)}
        </svg>}
        {selectedUnits.some(u=>ARTILLERY_KINDS.has(u.kind))&&<svg className="artillery-ranges" width={mapW} height={mapH}>{selectedUnits.filter(u=>ARTILLERY_KINDS.has(u.kind)).map(u=>{const r=u.kind==="mortar"?mortarMaxRange(activeScenario,u):u.kind==="heavy_artillery"?820:540;return <g key={"range-"+u.id}><circle cx={u.x} cy={u.y} r={r}/><text x={u.x+10} y={u.y-r+22}>{Math.round(r)} RANGE</text></g>})}</svg>}
        {pendingOrder==="fire"&&aimPoint&&selectedUnits.some(u=>u.kind==="mortar")&&<svg className="mortar-aim" width={mapW} height={mapH}><circle cx={aimPoint.x} cy={aimPoint.y} r={mortarDispersion(activeScenario,aimPoint.x,aimPoint.y,Math.min(1,Math.min(...selectedUnits.filter(u=>u.kind==="mortar").map(u=>Math.hypot(aimPoint.x-u.x,aimPoint.y-u.y)/mortarMaxRange(activeScenario,u)))))} /><circle className="mortar-aim-core" cx={aimPoint.x} cy={aimPoint.y} r="7"/></svg>}
        {renderedUnits.map(u=>{
          const visible=localSides.has(u.side)||detectedEnemies.has(u.id);
          if(!visible)return null;
          return <button key={u.id} className={"unit-counter "+u.side+" kind-"+u.kind+" "+(selected.includes(u.id)?"selected ":"")+(massTargets.includes(u.id)?"mass-target ":"")+(u.organization<30||(u.suppression??0)>50||(u.morale??82)<25?"shaken ":"")+(u.isolationHours&&u.isolationHours>6?" encircled ":"")+(u.order?.type==="retreat"?"retreating":"")+(AMMO_TYPES.has(u.kind)&&(u.ammo??100)<12?" low-ammo":"")} style={{left:u.x-16,top:u.y-16,background:"linear-gradient(90deg,"+(u.side==="blue"?"#5f8199":u.side==="red"?"#9c5f59":"#71846a")+" 0 50%,"+armyGroupColor(u.groupId)+" 50% 100%)"}} onPointerDown={e=>{if(e.button===2)e.preventDefault();e.stopPropagation()}} onClick={e=>selectUnit(e,u)} onContextMenuCapture={e=>e.preventDefault()} onContextMenu={e=>issueUnitTarget(e,u)}><span className="unit-top">{UNIT_LABEL[u.kind]}<i>{localSides.has(u.side)?u.groupId?.split("-").pop()??"·":"◆"}</i></span><b>{pct(u.strength)}</b><span className="unit-bars"><i style={{width:pct(u.organization)+"%"}}/><em style={{width:pct(u.supply)+"%"}}/></span></button>
        })}
        {revealedContacts.map(c=><div key={"contact-"+c.id} className="stale-contact" style={{left:c.x-17,top:c.y-17,opacity:Math.max(.2,c.confidence)}} title={"LAST CONTACT · "+Math.round((elapsedHoursRef.current-c.seenAt)*10)/10+"h AGO"}><b>?</b><small>{UNIT_LABEL[c.kind]}</small></div>)}
        {decoys.filter(d=>d.owner===playerSide||decoyVisibleTo(d,playerSide,units,activeScenario,elapsedHoursRef.current)).map(d=><div key={d.id} className={"deception-counter "+(d.owner===playerSide?"friendly":"enemy")} style={{left:d.x-16,top:d.y-16}} title={d.owner===playerSide?"Friendly deception marker":"Unconfirmed hostile formation"}><b>{d.owner===playerSide?"△":"INF"}</b><small>{d.owner===playerSide?"DECOY":"?"}</small></div>)}
        {openWorld?.structures.filter(s=>s.kind!=="road"&&s.kind!=="wall").map(s=><div key={s.id} className={"ow-structure "+s.kind+" "+s.side} style={{left:s.x-16,top:s.y-16}} title={s.kind}><b>{s.kind==="infantry_barracks"?"INF":s.kind==="mobile_barracks"?"MOB":s.kind==="support_barracks"?"SUP":"FORT"}</b></div>)}
        {emplacements.filter(e=>!isLinearConstruction(e.kind)).map(e=>{
          return <div key={e.id} className={"emplacement "+e.kind+" "+e.side} style={{left:e.x-18,top:e.y-18}} title={constructionLabel(e.kind)}><b>{constructionShort(e.kind)}</b><small>{Math.round(e.strength)}</small></div>
        })}
        {constructionProjects.filter(project=>localSides.has(project.side)).map(project=>{
          const x=project.x2===undefined?project.x:(project.x+project.x2)*.5,y=project.y2===undefined?project.y:(project.y+project.y2)*.5;
          return <div key={project.id} className={"construction-site "+project.kind} style={{left:x-15,top:y-15}}><b>{constructionShort(project.kind)}</b><span>{Math.round(project.progress/project.requiredHours*100)}%</span></div>
        })}
        {primary&&primaryTargetX!==undefined&&primaryTargetY!==undefined&&<svg className="order-line" width={mapW} height={mapH}><polyline points={[{x:primary.x,y:primary.y},{x:primaryTargetX,y:primaryTargetY},...(primary.order?.waypoints??[])].map(point=>point.x+","+point.y).join(" ")} /><circle cx={primaryTargetX} cy={primaryTargetY} r="10"/>{(primary.order?.waypoints??[]).map((point,i)=><circle key={i} cx={point.x} cy={point.y} r="8"/>)}</svg>}
        {frontDirectives.length>0&&<svg className="operational-front-overlay" width={mapW} height={mapH}>{frontDirectives.map(f=><g key={f.id} className={"front-posture "+f.mode+" "+f.side}><line x1={f.start.x} y1={f.start.y} x2={f.end.x} y2={f.end.y}/><text x={(f.start.x+f.end.x)/2} y={(f.start.y+f.end.y)/2-28}>{f.groupId.replace(f.side+"-army-","ARMY ")} · {f.mode.toUpperCase()}</text></g>)}</svg>}
        {attackPlans.length>0&&<svg className="attack-plans" width={mapW} height={mapH}>{attackPlans.map(plan=>{const o=planOrigin(plan);return <g key={plan.id} className={plan.status}><line x1={o.x} y1={o.y} x2={plan.targetX} y2={plan.targetY}/><circle cx={plan.targetX} cy={plan.targetY} r="18"/><text x={plan.targetX+24} y={plan.targetY-18}>{plan.name}</text></g>})}</svg>}
      </div>

      {selectionBox&&<div className="selection-box" style={{left:Math.min(selectionBox.x1,selectionBox.x2),top:Math.min(selectionBox.y1,selectionBox.y2),width:Math.abs(selectionBox.x2-selectionBox.x1),height:Math.abs(selectionBox.y2-selectionBox.y1)}}/>}
      {frontPreview&&<svg className="front-preview"><line x1={frontPreview.x1} y1={frontPreview.y1} x2={frontPreview.x2} y2={frontPreview.y2}/></svg>}
      <GameMinimap {...{openWorld,mapW,mapH,territoryPaths,cities,units}}/>}
      <GameMapHud {...{blue,enemy,detectedEnemies,blueCities,cities,hovered,activeScenario,zoom}}/>
      {pendingStrategicBuild&&<div className="target-banner">BUILD {pendingStrategicBuild.replaceAll("_"," ").toUpperCase()} · {(pendingStrategicBuild==="road"||pendingStrategicBuild==="wall")?(strategicBuildAnchor?"SELECT END POINT":"SELECT START POINT"):(isMobile?"TAP":"RMB")+" LOCATION"} <button onClick={()=>{setPendingStrategicBuild(null);setStrategicBuildAnchor(null)}}>CANCEL</button></div>}
      {pendingBuild&&<div className="target-banner">{constructionLabel(pendingBuild)} · {isLinearConstruction(pendingBuild)?(constructionAnchor?"SELECT END POINT":"SELECT START POINT"):(isMobile?"TAP CONSTRUCTION SITE":"RMB CONSTRUCTION SITE")} <button onClick={()=>{setPendingBuild(null);setConstructionAnchor(null)}}>CANCEL</button></div>}
      {pendingDecoy&&<div className="target-banner">RECON DECOY · PLACE WITHIN RECON RANGE <button onClick={()=>setPendingDecoy(false)}>CANCEL</button></div>}
      {pendingMassAttack&&<div className="target-banner">MARK ENEMY UNITS · {massTargets.length} TARGET{massTargets.length===1?"":"S"} <button disabled={!massTargets.length} onClick={launchGroupAttack}>LAUNCH · ENTER</button><button onClick={()=>{setPendingMassAttack(false);setMassTargets([])}}>CANCEL</button></div>}
      {pendingPlan&&<div className="target-banner">ATTACK PLAN · {isMobile?"TAP OBJECTIVE":"RMB OBJECTIVE"} <button onClick={()=>setPendingPlan(false)}>CANCEL</button></div>}
      {pendingOrder&&<div className="target-banner">{pendingOrder==="relieve"?"RELIEVE ARMED · "+(isMobile?"TAP FRIENDLY":"RMB FRIENDLY FRONTLINE"):pendingOrder==="fire"&&selectedUnits.some(u=>u.kind==="mortar")?"MORTAR FIRE · "+(isMobile?"TAP IMPACT AREA":"RMB IMPACT AREA"):pendingOrder==="assault"||pendingOrder==="fire"?pendingOrder.toUpperCase()+" ARMED · "+(isMobile?"TAP ENEMY":"RMB ENEMY FORMATION"):pendingOrder.toUpperCase()+" ARMED · "+(isMobile?"TAP TARGET":"RMB TARGET")} <button onClick={()=>setPendingOrder(null)}>CANCEL</button></div>}
      {warResult&&!battleReport&&<div className={"war-result "+warResult}><b>{localSides.has(warResult)?"VICTORY":"DEFEAT"}</b><span>Preparing battle statistics…</span></div>}
    </div>

    {isMobile&&primary&&<section className="mobile-selection-summary" aria-label="Selected formation controls">
      <div className="mobile-selection-head">
        <div><b>{selectedUnits.length>1?selectedUnits.length+" FORMATIONS":primary.name}</b><span>STR {pct(selectedStrength)} · ORG {pct(selectedOrganization)} · SUP {pct(selectedSupply)}</span></div>
        <button aria-label="Clear selection" onClick={()=>{setSelected([]);setPendingOrder(null);setPendingBuild(null);setConstructionAnchor(null)}}>×</button>
      </div>
      <div className="mobile-quick-orders">
        <button className={pendingOrder==="move"?"active":""} onClick={()=>startOrder("move")}>MOVE</button>
        <button disabled={!selectedUnits.some(u=>DIRECT_COMBAT_KINDS.has(u.kind))} className={pendingOrder==="assault"?"active":""} onClick={()=>startOrder("assault")}>ASSAULT</button>
        <button disabled={!selectedUnits.some(u=>ARTILLERY_KINDS.has(u.kind))} className={pendingOrder==="fire"?"active":""} onClick={()=>startOrder("fire")}>FIRE</button>
        <button onClick={()=>startOrder("defend")}>HOLD</button>
        <button onClick={()=>startOrder("dig")}>DIG</button>
        <button onClick={()=>startOrder("resupply")}>SUPPLY</button>
      </div>
      <div className="mobile-build-orders">
        <button className={pendingBuild==="trench"?"active":""} onClick={()=>armConstruction("trench")}>TRENCH</button>
        <button className={pendingBuild==="barricade"?"active":""} onClick={()=>armConstruction("barricade")}>BARRIER</button>
        <button disabled={!selectedUnits.some(u=>u.kind==="logistics")} className={pendingBuild==="road"?"active":""} onClick={()=>armConstruction("road")}>ROAD</button>
      </div>
    </section>}

    <aside className="right-panel">
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
    </aside>

    <MobileToolbar {...{mobileTool,setMobileTool,setMobilePanel,mobilePanel,selected,multiplayer,setRunning,warResult,running}}/>

    {battleReport&&<AfterActionReport history={battleReport} winner={warResult} playerSide={playerSide} onExit={returnToSetup}/>}
    <GameStatusbar {...{multiplayer,selectedUnits}}/>
  </main>
}
