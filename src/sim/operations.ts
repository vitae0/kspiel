import type {Formation,Side} from "./types";

export const ARMY_PALETTE=["#f4d35e","#c5a3ef","#f4aa73","#eaded0","#e69ac5","#d6c684"];
export function armyGroupColor(groupId?:string){
  const match=groupId?.match(/-army-(\d+)$/);
  return match?ARMY_PALETTE[(Number(match[1])-1)%ARMY_PALETTE.length]:"#a7a79c";
}

/** Stable spatial grouping at deployment. Never reassign a manual player group in the tick loop. */
export function recommendedArmyGroupCount(unitCount:number):number{
  // Small theaters have fewer commands; giant theaters have separate sectors.
  return Math.max(1,Math.min(12,Math.ceil(unitCount/16)));
}

/** Build spatially coherent, balanced mixed-arms groups at initial deployment.
 * Each army receives the rare support/armor/infantry types before duplicates,
 * while the distance penalty keeps its formations in the same sector. */
export function groupNearbyFormations(formations:Formation[],side:Side,maxGroups?:number):Formation[]{
  if(!formations.length)return formations;
  const k=Math.min(formations.length,maxGroups??recommendedArmyGroupCount(formations.length));
  const sortedPositions=[...formations].sort((a,b)=>a.x-b.x||a.y-b.y);
  const seeds=[{x:sortedPositions[0].x,y:sortedPositions[0].y}];
  while(seeds.length<k){
    const remaining=sortedPositions.map(u=>({u,d:Math.min(...seeds.map(c=>Math.hypot(c.x-u.x,c.y-u.y)))}))
      .sort((a,b)=>b.d-a.d);
    if(!remaining.length)break;
    seeds.push({x:remaining[0].u.x,y:remaining[0].u.y});
  }
  const centers=seeds.map(point=>({...point}));
  const groups=centers.map(()=>[] as Formation[]);
  const targetSize=Math.ceil(formations.length/k);
  // Deploy the least common branches first so each group gets a representative
  // share rather than placing all artillery and logistics in one command.
  const frequency=new Map<Formation["kind"],number>();
  for(const unit of formations)frequency.set(unit.kind,(frequency.get(unit.kind)??0)+1);
  const queue=[...formations].sort((a,b)=>
    (frequency.get(a.kind)??0)-(frequency.get(b.kind)??0)||a.x-b.x||a.y-b.y);
  const assignments=new Map<string,number>();
  for(const unit of queue){
    let best=0,bestScore=Infinity;
    for(let i=0;i<groups.length;i++){
      const group=groups[i];
      if(group.length>=targetSize)continue;
      const distance=Math.hypot(unit.x-centers[i].x,unit.y-centers[i].y);
      const duplicates=group.filter(existing=>existing.kind===unit.kind).length;
      // Capacity + duplicate pressure are measured in world coordinate units.
      const score=distance+duplicates*125+group.length*35;
      if(score<bestScore){bestScore=score;best=i}
    }
    groups[best].push(unit);
    assignments.set(unit.id,best);
    // Slowly adapt each command center to its actual assigned formations.
    const n=groups[best].length;
    centers[best]={x:centers[best].x+(unit.x-centers[best].x)/n,
      y:centers[best].y+(unit.y-centers[best].y)/n};
  }
  const ranked=centers.map((point,i)=>({...point,i})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const labels=new Map(ranked.map((point,i)=>[point.i,i+1]));
  return formations.map(unit=>({...unit,groupId:side+"-army-"+labels.get(assignments.get(unit.id)??0)}));
}

export type RoadVisualPiece={points:{x:number;y:number}[];cut:boolean};
/** Render only the actual interdicted interval red, not the whole connected road. */
export function roadVisualPieces(route:{x:number;y:number}[],cuts:{along:number}[],radius=115):RoadVisualPiece[]{
  if(route.length<2)return [];
  const lengths=[0];
  for(let i=1;i<route.length;i++)lengths.push(lengths[i-1]+Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y));
  const total=lengths[lengths.length-1];
  if(total<1)return [];
  const endpoints=new Set<number>([0,total]);
  for(const c of cuts){endpoints.add(Math.max(0,c.along-radius));endpoints.add(Math.min(total,c.along+radius))}
  const sorted=[...endpoints].sort((a,b)=>a-b);
  const at=(distance:number)=>{
    const index=Math.min(route.length-2,Math.max(0,lengths.findIndex((v,i)=>i>0&&v>=distance)-1));
    const seg=lengths[index+1]-lengths[index]||1;
    const t=Math.max(0,Math.min(1,(distance-lengths[index])/seg));
    return{x:route[index].x+(route[index+1].x-route[index].x)*t,y:route[index].y+(route[index+1].y-route[index].y)*t};
  };
  const pieces:RoadVisualPiece[]=[];
  for(let i=0;i<sorted.length-1;i++){
    const lo=sorted[i],hi=sorted[i+1];if(hi-lo<.01)continue;
    const points=[at(lo),...route.filter((_,j)=>lengths[j]>lo&&lengths[j]<hi),at(hi)];
    pieces.push({points,cut:cuts.some(c=>Math.abs((hi+lo)*.5-c.along)<=radius)});
  }
  return pieces;
}
