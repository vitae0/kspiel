"use client";
import {memo} from "react";
import type {Formation} from "@/sim/types";
import type {MultiplayerSession} from "@/lib/multiplayer";
type Props={multiplayer:MultiplayerSession|null;selectedUnits:Formation[]};
export const GameStatusbar=memo(function GameStatusbar({multiplayer,selectedUnits}:Props){
 return <footer className="statusbar">{multiplayer&&<span className="status-room">{multiplayer.teamSize}V{multiplayer.teamSize} · {multiplayer.nickname} · {multiplayer.side.toUpperCase()} · ROOM {multiplayer.code}</span>}<span>SPACE: PAUSE</span><span>MMB DRAG: PAN</span><span>RMB: MOVE · SHIFT/CTRL+RMB: QUEUE</span><span>LMB DRAG: BOX SELECT</span><span>CTRL+LMB: GROUP FRONT</span><span>H: GROUP ASSAULT</span><span>GUIDE: ?</span><span>CTRL+1…6: ASSIGN GROUP</span><span>B: ATTACK PLAN</span><span>ALL TROOPS: FIELD WORKS · LOGISTICS: ROADS</span><strong>{selectedUnits.length} FORMATION{selectedUnits.length===1?"":"S"} SELECTED</strong></footer>;
});
