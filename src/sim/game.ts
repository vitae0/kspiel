import type {CityState,Formation,Scenario,TerrainFeature,TerrainKind,TerrainSample,UnitKind} from "./types";

export const WORLD_W=2080;
export const WORLD_H=1360;

export const TERRAIN_RULES:Record<TerrainKind,{label:string;move:number;attack:number;defense:number;supply:number}>={
  water:{label:"Water",move:0,attack:0,defense:0,supply:0},
  plains:{label:"Plains",move:1,attack:1,defense:1,supply:1},
  forest:{label:"Forest",move:.68,attack:.82,defense:1.28,supply:.76},
  hills:{label:"Hills",move:.62,attack:.76,defense:1.38,supply:.7},
  mountain:{label:"Mountain",move:.38,attack:.58,defense:1.72,supply:.48},
  marsh:{label:"Marsh",move:.45,attack:.7,defense:1.16,supply:.52},
  urban:{label:"Urban",move:.82,attack:.72,defense:1.56,supply:1.18}
};

export const UNIT_LABEL:Record<UnitKind,string>={
  infantry:"INF",mechanized:"MECH",armor:"ARM",artillery:"ART",recon:"REC",engineer:"ENG",logistics:"LOG",reserve:"RSV"
};

function mulberry32(seed:number){
  return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
}

function coastX(s:Scenario["coast"],y:number){
  return s.base+s.amp1*Math.sin(y*s.f1+s.p1)+s.amp2*Math.sin(y*s.f2+s.p2)+s.amp3*Math.cos(y*s.f3);
}

export function polylinePath(points:{x:number;y:number}[]){
  return points.map((p,i)=>(i?"L ":"M ")+p.x+" "+p.y).join(" ");
}

function blobPath(cx:number,cy:number,rx:number,ry:number,rotation:number,seed:number){
  const points:string[]=[];
  const a=rotation*Math.PI/180;
  for(let i=0;i<30;i++){
    const t=i/30*Math.PI*2;
    const wobble=1+.11*Math.sin(t*3+seed*.13)+.06*Math.sin(t*7+seed*.37)+.035*Math.cos(t*11+seed);
    const ex=Math.cos(t)*rx*wobble,ey=Math.sin(t)*ry*wobble;
    const x=cx+ex*Math.cos(a)-ey*Math.sin(a);
    const y=cy+ex*Math.sin(a)+ey*Math.cos(a);
    points.push((i?"L ":"M ")+x.toFixed(1)+" "+y.toFixed(1));
  }
  return points.join(" ")+" Z";
}

function inFeature(x:number,y:number,f:TerrainFeature){
  const a=-f.rotation*Math.PI/180;
  const dx=x-f.cx,dy=y-f.cy;
  const lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
  const theta=Math.atan2(ly/f.ry,lx/f.rx);
  const boundary=1+.11*Math.sin(theta*3+f.seed*.13)+.06*Math.sin(theta*7+f.seed*.37)+.035*Math.cos(theta*11+f.seed);
  return Math.hypot(lx/f.rx,ly/f.ry)<boundary;
}

function pointSegmentDistance(x:number,y:number,a:{x:number;y:number},b:{x:number;y:number}){
  const dx=b.x-a.x,dy=b.y-a.y;
  const len=dx*dx+dy*dy;
  if(!len)return Math.hypot(x-a.x,y-a.y);
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len));
  return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
}

export function isLand(scenario:Scenario,x:number,y:number){
  return x>=coastX(scenario.coast,y)&&x<=WORLD_W&&y>=0&&y<=WORLD_H;
}

export function terrainAt(scenario:Scenario,x:number,y:number):TerrainSample{
  if(!isLand(scenario,x,y))return{x,y,terrain:"water",elevation:0,road:false};
  const city=scenario.cities.find(s=>Math.hypot(x-s.x,y-s.y)<44);
  if(city)return{x,y,terrain:"urban",elevation:.34,road:true,objective:city.name};

  const priorities:TerrainFeature["terrain"][]=["mountain","marsh","forest","hills"];
  for(const terrain of priorities){
    const hit=scenario.terrainFeatures.find(f=>f.terrain===terrain&&inFeature(x,y,f));
    if(hit){
      const elevation=terrain==="mountain"?.88:terrain==="hills"?.63:terrain==="forest"?.46:.3;
      return{x,y,terrain,elevation,road:nearRoad(scenario,x,y)};
    }
  }
  return{x,y,terrain:"plains",elevation:.36+.07*Math.sin(x*.008+scenario.seed)+.04*Math.cos(y*.013),road:nearRoad(scenario,x,y)};
}

export function nearRoad(scenario:Scenario,x:number,y:number){
  return scenario.roadRoutes.some(route=>route.slice(0,-1).some((p,i)=>pointSegmentDistance(x,y,p,route[i+1])<20));
}

