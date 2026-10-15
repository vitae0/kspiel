/** Local radius queries for units; rebuilt per simulation step. */
export class SpatialGrid<T extends {x:number;y:number}>{
 private buckets=new Map<string,T[]>();
 constructor(items:readonly T[],private readonly cellSize=128){
  if(!(cellSize>0))throw new Error("cellSize must be positive");
  for(const item of items){
   const k=this.key(Math.floor(item.x/cellSize),Math.floor(item.y/cellSize)),list=this.buckets.get(k);
   if(list)list.push(item);else this.buckets.set(k,[item]);
  }
 }
 private key(x:number,y:number){return x+":"+y}
 within(x:number,y:number,radius:number):T[]{
  const results:T[]=[],r2=radius*radius,s=this.cellSize;
  for(let iy=Math.floor((y-radius)/s);iy<=Math.floor((y+radius)/s);iy++)
   for(let ix=Math.floor((x-radius)/s);ix<=Math.floor((x+radius)/s);ix++)
    for(const item of this.buckets.get(this.key(ix,iy))??[]){
     const dx=item.x-x,dy=item.y-y;
     if(dx*dx+dy*dy<=r2)results.push(item);
    }
  return results;
 }
}
