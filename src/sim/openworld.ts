import {WORLD_H,WORLD_W} from "./game";
import type {CityState,Formation,Scenario,Side,UnitKind} from "./types";

export type OpenWorldBuildKind="infantry_barracks"|"mobile_barracks"|"support_barracks"|"road"|"wall"|"fort"|"city";
export type OpenWorldStructure={id:string;kind:OpenWorldBuildKind;side:Side;x:number;y:number;x2?:number;y2?:number;strength:number};
export type Recruitment={id:string;side:Side;kind:UnitKind;barracksId:string;hoursLeft:number};
export type ResourceNode={id:string;x:number;y:number;owner:Side|null;resource:"manpower"|"materials"|"fuel";value:number;urban:number};
export type OpenWorldState={
  resources:Record<Side,{manpower:number;materials:number;fuel:number}>;
  structures:OpenWorldStructure[];
  recruitment:Recruitment[];
  resourceNodes:ResourceNode[];
  serial:number;
};

export const UNIT_COST:Partial<Record<UnitKind,{family:"infantry_barracks"|"mobile_barracks"|"support_barracks";manpower:number;materials:number;fuel:number;hours:number}>>={
  infantry:{family:"infantry_barracks",manpower:90,materials:35,fuel:0,hours:10},
  mountaineer:{family:"infantry_barracks",manpower:105,materials:45,fuel:0,hours:13},
  special_forces:{family:"infantry_barracks",manpower:120,materials:65,fuel:5,hours:18},
  engineer:{family:"infantry_barracks",manpower:80,materials:55,fuel:0,hours:12},
  cavalry:{family:"mobile_barracks",manpower:95,materials:45,fuel:0,hours:11},
  recon:{family:"mobile_barracks",manpower:70,materials:70,fuel:18,hours:10},
  mechanized:{family:"mobile_barracks",manpower:85,materials:120,fuel:55,hours:18},
  tank:{family:"mobile_barracks",manpower:70,materials:165,fuel:85,hours:24},
  mortar:{family:"support_barracks",manpower:65,materials:60,fuel:0,hours:9},
  artillery:{family:"support_barracks",manpower:70,materials:95,fuel:8,hours:14},
  heavy_artillery:{family:"support_barracks",manpower:80,materials:145,fuel:15,hours:20},
  logistics:{family:"support_barracks",manpower:60,materials:80,fuel:35,hours:11}
};

const SIDES:Side[]=["blue","red","green"];
const WORLD_FALLBACK_X=WORLD_W*.5, WORLD_FALLBACK_Y=WORLD_H*.5;

function mkUnit(kind:UnitKind,side:Side,x:number,y:number,id:string):Formation{
  const base={
    infantry:[100,18,4,22,12,5,.08,18,8],
    mountaineer:[95,19,5,24,14,5,.08,20,10],
    special_forces:[85,24,10,22,18,6,.12,28,14],
    engineer:[80,15,5,20,11,5,.08,16,8],
    cavalry:[90,18,5,18,15,12,.1,20,14],
    recon:[65,12,7,14,18,24,.18,32,18],
    mechanized:[80,25,20,24,28,18,.42,24,18],
    tank:[70,22,34,28,38,16,.72,18,16],
    mortar:[60,28,5,13,8,4,.05,10,8],
    artillery:[70,36,12,16,8,4,.06,8,6],
    heavy_artillery:[75,48,24,18,6,3,.1,6,5],
    logistics:[60,8,3,15,5,14,.12,8,8],
    armor:[75,24,30,25,32,16,.62,18,15]
  }[kind]??[80,18,6,18,12,8,.1,14,10];
  return{id,name:kind.replace("_"," ").toUpperCase()+" "+id.slice(-3),side,kind,x,y,manpower:Math.round(base[0]*55),strength:100,organization:86,supply:100,fuel:100,entrenchment:0,experience:18,readiness:90,hardness:base[6],softAttack:base[1],hardAttack:base[2],defense:base[3],breakthrough:base[4],speed:base[5],recon:base[7],movementProgress:0};
}

