import type {CityState,Formation,Scenario,Side,TerrainFeature,TerrainKind,TerrainSample,UnitKind} from "./types";

export const WORLD_W=6200;
export const WORLD_H=4200;

export const TERRAIN_RULES:Record<TerrainKind,{label:string;move:number;attack:number;defense:number;supply:number}>={
  water:{label:"Water",move:0,attack:0,defense:0,supply:0},
  plains:{label:"Plains",move:1,attack:1,defense:1,supply:1},
  forest:{label:"Forest",move:.66,attack:.8,defense:1.3,supply:.7},
  hills:{label:"Hills",move:.6,attack:.74,defense:1.4,supply:.64},
  mountain:{label:"Mountain",move:.34,attack:.54,defense:1.78,supply:.4},
  marsh:{label:"Marsh",move:.42,attack:.66,defense:1.18,supply:.45},
  urban:{label:"Urban",move:.78,attack:.68,defense:1.62,supply:1.12}
};

export const UNIT_LABEL:Record<UnitKind,string>={
  infantry:"INF",mechanized:"MECH",armor:"ARM",artillery:"ART",recon:"REC",engineer:"ENG",logistics:"LOG"
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
  for(let i=0;i<34;i++){
    const t=i/34*Math.PI*2;
    const wobble=1+.1*Math.sin(t*3+seed*.13)+.055*Math.sin(t*7+seed*.37)+.03*Math.cos(t*11+seed);
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
  const boundary=1+.1*Math.sin(theta*3+f.seed*.13)+.055*Math.sin(theta*7+f.seed*.37)+.03*Math.cos(theta*11+f.seed);
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
  const city=scenario.cities.find(s=>Math.hypot(x-s.x,y-s.y)<70);
  if(city)return{x,y,terrain:"urban",elevation:.34,road:true,objective:city.name};

  const priorities:TerrainFeature["terrain"][]=["mountain","marsh","forest","hills"];
  for(const terrain of priorities){
    const hit=scenario.terrainFeatures.find(f=>f.terrain===terrain&&inFeature(x,y,f));
    if(hit){
      const elevation=terrain==="mountain"?.88:terrain==="hills"?.63:terrain==="forest"?.46:.3;
      return{x,y,terrain,elevation,road:nearRoad(scenario,x,y)};
    }
  }
  return{x,y,terrain:"plains",elevation:.36+.07*Math.sin(x*.003+scenario.seed)+.04*Math.cos(y*.005),road:nearRoad(scenario,x,y)};
}

export function nearRoad(scenario:Scenario,x:number,y:number){
  return scenario.roadRoutes.some(route=>route.slice(0,-1).some((p,i)=>pointSegmentDistance(x,y,p,route[i+1])<30));
}

function makeFeatures(rnd:()=>number){
  const spec:Array<[TerrainFeature["terrain"],number,[number,number],[number,number]]>=[
    ["mountain",8+Math.floor(rnd()*4),[430,920],[300,720]],
    ["hills",11+Math.floor(rnd()*5),[480,1050],[330,800]],
    ["forest",17+Math.floor(rnd()*7),[420,980],[300,760]],
    ["marsh",6+Math.floor(rnd()*4),[400,900],[300,690]]
  ];
  const out:TerrainFeature[]=[];
  let id=0;
  for(const [terrain,count,rxRange,ryRange] of spec){
    for(let i=0;i<count;i++){
      let cx=500+rnd()*(WORLD_W-650),cy=180+rnd()*(WORLD_H-360);
      if(terrain==="mountain"){cx=1750+rnd()*(WORLD_W-2050);cy=160+rnd()*2050}
      if(terrain==="marsh"){cy=1900+rnd()*1900}
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
  "Miren","Ostrel","Karvin","Dunava","Brask","Velin","Sodra","Narev","Korven","Aster",
  "Lydin","Morava","Draven","Kelm","Vezna","Orel","Rask","Tovin","Berez","Arden",
  "Novar","Selin","Korda","Veles","Ruden","Zorin","Merva","Dalen","Korin","Savin"
];

function makeCities(rnd:()=>number):CityState[]{
  const count=15+Math.floor(rnd()*4);
  const shuffled=[...CITY_NAMES].sort(()=>rnd()-.5);
  const cities:CityState[]=[];
  for(let i=0;i<count;i++){
    const t=count===1?.5:i/(count-1);
    const x=720+t*(WORLD_W-1440)+(rnd()-.5)*430;
    const y=360+rnd()*(WORLD_H-720);
    cities.push({name:shuffled[i],x:Math.max(420,Math.min(WORLD_W-220,x)),y,owner:x<WORLD_W*.5?"blue":"red",capture:0});
  }
  cities.sort((a,b)=>a.x-b.x);
  for(let i=0;i<cities.length;i++)cities[i].owner=i<Math.floor(cities.length/2)?"blue":"red";
  return cities;
}

function routeBetween(a:{x:number;y:number},b:{x:number;y:number},rnd:()=>number){
  const dx=b.x-a.x,dy=b.y-a.y;
  const p1={x:a.x+dx*.34+(rnd()-.5)*180,y:a.y+dy*.34+(rnd()-.5)*230};
  const p2={x:a.x+dx*.68+(rnd()-.5)*180,y:a.y+dy*.68+(rnd()-.5)*230};
  return[{x:a.x,y:a.y},p1,p2,{x:b.x,y:b.y}];
}

function makeRoads(cities:CityState[],rnd:()=>number){
  const sorted=[...cities].sort((a,b)=>a.x-b.x);
  const roads:Array<Array<{x:number;y:number}>>=[];
  for(let i=0;i<sorted.length-1;i++)roads.push(routeBetween(sorted[i],sorted[i+1],rnd));
  for(let i=0;i<Math.max(5,Math.floor(cities.length/2));i++){
    const a=cities[Math.floor(rnd()*cities.length)];
    let b=cities[Math.floor(rnd()*cities.length)];
    if(a===b)b=cities[(cities.indexOf(a)+2)%cities.length];
    roads.push(routeBetween(a,b,rnd));
  }
  return roads;
}

function makeRivers(rnd:()=>number){
  const count=3+Math.floor(rnd()*2);
  const routes:Array<Array<{x:number;y:number}>>=[];
  for(let r=0;r<count;r++){
    const base=1500+r*1100+(rnd()-.5)*360;
    const pts:Array<{x:number;y:number}>=[];
    for(let y=80;y<=WORLD_H;y+=260)pts.push({x:base+160*Math.sin(y*.0024+r)+(rnd()-.5)*150,y});
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
    logistics:{manpower:2300,hardness:.1,softAttack:10,hardAttack:4,defense:22,breakthrough:8,speed:6,recon:18}
  };
  return base[kind];
}

function unit(id:string,name:string,side:Side,kind:UnitKind,x:number,y:number,rnd:()=>number,mods:Partial<Formation>={}):Formation{
  return{
    id,name,side,kind,x,y,
    strength:88+rnd()*12,
    organization:80+rnd()*14,
    supply:76+rnd()*20,
    fuel:["infantry","artillery","engineer"].includes(kind)?100:72+rnd()*22,
    entrenchment:rnd()*16,
    experience:25+rnd()*45,
    readiness:76+rnd()*16,
    movementProgress:0,
    ...unitBase(kind),
    ...mods
  };
}

function spawnPoint(side:Side,cities:CityState[],scenario:Scenario,rnd:()=>number){
  const owned=cities.filter(c=>c.owner===side);
  for(let tries=0;tries<60;tries++){
    const anchor=owned[Math.floor(rnd()*owned.length)]??{x:side==="blue"?1300:4900,y:WORLD_H*.5};
    const angle=rnd()*Math.PI*2;
    const radius=140+rnd()*430;
    const x=Math.max(330,Math.min(WORLD_W-90,anchor.x+Math.cos(angle)*radius));
    const y=Math.max(90,Math.min(WORLD_H-90,anchor.y+Math.sin(angle)*radius));
    if(isLand(scenario,x,y))return{x,y};
  }
  return{x:side==="blue"?1300:4900,y:500+rnd()*(WORLD_H-1000)};
}

function makeFormations(side:Side,scenario:Scenario,rnd:()=>number){
  const kinds:UnitKind[]=[
    "infantry","infantry","infantry","infantry","infantry","infantry","infantry","infantry","infantry","infantry","infantry","infantry",
    "mechanized","mechanized","mechanized","mechanized","armor","armor","armor",
    "artillery","artillery","artillery","artillery","recon","recon","engineer","logistics","logistics"
  ];
  const labels:Record<UnitKind,string>={
    infantry:"Infantry",mechanized:"Mechanized",armor:"Armored",artillery:"Field Artillery",
    recon:"Recon",engineer:"Engineers",logistics:"Logistics"
  };
  return kinds.map((kind,i)=>{
    const p=spawnPoint(side,scenario.cities,scenario,rnd);
    const prefix=side[0];
    const groupId=side+"-army-"+(1+Math.floor(i/7));
    return unit(prefix+(i+1),(i+1)+"th "+labels[kind],side,kind,p.x,p.y,rnd,{groupId,...(kind==="logistics"?{supply:100}: {})});
  });
}

export function generateScenario(seed:number):Scenario{
  const rnd=mulberry32(seed||1);
  const coast={
    base:210+rnd()*150,
    amp1:85+rnd()*90,
    amp2:50+rnd()*70,
    amp3:28+rnd()*42,
    f1:.0018+rnd()*.001,
    f2:.0042+rnd()*.002,
    f3:.007+rnd()*.0025,
    p1:rnd()*Math.PI*2,
    p2:rnd()*Math.PI*2
  };

  const cities=makeCities(rnd);
  const terrainFeatures=makeFeatures(rnd);
  const roadRoutes=makeRoads(cities,rnd);
  const riverRoutes=makeRivers(rnd);
  const shell:Scenario={seed,coast,cities,terrainFeatures,roadRoutes,riverRoutes,formations:[],landPath:""};

  const pts:Array<{x:number;y:number}>=[];
  for(let y=0;y<=WORLD_H;y+=70)pts.push({x:coastX(coast,y),y});
  shell.landPath="M "+WORLD_W+" 0 L "+coastX(coast,0)+" 0 "+pts.slice(1).map(p=>"L "+p.x.toFixed(1)+" "+p.y).join(" ")+" L "+WORLD_W+" "+WORLD_H+" Z";

  shell.formations=[...makeFormations("blue",shell,rnd),...makeFormations("red",shell,rnd)];
  return shell;
}
