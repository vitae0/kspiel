/** strategy mechanics. Extracted without changing game rules. */
import {terrainAt} from "@/sim/game";
import {type DecoyContact} from "@/sim/warfare";
import {type CityState,type Formation,type Scenario,type Side} from "@/sim/types";
import {clamp} from "@/sim/geometry";
import {DIRECT_COMBAT_KINDS,CAPTURE_KINDS,ARTILLERY_KINDS,retreatDestination,mortarMaxRange} from "@/sim/rules";

export function updateCities(cities:CityState[],units:Formation[],hours:number):CityState[]{
  return cities.map(city=>{
    const nearby=units.filter(u=>u.strength>5&&Math.hypot(u.x-city.x,u.y-city.y)<118);
    const defenders=nearby.filter(u=>u.side===city.owner&&DIRECT_COMBAT_KINDS.has(u.kind));
    const attackers=nearby.filter(u=>u.side!==city.owner&&CAPTURE_KINDS.has(u.kind));
    if(defenders.length||!attackers.length)return{...city,capture:Math.max(0,city.capture-hours*14)};

    const bySide=new Map<Side,Formation[]>();
    for(const u of attackers)bySide.set(u.side,[...(bySide.get(u.side)??[]),u]);
    const ranked=[...bySide.entries()].sort((a,b)=>b[1].reduce((s,u)=>s+u.readiness,0)-a[1].reduce((s,u)=>s+u.readiness,0));
    if(ranked.length>1)return{...city,capture:Math.max(0,city.capture-hours*5)};

    const [attackingSide,force]=ranked[0];
    const avgReadiness=force.reduce((sum,u)=>sum+u.readiness,0)/force.length;
    const infantryWeight=force.reduce((sum,u)=>sum+(u.kind==="infantry"?1.25:u.kind==="militia"?1.05:u.kind==="partisan"?1.22:u.kind==="engineer"?1.4:1),0);
    const capture=city.capture+hours*(10+4*Math.sqrt(infantryWeight))*(.5+avgReadiness/210);
    return capture>=100?{...city,owner:attackingSide,capture:0}:{...city,capture};
  });
}