export function createOpenWorldState(scenario:Scenario,units:Formation[],cities:CityState[]):{state:OpenWorldState;units:Formation[];cities:CityState[]}{
  const nextCities:CityState[]=cities.map((c,i)=>({...c,owner:(i<cities.length/3?"blue":i<2*cities.length/3?"green":"red") as Side}));
  const blue=units.filter(u=>u.side==="blue").slice(0,10).map((u,i)=>({...u,x:nextCities[Math.min(i%4,nextCities.length-1)]?.x??900,y:(nextCities[Math.min(i%4,nextCities.length-1)]?.y??900)+i*18}));
  const red=units.filter(u=>u.side==="red").slice(0,10);
  const greenAnchor=scenario.cities[Math.floor(scenario.cities.length/2)]??{x:WORLD_FALLBACK_X,y:WORLD_FALLBACK_Y};
  const green=red.slice(0,8).map((u,i)=>({...u,id:"g"+i,name:"Green "+u.name,side:"green" as Side,x:greenAnchor.x+(i%4)*35,y:greenAnchor.y+Math.floor(i/4)*35}));
  const resourceNodes:ResourceNode[]=[];
  let n=0;
  const sampleStep=560;
  for(let y=sampleStep*.55;y<WORLD_H;y+=sampleStep)for(let x=sampleStep*.7;x<WORLD_W;x+=sampleStep){
    const nearest=nextCities.map(c=>({c,d:Math.hypot(c.x-x,c.y-y)})).sort((a,b)=>a.d-b.d)[0];
    const owner=nearest&&nearest.d<1050?nearest.c.owner:null;
    const r=(n*37+Math.floor(x/sampleStep)*11+Math.floor(y/sampleStep)*17)%3;
    resourceNodes.push({id:"resource-"+n++,x,y,owner,resource:r===0?"manpower":r===1?"materials":"fuel",value:1+((n*13)%4),urban:0});
  }
  const structures:OpenWorldStructure[]=[];
  for(const side of SIDES){
    const city=nextCities.find(c=>c.owner===side);if(!city)continue;
    structures.push({id:"b-inf-"+side,kind:"infantry_barracks",side,x:city.x-70,y:city.y+70,strength:100});
    structures.push({id:"b-mob-"+side,kind:"mobile_barracks",side,x:city.x,y:city.y+90,strength:100});
    structures.push({id:"b-sup-"+side,kind:"support_barracks",side,x:city.x+70,y:city.y+70,strength:100});
  }
  return{state:{resources:{
    blue:{manpower:650,materials:500,fuel:280},red:{manpower:650,materials:500,fuel:280},green:{manpower:650,materials:500,fuel:280}
  },structures,recruitment:[],resourceNodes,serial:100},units:[...blue,...red,...green],cities:nextCities};
}

export function queueRecruitment(state:OpenWorldState,side:Side,kind:UnitKind,barracksId:string):OpenWorldState{
  const cost=UNIT_COST[kind],b=state.structures.find(s=>s.id===barracksId&&s.side===side);
  if(!cost||!b||b.kind!==cost.family)return state;
  const r=state.resources[side];
  if(r.manpower<cost.manpower||r.materials<cost.materials||r.fuel<cost.fuel)return state;
  return{...state,resources:{...state.resources,[side]:{manpower:r.manpower-cost.manpower,materials:r.materials-cost.materials,fuel:r.fuel-cost.fuel}},recruitment:[...state.recruitment,{id:"rq-"+state.serial,side,kind,barracksId,hoursLeft:cost.hours}],serial:state.serial+1};
}

export function addStrategicStructure(state:OpenWorldState,side:Side,kind:OpenWorldBuildKind,x:number,y:number,x2?:number,y2?:number):OpenWorldState{
  if(kind==="city")return state;
  const length=x2!==undefined&&y2!==undefined?Math.hypot(x2-x,y2-y):0;
  const price=kind==="road"?35+length*.035:kind==="wall"?55+length*.055:kind==="fort"?90:kind.includes("barracks")?120:60;
  const r=state.resources[side];if(r.materials<price)return state;
  const strength=kind==="wall"?160:kind==="fort"?140:100;
  return{...state,resources:{...state.resources,[side]:{...r,materials:r.materials-price}},structures:[...state.structures,{id:"ow-"+state.serial,kind,side,x,y,x2,y2,strength}],serial:state.serial+1};
}

