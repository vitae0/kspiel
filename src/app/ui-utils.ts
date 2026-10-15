/** ui-utils mechanics. Extracted without changing game rules. */
import {type EmplacementKind} from "@/sim/types";
import {clamp} from "@/sim/geometry";

export function pct(v:number){return Math.round(clamp(v,0,100))}
export function timeLabel(hour:number){
  const h=Math.floor(hour)%24;
  const m=Math.floor((hour-Math.floor(hour))*60);
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}


export function constructionLabel(kind:EmplacementKind){
  return kind==="observatory"?"OBSERVATORY"
    :kind==="fixed_artillery"?"FIXED ARTILLERY"
    :kind==="field_fortification"?"FIELD FORTIFICATION"
    :kind==="supply_depot"?"SUPPLY DEPOT"
    :kind==="trench"?"TRENCH"
    :kind==="barricade"?"BARRICADE"
    :"ROAD";
}

export function constructionShort(kind:EmplacementKind){
  return kind==="observatory"?"OBS":kind==="fixed_artillery"?"BAT":kind==="field_fortification"?"FORT":kind==="supply_depot"?"DEP":kind==="trench"?"TRN":kind==="barricade"?"BAR":"RD";
}

export function isLinearConstruction(kind:EmplacementKind){
  return kind==="trench"||kind==="barricade"||kind==="road";
}

