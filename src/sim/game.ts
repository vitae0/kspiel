import type {CityState,Formation,TerrainFeature,TerrainKind,TerrainSample,UnitKind} from "./types";

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
  infantry:"INF",mechanized:"MECH",armor:"ARM",artillery:"ART",recon:"REC",engineer:"ENG",logistics:"LOG",airDefense:"ADA"
};

export const STRATEGIC_SITES=[
  {x:390,y:300,name:"Varen"},
  {x:705,y:540,name:"Orlov Crossing"},
  {x:1110,y:300,name:"Karsen"},
  {x:1475,y:760,name:"Drey Basin"},
  {x:1730,y:405,name:"Helmstadt"},
  {x:965,y:1080,name:"Serev"},
  {x:1665,y:1115,name:"Port Vesta"}
];

export const INITIAL_CITIES:CityState[]=STRATEGIC_SITES.map(site=>({
  ...site,
  owner:site.x<1000?"blue":"red",
  capture:0
}));

export const ROAD_ROUTES=[
  [{x:300,y:290},{x:520,y:390},{x:705,y:540},{x:1010,y:680},{x:1475,y:760},{x:1740,y:650}],
  [{x:390,y:300},{x:730,y:250},{x:1110,y:300},{x:1420,y:365},{x:1730,y:405}],
  [{x:705,y:540},{x:760,y:830},{x:965,y:1080},{x:1320,y:1100},{x:1665,y:1115}],
  [{x:1475,y:760},{x:1570,y:930},{x:1665,y:1115}]
];

export const RIVER_ROUTES=[
  [{x:820,y:60},{x:790,y:230},{x:840,y:390},{x:785,y:560},{x:850,y:740},{x:815,y:940},{x:900,y:1180},{x:875,y:1360}],
  [{x:1370,y:200},{x:1330,y:360},{x:1380,y:525},{x:1320,y:700},{x:1405,y:910},{x:1430,y:1180}]
];

function mulberry32(seed:number){
  return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
}

export function polylinePath(points:{x:number;y:number}[]){
  return points.map((p,i)=>(i?"L ":"M ")+p.x+" "+p.y).join(" ");
}

function coastX(y:number){
  return 135+48*Math.sin(y*.0067)+26*Math.sin(y*.017+1.2)+18*Math.cos(y*.031);
}

export const LAND_PATH=(()=>{
  const pts:Array<{x:number;y:number}>=[];
  for(let y=0;y<=WORLD_H;y+=40)pts.push({x:coastX(y),y});
  return "M "+WORLD_W+" 0 L "+coastX(0)+" 0 "+pts.slice(1).map(p=>"L "+p.x+" "+p.y).join(" ")+" L "+WORLD_W+" "+WORLD_H+" Z";
})();

function blobPath(cx:number,cy:number,rx:number,ry:number,rotation:number,seed:number){
  const points:string[]=[];
  const a=rotation*Math.PI/180;
  for(let i=0;i<28;i++){
    const t=i/28*Math.PI*2;
    const wobble=1+.11*Math.sin(t*3+seed*.13)+.06*Math.sin(t*7+seed*.37)+.035*Math.cos(t*11+seed);
    const ex=Math.cos(t)*rx*wobble,ey=Math.sin(t)*ry*wobble;
    const x=cx+ex*Math.cos(a)-ey*Math.sin(a);
    const y=cy+ex*Math.sin(a)+ey*Math.cos(a);
    points.push((i?"L ":"M ")+x.toFixed(1)+" "+y.toFixed(1));
  }
  return points.join(" ")+" Z";
}

function makeFeatures():TerrainFeature[]{
  const rnd=mulberry32(851932);
  const spec:Array<[TerrainFeature["terrain"],number,[number,number],[number,number]]>=[
    ["mountain",8,[105,220],[75,160]],
    ["hills",12,[120,250],[85,190]],
    ["forest",21,[100,240],[75,180]],
    ["marsh",7,[120,260],[80,185]]
  ];
  const out:TerrainFeature[]=[];
  let id=0;
  for(const [terrain,count,rxRange,ryRange] of spec){
    for(let i=0;i<count;i++){
      let cx=260+rnd()*(WORLD_W-360),cy=80+rnd()*(WORLD_H-160);
      if(terrain==="mountain"){cx=760+rnd()*1180;cy=80+rnd()*560}
      if(terrain==="marsh"){cy=690+rnd()*570}
      const rx=rxRange[0]+rnd()*(rxRange[1]-rxRange[0]);
      const ry=ryRange[0]+rnd()*(ryRange[1]-ryRange[0]);
      const rotation=-55+rnd()*110;
      const seed=Math.floor(rnd()*10000);
      out.push({id:"t"+id++,terrain,cx,cy,rx,ry,rotation,seed,path:blobPath(cx,cy,rx,ry,rotation,seed)});
    }
  }
  return out;
}

export const TERRAIN_FEATURES=makeFeatures();

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

function nearRoad(x:number,y:number){
  return ROAD_ROUTES.some(route=>route.slice(0,-1).some((p,i)=>pointSegmentDistance(x,y,p,route[i+1])<18));
}

export function isLand(x:number,y:number){
  return x>=coastX(y)&&x<=WORLD_W&&y>=0&&y<=WORLD_H;
}

export function terrainAt(x:number,y:number):TerrainSample{
  if(!isLand(x,y))return{x,y,terrain:"water",elevation:0,road:false};
  const city=STRATEGIC_SITES.find(s=>Math.hypot(x-s.x,y-s.y)<42);
  if(city)return{x,y,terrain:"urban",elevation:.34,road:true,objective:city.name};
  const priorities:TerrainFeature["terrain"][]=["mountain","marsh","forest","hills"];
  for(const terrain of priorities){
    const hit=TERRAIN_FEATURES.find(f=>f.terrain===terrain&&inFeature(x,y,f));
    if(hit){
      const elevation=terrain==="mountain"?.88:terrain==="hills"?.63:terrain==="forest"?.46:.3;
      return{x,y,terrain,elevation,road:nearRoad(x,y)};
    }
  }
  return{x,y,terrain:"plains",elevation:.36+.07*Math.sin(x*.008)+.04*Math.cos(y*.013),road:nearRoad(x,y)};
}

