/** Front geometry in world coordinates, shared by input, simulation and SVGs. */
export type FrontPoint={x:number;y:number};
export type FrontFrame=FrontPoint&{tx:number;ty:number;nx:number;ny:number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const dist=(a:FrontPoint,b:FrontPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

export function frontPathPoints(front:{start:FrontPoint;end:FrontPoint;points?:FrontPoint[]}):FrontPoint[]{
  return front.points&&front.points.length>=2?front.points:[front.start,front.end];
}
export function frontPathLength(points:readonly FrontPoint[]):number{
  let total=0;
  for(let i=1;i<points.length;i++)total+=dist(points[i-1],points[i]);
  return total;
}
/** Equal fractions always mean equal arc lengths, regardless of pointer sample density. */
export function frontPathFrame(points:readonly FrontPoint[],fraction:number):FrontFrame{
  if(!points.length)return{x:0,y:0,tx:1,ty:0,nx:0,ny:1};
  const total=frontPathLength(points);
  if(total<1e-6)return{...points[0],tx:1,ty:0,nx:0,ny:1};
  const target=clamp(fraction,0,1)*total;
  let travelled=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],segment=dist(a,b);
    if(segment<1e-6)continue;
    if(travelled+segment>=target||i===points.length-1){
      const ratio=clamp((target-travelled)/segment,0,1),tx=(b.x-a.x)/segment,ty=(b.y-a.y)/segment;
      return{x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio,tx,ty,nx:-ty,ny:tx};
    }
    travelled+=segment;
  }
  return{...points[points.length-1],tx:1,ty:0,nx:0,ny:1};
}
/** Smoothed vertex normal: used to advance all segments, not just the endpoints. */
export function frontVertexFrame(points:readonly FrontPoint[],index:number):FrontFrame{
  if(!points.length)return frontPathFrame(points,0);
  const i=clamp(index,0,points.length-1),a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const length=dist(a,b);
  if(length<1e-6)return frontPathFrame(points,i/Math.max(1,points.length-1));
  const tx=(b.x-a.x)/length,ty=(b.y-a.y)/length;
  return{...points[i],tx,ty,nx:-ty,ny:tx};
}
/** Nearest progress along polyline, for stable left-to-right unit assignments. */
export function nearestFrontFraction(points:readonly FrontPoint[],p:FrontPoint):number{
  const total=frontPathLength(points);
  if(total<1e-6)return 0;
  let walked=0,best=Infinity,location=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,segment=dist(a,b);
    if(segment<1e-6)continue;
    const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(segment*segment),0,1);
    const d=(p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;
    if(d<best){best=d;location=(walked+segment*t)/total}
    walked+=segment;
  }
  return location;
}
/** Preserve bends while removing pointer jitter and capping network/save payloads. */
export function simplifyFrontPath(input:readonly FrontPoint[],tolerance=5,maxPoints=256):FrontPoint[]{
  const points:FrontPoint[]=[];
  for(const p of input)if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&(!points.length||dist(p,points[points.length-1])>1e-4))points.push(p);
  if(points.length<=2)return points;
  const simplify=(epsilon:number)=>{
    const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;
    const stack:Array<[number,number]>=[[0,points.length-1]];
    while(stack.length){
      const [lo,hi]=stack.pop()!,a=points[lo],b=points[hi];
      const dx=b.x-a.x,dy=b.y-a.y,squared=dx*dx+dy*dy;
      let largest=epsilon*epsilon,index=-1;
      for(let i=lo+1;i<hi;i++){
        const p=points[i],t=squared>0?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/squared,0,1):0;
        const d=(p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;
        if(d>largest){largest=d;index=i}
      }
      if(index>=0){keep[index]=1;stack.push([lo,index],[index,hi])}
    }
    return points.filter((_,i)=>keep[i]===1);
  };
  let epsilon=Math.max(.5,tolerance),result=simplify(epsilon);
  while(result.length>maxPoints){epsilon*=1.6;result=simplify(epsilon)}
  return result;
}
