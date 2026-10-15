import type {CityState,Formation,Side,UnitKind} from "./types";
import type {OpenWorldState} from "./openworld";
import {SIDES} from "./warfare";

export type StatSide={side:Side;units:number;effectiveStrength:number;cities:number;supply:number;organization:number;morale:number;isolated:number;
  territory:number;dealt:number;losses:number;casualties:number;reinforcements:number;captures:number;construction:number;
  resources:number;shortage:number;};
export type BattleSample={hour:number;values:Record<Side,StatSide>};
export type BattleEvent={hour:number;side:Side;kind:"capture"|"lost"|"reinforcements"|"front"|"construction"|"surrender"|"intel";title:string};
export type UnitRecord={id:string;name:string;side:Side;kind:UnitKind;damage:number;suppression:number;initialStrength:number;lastStrength:number;active:boolean};
export type BattleHistory={title:string;seed:number;startedAt:number;finishedAt?:number;reason?:string;samples:BattleSample[];events:BattleEvent[];
  totals:Record<Side,{damage:number;suppression:number;losses:number;casualties:number;reinforcements:number;captures:number;construction:number;shortageHours:number;isolatedHours:number}>;
  records:UnitRecord[];lastSampleHour:number;startingCities:Record<Side,number>;
};
const zero=()=>({damage:0,suppression:0,losses:0,casualties:0,reinforcements:0,captures:0,construction:0,shortageHours:0,isolatedHours:0});
const totalSides=()=>({blue:zero(),red:zero(),green:zero()});
export function startHistory(title:string,seed:number,units:Formation[],cities:CityState[],openWorld?:OpenWorldState|null):BattleHistory{
  const history:BattleHistory={
    title,seed,startedAt:0,samples:[],events:[],totals:totalSides(),
    records:units.map(u=>({id:u.id,name:u.name,side:u.side,kind:u.kind,damage:u.damageDealt??0,suppression:u.suppressionInflicted??0,initialStrength:u.strength,lastStrength:u.strength,active:true})),
    lastSampleHour:-Infinity,
    startingCities:{blue:cities.filter(c=>c.owner==="blue").length,red:cities.filter(c=>c.owner==="red").length,green:cities.filter(c=>c.owner==="green").length}
  };
  return appendSample(history,0,units,cities,openWorld,true);
}
export function appendSample(history:BattleHistory,hour:number,units:Formation[],cities:CityState[],openWorld:OpenWorldState|null|undefined,force=false):BattleHistory{
  if(!force&&hour-history.lastSampleHour<2)return history;
  const values={} as Record<Side,StatSide>;
  for(const side of SIDES){
    const own=units.filter(u=>u.side===side),count=Math.max(1,own.length),totals=history.totals[side];
    values[side]={side,units:own.length,effectiveStrength:own.reduce((s,u)=>s+u.strength/100,0),
      cities:cities.filter(c=>c.owner===side).length,supply:own.reduce((s,u)=>s+u.supply,0)/count,
      organization:own.reduce((s,u)=>s+u.organization,0)/count,morale:own.reduce((s,u)=>s+(u.morale??80),0)/count,
      isolated:own.filter(u=>(u.isolationHours??0)>6).length,
      territory:openWorld?.resourceNodes.filter(c=>c.owner===side).reduce((s,c)=>s+c.control,0)??cities.filter(c=>c.owner===side).length,
      dealt:totals.damage,losses:totals.losses,casualties:totals.casualties,reinforcements:totals.reinforcements,captures:totals.captures,
      construction:totals.construction,resources:openWorld?Object.values(openWorld.resources[side]).reduce((s,n)=>s+n,0):0,
      shortage:own.filter(u=>u.supply<20).length};
  }
  history.samples.push({hour,values});history.lastSampleHour=hour;
  // Keep an actual time series without unbounded memory growth in long Dominion sessions.
  if(history.samples.length>700)history.samples=history.samples.filter((_,i)=>i%2===0||i===history.samples.length-1);
  return history;
}
export function addBattleEvent(history:BattleHistory,event:BattleEvent){
  history.events.push(event);
  if(history.events.length>220)history.events.shift();
}
export function updateHistory(history:BattleHistory,prev:Formation[],next:Formation[],previousCities:CityState[],nextCities:CityState[],hour:number,hours:number,openWorld:OpenWorldState|null|undefined,completedConstruction:{side:Side;kind:string}[]=[]){
  const before=new Map(prev.map(u=>[u.id,u])),after=new Map(next.map(u=>[u.id,u]));
  const record=new Map(history.records.map(r=>[r.id,r]));
  for(const u of prev){
    const current=after.get(u.id),sum=history.totals[u.side],earlier=record.get(u.id);
    if(!earlier)continue;
    const earlierStrength=u.strength;
    const finalStrength=current?.strength??0;
    const killed=Math.max(0,earlierStrength-finalStrength)*u.manpower/100;
    sum.casualties+=killed; // estimated casualties: proportional to formation strength reduction
    const inflicted=Math.max(0,(current?.damageDealt??u.damageDealt??0)-(u.damageDealt??0));
    const suppressed=Math.max(0,(current?.suppressionInflicted??u.suppressionInflicted??0)-(u.suppressionInflicted??0));
    sum.damage+=inflicted;sum.suppression+=suppressed;
    earlier.damage+=inflicted;earlier.suppression+=suppressed;
    earlier.lastStrength=finalStrength;
    sum.shortageHours+=u.supply<20?hours:0;
    sum.isolatedHours+=(u.isolationHours??0)>6?hours:0;
    if(!current){
      sum.losses++;earlier.active=false;
      addBattleEvent(history,{hour,side:u.side,kind:"lost",title:u.name+" lost"});
    }
  }
  for(const u of next)if(!before.has(u.id)){
    history.totals[u.side].reinforcements++;
    history.records.push({id:u.id,name:u.name,side:u.side,kind:u.kind,damage:u.damageDealt??0,suppression:u.suppressionInflicted??0,initialStrength:u.strength,lastStrength:u.strength,active:true});
  }
  for(const side of SIDES){
    const arrived=next.filter(u=>u.side===side&&!before.has(u.id));
    if(arrived.length)addBattleEvent(history,{hour,side,kind:"reinforcements",title:arrived.length+" formations deployed"});
  }
  const oldOwners=new Map(previousCities.map(c=>[c.name,c.owner]));
  for(const city of nextCities)if(oldOwners.has(city.name)&&oldOwners.get(city.name)!==city.owner){
    history.totals[city.owner].captures++;
    addBattleEvent(history,{hour,side:city.owner,kind:"capture",title:city.name+" captured"});
  }
  for(const work of completedConstruction){
    history.totals[work.side].construction++;
    addBattleEvent(history,{hour,side:work.side,kind:"construction",title:work.kind.replaceAll("_"," ")+" completed"});
  }
  appendSample(history,hour,next,nextCities,openWorld);
  return history;
}
export function finishHistory(history:BattleHistory,hour:number,units:Formation[],cities:CityState[],openWorld:OpenWorldState|null|undefined,reason:string){
  history.finishedAt=hour;history.reason=reason;
  appendSample(history,hour,units,cities,openWorld,true);
  return history;
}
