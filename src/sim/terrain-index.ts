import type {Scenario} from "./types";
type Segment={ax:number;ay:number;bx:number;by:number};
const CELL_SIZE=256,RADIUS=30;
const indexes=new WeakMap<Scenario,Map<string,Segment[]>>();
const key=(x:number,y:number)=>x+":"+y;
/** Cache the static road geometry per generated scenario. */
function build(scenario:Scenario){
 const cells=new Map<string,Segment[]>();
 for(const route of scenario.roadRoutes)for(let i=0;i+1<route.length;i++){
  const a=route[i],b=route[i+1],segment={ax:a.x,ay:a.y,bx:b.x,by:b.y};
  const x0=Math.floor((Math.min(a.x,b.x)-RADIUS)/CELL_SIZE),x1=Math.floor((Math.max(a.x,b.x)+RADIUS)/CELL_SIZE);
  const y0=Math.floor((Math.min(a.y,b.y)-RADIUS)/CELL_SIZE),y1=Math.floor((Math.max(a.y,b.y)+RADIUS)/CELL_SIZE);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const k=key(x,y),bucket=cells.get(k);
   if(bucket)bucket.push(segment);else cells.set(k,[segment]);
  }
 }
 return cells;
}
/** Maintains original strict distance < 30, including point/segment endpoints. */
export function roadNearPoint(scenario:Scenario,x:number,y:number){
 let cells=indexes.get(scenario);
 if(!cells){cells=build(scenario);indexes.set(scenario,cells)}
 const bucket=cells.get(key(Math.floor(x/CELL_SIZE),Math.floor(y/CELL_SIZE)));
 if(!bucket)return false;
 for(const s of bucket){
  const dx=s.bx-s.ax,dy=s.by-s.ay,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((x-s.ax)*dx+(y-s.ay)*dy)/len)):0;
  const xx=x-(s.ax+t*dx),yy=y-(s.ay+t*dy);
  if(xx*xx+yy*yy<RADIUS*RADIUS)return true;
 }
 return false;
}
