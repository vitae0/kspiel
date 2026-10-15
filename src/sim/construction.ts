/** construction mechanics. Extracted without changing game rules. */
import {constructionWork,fireBudget,replenish,type GunEvent} from "@/sim/attrition";
import {type CityState,type ConstructionProject,type Emplacement,type Formation} from "@/sim/types";
import {clamp,structureSegmentDistance} from "@/sim/geometry";
import {isInCombat} from "@/sim/rules";

export function applyEmplacementFire(units:Formation[],emplacements:Emplacement[],cities:CityState[],hours:number,effects?:GunEvent[],now=0){
  const result=units.map(u=>({...u,order:u.order?{...u.order}:undefined}));
  for(const emplacement of emplacements){
    if(emplacement.strength<=0)continue;
    if(emplacement.kind==="field_fortification"){
      for(const u of result)if(u.side===emplacement.side&&Math.hypot(u.x-emplacement.x,u.y-emplacement.y)<=emplacement.range){
        u.entrenchment=clamp(u.entrenchment+hours*.22,0,100);
        u.organization=clamp(u.organization+hours*.06,0,100);
      }
      continue;
    }
    if(emplacement.kind==="trench"){
      for(const u of result)if(u.side===emplacement.side&&structureSegmentDistance(emplacement,u.x,u.y)<=85){
        u.entrenchment=clamp(u.entrenchment+hours*.92,0,100);
        u.organization=clamp(u.organization+hours*.08,0,100);
      }
      continue;
    }
    if(emplacement.kind==="supply_depot"||emplacement.kind==="barricade"||emplacement.kind==="road")continue;
    if(emplacement.kind!=="fixed_artillery")continue;
    const target=result
      .filter(u=>u.side!==emplacement.side&&u.strength>1&&Math.hypot(u.x-emplacement.x,u.y-emplacement.y)<=emplacement.range)
      .sort((a,b)=>Math.hypot(a.x-emplacement.x,a.y-emplacement.y)-Math.hypot(b.x-emplacement.x,b.y-emplacement.y))[0];
    if(!target)continue;
    const supplied=cities.some(c=>c.owner===emplacement.side&&Math.hypot(c.x-emplacement.x,c.y-emplacement.y)<1150);
    emplacement.ammo=replenish(emplacement.ammo,supplied?2:0,supplied?100:8,supplied?3:0,hours,"ammo");
    const volley=fireBudget(emplacement.ammo,"artillery",hours);
    if(volley.spent<=0)continue;
    emplacement.ammo=volley.remaining;
    const fireFactor=supplied?1:.32;
    target.strength=clamp(target.strength-hours*volley.ratio*.34*fireFactor,0,100);
    target.organization=clamp(target.organization-hours*volley.ratio*.92*fireFactor,0,100);
    emplacement.shotClock=(emplacement.shotClock??0)+hours*volley.ratio;
    if(emplacement.shotClock>=.6){
      emplacement.shotClock-=.6;
      effects?.push({id:emplacement.id+"-"+now,kind:"artillery",side:emplacement.side,
        fromX:emplacement.x,fromY:emplacement.y,x:target.x,y:target.y,birth:now});
    }
  }
  return result.filter(u=>u.strength>1);
}

export function advanceConstruction(projects:ConstructionProject[],emplacements:Emplacement[],units:Formation[],hours:number){
  const nextProjects:ConstructionProject[]=[];
  const nextEmplacements=[...emplacements];
  for(const project of projects){
    const workX=project.x2===undefined?project.x:(project.x+project.x2)*.5;
    const workY=project.y2===undefined?project.y:(project.y+project.y2)*.5;
    const builders=units.filter(u=>project.builderIds.includes(u.id)&&u.side===project.side&&u.strength>8&&(project.kind!=="road"||u.kind==="logistics"));
    const active=builders.filter(u=>Math.hypot(u.x-workX,u.y-workY)<92&&u.supply>12&&!isInCombat(u,units));
    let workBudget=hours*(project.kind==="trench"?27:12);
    let progress=project.progress;
    for(const builder of active){
      if(workBudget<=0||progress>=project.requiredHours)break;
      const skill=(builder.kind==="engineer"?4:builder.kind==="logistics"&&project.kind==="road"?1.35:1)*(project.kind==="trench"?2.1:1);
      const {work,remaining}=constructionWork(builder.materials,hours,skill,Math.min(workBudget,project.requiredHours-progress));
      if(work<=0)continue;
      builder.materials=remaining;
      builder.supply=clamp(builder.supply-work*(project.kind==="fixed_artillery"?.095:project.kind==="supply_depot"?.08:.06),0,100);
      progress+=work;workBudget-=work;
    }
    if(progress>=project.requiredHours){
      nextEmplacements.push({
        id:"em-"+project.id,kind:project.kind,side:project.side,x:project.x,y:project.y,x2:project.x2,y2:project.y2,
        strength:project.kind==="barricade"?145:project.kind==="trench"?125:100,
        ammo:project.kind==="fixed_artillery"?100:undefined,shotClock:0,
        range:project.kind==="observatory"?1100:project.kind==="fixed_artillery"?860:project.kind==="field_fortification"?125:project.kind==="supply_depot"?540:project.kind==="trench"?85:project.kind==="barricade"?75:0
      });
    }else nextProjects.push({...project,progress});
  }
  return{projects:nextProjects,emplacements:nextEmplacements};
}
