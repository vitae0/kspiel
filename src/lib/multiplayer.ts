import {createClient} from "@supabase/supabase-js";
import type {AttackPlan,CityState,ConstructionProject,Emplacement,Formation,Side} from "@/sim/types";

export const SUPABASE_URL="https://qyylrkqktctcsrqgviwp.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY="sb_publishable_VaV0h0GhPx171fJHTG-avw_7oWSlJt8";

export const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  realtime:{params:{eventsPerSecond:24}}
});

export type MultiplayerSession={
  roomId:string;
  code:string;
  kind:"quickplay"|"invite";
  role:"host"|"guest";
  isHost:boolean;
  playerToken:string;
  side:Side;
  opponentSide:Side;
  seed:number;
  presetId:string;
  gameMode:"scenario";
};

export type UnitCommandPatch={
  id:string;
  order?:Formation["order"];
  groupId?:string;
  formationShape?:Formation["formationShape"];
};

export type MultiplayerSnapshot={
  seq:number;
  units:Formation[];
  cities:CityState[];
  attackPlans:AttackPlan[];
  emplacements:Emplacement[];
  constructionProjects:ConstructionProject[];
  hour:number;
  day:number;
  running:boolean;
  speed:number;
  warResult:Side|null;
};

type MatchmakingPayload=
  |{action:"quickplay";presetId:string;side:Side}
  |{action:"create_invite";presetId:string;side:Side}
  |{action:"join_invite";code:string}
  |{action:"cancel_room";roomId:string;playerToken:string};

async function matchmaking(payload:MatchmakingPayload){
  const response=await fetch(SUPABASE_URL+"/functions/v1/matchmaking",{
    method:"POST",
    headers:{"Content-Type":"application/json",apikey:SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify(payload)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof body?.error==="string"?body.error:"matchmaking_failed");
  return body as {session?:MultiplayerSession;ok?:boolean};
}

export async function findQuickPlay(presetId:string,side:Side){
  const body=await matchmaking({action:"quickplay",presetId,side});
  if(!body.session)throw new Error("missing_session");
  return body.session;
}

export async function createPrivateMatch(presetId:string,side:Side){
  const body=await matchmaking({action:"create_invite",presetId,side});
  if(!body.session)throw new Error("missing_session");
  return body.session;
}

export async function joinPrivateMatch(code:string){
  const body=await matchmaking({action:"join_invite",code});
  if(!body.session)throw new Error("missing_session");
  return body.session;
}

export async function closeMultiplayerRoom(session:MultiplayerSession){
  try{await matchmaking({action:"cancel_room",roomId:session.roomId,playerToken:session.playerToken})}catch{}
}

export function inviteUrl(code:string){
  if(typeof window==="undefined")return"";
  const url=new URL(window.location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("join",code);
  return url.toString();
}