export function buildStrategicCity(state:OpenWorldState,side:Side):{state:OpenWorldState;built:boolean}{
  const r=state.resources[side],materials=240,manpower=80;
  if(r.materials<materials||r.manpower<manpower)return{state,built:false};
  return{built:true,state:{...state,resources:{...state.resources,[side]:{...r,materials:r.materials-materials,manpower:r.manpower-manpower}},serial:state.serial+1}};
}

export function advanceOpenWorld(state:OpenWorldState,units:Formation[],cities:CityState[],hours:number){
  const structures=state.structures.filter(s=>s.strength>0);
  const resourceNodes=state.resourceNodes.map(cell=>{
    const influences:Record<Side,number>={blue:0,red:0,green:0};
    for(const side of SIDES){
      const cityInf=cities.filter(c=>c.owner===side).reduce((s,c)=>s+Math.max(0,1-Math.hypot(c.x-cell.x,c.y-cell.y)/900)*2.4,0);
      const unitInf=units.filter(u=>u.side===side&&u.strength>10).reduce((s,u)=>s+Math.max(0,1-Math.hypot(u.x-cell.x,u.y-cell.y)/520)*(u.strength/100),0);
      const fortInf=structures.filter(b=>b.side===side&&(b.kind==="fort"||b.kind.includes("barracks"))).reduce((s,b)=>s+Math.max(0,1-Math.hypot(b.x-cell.x,b.y-cell.y)/680)*1.5,0);
      influences[side]=cityInf+unitInf+fortInf;
    }
    const ranked=SIDES.map(side=>({side,v:influences[side]})).sort((a,b)=>b.v-a.v);
    const owner=ranked[0].v>.22&&ranked[0].v>ranked[1].v*1.12?ranked[0].side:cell.owner;
    const nearby=owner?units.filter(u=>u.side===owner&&Math.hypot(u.x-cell.x,u.y-cell.y)<150).length:0;
    return{...cell,owner,urban:Math.min(100,cell.urban+hours*(nearby>=6?.42:nearby>=4?.18:-.02))};
  });
  const resources={...state.resources};
  for(const side of SIDES){
    const owned=resourceNodes.filter(c=>c.owner===side);
    resources[side]={...resources[side],
      manpower:resources[side].manpower+hours*owned.filter(c=>c.resource==="manpower").reduce((s,c)=>s+c.value*.15,0),
      materials:resources[side].materials+hours*owned.filter(c=>c.resource==="materials").reduce((s,c)=>s+c.value*.12,0),
      fuel:resources[side].fuel+hours*owned.filter(c=>c.resource==="fuel").reduce((s,c)=>s+c.value*.09,0)
    };
  }
  const spawned:Formation[]=[];const recruitment:Recruitment[]=[];
  let serial=state.serial;
  for(const q of state.recruitment){
    const left=q.hoursLeft-hours;
    if(left>0){recruitment.push({...q,hoursLeft:left});continue}
    const b=structures.find(s=>s.id===q.barracksId);if(b)spawned.push(mkUnit(q.kind,q.side,b.x+28,b.y+28,"owu-"+serial++));
  }
  const newCities:CityState[]=[];
  for(const cell of resourceNodes)if(cell.owner&&cell.urban>=100&&!cities.some(c=>Math.hypot(c.x-cell.x,c.y-cell.y)<260)){
    newCities.push({name:"Settlement "+cell.id.split("-")[1],x:cell.x,y:cell.y,owner:cell.owner,capture:0});
    cell.urban=15;
  }
  return{state:{...state,resources,structures,resourceNodes,recruitment,serial},spawned,newCities};
}
