/** simulation mechanics. Extracted without changing game rules. */
import {terrainAt,TERRAIN_RULES} from "@/sim/game";
import {AMMO_TYPES,SHELL_INTERVAL,fireBudget,marchPaces,replenish,type GunEvent} from "@/sim/attrition";
import {type OpenWorldState} from "@/sim/openworld";
import {type CityState,type Emplacement,type Formation,type Scenario,type TerrainSample} from "@/sim/types";
import {clamp,segmentContact,segmentsIntersect,structureSegmentDistance} from "@/sim/geometry";
import {MOVEMENT_SCALE,DIRECT_COMBAT_KINDS,ARTILLERY_KINDS,GUN_ARTILLERY_KINDS,MOTORIZED_KINDS,isInCombat,retreatDestination,mortarTerrainProfile,mortarMaxRange,mortarDispersion,movementSupplyFactor,roadMovementBonus,movementTerrainFactor,forageSupply} from "@/sim/rules";
import {computeSupplyNetwork,computeLogisticsLinks,supplyAccess} from "@/sim/logistics";

export function resolveReliefs(units:Formation[],cities:CityState[]):Formation[]{
  const out=units.map(u=>({...u,order:u.order?{...u.order}:undefined}));
  for(const relief of out){
    if(relief.order?.type!=="relieve"||!relief.order.targetUnitId)continue;
    const target=out.find(v=>v.id===relief.order?.targetUnitId&&v.side===relief.side);
    if(!target){relief.order={type:"defend"};continue}
    if(Math.hypot(relief.x-target.x,relief.y-target.y)>54)continue;

    const inheritedEnemy=target.order?.targetUnitId
      ?out.find(v=>v.id===target.order?.targetUnitId&&v.side!==target.side)
      :out.filter(v=>v.side!==target.side&&DIRECT_COMBAT_KINDS.has(v.kind)).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];

    if(inheritedEnemy)relief.order={type:"assault",targetUnitId:inheritedEnemy.id};
    else relief.order={type:"defend"};

    const d=retreatDestination(target,out,cities);
    target.order={type:"retreat",targetX:d.x,targetY:d.y};
    target.organization=clamp(target.organization+6,0,100);
  }
  return out;
}


