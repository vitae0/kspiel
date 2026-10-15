import {terrainAt} from "./game";
import type {CityState,Formation,Scenario,Side} from "./types";

export type TerritoryCell={x:number;y:number;owner:Side|null;control:number;contested:number};
const SIDES:Side[]=["blue","red","green"];

/** Territorial influence is a field, not an arbitrary 520px disc around each unit. */
export function scenarioTerritoryCells(scenario:Scenario,cities:CityState[],units:Formation[],step=360):TerritoryCell[]{
  const cells:TerritoryCell[]=[];
  const friendly:Record<Side,Formation[]>={blue:[],red:[],green:[]};
  const cityGroups:Record<Side,CityState[]>={blue:[],red:[],green:[]};
  for(const u of units)if(u.strength>8)friendly[u.side].push(u);
  for(const c of cities)cityGroups[c.owner].push(c);
  for(let y=step/2;y<scenario.worldHeight;y+=step)for(let x=step/2;x<scenario.worldWidth;x+=step){
    const terrain=terrainAt(scenario,x,y);
    if(terrain.terrain==="water")continue;
    const rough=terrain.terrain==="mountain"||terrain.terrain==="highmountain"?.62
      :terrain.terrain==="forest"||terrain.terrain==="marsh"?.82:1;
    const scores=SIDES.map(side=>{
      let influence=0;
      for(const city of cityGroups[side]){
        const d=Math.hypot(city.x-x,city.y-y),radius=1370*rough;
        if(d<radius)influence+=2.85*Math.pow(1-d/radius,2)*(1-Math.min(.7,city.capture/130));
      }
      for(const u of friendly[side]){
        const occupying=u.kind==="logistics"?.14:u.kind==="artillery"||u.kind==="heavy_artillery"||u.kind==="mortar"?.22
          :u.kind==="recon"?.55:u.kind==="tank"||u.kind==="armor"?.95:1.1;
        const radius=(u.kind==="recon"?510:u.kind==="tank"||u.kind==="armor"||u.kind==="mechanized"?465:375)*rough;
        const d=Math.hypot(u.x-x,u.y-y);
        if(d<radius)influence+=occupying*Math.pow(1-d/radius,2)*(u.strength/100)*(.4+.6*u.organization/100)*(.35+.65*u.supply/100);
      }
      return{side,value:influence};
    }).sort((a,b)=>b.value-a.value);
    const leader=scores[0],runner=scores[1],sum=leader.value+runner.value+.06;
    const margin=(leader.value-runner.value)/sum;
    const owner:Side|null=leader.value>.1&&margin>.065?leader.side:null;
    cells.push({x,y,owner,control:owner?Math.max(.22,Math.min(1,margin*1.1)):0,
      contested:Math.max(0,Math.min(1,1-margin*1.3))});
  }
  return cells;
}

/** The same influence-field ownership test used by the colored territory cells,
 * sampled at an individual unit rather than recomputing the entire map grid.
 * Gameplay uses this for supply so control is no longer a purely visual layer. */
export function territoryOwnerAt(scenario:Scenario,cities:CityState[],units:Formation[],x:number,y:number):Side|null{
  const terrain=terrainAt(scenario,x,y).terrain;
  if(terrain==="water")return null;
  const rough=terrain==="mountain"||terrain==="highmountain"?.62:
    terrain==="forest"||terrain==="marsh"?.82:1;
  const scores:Record<Side,number>={blue:0,red:0,green:0};
  for(const city of cities){
    const d=Math.hypot(city.x-x,city.y-y),radius=1370*rough;
    if(d<radius)scores[city.owner]+=2.85*Math.pow(1-d/radius,2)*(1-Math.min(.7,city.capture/130));
  }
  for(const unit of units){
    if(unit.strength<=8)continue;
    const radius=(unit.kind==="recon"?510:unit.kind==="tank"||unit.kind==="armor"||unit.kind==="mechanized"?465:375)*rough;
    const d=Math.hypot(unit.x-x,unit.y-y);
    if(d>=radius)continue;
    const occupying=unit.kind==="logistics"?.14:
      unit.kind==="artillery"||unit.kind==="heavy_artillery"||unit.kind==="mortar"?.22:
      unit.kind==="recon"?.55:unit.kind==="tank"||unit.kind==="armor"?.95:1.1;
    scores[unit.side]+=occupying*Math.pow(1-d/radius,2)*(unit.strength/100)*
      (.4+.6*unit.organization/100)*(.35+.65*unit.supply/100);
  }
  const ranked=SIDES.map(side=>({side,score:scores[side]})).sort((a,b)=>b.score-a.score);
  const leader=ranked[0],runner=ranked[1],margin=(leader.score-runner.score)/(leader.score+runner.score+.06);
  return leader.score>.1&&margin>.065?leader.side:null;
}