export function enemyAI(scenario:Scenario,units:Formation[],cities:CityState[],side:Side,decoys:DecoyContact[]=[],elapsed=0):Formation[]{
  const friendly=units.filter(u=>u.side===side);
  const hostile=units.filter(u=>u.side!==side);
  const hostileCities=cities.filter(c=>c.owner!==side);
  const friendlyCities=cities.filter(c=>c.owner===side);
  if(!hostile.length)return units;

  const hash=(id:string)=>{let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const combatPower=(u:Formation)=>(u.softAttack+u.hardAttack*.65+u.defense*.45)*(u.strength/100)*(u.organization/100)*(.55+u.supply/220);
  const localPower=(x:number,y:number,force:Formation[],radius:number)=>force.filter(v=>DIRECT_COMBAT_KINDS.has(v.kind)&&Math.hypot(v.x-x,v.y-y)<radius).reduce((sum,v)=>sum+combatPower(v),0);
  const currentTargetUnit=(u:Formation)=>u.order?.targetUnitId?units.find(v=>v.id===u.order?.targetUnitId&&v.side!==u.side&&v.strength>1):undefined;
  const currentTargetCity=(u:Formation)=>u.order?.targetX!==undefined&&u.order?.targetY!==undefined
    ?hostileCities.find(c=>Math.hypot(c.x-u.order!.targetX!,c.y-u.order!.targetY!)<90)
    :undefined;
  const safeDestination=(u:Formation,p:{x:number;y:number})=>terrainAt(scenario,p.x,p.y).terrain!=="water"&&Math.hypot(p.x-u.x,p.y-u.y)>75;

  const hostilePressure=(x:number,y:number)=>localPower(x,y,hostile,280);
  const friendlyPressure=(x:number,y:number)=>localPower(x,y,friendly,280);
  const cityScore=(u:Formation,c:CityState,current?:CityState)=>{
    const d=Math.hypot(c.x-u.x,c.y-u.y);
    const defenders=hostilePressure(c.x,c.y);
    const support=friendlyPressure(c.x,c.y);
    const crowd=friendly.filter(v=>v.id!==u.id&&v.order?.targetX!==undefined&&v.order?.targetY!==undefined&&Math.hypot(v.order.targetX-c.x,v.order.targetY-c.y)<110).length;
    const roleBias=u.kind==="recon"?1.18:u.kind==="raider"?.7:u.kind==="partisan"?.91:u.kind==="cavalry"||u.kind==="mechanized"||u.kind==="tank"?1.08:1;
    const stick=current?.name===c.name?1.42:1;
    const spread=1/(1+crowd*.17);
    return roleBias*stick*spread*(1+support*.0045)/(1+d/950)/(1+defenders*.007);
  };

  return units.map((u):Formation=>{
    if(u.side!==side)return u;
    let nearestHostile:{v:Formation;d:number}|undefined;
    let nearestSquared=Infinity;
    for(const v of hostile){
      const dx=v.x-u.x,dy=v.y-u.y,d2=dx*dx+dy*dy;
      if(d2<nearestSquared){nearestSquared=d2;nearestHostile={v,d:Math.sqrt(d2)}}
    }
    if(!nearestHostile)return u;
    // Irregulars prioritize isolated convoys and vulnerable artillery instead of open-field clashes.
    if(u.kind==="partisan"||u.kind==="raider"){
      const rearTarget=hostile.filter(v=>v.kind==="logistics"||ARTILLERY_KINDS.has(v.kind))
        .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)})).filter(v=>v.d<660).sort((a,b)=>a.d-b.d)[0];
      if(rearTarget&&u.supply>22&&u.organization>34&&nearestHostile.d>250){
        return{...u,order:{type:"probe",targetUnitId:rearTarget.v.id}};
      }
    }
    // Limited deception: only a subset of regular formations diverts to an unverified decoy.
    const isScout=u.kind==="recon";
    const lure=decoys.filter(d=>d.owner!==side&&d.expiresAt>elapsed&&Math.hypot(d.x-u.x,d.y-u.y)<950)
      .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
    if(lure&&!isScout&&u.kind!=="logistics"&&!ARTILLERY_KINDS.has(u.kind)&&nearestHostile.d>450
      &&u.organization>42&&u.supply>25&&hash(u.id)%3===0&&Math.hypot(u.x-lure.x,u.y-lure.y)>150){
      return{...u,order:{type:"probe",targetX:lure.x,targetY:lure.y}};
    }

    const nearestFriendlyCombat=friendly
      .filter(v=>v.id!==u.id&&DIRECT_COMBAT_KINDS.has(v.kind))
      .map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y)}))
      .sort((a,b)=>a.d-b.d)[0];

    // A retreat is a commitment, not a mood swing. Recover before reconsidering.
    if(u.order?.type==="retreat"&&u.order.targetX!==undefined&&u.order.targetY!==undefined){
      const retreatLeft=Math.hypot(u.order.targetX-u.x,u.order.targetY-u.y);
      if(retreatLeft>80&&(u.organization<62||u.strength<68||u.supply<34))return u;
    }

    if(ARTILLERY_KINDS.has(u.kind)){
      const maxRange=u.kind==="mortar"?mortarMaxRange(scenario,u):u.kind==="heavy_artillery"?820:540;
      const current=currentTargetUnit(u);
      if(current){
        const d=Math.hypot(current.x-u.x,current.y-u.y);
        if(d<=maxRange*1.08&&u.supply>16&&u.organization>20){
          return u.kind==="mortar"?{...u,order:{type:"fire",targetX:current.x,targetY:current.y}}:{...u,order:{type:"fire",targetUnitId:current.id}};
        }
      }
      const candidates=hostile.map(v=>({v,d:Math.hypot(v.x-u.x,v.y-u.y),score:combatPower(v)/(1+Math.hypot(v.x-u.x,v.y-u.y)/maxRange)}))
        .filter(x=>x.d<=maxRange).sort((a,b)=>b.score-a.score);
      if(candidates.length&&u.supply>20&&u.organization>24){
        const target=candidates[0].v;
        return u.kind==="mortar"?{...u,order:{type:"fire",targetX:target.x,targetY:target.y}}:{...u,order:{type:"fire",targetUnitId:target.id}};
      }
      const anchor=nearestFriendlyCombat?.v;
      if(anchor){
        const enemy=current??nearestHostile.v;
        const dx=anchor.x-enemy.x,dy=anchor.y-enemy.y,len=Math.hypot(dx,dy)||1;
        const standoff=u.kind==="mortar"?340:245;
        const tx=clamp(anchor.x+dx/len*standoff,20,scenario.worldWidth-20),ty=clamp(anchor.y+dy/len*standoff,20,scenario.worldHeight-20);
        if(safeDestination(u,{x:tx,y:ty})){
          if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-tx,u.order.targetY-ty)<130)return u;
          return{...u,order:{type:"move",targetX:tx,targetY:ty}};
        }
      }
      return u.order?.type==="defend"?u:{...u,order:{type:"defend"}};
    }

    if(u.kind==="logistics"){
      const movingAnchor=u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined
        ?friendly.filter(v=>DIRECT_COMBAT_KINDS.has(v.kind)).map(v=>({v,d:Math.hypot(v.x-u.order!.targetX!,v.y-u.order!.targetY!)})).sort((a,b)=>a.d-b.d)[0]?.v
        :undefined;
      const anchor=movingAnchor??nearestFriendlyCombat?.v;
      if(!anchor)return u.order?.type==="resupply"?u:{...u,order:{type:"resupply"}};
      const enemy=hostile.map(v=>({v,d:Math.hypot(v.x-anchor.x,v.y-anchor.y)})).sort((a,b)=>a.d-b.d)[0]?.v??nearestHostile.v;
      const dx=anchor.x-enemy.x,dy=anchor.y-enemy.y,len=Math.hypot(dx,dy)||1;
      const tx=clamp(anchor.x+dx/len*390,20,scenario.worldWidth-20),ty=clamp(anchor.y+dy/len*390,20,scenario.worldHeight-20);
      if(Math.hypot(tx-u.x,ty-u.y)>145&&terrainAt(scenario,tx,ty).terrain!=="water"){
        if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-tx,u.order.targetY-ty)<170)return u;
        return{...u,order:{type:"move",targetX:tx,targetY:ty}};
      }
      return u.order?.type==="resupply"?u:{...u,order:{type:"resupply"}};
    }

    if(DIRECT_COMBAT_KINDS.has(u.kind)){
      const friendlyPower=localPower(u.x,u.y,friendly,280)+combatPower(u);
      const enemyPower=localPower(u.x,u.y,hostile,280);
      const ratio=friendlyPower/Math.max(1,enemyPower);

      // Hysteresis prevents advance/retreat thrashing around a single threshold.
      const retreating=u.order?.type==="retreat";
      const shouldRetreat=(u.morale??82)<(retreating?27:15)||u.organization<(retreating?58:34)||u.strength<(retreating?64:46)||u.supply<(retreating?30:10)||(nearestHostile.d<170&&ratio<(retreating?.98:.72));
      if(shouldRetreat){
        if(retreating&&u.order?.targetX!==undefined&&u.order?.targetY!==undefined)return u;
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }

      const currentEnemy=currentTargetUnit(u);
      if(currentEnemy){
        const d=Math.hypot(currentEnemy.x-u.x,currentEnemy.y-u.y);
        const targetLocalEnemy=localPower(currentEnemy.x,currentEnemy.y,hostile,220);
        const targetLocalFriendly=localPower(currentEnemy.x,currentEnemy.y,friendly,220)+combatPower(u);
        const targetRatio=targetLocalFriendly/Math.max(1,targetLocalEnemy);
        if(d<430&&targetRatio>.7&&u.organization>36&&u.supply>12){
          if(d<220)return{...u,order:{type:targetRatio>=1.16&&u.organization>46?"assault":"probe",targetUnitId:currentEnemy.id}};
          return u;
        }
      }

      if(nearestHostile.d<210){
        if(ratio>=1.18&&u.organization>46&&u.supply>18)return{...u,order:{type:"assault",targetUnitId:nearestHostile.v.id}};
        if(ratio>=.8)return{...u,order:{type:"probe",targetUnitId:nearestHostile.v.id}};
        const d=retreatDestination(u,units,cities);
        return{...u,order:{type:"retreat",targetX:d.x,targetY:d.y}};
      }

      const currentCity=currentTargetCity(u);
      const scoredCities=hostileCities.map(c=>({c,score:cityScore(u,c,currentCity),d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>b.score-a.score);
      if(currentCity){
        const currentScore=cityScore(u,currentCity,currentCity);
        const best=scoredCities[0];
        const remaining=Math.hypot(currentCity.x-u.x,currentCity.y-u.y);
        if(remaining>110&&(!best||best.c.name===currentCity.name||best.score<currentScore*1.32))return u;
      }

      const nearestFriendlyCity=friendlyCities.map(c=>({c,d:Math.hypot(c.x-u.x,c.y-u.y)})).sort((a,b)=>a.d-b.d)[0];
      if(ratio<.9&&nearestFriendlyCity&&nearestFriendlyCity.d>140){
        if(u.order?.type==="move"&&u.order.targetX!==undefined&&u.order.targetY!==undefined&&Math.hypot(u.order.targetX-nearestFriendlyCity.c.x,u.order.targetY-nearestFriendlyCity.c.y)<90)return u;
        return{...u,order:{type:"move",targetX:nearestFriendlyCity.c.x,targetY:nearestFriendlyCity.c.y}};
      }

      if(scoredCities.length&&ratio>.98){
        const top=scoredCities.slice(0,Math.min(3,scoredCities.length));
        const slot=hash(u.id)%top.length;
        const chosen=(u.kind==="recon"?top[Math.min(slot,top.length-1)]:top[slot]).c;
        if(u.kind==="recon"&&nearestHostile.d>360)return{...u,order:{type:"probe",targetX:chosen.x,targetY:chosen.y}};
        return{...u,order:{type:"move",targetX:chosen.x,targetY:chosen.y}};
      }

      // Hold useful ground instead of constantly searching for another destination.
      if(u.order?.type==="defend"||u.order?.type==="dig")return u;
      return{...u,order:{type:"defend"}};
    }
    return u;
  });
}
