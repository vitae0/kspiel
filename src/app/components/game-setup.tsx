"use client";
import type {Dispatch,SetStateAction} from "react";
import {SCENARIO_PRESETS,WORLD_W,WORLD_H} from "@/sim/game";
import type {Side} from "@/sim/types";
import type {MultiplayerSession,MultiplayerTeamSize} from "@/lib/multiplayer";
import BrandMark from "@/app/brand-mark";
import MenuAtmosphere from "@/app/menu-atmosphere";
import MenuScore from "@/app/menu-score";
import {Flag} from "./ui-primitives";
type Mode="scenario"|"openworld";
type Category="all"|"fictional"|"historical"|"mega"|"guerrilla";
type Phase="idle"|"matching"|"waiting"|"connected"|"opponent-left"|"error";
type Player={token:string;nickname:string;side:Side;slot:number};
type Props={
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
/** Setup-only state and callbacks are explicit; gameplay state never enters this screen. */
export function GameSetup({setupCategory,setSetupCategory,selectedPresetId,setSelectedPresetId,
selectedGameMode,setSelectedGameMode,playerSide,setPlayerSide,multiplayer,networkPhase,networkError,
pendingInviteCode,setPendingInviteCode,inviteLink,nickname,setNickname,multiplayerTeamSize,setMultiplayerTeamSize,
onlinePlayers,beginQuickPlay,beginPrivateMatch,joinPendingInvite,cancelMultiplayer,startGame,setNetworkError}:Props){
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
