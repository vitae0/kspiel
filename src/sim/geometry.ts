/** geometry mechanics. Extracted without changing game rules. */
import {type CityState} from "@/sim/types";

export function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}

export function segmentContact(ax:number,ay:number,bx:number,by:number,px:number,py:number){
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  if(!len)return{distance:Math.hypot(px-ax,py-ay),t:0};
  const t=clamp(((px-ax)*dx+(py-ay)*dy)/len,0,1);
  return{distance:Math.hypot(px-(ax+t*dx),py-(ay+t*dy)),t};
}

export function segmentsIntersect(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  const orient=(px:number,py:number,qx:number,qy:number,rx:number,ry:number)=>(qx-px)*(ry-py)-(qy-py)*(rx-px);
  const o1=orient(ax,ay,bx,by,cx,cy),o2=orient(ax,ay,bx,by,dx,dy),o3=orient(cx,cy,dx,dy,ax,ay),o4=orient(cx,cy,dx,dy,bx,by);
  return ((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0));
}

export function segmentIntersectionPoint(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  const rx=bx-ax,ry=by-ay,sx=dx-cx,sy=dy-cy;
  const den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-7)return null;
  const qx=cx-ax,qy=cy-ay;
  const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  if(t<0||t>1||u<0||u>1)return null;
  return{x:ax+t*rx,y:ay+t*ry};
}


export function structureSegmentDistance(s:{x:number;y:number;x2?:number;y2?:number},x:number,y:number){
  return s.x2===undefined||s.y2===undefined?Math.hypot(s.x-x,s.y-y):segmentContact(s.x,s.y,s.x2,s.y2,x,y).distance;
}


export function nearestCityTo(point:{x:number;y:number},cities:CityState[]){
  return cities.map(c=>({c,d:Math.hypot(c.x-point.x,c.y-point.y)})).sort((a,b)=>a.d-b.d)[0]?.c;
}

export function cityAtPoint(cities:CityState[],x:number,y:number,radius=105){
  return cities.map(c=>({c,d:Math.hypot(c.x-x,c.y-y)})).filter(v=>v.d<=radius).sort((a,b)=>a.d-b.d)[0]?.c;
}

export type RoutePosition={distance:number;point:{x:number;y:number};segment:number;t:number;along:number;total:number};

export function routePosition(route:{x:number;y:number}[],x:number,y:number):RoutePosition{
  let best:RoutePosition={distance:Infinity,point:{x,y},segment:0,t:0,along:0,total:0};
  let walked=0,total=0;
  const lengths:number[]=[];
  for(let i=0;i<route.length-1;i++){
    const len=Math.hypot(route[i+1].x-route[i].x,route[i+1].y-route[i].y);
    lengths.push(len);total+=len;
  }
  for(let i=0;i<route.length-1;i++){
    const hit=segmentContact(route[i].x,route[i].y,route[i+1].x,route[i+1].y,x,y);
    if(hit.distance<best.distance){
      best={distance:hit.distance,point:{x:route[i].x+(route[i+1].x-route[i].x)*hit.t,y:route[i].y+(route[i+1].y-route[i].y)*hit.t},segment:i,t:hit.t,along:walked+lengths[i]*hit.t,total};
    }
    walked+=lengths[i];
  }
  return best;
}

export function routeDistance(route:{x:number;y:number}[],x:number,y:number){
  return routePosition(route,x,y).distance;
}

export function dedupeRoutePoints(points:Array<{x:number;y:number}>){
  const out:Array<{x:number;y:number}>=[];
  for(const point of points){
    const last=out[out.length-1];
    if(!last||Math.hypot(last.x-point.x,last.y-point.y)>2)out.push(point);
  }
  return out;
}

