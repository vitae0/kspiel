import type {ArmyGroup,GameCommand,MatchConfig,MatchMode,Side} from "./types";

export const LOCAL_PLAYER_ID="local";

export function createMatchConfig(mode:MatchMode,localPlayerId=LOCAL_PLAYER_ID):MatchConfig{
  const common={id:"local-"+mode,mode,authoritativeTickRate:10,commandDelayTicks:0};
  if(mode==="coop")return{...common,players:[
    {id:localPlayerId,name:"Player 1",side:"blue",controller:"human",local:true},
    {id:"remote-1",name:"Player 2",side:"blue",controller:"human"},
    {id:"bot-red",name:"Red Command",side:"red",controller:"bot"}
  ]};
  if(mode==="pvp")return{...common,players:[
    {id:localPlayerId,name:"Player 1",side:"blue",controller:"human",local:true},
    {id:"remote-1",name:"Player 2",side:"red",controller:"human"}
  ]};
  if(mode==="pvpve")return{...common,players:[
    {id:localPlayerId,name:"Player 1",side:"blue",controller:"human",local:true},
    {id:"remote-1",name:"Player 2",side:"red",controller:"human"},
    {id:"bot-green",name:"Green Command",side:"green",controller:"bot"}
  ]};
  return{...common,players:[
    {id:localPlayerId,name:"Player",side:"blue",controller:"human",local:true},
    {id:"bot-red",name:"Red Command",side:"red",controller:"bot"}
  ]};
}

export function localControlledSides(config:MatchConfig,playerId=LOCAL_PLAYER_ID):Side[]{
  return [...new Set(config.players.filter(p=>p.id===playerId&&p.controller==="human").map(p=>p.side))];
}
export function botControlledSides(config:MatchConfig):Side[]{
  return [...new Set(config.players.filter(p=>p.controller==="bot").map(p=>p.side))];
}
export function canPlayerCommand(config:MatchConfig,playerId:string,side:Side){
  return config.players.some(p=>p.id===playerId&&p.controller==="human"&&p.side===side);
}
export function commandIsAuthorized(config:MatchConfig,command:GameCommand){
  return canPlayerCommand(config,command.playerId,command.side);
}
export function defaultArmyGroups(side:Side):ArmyGroup[]{
  return Array.from({length:6},(_,i)=>({id:side+"-army-"+(i+1),name:(i+1)+ordinal(i+1)+" Army",side,hotkey:i+1}));
}
function ordinal(n:number){
  const mod100=n%100;if(mod100>=11&&mod100<=13)return"th";
  return n%10===1?"st":n%10===2?"nd":n%10===3?"rd":"th";
}
