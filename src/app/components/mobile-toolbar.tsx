"use client";
import type {Dispatch,SetStateAction} from "react";
import type {Side} from "@/sim/types";
import type {MultiplayerSession} from "@/lib/multiplayer";
type Panel="none"|"forces"|"unit";
type Tool="pan"|"front";
type Props={mobileTool:Tool;setMobileTool:Dispatch<SetStateAction<Tool>>;setMobilePanel:Dispatch<SetStateAction<Panel>>;mobilePanel:Panel;selected:string[];multiplayer:MultiplayerSession|null;setRunning:Dispatch<SetStateAction<boolean>>;warResult:Side|null;running:boolean};
export function MobileToolbar({mobileTool,setMobileTool,setMobilePanel,mobilePanel,selected,multiplayer,setRunning,warResult,running}:Props){
 return <nav className="mobile-toolbar" aria-label="Mobile controls">
      <button className={mobileTool==="pan"?"active":""} onClick={()=>{setMobileTool("pan");setMobilePanel("none")}}><b>✥</b><span>PAN</span></button>
      <button disabled={selected.length<1} className={mobileTool==="front"?"active":""} onClick={()=>{setMobileTool("front");setMobilePanel("none")}}><b>╱</b><span>FRONT</span></button>
      <button className={mobilePanel==="forces"?"active":""} onClick={()=>setMobilePanel(v=>v==="forces"?"none":"forces")}><b>☷</b><span>FORCES</span></button>
      <button disabled={Boolean(multiplayer&&!multiplayer.isHost)} onClick={()=>setRunning(v=>warResult?v:!v)}><b>{running?"Ⅱ":"▶"}</b><span>{running?"PAUSE":"PLAY"}</span></button>
    </nav>;
}