export function simulate(scenario:Scenario,units:Formation[],hours:number,cities:CityState[],emplacements:Emplacement[]=[],openWorld:OpenWorldState|null=null,effects?:GunEvent[],now=0){
  const marching=marchPaces(units,u=>{
    const ground=terrainAt(scenario,u.x,u.y);
    return u.speed*movementTerrainFactor(u,ground.terrain)*movementSupplyFactor(u)*(ground.road?roadMovementBonus(u):1);
  });
  const lagging=new Map<string,number>();
  for(const u of units)if(u.order?.type==="move"&&u.order.marchId&&u.order.marchGoalX!==undefined&&u.order.marchGoalY!==undefined){
    const remaining=Math.hypot(u.x-u.order.marchGoalX,u.y-u.order.marchGoalY);
    const progress=clamp(1-remaining/Math.max(1,u.order.marchInitialDistance??remaining),0,1);
    lagging.set(u.order.marchId,Math.min(lagging.get(u.order.marchId)??1,progress));
  }
  const supplyNetwork=computeSupplyNetwork(scenario,units,cities);
  const logisticsGraph=computeLogisticsLinks(scenario,units,cities,supplyNetwork,emplacements);
  const next=units.map(u=>{
    const sample=terrainAt(scenario,u.x,u.y);
    const terrain=TERRAIN_RULES[sample.terrain];
    const access=supplyAccess(scenario,u,units,cities,supplyNetwork,emplacements,logisticsGraph,openWorld);
    const n:Formation={...u,order:u.order?{...u.order}:undefined};
    n.suppression=clamp((u.suppression??0)-hours*(u.order?.type==="retreat"?7:3.5),0,100);
    n.morale=clamp((u.morale??82)+hours*((u.supply>25?0.15:-.28)-(u.suppression??0)*.009),0,100);

    if(n.order?.targetUnitId){
      const tracked=units.find(v=>v.id===n.order?.targetUnitId&&v.strength>1);
      if(tracked)n.order={...n.order,targetX:tracked.x,targetY:tracked.y};
      else n.order={type:"defend"};
    }
    if(n.order?.finalType==="assault"&&n.order.finalTargetUnitId){
      const target=units.find(v=>v.id===n.order?.finalTargetUnitId&&v.strength>1);
      if(target&&Math.hypot(target.x-u.x,target.y-u.y)<95)
        n.order={type:"assault",targetUnitId:target.id,targetX:target.x,targetY:target.y};
    }

    const inCombat=isInCombat(u,units);
    const baselineBurn=(u.kind==="tank"||u.kind==="armor"?1.12:u.kind==="mechanized"?.86:u.kind==="heavy_artillery"?.96:u.kind==="artillery"?.72:u.kind==="mortar"?.62:u.kind==="logistics"?.58:u.kind==="special_forces"?.26:u.kind==="partisan"?.19:u.kind==="raider"?.24:u.kind==="militia"?.29:u.kind==="cavalry"?.38:u.kind==="infantry"?.375:.5);
    const harshClimate=sample.terrain==="desert"&&(MOTORIZED_KINDS.has(u.kind)||u.kind==="infantry")?1.16:sample.terrain==="mountain"&&MOTORIZED_KINDS.has(u.kind)?1.22:sample.terrain==="marsh"&&["mechanized","tank","armor"].includes(u.kind)?1.17:1;
    const supplyBurn=baselineBurn*harshClimate*(inCombat?1.72:1)*(scenario.presetId==="open-world"?.55:1);
    n.supply=clamp(n.supply-hours*supplyBurn/Math.max(.38,terrain.supply),0,100);
    n.supply=clamp(n.supply+hours*forageSupply(u,sample.terrain,inCombat),0,100);
    if(MOTORIZED_KINDS.has(u.kind))n.fuel=clamp(n.fuel-hours*(inCombat?.42:.18),0,100);

    const logisticsConnected=access.level>0&&(u.isolationHours??0)<6;
    if(logisticsConnected){
      n.supply=clamp(n.supply+hours*access.supplyPerHour*(scenario.presetId==="open-world"?1.65:1),0,100);
      if(MOTORIZED_KINDS.has(u.kind))n.fuel=clamp(n.fuel+hours*access.fuelPerHour,0,100);
    }
    // Gun ammunition and building materials are independent finite stockpiles.
    // An isolated pocket only recovers at a nearly negligible field-scavenging rate.
    if(AMMO_TYPES.has(n.kind))n.ammo=replenish(n.ammo,logisticsConnected?access.level:0,n.supply,access.supplyPerHour,hours,"ammo");
    n.materials=replenish(n.materials,logisticsConnected?access.level:0,n.supply,access.supplyPerHour,hours,"materials");

    const friendlyCity=sample.objective?cities.find(c=>c.name===sample.objective&&c.owner===u.side):undefined;
    if(friendlyCity&&!inCombat&&n.supply>22){
      n.strength=clamp(n.strength+hours*.16,0,100);
      n.organization=clamp(n.organization+hours*.48,0,100);
      n.supply=clamp(n.supply-hours*.12,0,100);
    }

    if(n.order?.type==="dig"){
      n.entrenchment=clamp(n.entrenchment+hours*.42,0,100);
      n.organization=clamp(n.organization+hours*.18,0,100);
      n.supply=clamp(n.supply-hours*.05,0,100);
    }else if(n.order?.type==="resupply"){
      const orderSupply=access.level===0?.12:.45+Math.log2(access.level+1)*.92;
      n.supply=clamp(n.supply+hours*orderSupply,0,100);
      n.fuel=clamp(n.fuel+hours*(access.level===0?.04:.85),0,100);
      n.organization=clamp(n.organization+hours*(access.level===0?.12:.5),0,100);
    }else if(n.order?.type==="fire"){
      n.entrenchment=clamp(n.entrenchment+hours*.01,0,100);
    }else if(n.order&&n.order.targetX!==undefined&&n.order.targetY!==undefined){
      const dx=n.order.targetX-u.x,dy=n.order.targetY-u.y,dist=Math.hypot(dx,dy);
      if(dist<5&&!n.order.targetUnitId){
        n.x=n.order.targetX;n.y=n.order.targetY;
        const [nextWaypoint,...remaining]=n.order.waypoints??[];
        n.order=nextWaypoint?{...n.order,type:"move",targetX:nextWaypoint.x,targetY:nextWaypoint.y,waypoints:remaining}
          :n.order.finalType?{type:n.order.finalType,targetUnitId:n.order.finalTargetUnitId}
          :{type:"defend"};
      }else if(dist>0){
        const posture=n.order.type==="retreat"?1.9:n.order.type==="relieve"?1.12:n.order.type==="assault"?.58:n.order.type==="probe"?.74:1;
        const fieldRoad=emplacements.some(e=>e.kind==="road"&&e.strength>0&&structureSegmentDistance(e,u.x,u.y)<34);
        const strategicRoad=openWorld?.structures.some(s=>s.kind==="road"&&s.strength>0&&structureSegmentDistance(s,u.x,u.y)<34);
        const onRoad=sample.road||fieldRoad||Boolean(strategicRoad);
        const roadBonus=onRoad
          ?ARTILLERY_KINDS.has(u.kind)?2.5
          :u.kind==="logistics"?2.05
          :u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"||u.kind==="recon"?1.8
          :u.kind==="cavalry"?1.45
          :1.55
          :1;
        const terrainMove=(sample.terrain==="highmountain"&&u.kind==="mountaineer")?.78
          :(u.kind==="mountaineer"&&(sample.terrain==="mountain"||sample.terrain==="hills"))?terrain.move*1.45
          :(u.kind==="cavalry"&&(sample.terrain==="plains"||sample.terrain==="desert"))?terrain.move*1.28
          :((u.kind==="partisan"||u.kind==="raider")&&["forest","hills","mountain"].includes(sample.terrain))?Math.min(1.04,terrain.move*1.52)
          :terrain.move;
        const supplyMove=n.order.type==="retreat"?Math.max(.72,movementSupplyFactor(n)):movementSupplyFactor(n);
        const ordinaryPace=u.speed*terrainMove*roadBonus*posture*supplyMove;
        // Each independent march column advances no faster than its current slowest
        // combat member. Guns/logistics travel separately and are not pace-limited.
        const marchLimit=n.order.marchId?marching.get(n.order.marchId):undefined;
        const finishedDistance=n.order.marchGoalX!==undefined&&n.order.marchGoalY!==undefined
          ?Math.hypot(u.x-n.order.marchGoalX,u.y-n.order.marchGoalY):Infinity;
        const fraction=n.order.marchId?clamp(1-finishedDistance/Math.max(1,n.order.marchInitialDistance??finishedDistance),0,1):0;
        const waiting=Boolean(n.order.marchId)&&fraction>(lagging.get(n.order.marchId!)??fraction)+.11;
        const travel=waiting?0:Math.min(dist,Math.min(ordinaryPace,marchLimit??Infinity)*hours*MOVEMENT_SCALE);
        let nx=clamp(u.x+dx/dist*travel,1,scenario.worldWidth-1),ny=clamp(u.y+dy/dist*travel,1,scenario.worldHeight-1);

        if(DIRECT_COMBAT_KINDS.has(u.kind)&&n.order.type!=="retreat"){
          const contact=units.filter(v=>v.side!==u.side).map(v=>({v,...segmentContact(u.x,u.y,nx,ny,v.x,v.y)})).filter(c=>c.distance<44).sort((a,b)=>a.t-b.t)[0];
          if(contact){
            const stopDistance=Math.max(0,travel*contact.t-36);
            nx=clamp(u.x+dx/dist*stopDistance,1,scenario.worldWidth-1);ny=clamp(u.y+dy/dist*stopDistance,1,scenario.worldHeight-1);
          }
        }

        const blockingWall=openWorld?.structures.find(s=>s.kind==="wall"&&s.side!==u.side&&s.strength>0&&s.x2!==undefined&&s.y2!==undefined&&segmentsIntersect(u.x,u.y,nx,ny,s.x,s.y,s.x2,s.y2));
        const blockingBarricade=emplacements.find(e=>e.kind==="barricade"&&e.side!==u.side&&e.strength>0&&e.x2!==undefined&&e.y2!==undefined&&segmentsIntersect(u.x,u.y,nx,ny,e.x,e.y,e.x2,e.y2));
        const obstacle=blockingWall??blockingBarricade;
        if(obstacle){
          if(n.order.type==="assault"||n.order.type==="probe"){
            const breachPower=(n.softAttack*.055+n.hardAttack*.08)*(n.organization/100)*Math.max(.25,n.supply/100);
            obstacle.strength=Math.max(0,obstacle.strength-hours*breachPower);
            n.organization=clamp(n.organization-hours*.42,0,100);
            n.supply=clamp(n.supply-hours*.22,0,100);
          }
          if(obstacle.strength>0){nx=u.x;ny=u.y}
        }
        const nextTerrain=terrainAt(scenario,nx,ny).terrain;
        const passable=nextTerrain!=="water"&&(nextTerrain!=="highmountain"||u.kind==="mountaineer");
        if(passable){
          n.x=nx;n.y=ny;
          const movementSupplyCost=onRoad?0:travel*(u.kind==="armor"||u.kind==="tank"||u.kind==="mechanized"?.024:u.kind==="heavy_artillery"?.02:.012);
          n.supply=clamp(n.supply-movementSupplyCost,0,100);
          n.fuel=clamp(n.fuel-travel*(u.kind==="armor"||u.kind==="tank"?.021:u.kind==="mechanized"||u.kind==="recon"?.013:.001),0,100);
          n.entrenchment=Math.max(0,n.entrenchment-hours*.7);
          n.organization=clamp(n.organization-hours*.12,0,100);
        }
      }
    }else{
      n.organization=clamp(n.organization+hours*.08,0,100);
      n.entrenchment=clamp(n.entrenchment+hours*.012,0,100);
    }

    const special=u.kind==="special_forces";
    const foot=u.kind==="infantry"||u.kind==="mountaineer"||u.kind==="engineer"||u.kind==="militia"||u.kind==="partisan"||u.kind==="raider";
    if(n.supply<25)n.organization=clamp(n.organization-hours*(special?.08:foot?.34:.78),0,100);
    n.organization=clamp(n.organization-hours*(n.suppression??0)*.006,0,100);
    if((n.morale??80)<12&&n.order?.type!=="retreat")n.organization=clamp(n.organization-hours*.7,0,100);
    if(n.supply<12){n.organization=clamp(n.organization-hours*(special?.16:foot?.62:1.25),0,100);n.strength=clamp(n.strength-hours*(special?.012:foot?.05:.14),0,100)}
    if(n.supply<4)n.strength=clamp(n.strength-hours*(special?.035:foot?.12:.3),0,100);
    n.readiness=clamp(n.organization*.46+n.supply*.3+n.strength*.24,0,100);
    return n;
  });

  let result=resolveReliefs(next,cities);

  for(let i=0;i<result.length;i++){
    for(let j=i+1;j<result.length;j++){
      const a=result[i],b=result[j];
      if(a.side===b.side)continue;
      const dist=Math.hypot(a.x-b.x,a.y-b.y);
      if(dist>48)continue;

      const aCan=DIRECT_COMBAT_KINDS.has(a.kind),bCan=DIRECT_COMBAT_KINDS.has(b.kind);
      if(!aCan&&!bCan)continue;
      const aWall=openWorld?.structures.some(s=>(s.kind==="wall"||s.kind==="fort")&&s.side===a.side&&Math.hypot(s.x-a.x,s.y-a.y)<150)?1.32:1;
      const bWall=openWorld?.structures.some(s=>(s.kind==="wall"||s.kind==="fort")&&s.side===b.side&&Math.hypot(s.x-b.x,s.y-b.y)<150)?1.32:1;
      const fieldDefense=(u:Formation,attacker:Formation)=>{
        let factor=1;
        for(const e of emplacements){
          if(e.side!==u.side||e.strength<=0)continue;
          const distance=structureSegmentDistance(e,u.x,u.y);
          if(e.kind==="trench"&&distance<85){
             const assaultModifier=attacker.kind==="tank"?.07:attacker.kind==="armor"?.11:attacker.kind==="mechanized"?.17:.38;
             const defenderModifier=u.kind==="tank"?.55:u.kind==="armor"?.7:1;
             factor=Math.max(factor,1+assaultModifier*defenderModifier);
           }
          else if(e.kind==="barricade"&&distance<75)factor=Math.max(factor,1.22);
          else if(e.kind==="field_fortification"&&distance<e.range)factor=Math.max(factor,1.26);
        }
        return factor;
      };
      const aTerrain=terrainAt(scenario,a.x,a.y).terrain,bTerrain=terrainAt(scenario,b.x,b.y).terrain;
      const irregularCover=(u:Formation,t:TerrainSample["terrain"])=>
        u.kind==="partisan"?(["forest","hills","mountain","marsh"].includes(t)?1.33:.82)
        :u.kind==="raider"?(["forest","hills","mountain"].includes(t)?1.15:.76)
        :u.kind==="militia"?(t==="urban"?1.38:t==="forest"?1.13:1):1;
      const irregularAmbush=(u:Formation,t:TerrainSample["terrain"],target:Formation)=>
        (u.kind==="partisan"||u.kind==="raider")&&["forest","hills","mountain","marsh"].includes(t)
        ?(u.kind==="partisan"?1.36:1.52)*(target.recon>65?.8:1):1;
      const aDef=TERRAIN_RULES[aTerrain].defense*aWall*fieldDefense(a,b)*irregularCover(a,aTerrain);
      const bDef=TERRAIN_RULES[bTerrain].defense*bWall*fieldDefense(b,a)*irregularCover(b,bTerrain);
      const aRetreat=a.order?.type==="retreat",bRetreat=b.order?.type==="retreat";
      const aPower=aCan&&!aRetreat?(a.softAttack*(1-b.hardness)+a.hardAttack*b.hardness)*(a.organization/100)*(a.supply/100)*(1-(a.suppression??0)*.006)*(0.6+(a.morale??82)/205)*irregularAmbush(a,aTerrain,b):0;
      const bPower=bCan&&!bRetreat?(b.softAttack*(1-a.hardness)+b.hardAttack*a.hardness)*(b.organization/100)*(b.supply/100)*(1-(b.suppression??0)*.006)*(0.6+(b.morale??82)/205)*irregularAmbush(b,bTerrain,a):0;
      const aPosture=a.order?.type==="assault"?1.22:a.order?.type==="probe"?.76:1;
      const bPosture=b.order?.type==="assault"?1.22:b.order?.type==="probe"?.76:1;
      const aLoss=(bPower*bPosture/Math.max(20,a.defense*aDef+a.entrenchment*(a.kind==="tank"?.45:1.35)))*hours*2.15*(aRetreat?1.2:1);
      const bLoss=(aPower*aPosture/Math.max(20,b.defense*bDef+b.entrenchment*(b.kind==="tank"?.45:1.35)))*hours*2.15*(bRetreat?1.2:1);
      const actualALoss=Math.min(a.strength,aLoss),actualBLoss=Math.min(b.strength,bLoss);
      // Small-arms skirmishes are visible too, but use quick tracers rather than artillery blasts.
      if(aPower>0&&aCan){
        a.shotClock=(a.shotClock??0)+hours;
        if(a.shotClock>=.27){
          a.shotClock-=.27;
          effects?.push({id:a.id+"-rifle-"+b.id+"-"+now,kind:"rifle",side:a.side,
            fromX:a.x,fromY:a.y,x:b.x,y:b.y,birth:now});
        }
      }
      if(bPower>0&&bCan){
        b.shotClock=(b.shotClock??0)+hours;
        if(b.shotClock>=.27){
          b.shotClock-=.27;
          effects?.push({id:b.id+"-rifle-"+a.id+"-"+now,kind:"rifle",side:b.side,
            fromX:b.x,fromY:b.y,x:a.x,y:a.y,birth:now});
        }
      }
      a.damageDealt=(a.damageDealt??0)+actualBLoss;
      b.damageDealt=(b.damageDealt??0)+actualALoss;
      a.strength=clamp(a.strength-aLoss,0,100);b.strength=clamp(b.strength-bLoss,0,100);
      if(irregularAmbush(b,bTerrain,a)>1)a.suppression=clamp((a.suppression??0)+actualALoss*1.7,0,100);
      a.morale=clamp((a.morale??82)-actualALoss*.38,0,100);
      if(irregularAmbush(a,aTerrain,b)>1)b.suppression=clamp((b.suppression??0)+actualBLoss*1.7,0,100);
      b.morale=clamp((b.morale??82)-actualBLoss*.38,0,100);
      a.organization=clamp(a.organization-aLoss*1.9,0,100);b.organization=clamp(b.organization-bLoss*1.9,0,100);
    }
  }

  for(const gun of result){
    if(!ARTILLERY_KINDS.has(gun.kind)||gun.order?.type!=="fire")continue;

    if(gun.kind==="mortar"){
      if(gun.order.targetX===undefined||gun.order.targetY===undefined)continue;
      const tx=gun.order.targetX,ty=gun.order.targetY;
      const range=Math.hypot(tx-gun.x,ty-gun.y),maxRange=mortarMaxRange(scenario,gun);
      if(range>maxRange||gun.supply<8||gun.organization<10)continue;
      const volley=fireBudget(gun.ammo,gun.kind,hours);
      if(volley.spent<=0)continue;
      gun.ammo=volley.remaining;
      const targetTerrain=terrainAt(scenario,tx,ty).terrain;
      const profile=mortarTerrainProfile(targetTerrain);
      const dispersion=mortarDispersion(scenario,tx,ty,range/maxRange);
      const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*dispersion;
      const impactX=clamp(tx+Math.cos(angle)*radius,1,scenario.worldWidth-1),impactY=clamp(ty+Math.sin(angle)*radius,1,scenario.worldHeight-1);
      const rangeFactor=clamp(1-range/maxRange*.42,.58,1);
      for(const target of result){
        if(target.id===gun.id)continue;
        const d=Math.hypot(target.x-impactX,target.y-impactY);
        if(d>105)continue;
        const falloff=clamp(1-d/115,.08,1);
        const friendlyFire=target.side===gun.side?.55:1;
        const cover=mortarTerrainProfile(terrainAt(scenario,target.x,target.y).terrain).effect;
        const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor*profile.effect*falloff*friendlyFire;
        const loss=(power/Math.max(22,target.defense*.62+target.entrenchment*1.3))*hours*volley.ratio*1.22*cover*(target.kind==="tank"?.86:target.kind==="armor"?.94:1);
        const actual=Math.min(target.strength,loss),shock=clamp(loss*4,0,25);
        if(target.side!==gun.side){gun.damageDealt=(gun.damageDealt??0)+actual;gun.suppressionInflicted=(gun.suppressionInflicted??0)+shock}
        target.suppression=clamp((target.suppression??0)+shock,0,100);
        target.morale=clamp((target.morale??82)-loss*1.7-shock*.12,0,100);
        target.strength=clamp(target.strength-loss,0,100);
        target.organization=clamp(target.organization-loss*3.25,0,100);
      }
      gun.supply=clamp(gun.supply-hours*.82*volley.ratio,0,100);gun.organization=clamp(gun.organization-hours*.035*volley.ratio,0,100);
      gun.shotClock=(gun.shotClock??0)+hours*volley.ratio;
      const interval=SHELL_INTERVAL[gun.kind]??.4;
      let emitted=0;
      while(gun.shotClock>=interval&&emitted++<2){
        gun.shotClock-=interval;
        effects?.push({id:gun.id+"-"+now+"-"+emitted,kind:"mortar",side:gun.side,fromX:gun.x,fromY:gun.y,x:impactX,y:impactY,birth:now});
      }
      continue;
    }

    if(!gun.order.targetUnitId||!GUN_ARTILLERY_KINDS.has(gun.kind))continue;
    const target=result.find(v=>v.id===gun.order?.targetUnitId&&v.side!==gun.side);
    if(!target)continue;
    const range=Math.hypot(target.x-gun.x,target.y-gun.y);
    const maxRange=gun.kind==="heavy_artillery"?820:540;
    if(range>maxRange||gun.supply<10||gun.organization<10)continue;
    const volley=fireBudget(gun.ammo,gun.kind,hours);
    if(volley.spent<=0)continue;
    gun.ammo=volley.remaining;
    const terrain=TERRAIN_RULES[terrainAt(scenario,target.x,target.y).terrain];
    const rangeFactor=clamp(1-(range-80)/(gun.kind==="heavy_artillery"?880:530),.34,1);
    const power=(gun.softAttack*(1-target.hardness)+gun.hardAttack*target.hardness)*(gun.organization/100)*(gun.supply/100)*rangeFactor;
    const loss=(power/Math.max(24,target.defense*terrain.defense+target.entrenchment*1.15))*hours*volley.ratio*(gun.kind==="heavy_artillery"?1.65:1.45)*(target.kind==="tank"?.86:target.kind==="armor"?.94:1);
    gun.damageDealt=(gun.damageDealt??0)+Math.min(target.strength,loss);
    const shock=clamp(loss*3.2,0,28);
    gun.suppressionInflicted=(gun.suppressionInflicted??0)+shock;
    target.suppression=clamp((target.suppression??0)+shock,0,100);
    target.morale=clamp((target.morale??82)-loss*1.5-shock*.15,0,100);
    target.strength=clamp(target.strength-loss,0,100);target.organization=clamp(target.organization-loss*2.2,0,100);
    gun.supply=clamp(gun.supply-hours*(gun.kind==="heavy_artillery"?1.45:.95)*volley.ratio,0,100);gun.organization=clamp(gun.organization-hours*.04*volley.ratio,0,100);
    gun.shotClock=(gun.shotClock??0)+hours*volley.ratio;
    const interval=SHELL_INTERVAL[gun.kind]??.6;
    let emitted=0;
    while(gun.shotClock>=interval&&emitted++<2){
      gun.shotClock-=interval;
      effects?.push({id:gun.id+"-"+now+"-"+emitted,kind:gun.kind as "artillery"|"heavy_artillery",side:gun.side,
        fromX:gun.x,fromY:gun.y,x:target.x,y:target.y,birth:now});
    }
  }

  return result.filter(u=>u.strength>1);
}

