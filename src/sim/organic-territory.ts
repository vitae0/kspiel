import type {Side} from "./types";

type Cell={x:number;y:number;owner:Side|null};
type Point={x:number;y:number};
type Segment={a:Point;b:Point};

/** A visual contour only: ownership, capture, supply and income stay grid-based. */
export function organicTerritoryBoundaryPath(cells:Cell[],side:Side,step:number):string{
  if(!cells.length||step<=0)return "";
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const c of cells){minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y)}
  // Offset from real cell coordinates: open-world cells aren't centered at step/2.
  const owned=new Set<string>();
  for(const c of cells)if(c.owner===side)owned.add(Math.round((c.x-minX)/step)+","+Math.round((c.y-minY)/step));
  if(!owned.size)return "";
  const occupied=(ix:number,iy:number)=>owned.has(ix+","+iy)?1:-1;
  const smooth=(t:number)=>t*t*(3-2*t);
  const field=(x:number,y:number)=>{
    // Same deterministic warp for every side, so neighboring borders align.
    const wx=step*(.11*Math.sin(y/(1.8*step)+Math.sin(x/(2.75*step)))+.04*Math.sin(y/(.9*step)+x/(2.1*step)));
    const wy=step*(.11*Math.sin(x/(1.65*step)+Math.cos(y/(2.4*step)))+.04*Math.cos(x/(.85*step)-y/(2*step)));
    const gx=(x+wx-minX)/step,gy=(y+wy-minY)/step;
    const ix=Math.floor(gx),iy=Math.floor(gy),tx=smooth(gx-ix),ty=smooth(gy-iy);
    const upper=occupied(ix,iy)*(1-tx)+occupied(ix+1,iy)*tx;
    const lower=occupied(ix,iy+1)*(1-tx)+occupied(ix+1,iy+1)*tx;
    return upper*(1-ty)+lower*ty;
  };
  const pitch=step/3,left=minX-1.5*step,top=minY-1.5*step;
  const columns=Math.ceil((maxX-minX+3*step)/pitch),rows=Math.ceil((maxY-minY+3*step)/pitch),stride=columns+1;
  const values=new Float64Array(stride*(rows+1));
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)values[y*stride+x]=field(left+x*pitch,top+y*pitch);
  const edgeCorners=[[0,1],[1,2],[2,3],[3,0]];
  const segments:Segment[]=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const row=y*stride+x,next=row+stride;
    const v=[values[row],values[row+1],values[next+1],values[next]];
    const mask=(v[0]>0?1:0)|(v[1]>0?2:0)|(v[2]>0?4:0)|(v[3]>0?8:0);
    if(!mask||mask===15)continue;
    const center=(v[0]+v[1]+v[2]+v[3])/4;
    let pairs:number[][]=[];
    switch(mask){
      case 1:pairs=[[3,0]];break;case 2:pairs=[[0,1]];break;
      case 3:pairs=[[3,1]];break;case 4:pairs=[[1,2]];break;
      case 5:pairs=center>0?[[0,1],[2,3]]:[[3,0],[1,2]];break;
      case 6:pairs=[[0,2]];break;case 7:pairs=[[3,2]];break;
      case 8:pairs=[[2,3]];break;case 9:pairs=[[0,2]];break;
      case 10:pairs=center>0?[[3,0],[1,2]]:[[0,1],[2,3]];break;
      case 11:pairs=[[1,2]];break;case 12:pairs=[[1,3]];break;
      case 13:pairs=[[0,1]];break;case 14:pairs=[[3,0]];break;
    }
    const px=left+x*pitch,py=top+y*pitch;
    const corners:Point[]=[{x:px,y:py},{x:px+pitch,y:py},{x:px+pitch,y:py+pitch},{x:px,y:py+pitch}];
    const cross=(edge:number):Point=>{
      const [a,b]=edgeCorners[edge],t=v[a]===v[b]?.5:Math.max(0,Math.min(1,v[a]/(v[a]-v[b])));
      return{x:corners[a].x+(corners[b].x-corners[a].x)*t,y:corners[a].y+(corners[b].y-corners[a].y)*t};
    };
    for(const [a,b] of pairs)segments.push({a:cross(a),b:cross(b)});
  }
  // Stitch contour fragments into closed rings, including disconnected pockets.
  const key=(p:Point)=>p.x.toFixed(5)+":"+p.y.toFixed(5);
  const adjacent=new Map<string,number[]>();
  segments.forEach((s,i)=>{for(const p of [s.a,s.b]){const k=key(p),list=adjacent.get(k)??[];list.push(i);adjacent.set(k,list)}});
  const visited=new Uint8Array(segments.length),paths:string[]=[];
  const f=(n:number)=>n.toFixed(1);
  for(let i=0;i<segments.length;i++){
    if(visited[i])continue;
    visited[i]=1;
    const ring:Point[]=[segments[i].a];let tip=segments[i].b,closed=false;
    for(let limit=0;limit<=segments.length;limit++){
      if(key(tip)===key(ring[0])){closed=true;break}
      ring.push(tip);
      const nextId=adjacent.get(key(tip))?.find(j=>!visited[j]);
      if(nextId===undefined)break;
      visited[nextId]=1;
      const s=segments[nextId];tip=key(s.a)===key(tip)?s.b:s.a;
    }
    if(!closed||ring.length<3)continue;
    const last=ring[ring.length-1],first=ring[0];
    let path="M "+f((last.x+first.x)/2)+" "+f((last.y+first.y)/2);
    for(let j=0;j<ring.length;j++){
      const p=ring[j],n=ring[(j+1)%ring.length];
      path+=" Q "+f(p.x)+" "+f(p.y)+" "+f((p.x+n.x)/2)+" "+f((p.y+n.y)/2);
    }
    paths.push(path+" Z");
  }
  return paths.join(" ");
}