function makeFeatures(rnd:()=>number){
  const spec:Array<[TerrainFeature["terrain"],number,[number,number],[number,number]]>=[
    ["mountain",7+Math.floor(rnd()*4),[105,220],[75,160]],
    ["hills",10+Math.floor(rnd()*5),[120,250],[85,190]],
    ["forest",18+Math.floor(rnd()*7),[100,240],[75,180]],
    ["marsh",5+Math.floor(rnd()*5),[120,260],[80,185]]
  ];
  const out:TerrainFeature[]=[];
  let id=0;
  for(const [terrain,count,rxRange,ryRange] of spec){
    for(let i=0;i<count;i++){
      let cx=250+rnd()*(WORLD_W-340),cy=70+rnd()*(WORLD_H-140);
      if(terrain==="mountain"){cx=720+rnd()*1230;cy=70+rnd()*610}
      if(terrain==="marsh"){cy=650+rnd()*620}
      const rx=rxRange[0]+rnd()*(rxRange[1]-rxRange[0]);
      const ry=ryRange[0]+rnd()*(ryRange[1]-ryRange[0]);
      const rotation=-55+rnd()*110;
      const seed=Math.floor(rnd()*100000);
      out.push({id:"t"+id++,terrain,cx,cy,rx,ry,rotation,seed,path:blobPath(cx,cy,rx,ry,rotation,seed)});
    }
  }
  return out;
}

const CITY_NAMES=[
  "Varen","Orlov","Karsen","Drey","Helmstadt","Serev","Vesta","Belgor","Rovina","Tarsk",
  "Miren","Ostrel","Karvin","Dunava","Brask","Velin","Sodra","Narev","Korven","Aster"
];

function makeCities(rnd:()=>number):CityState[]{
  const count=7+Math.floor(rnd()*3);
  const shuffled=[...CITY_NAMES].sort(()=>rnd()-.5);
  const cities:CityState[]=[];

  for(let i=0;i<count;i++){
    const t=count===1?.5:i/(count-1);
    const x=330+t*1420+(rnd()-.5)*170;
    const y=170+rnd()*1020;
    cities.push({
      name:shuffled[i],
      x:Math.max(250,Math.min(WORLD_W-120,x)),
      y,
      owner:x<WORLD_W*.5?"blue":"red",
      capture:0
    });
  }

  // Guarantee a meaningful opening split even on eccentric seeds.
  cities.sort((a,b)=>a.x-b.x);
  for(let i=0;i<cities.length;i++){
    cities[i].owner=i<Math.floor(cities.length/2)?"blue":"red";
  }
  return cities;
}

function routeBetween(a:{x:number;y:number},b:{x:number;y:number},rnd:()=>number){
  const mx=(a.x+b.x)/2+(rnd()-.5)*90;
  const my=(a.y+b.y)/2+(rnd()-.5)*120;
  return[{x:a.x,y:a.y},{x:mx,y:my},{x:b.x,y:b.y}];
}

function makeRoads(cities:CityState[],rnd:()=>number){
  const sorted=[...cities].sort((a,b)=>a.x-b.x);
  const roads:Array<Array<{x:number;y:number}>>=[];
  for(let i=0;i<sorted.length-1;i++)roads.push(routeBetween(sorted[i],sorted[i+1],rnd));
  for(let i=0;i<Math.max(2,Math.floor(cities.length/3));i++){
    const a=cities[Math.floor(rnd()*cities.length)];
    let b=cities[Math.floor(rnd()*cities.length)];
    if(a===b)b=cities[(cities.indexOf(a)+2)%cities.length];
    roads.push(routeBetween(a,b,rnd));
  }
  return roads;
}

function makeRivers(rnd:()=>number){
  const count=2+Math.floor(rnd()*2);
  const routes:Array<Array<{x:number;y:number}>>=[];
  for(let r=0;r<count;r++){
    const base=720+r*520+(rnd()-.5)*180;
    const pts:Array<{x:number;y:number}>=[];
    for(let y=40;y<=WORLD_H;y+=170){
      pts.push({x:base+70*Math.sin(y*.006+r)+ (rnd()-.5)*75,y});
    }
    routes.push(pts);
  }
  return routes;
}

