/** rules mechanics. Extracted without changing game rules. */
import {terrainAt,TERRAIN_RULES} from "@/sim/game";
import {type CityState,type Formation,type Scenario,type TerrainSample} from "@/sim/types";
import {clamp} from "@/sim/geometry";

export const SOLO_SPEED=[0,1,2.5,6];
export const MULTIPLAYER_SPEED=[0,.5,1,2];
export const SIM_HOURS_PER_REAL_SECOND=.75;
export const MAX_FRAME_SECONDS=.12;
export const SIM_TICK_MS=100;
export const AI_COMMAND_INTERVAL_SECONDS=1.05;
export const MOVEMENT_SCALE=4.2;
export const RETREAT_SUPPLY_MIN=0;
export const DIRECT_COMBAT_KINDS=new Set<Formation["kind"]>(["infantry","militia","partisan","raider","mechanized","armor","tank","cavalry","mountaineer","special_forces","recon","engineer"]);
export const CAPTURE_KINDS=new Set<Formation["kind"]>(["infantry","militia","partisan","mechanized","tank","cavalry","mountaineer","special_forces","engineer"]);
export const ARTILLERY_KINDS=new Set<Formation["kind"]>(["mortar","artillery","heavy_artillery"]);
export const GUN_ARTILLERY_KINDS=new Set<Formation["kind"]>(["artillery","heavy_artillery"]);
export const MORTAR_BASE_RANGE=980;
export const MORTAR_BASE_DISPERSION=170;
export const MOTORIZED_KINDS=new Set<Formation["kind"]>(["armor","tank","mechanized","recon","logistics"]);

export function isInCombat(u:Formation,units:Formation[]){
  return units.some(v=>v.side!==u.side&&DIRECT_COMBAT_KINDS.has(v.kind)&&Math.hypot(v.x-u.x,v.y-u.y)<116);
}

export function retreatDestination(u:Formation,units:Formation[],cities:CityState[]){
  const city=cities.filter(c=>c.owner===u.side).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  if(city)return{x:city.x,y:city.y};
  const log=units.filter(v=>v.side===u.side&&v.kind==="logistics").sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
  return log?{x:log.x,y:log.y}:{x:u.x,y:u.y};
}

export function visionRange(u:Formation){
  return u.kind==="recon"?650+u.recon*4.6:300+u.recon*2.5;
}


export function mortarTerrainProfile(terrain:TerrainSample["terrain"]){
  return {
    water:{dispersion:1.8,effect:.25},
    plains:{dispersion:1,effect:1},
    desert:{dispersion:.94,effect:1.06},
    forest:{dispersion:1.28,effect:.76},
    hills:{dispersion:1.16,effect:.84},
    mountain:{dispersion:1.34,effect:.7},
    highmountain:{dispersion:1.5,effect:.58},
    marsh:{dispersion:1.24,effect:.9},
    urban:{dispersion:1.3,effect:.72}
  }[terrain];
}

export function mortarMaxRange(scenario:Scenario,u:Formation){
  const terrain=terrainAt(scenario,u.x,u.y).terrain;
  const terrainFactor=terrain==="mountain"?1.12:terrain==="hills"?1.08:terrain==="highmountain"?1.15:terrain==="forest"?.94:terrain==="marsh"?.92:1;
  return MORTAR_BASE_RANGE*terrainFactor;
}

export function mortarDispersion(scenario:Scenario,x:number,y:number,rangeRatio=.5){
  const terrain=mortarTerrainProfile(terrainAt(scenario,x,y).terrain);
  return MORTAR_BASE_DISPERSION*terrain.dispersion*(.82+.42*clamp(rangeRatio,0,1));
}

export function movementSupplyFactor(u:Formation){
  const s=clamp(u.supply/100,0,1);
  if(u.kind==="special_forces")return .9+.1*Math.sqrt(s);
  if(u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="engineer"||u.kind==="militia"||u.kind==="partisan"||u.kind==="raider")return .72+.28*Math.sqrt(s);
  if(u.kind==="cavalry")return .62+.38*Math.sqrt(s);
  if(ARTILLERY_KINDS.has(u.kind))return .38+.62*s;
  if(MOTORIZED_KINDS.has(u.kind))return .42+.58*s;
  return .58+.42*s;
}


export function roadMovementBonus(u:Formation){
  if(ARTILLERY_KINDS.has(u.kind))return 2.5;
  if(u.kind==="logistics")return 2.05;
  if(u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"||u.kind==="recon")return 1.8;
  if(u.kind==="cavalry")return 1.45;
  return 1.55;
}

export function movementTerrainFactor(u:Formation,terrain:TerrainSample["terrain"]){
  const base=TERRAIN_RULES[terrain].move;
  if(terrain==="highmountain"&&u.kind==="mountaineer")return .78;
  if(u.kind==="mountaineer"&&(terrain==="mountain"||terrain==="hills"))return base*1.45;
  if(u.kind==="cavalry"&&(terrain==="plains"||terrain==="desert"))return base*1.28;
  if((u.kind==="partisan"||u.kind==="raider")&&(terrain==="forest"||terrain==="hills"||terrain==="mountain"))return Math.min(1.04,base*1.52);
  return base;
}

// Cheap ETA estimate used only when issuing orders. Runtime movement still uses the
// full terrain/road model. One midpoint sample is deliberately "fake but fast".

export function forageSupply(u:Formation,terrain:TerrainSample["terrain"],inCombat:boolean){
  if(inCombat)return 0;
  if(u.kind==="partisan"||u.kind==="raider"||u.kind==="militia"){
    const rate={
      forest:u.kind==="partisan"?.46:u.kind==="raider"?.37:.15,
      hills:u.kind==="partisan"?.38:u.kind==="raider"?.29:.12,
      mountain:u.kind==="partisan"?.32:u.kind==="raider"?.22:.07,
      highmountain:.08,marsh:u.kind==="partisan"?.28:.11,plains:u.kind==="partisan"?.14:.08,
      desert:.035,urban:.16,water:0
    }[terrain];
    return rate;
  }
  if(u.kind==="special_forces"){
    const rate={forest:.42,hills:.38,mountain:.34,highmountain:.22,marsh:.28,plains:.18,desert:.08,urban:.12,water:0}[terrain];
    return rate;
  }
  if(u.kind==="mountaineer"){
    const rate={forest:.14,hills:.22,mountain:.3,highmountain:.24,marsh:.08,plains:.07,desert:.03,urban:.06,water:0}[terrain];
    return rate;
  }
  return 0;
}

