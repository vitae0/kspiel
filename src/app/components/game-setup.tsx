"use client";
import {useEffect,useState,type Dispatch,type SetStateAction} from "react";
import {SCENARIO_PRESETS,WORLD_W,WORLD_H} from "@/sim/game";
import type {Side} from "@/sim/types";
import type {MultiplayerSession,MultiplayerTeamSize} from "@/lib/multiplayer";
import BrandMark from "@/app/brand-mark";
import MenuAtmosphere from "@/app/menu-atmosphere";
import MenuScore from "@/app/menu-score";
import {Flag} from "./ui-primitives";
import {MapSelection,MapDeploymentBrief} from "@/app/map-selection";
type Mode="scenario"|"openworld";
type Category="all"|"fictional"|"historical"|"mega"|"guerrilla";
type Stage="mode"|"maps";
type Phase="idle"|"matching"|"waiting"|"connected"|"opponent-left"|"error";
type Player={token:string;nickname:string;side:Side;slot:number};
type Props={
 setupStage:Stage;setSetupStage:Dispatch<SetStateAction<Stage>>;
 setupCategory:Category;setSetupCategory:Dispatch<SetStateAction<Category>>;
 selectedPresetId:string;setSelectedPresetId:Dispatch<SetStateAction<string>>;
 selectedGameMode:Mode;setSelectedGameMode:Dispatch<SetStateAction<Mode>>;
 playerSide:Side;setPlayerSide:Dispatch<SetStateAction<Side>>;
 multiplayer:MultiplayerSession|null;networkPhase:Phase;networkError:string;
 pendingInviteCode:string;setPendingInviteCode:Dispatch<SetStateAction<string>>;
 inviteLink:string;nickname:string;setNickname:Dispatch<SetStateAction<string>>;
 multiplayerTeamSize:MultiplayerTeamSize;setMultiplayerTeamSize:Dispatch<SetStateAction<MultiplayerTeamSize>>;
 onlinePlayers:Player[];beginQuickPlay:()=>Promise<unknown>;beginPrivateMatch:()=>Promise<unknown>;
 joinPendingInvite:()=>Promise<unknown>;cancelMultiplayer:()=>void;
 startGame:()=>void;setNetworkError:Dispatch<SetStateAction<string>>;
};
/** Two-step scenario setup and multiplayer lobby; latest map selection design preserved. */
export function GameSetup({setupStage,setSetupStage,setupCategory,setSetupCategory,selectedPresetId,setSelectedPresetId,
selectedGameMode,setSelectedGameMode,playerSide,setPlayerSide,multiplayer,networkPhase,networkError,
pendingInviteCode,setPendingInviteCode,inviteLink,nickname,setNickname,multiplayerTeamSize,setMultiplayerTeamSize,
onlinePlayers,beginQuickPlay,beginPrivateMatch,joinPendingInvite,cancelMultiplayer,startGame,setNetworkError}:Props){

    const [sideTab,setSideTab]=useState<"settings"|"forces"|"room">("settings");
    const [mobileView,setMobileView]=useState<"maps"|"setup">("maps");
    useEffect(()=>{
      if(multiplayer||pendingInviteCode||networkPhase==="matching"||networkPhase==="error")setSideTab("room");
    },[multiplayer,pendingInviteCode,networkPhase]);

    // Keep map selection scoped to modes that can actually launch them.
    // Open-world currently supports the four fictional single-scale theaters.
    const presets=SCENARIO_PRESETS.filter(p=>selectedGameMode==="openworld"
      ?!p.historical&&(p.mapScale??1)===1
      :setupCategory==="all"||
        (setupCategory==="historical"&&p.historical)||(setupCategory==="fictional"&&!p.historical)||
        (setupCategory==="mega"&&(p.mapScale??1)>=2)||(setupCategory==="guerrilla"&&p.warfare==="guerrilla"));
    const selectedPreset=SCENARIO_PRESETS.find(p=>p.id===selectedPresetId)??SCENARIO_PRESETS[0];
    const changeFilter=(category:typeof setupCategory)=>{
      setSetupCategory(category);
      const visible=SCENARIO_PRESETS.filter(p=>category==="all"||
        (category==="historical"&&p.historical)||(category==="fictional"&&!p.historical)||
        (category==="mega"&&(p.mapScale??1)>=2)||(category==="guerrilla"&&p.warfare==="guerrilla"));
      if(visible.length&&!visible.some(p=>p.id===selectedPresetId)){
        setSelectedPresetId(visible[0].id);
        setPlayerSide("blue");
      }
    };
    const chooseMode=(mode:"scenario"|"openworld")=>{
      if(multiplayer)return;
      setSelectedGameMode(mode);
      setSetupCategory("all");
      if(mode==="openworld"&&selectedPreset.historical)setSelectedPresetId("frontier");
      setSetupStage("maps");
      setMobileView("maps");
      setSideTab("settings");
    };

return <main className="setup-shell">
      <MenuAtmosphere/>
      <div className={"setup-panel "+(setupStage==="mode"?"setup-mode-panel":"setup-maps-panel")}>
        <div className="setup-brand"><BrandMark/><div className="setup-brand-identity"><b>KSPIEL</b><small>OPERATIONAL COMMAND SIMULATION</small></div><div className="menu-brand-actions"><span className="menu-build-tag">THE WAR ROOM</span><MenuScore/></div></div>
        {setupStage==="mode"?<section className="setup-mode-screen">
          <div className="setup-mode-heading"><small>NEW CAMPAIGN / STEP 01 OF 02</small><h1>Choose your battlefield.</h1>
            <p>Select how the war will unfold. The next screen shows detailed battlefield previews, starting forces and unit compositions before deployment.</p>
          </div>
          <div className="setup-mode-choices">
            <button type="button" className="setup-mode-card" onClick={()=>chooseMode("scenario")}>
              <div className="setup-mode-art scenario-art" aria-hidden="true"><span>◈</span><i>FRONTS · SUPPLY · WARFARE</i></div>
              <div className="setup-mode-copy"><small>01 / TACTICAL OPERATIONS</small><h2>SCENARIO WAR</h2>
                <p>Command an army across historical and fictional theaters. Defend supply lines, break fronts, capture objectives and dominate the map.</p>
                <div className="setup-mode-chips"><span>SOLO</span><span>QUICK PLAY</span><span>PRIVATE ROOMS</span></div>
                <strong>CHOOSE A MAP <span>→</span></strong>
              </div>
            </button>
            <button type="button" className="setup-mode-card" onClick={()=>chooseMode("openworld")}>
              <div className="setup-mode-art dominion-art" aria-hidden="true"><span>⚑</span><i>CONQUEST · RESOURCES · EMPIRES</i></div>
              <div className="setup-mode-copy"><small>02 / STRATEGIC CONQUEST</small><h2>OPEN WORLD DOMINION</h2>
                <p>Build settlements, recruit formations, extend roads and infrastructure, and conquer a persistent three-faction frontier.</p>
                <div className="setup-mode-chips"><span>SOLO</span><span>3 FACTIONS</span><span>EXPANSION</span></div>
                <strong>CHOOSE A MAP <span>→</span></strong>
              </div>
            </button>
          </div>
          <p className="setup-mode-footnote">Theater maps use live KSpiel scenario geometry. Maps and starting forces are previewed before the session is launched.</p>
        </section>:<>
        <nav className="theater-flow-nav" aria-label="Campaign setup progress">
          <button type="button" className="theater-back" onClick={()=>{if(!multiplayer&&!pendingInviteCode)setSetupStage("mode")}}
            disabled={Boolean(multiplayer)||Boolean(pendingInviteCode)}>← GAME MODES</button>
          <div><span>01 / MODE</span><span className="active">02 / MAP SELECTION</span></div>
          <span className="theater-flow-mode">{selectedGameMode==="openworld"?"OPEN WORLD DOMINION":"SCENARIO WAR"}</span>
        </nav>
        <div className="menu-mobile-switch" role="group" aria-label="Map and battle setup">
          <button type="button" className={mobileView==="maps"?"active":""} onClick={()=>setMobileView("maps")}>MAPS</button>
          <button type="button" className={mobileView==="setup"?"active":""} onClick={()=>setMobileView("setup")}>BATTLE SETUP</button>
        </div>
        <div className={"setup-grid menu-view-"+mobileView}>
          <section className="setup-main">
            <div className="setup-heading"><small>FIELD OPERATIONS / THEATER SELECTION</small>
              <h1>Choose your map</h1>
              <p>Inspect real terrain previews, unit counts, battle rosters and tactical conditions. Select a theater to configure your forces and deploy.</p>
            </div>
            {selectedGameMode==="scenario"?<div className="setup-tabs theater-filters" role="group" aria-label="Filter theaters">
              <button className={setupCategory==="all"?"active":""} onClick={()=>changeFilter("all")}>ALL</button>
              <button className={setupCategory==="fictional"?"active":""} onClick={()=>changeFilter("fictional")}>FICTIONAL</button>
              <button className={setupCategory==="historical"?"active":""} onClick={()=>changeFilter("historical")}>HISTORICAL</button>
              <button className={setupCategory==="mega"?"active":""} onClick={()=>changeFilter("mega")}>MEGA MAPS</button>
              <button className={setupCategory==="guerrilla"?"active":""} onClick={()=>changeFilter("guerrilla")}>GUERRILLA</button>
            </div>:<div className="theater-mode-note">THREE FACTIONS · PROCEDURAL TERRITORY · BUILD AND EXPAND</div>}
            <MapSelection presets={presets} selectedPresetId={selectedPresetId} mode={selectedGameMode}
              locked={Boolean(multiplayer)||Boolean(pendingInviteCode)}
              onSelect={id=>{if(multiplayer||pendingInviteCode)return;setSelectedPresetId(id);setPlayerSide("blue")}}/>
          </section>
          <aside className="setup-side">
            <div className="menu-setup-tabs" role="group" aria-label="Battle setup sections">
              <button type="button" className={sideTab==="settings"?"active":""} onClick={()=>setSideTab("settings")}>SETTINGS</button>
              <button type="button" className={sideTab==="forces"?"active":""} onClick={()=>setSideTab("forces")}>FORCES</button>
              <button type="button" className={sideTab==="room"?"active":""} onClick={()=>setSideTab("room")}>ROOM</button>
            </div>
            <div className="menu-selected-theater"><small>SELECTED THEATER</small>
              <strong>{selectedPreset.title}</strong>
              <span>{selectedPreset.location} · {selectedPreset.theme.toUpperCase()}</span>
            </div>
            {sideTab==="settings"&&<div className="menu-setup-settings">
            <div className="section-title">{selectedGameMode==="openworld"?"WORLD RULESET":"SELECTED THEATER"}</div><h2>{selectedPreset.title}</h2><p>{selectedGameMode==="openworld"?"Open World Dominion · three factions · "+selectedPreset.location:selectedPreset.location+(selectedPreset.year?" · "+selectedPreset.year:"")}</p>
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
            </div>}
            {sideTab==="room"&&<div className="menu-room-content">
            {pendingInviteCode&&!multiplayer&&<div className="menu-room-join-fields">
              <label>COMMANDER
                <input maxLength={20} placeholder="Nickname" value={nickname}
                  onChange={e=>{setNickname(e.target.value);window.localStorage.setItem("kspiel.nickname",e.target.value)}}/>
              </label>
              <div className="menu-room-team-choice">{(["blue","red"] as Side[]).map(side=>
                <button key={side} type="button" className={playerSide===side?"active":""} onClick={()=>setPlayerSide(side)}>
                  <Flag styleName={selectedPreset.sideFlags[side]??"generic-blue"}/>{side.toUpperCase()} TEAM
                </button>)}</div>
            </div>}
            {pendingInviteCode&&!multiplayer&&<div className="invite-join-card"><b>INVITE ROOM · {pendingInviteCode}</b><small>Pick a nickname and either team. Everyone on a team can command the full army.</small><div className="invite-actions"><button disabled={networkPhase==="matching"||!nickname.trim()} onClick={()=>void joinPendingInvite()}>JOIN ROOM</button><button onClick={()=>{setPendingInviteCode("");setNetworkError("")}}>DISMISS</button></div></div>}
            {multiplayer&&<div className={"network-lobby "+networkPhase}><div><span><b>{networkPhase==="connected"?"ALL COMMANDERS CONNECTED":networkPhase==="opponent-left"?"PLAYER DISCONNECTED":multiplayer.kind==="quickplay"?"QUICK PLAY QUEUE":"PRIVATE ROOM"}</b><small>ROOM {multiplayer.code} · {multiplayer.teamSize}V{multiplayer.teamSize} · {multiplayer.nickname} · {multiplayer.side.toUpperCase()} TEAM</small></span><strong>{onlinePlayers.length}/{multiplayer.maxPlayers}</strong></div><div className="lobby-roster">{(["blue","red"] as Side[]).map(side=><div key={side}><b>{side.toUpperCase()} TEAM</b>{onlinePlayers.filter(player=>player.side===side).sort((a,b)=>a.slot-b.slot).map(player=><small key={player.token}>{player.slot}. {player.nickname}{player.token===multiplayer.playerToken?" · YOU":""}</small>)}{onlinePlayers.filter(player=>player.side===side).length<multiplayer.teamSize&&<small>Waiting for {multiplayer.teamSize-onlinePlayers.filter(player=>player.side===side).length}…</small>}</div>)}</div>{inviteLink&&<div className="invite-link"><input aria-label="Invite link" readOnly value={inviteLink}/><button onClick={()=>void navigator.clipboard.writeText(inviteLink)}>COPY LINK</button></div>}<button className="cancel-network" onClick={cancelMultiplayer}>CANCEL</button></div>}
            {networkPhase==="matching"&&<div className="network-lobby matching"><b>CONNECTING TO MATCHMAKING…</b><small>Preparing Supabase Realtime session.</small></div>}
            {networkError&&<div className="network-error">{networkError==="team_full"?"That team is full. Pick the other team.":networkError==="room_unavailable"?"That room is full, closed, or expired.":networkError}</div>}
            {!pendingInviteCode&&!multiplayer&&networkPhase==="idle"&&<div className="menu-room-empty">No active room. Select Quick Play or Private Match under SETTINGS.</div>}
            </div>}
            {sideTab==="forces"&&<div className="menu-forces-content">
              <MapDeploymentBrief preset={selectedPreset} mode={selectedGameMode}/>
            </div>}
            <div className="menu-setup-bottom">
              <button className="launch-button" disabled={Boolean(multiplayer)||networkPhase==="matching"||Boolean(pendingInviteCode)} onClick={()=>startGame()}>{selectedGameMode==="openworld"?"FOUND DOMINION":"DEPLOY TO THEATER"}</button>
              {sideTab!=="forces"&&<button type="button" className="menu-forces-link" onClick={()=>setSideTab("forces")}>VIEW INITIAL FORCES →</button>}
            </div>
          </aside>
        </div>
        </>}
      </div>
    </main>;
}