function unitBase(kind:UnitKind):Pick<Formation,"manpower"|"hardness"|"softAttack"|"hardAttack"|"defense"|"breakthrough"|"speed"|"recon">{
  const base:Record<UnitKind,Pick<Formation,"manpower"|"hardness"|"softAttack"|"hardAttack"|"defense"|"breakthrough"|"speed"|"recon">>={
    infantry:{manpower:9800,hardness:.12,softAttack:54,hardAttack:18,defense:68,breakthrough:30,speed:4,recon:34},
    mechanized:{manpower:8200,hardness:.56,softAttack:72,hardAttack:44,defense:64,breakthrough:63,speed:7,recon:48},
    armor:{manpower:6200,hardness:.82,softAttack:68,hardAttack:78,defense:48,breakthrough:88,speed:6,recon:38},
    artillery:{manpower:3900,hardness:.08,softAttack:92,hardAttack:35,defense:24,breakthrough:18,speed:3,recon:16},
    recon:{manpower:2600,hardness:.38,softAttack:31,hardAttack:22,defense:36,breakthrough:45,speed:9,recon:92},
    engineer:{manpower:4300,hardness:.14,softAttack:35,hardAttack:14,defense:71,breakthrough:40,speed:4,recon:30},
    logistics:{manpower:2300,hardness:.1,softAttack:10,hardAttack:4,defense:22,breakthrough:8,speed:6,recon:18},
    reserve:{manpower:8600,hardness:.14,softAttack:49,hardAttack:17,defense:64,breakthrough:38,speed:4.5,recon:30}
  };
  return base[kind];
}

function unit(id:string,name:string,side:"blue"|"red",kind:UnitKind,x:number,y:number,rnd:()=>number,mods:Partial<Formation>={}):Formation{
  return{
    id,name,side,kind,x,y,
    strength:92+rnd()*8,
    organization:kind==="reserve"?78+rnd()*8:82+rnd()*12,
    supply:82+rnd()*16,
    fuel:["infantry","artillery","engineer","reserve"].includes(kind)?100:76+rnd()*18,
    entrenchment:rnd()*18,
    experience:25+rnd()*45,
    readiness:78+rnd()*14,
    movementProgress:0,
    ...unitBase(kind),
    ...mods
  };
}

function spawnPoint(side:"blue"|"red",cities:CityState[],scenario:Scenario,rnd:()=>number){
  const owned=cities.filter(c=>c.owner===side);
  for(let tries=0;tries<40;tries++){
    const anchor=owned[Math.floor(rnd()*owned.length)]??{x:side==="blue"?520:1560,y:680};
    const angle=rnd()*Math.PI*2;
    const radius=70+rnd()*210;
    const x=Math.max(210,Math.min(WORLD_W-50,anchor.x+Math.cos(angle)*radius));
    const y=Math.max(40,Math.min(WORLD_H-40,anchor.y+Math.sin(angle)*radius));
    if(isLand(scenario,x,y))return{x,y};
  }
  return{x:side==="blue"?520:1560,y:220+rnd()*920};
}

function makeFormations(side:"blue"|"red",scenario:Scenario,rnd:()=>number){
  const kinds:UnitKind[]=[
    "infantry","infantry","infantry","infantry","infantry","infantry",
    "mechanized","mechanized","mechanized","armor","armor",
    "artillery","artillery","artillery","recon","recon","engineer",
    "logistics","logistics","reserve","reserve","reserve"
  ];
  const labels:Record<UnitKind,string>={
    infantry:"Infantry",mechanized:"Mechanized",armor:"Armored",artillery:"Field Artillery",
    recon:"Recon",engineer:"Engineers",logistics:"Logistics",reserve:"Reserve"
  };
  return kinds.map((kind,i)=>{
    const p=spawnPoint(side,scenario.cities,scenario,rnd);
    const prefix=side==="blue"?"b":"r";
    return unit(prefix+(i+1),(i+1)+(side==="blue"?"th ":"th ")+labels[kind],side,kind,p.x,p.y,rnd,kind==="logistics"?{supply:100}:undefined);
  });
}

export function generateScenario(seed:number):Scenario{
  const rnd=mulberry32(seed||1);
  const coast={
    base:105+rnd()*85,
    amp1:35+rnd()*38,
    amp2:18+rnd()*26,
    amp3:10+rnd()*18,
    f1:.0055+rnd()*.0028,
    f2:.014+rnd()*.006,
    f3:.026+rnd()*.009,
    p1:rnd()*Math.PI*2,
    p2:rnd()*Math.PI*2
  };

  const cities=makeCities(rnd);
  const terrainFeatures=makeFeatures(rnd);
  const roadRoutes=makeRoads(cities,rnd);
  const riverRoutes=makeRivers(rnd);

  const shell:Scenario={
    seed,coast,cities,terrainFeatures,roadRoutes,riverRoutes,formations:[],landPath:""
  };

  const pts:Array<{x:number;y:number}>=[];
  for(let y=0;y<=WORLD_H;y+=35)pts.push({x:coastX(coast,y),y});
  shell.landPath="M "+WORLD_W+" 0 L "+coastX(coast,0)+" 0 "+pts.slice(1).map(p=>"L "+p.x.toFixed(1)+" "+p.y).join(" ")+" L "+WORLD_W+" "+WORLD_H+" Z";

  const blue=makeFormations("blue",shell,rnd);
  const red=makeFormations("red",shell,rnd);
  shell.formations=[...blue,...red];
  return shell;
}