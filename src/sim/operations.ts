import type {Formation,Side} from "./types";

export const ARMY_PALETTE=["#f4d35e","#c5a3ef","#f4aa73","#eaded0","#e69ac5","#d6c684"];
export function armyGroupColor(groupId?:string){
  const match=groupId?.match(/-army-(\\d+)$/);
  return match?ARMY_PALETTE[(Number(match[1])-1)%ARMY_PALETTE.length]:"#a7a79c";
}

/** Stable spatial grouping at deployment. Never reassign a manual player group in the tick loop. */
export function groupNearbyFormations(formations:Formation[],side:Side,maxGroups=6):Formation[]{
  if(!formations.length)return formations;
  const uniquePlaces=new Map<string,{x:number;y:number}>();
  for(const unit of formations)uniquePlaces.set(Math.round(unit.x/180)+":"+Math.round(unit.y/180),{x:unit.x,y:unit.y});
  const positions=[...uniquePlaces.values()];
  const k=Math.min(maxGroups,positions.length);
  const seeds=[positions[0]];
  while(seeds.length<k){
    const ranked=positions.filter(p=>!seeds.includes(p)).map(p=>({p,d:Math.min(...seeds.map(c=>Math.hypot(c.x-p.x,c.y-p.y)))})).sort((a,b)=>b.d-a.d);
    if(!ranked.length)break;
    seeds.push(ranked[0].p);
  }
  let centers=seeds.map(p=>({...p}));
  for(let pass=0;pass<7;pass++){
    const buckets=centers.map(()=>[] as Formation[]);
    for(const u of formations){
      let best=0,dist=Infinity;
      centers.forEach((c,i)=>{const d=Math.hypot(u.x-c.x,u.y-c.y);if(d<dist){dist=d;best=i}});
      buckets[best].push(u);
    }
    centers=centers.map((c,i)=>buckets[i].length?{
      x:buckets[i].reduce((sum,u)=>sum+u.x,0)/buckets[i].length,
      y:buckets[i].reduce((sum,u)=>sum+u.y,0)/buckets[i].length
    }:c);
  }
  const sorted=centers.map((c,i)=>({...c,i})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const labels=new Map(sorted.map((c,i)=>[c.i,i+1]));
  return formations.map(u=>{
    let best=0,dist=Infinity;
    centers.forEach((c,i)=>{const d=Math.hypot(u.x-c.x,u.y-c.y);if(d<dist){best=i;dist=d}});
    return {...u,groupId:side+"-army-"+labels.get(best)};
  });
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