function unit(id:string,name:string,side:"blue"|"red",kind:UnitKind,x:number,y:number,mods:Partial<Formation>={}):Formation{
  const base:Record<UnitKind,Pick<Formation,"manpower"|"hardness"|"softAttack"|"hardAttack"|"defense"|"breakthrough"|"speed"|"recon">>={
    infantry:{manpower:9800,hardness:.12,softAttack:54,hardAttack:18,defense:68,breakthrough:30,speed:4,recon:34},
    mechanized:{manpower:8200,hardness:.56,softAttack:72,hardAttack:44,defense:64,breakthrough:63,speed:7,recon:48},
    armor:{manpower:6200,hardness:.82,softAttack:68,hardAttack:78,defense:48,breakthrough:88,speed:6,recon:38},
    artillery:{manpower:3900,hardness:.08,softAttack:92,hardAttack:35,defense:24,breakthrough:18,speed:3,recon:16},
    recon:{manpower:2600,hardness:.38,softAttack:31,hardAttack:22,defense:36,breakthrough:45,speed:9,recon:92},
    engineer:{manpower:4300,hardness:.14,softAttack:35,hardAttack:14,defense:71,breakthrough:40,speed:4,recon:30},
    logistics:{manpower:2100,hardness:.1,softAttack:10,hardAttack:4,defense:18,breakthrough:8,speed:6,recon:12},
    airDefense:{manpower:2800,hardness:.16,softAttack:25,hardAttack:46,defense:42,breakthrough:15,speed:4,recon:20}
  };
  return{id,name,side,kind,x,y,strength:100,organization:86,supply:92,fuel:["infantry","artillery","engineer","airDefense"].includes(kind)?100:84,entrenchment:12,experience:38,readiness:82,movementProgress:0,...base[kind],...mods};
}

export const INITIAL_FORMATIONS:Formation[]=[
  unit("b1","1st Guards Infantry","blue","infantry",470,390,{experience:62,entrenchment:24}),
  unit("b2","3rd Mechanized","blue","mechanized",535,475,{experience:51}),
  unit("b3","7th Armored Brigade","blue","armor",615,520,{fuel:77,experience:58}),
  unit("b4","12th Field Artillery","blue","artillery",440,520),
  unit("b5","4th Recon Group","blue","recon",650,385),
  unit("b6","2nd Combat Engineers","blue","engineer",505,605),
  unit("b7","18th Infantry","blue","infantry",400,690),
  unit("b8","5th Mechanized","blue","mechanized",570,735),
  unit("b9","21st Artillery","blue","artillery",455,790),
  unit("b10","6th Logistics Command","blue","logistics",320,610,{supply:100}),
  unit("b11","9th Air Defense","blue","airDefense",545,310),
  unit("b12","31st Infantry","blue","infantry",700,825),
  unit("b13","42nd Infantry","blue","infantry",355,455),
  unit("b14","8th Armored Brigade","blue","armor",610,645,{fuel:82}),
  unit("b15","15th Mechanized","blue","mechanized",740,610),
  unit("b16","33rd Field Artillery","blue","artillery",520,875),
  unit("b17","10th Recon Group","blue","recon",760,455),
  unit("b18","17th Engineers","blue","engineer",640,930),
  unit("b19","24th Infantry","blue","infantry",350,860),
  unit("b20","11th Logistics Command","blue","logistics",410,1020,{supply:100}),
  unit("b21","14th Air Defense","blue","airDefense",610,1015),
  unit("b22","2nd Reserve Infantry","blue","infantry",285,735,{organization:74}),

  unit("r1","41st Rifle Division","red","infantry",1240,430,{entrenchment:41}),
  unit("r2","8th Tank Brigade","red","armor",1360,555,{experience:55}),
  unit("r3","16th Mechanized","red","mechanized",1205,680),
  unit("r4","5th Artillery Group","red","artillery",1415,470),
  unit("r5","22nd Rifle Division","red","infantry",1510,735,{entrenchment:52}),
  unit("r6","3rd Recon Battalion","red","recon",1180,355),
  unit("r7","14th Engineers","red","engineer",1450,805),
  unit("r8","2nd Guards Armor","red","armor",1600,885,{experience:64}),
  unit("r9","19th Rifle Division","red","infantry",1325,925),
  unit("r10","7th Logistics Command","red","logistics",1710,720,{supply:100}),
  unit("r11","11th Air Defense","red","airDefense",1490,590),
  unit("r12","27th Rifle Division","red","infantry",1560,520,{entrenchment:28}),
  unit("r13","12th Mechanized","red","mechanized",1640,650),
  unit("r14","6th Tank Brigade","red","armor",1760,790,{fuel:80}),
  unit("r15","9th Artillery Group","red","artillery",1515,900),
  unit("r16","18th Rifle Division","red","infantry",1810,565),
  unit("r17","4th Recon Battalion","red","recon",1690,980),
  unit("r18","20th Engineers","red","engineer",1530,1040),
  unit("r19","13th Artillery Group","red","artillery",1825,1010),
  unit("r20","25th Rifle Division","red","infantry",1370,1110,{entrenchment:30}),
  unit("r21","9th Logistics Command","red","logistics",1880,820,{supply:100}),
  unit("r22","15th Air Defense","red","airDefense",1750,1180)
];