type Point={x:number;y:number};
type Edge={from:Point;to:Point;used:boolean};
/** Union adjacent ownership cells and round the outline corners. Clip result to land. */
export function territoryBoundaryPath(cells:TerritoryCell[],side:Side,step:number):string{
  const index=(x:number,y:number)=>Math.round(x/step)+","+Math.round(y/step);
  const ownerSet=new Set(cells.filter(cell=>cell.owner===side).map(cell=>index(cell.x,cell.y)));
  const edges:Edge[]=[];
  const half=step/2;
  for(const c of cells){
    if(c.owner!==side)continue;
    const ix=Math.round(c.x/step),iy=Math.round(c.y/step),x=c.x,y=c.y;
    if(!ownerSet.has((ix)+","+(iy-1)))edges.push({from:{x:x-half,y:y-half},to:{x:x+half,y:y-half},used:false});
    if(!ownerSet.has((ix+1)+","+(iy)))edges.push({from:{x:x+half,y:y-half},to:{x:x+half,y:y+half},used:false});
    if(!ownerSet.has((ix)+","+(iy+1)))edges.push({from:{x:x+half,y:y+half},to:{x:x-half,y:y+half},used:false});
    if(!ownerSet.has((ix-1)+","+(iy)))edges.push({from:{x:x-half,y:y+half},to:{x:x-half,y:y-half},used:false});
  }
  const key=(pt:Point)=>pt.x.toFixed(3)+":"+pt.y.toFixed(3);
  const outgoing=new Map<string,Edge[]>();
  for(const edge of edges){const list=outgoing.get(key(edge.from))??[];list.push(edge);outgoing.set(key(edge.from),list)}
  const parts:string[]=[];
  for(const first of edges){
    if(first.used)continue;
    const ring:Point[]=[first.from];
    let edge:Edge|undefined=first;
    while(edge&&!edge.used&&ring.length<=edges.length+1){
      edge.used=true;
      if(key(edge.to)===key(ring[0]))break;
      ring.push(edge.to);
      edge=outgoing.get(key(edge.to))?.find(e=>!e.used);
    }
    if(ring.length<3)continue;
    const enter=(a:Point,b:Point)=>({x:a.x+(b.x-a.x)*.2,y:a.y+(b.y-a.y)*.2});
    const exit=(a:Point,b:Point)=>({x:a.x+(b.x-a.x)*.2,y:a.y+(b.y-a.y)*.2});
    let d="";
    const start=exit(ring[0],ring[1]);
    d+="M "+start.x+" "+start.y+" ";
    for(let i=1;i<=ring.length;i++){
      const idx=i%ring.length,pt=ring[idx],prev=ring[(idx-1+ring.length)%ring.length],next=ring[(idx+1)%ring.length];
      const incoming=enter(pt,prev),out=exit(pt,next);
      d+="L "+incoming.x+" "+incoming.y+" Q "+pt.x+" "+pt.y+" "+out.x+" "+out.y+" ";
    }
    parts.push(d+"Z");
  }
  return parts.join(" ");
}
