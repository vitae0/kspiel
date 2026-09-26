import type {Formation,MapTile,TerrainKind,UnitKind} from "./types";

export const MAP_W=52;
export const MAP_H=34;
export const TILE=40;

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
  infantry:"INF",
  mechanized:"MECH",
  armor:"ARM",
  artillery:"ART",
  recon:"REC",
  engineer:"ENG",
  logistics:"LOG",
  airDefense:"ADA"
};

const sites=[
  {x:8,y:8,name:"Varen"},
  {x:17,y:14,name:"Orlov Crossing"},
  {x:28,y:7,name:"Karsen"},
  {x:37,y:19,name:"Drey Basin"},
  {x:44,y:10,name:"Helmstadt"},
  {x:24,y:27,name:"Serev"},
  {x:42,y:28,name:"Port Vesta"}
];

function hash(x:number,y:number,seed=7331){
  let n=x*374761393+y*668265263+seed*1442695041;
  n=(n^(n>>13))*1274126177;
  return ((n^(n>>16))>>>0)/4294967295;
}

function smooth(t:number){return t*t*(3-2*t)}
function valueNoise(x:number,y:number){
  const x0=Math.floor(x),y0=Math.floor(y),fx=smooth(x-x0),fy=smooth(y-y0);
  const a=hash(x0,y0),b=hash(x0+1,y0),c=hash(x0,y0+1),d=hash(x0+1,y0+1);
  const u=a+(b-a)*fx;
  const v=c+(d-c)*fx;
  return u+(v-u)*fy;
}
function fbm(x:number,y:number){
  let value=0,amp=.56,freq=.085,total=0;
  for(let i=0;i<5;i++){value+=valueNoise(x*freq,y*freq)*amp;total+=amp;amp*=.52;freq*=2.05}
  return value/total;
}
function nearSite(x:number,y:number){
  return sites.find(s=>Math.hypot(x-s.x,y-s.y)<1.55);
}
function roadScore(x:number,y:number){
  const diagonal=Math.abs(y-(.46*x+4));
  const northern=Math.abs(y-(13+Math.sin(x*.22)*2));
  const eastern=Math.abs(x-(36+Math.sin(y*.28)*3));
  return Math.min(diagonal,northern,eastern);
}

export function generateMap(width=MAP_W,height=MAP_H):MapTile[]{
  const tiles:MapTile[]=[];
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const coastBias=(x<4?(.18*(4-x)):0)+(y>29?(.06*(y-29)):0);
      const elevation=Math.max(0,Math.min(1,fbm(x,y)-coastBias+.08*Math.sin(x*.17)-.05*Math.cos(y*.31)));
      const moisture=Math.max(0,Math.min(1,fbm(x+91,y-37)+.09*Math.sin((x+y)*.21)));
      let terrain:TerrainKind="plains";
      if(elevation<.26)terrain="water";
      else if(elevation>.74)terrain="mountain";
      else if(elevation>.61)terrain="hills";
      else if(moisture>.67&&elevation<.48)terrain="marsh";
      else if(moisture>.56)terrain="forest";
      const site=nearSite(x,y);
      if(site&&terrain!=="water")terrain="urban";
      tiles.push({x,y,terrain,elevation,moisture,road:terrain!=="water"&&roadScore(x,y)<.5,objective:site?.name});
    }
  }
  return tiles;
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
  return {
    id,name,side,kind,x,y,
    strength:100,organization:86,supply:92,fuel:kind==="infantry"||kind==="artillery"||kind==="engineer"||kind==="airDefense"?100:84,
    entrenchment:12,experience:38,readiness:82,movementProgress:0,
    ...base[kind],...mods
  };
}

export const INITIAL_FORMATIONS:Formation[]=[
  unit("b1","1st Guards Infantry","blue","infantry",11,10,{experience:62,entrenchment:24}),
  unit("b2","3rd Mechanized","blue","mechanized",13,12,{experience:51}),
  unit("b3","7th Armored Brigade","blue","armor",15,13,{fuel:77,experience:58}),
  unit("b4","12th Field Artillery","blue","artillery",10,13),
  unit("b5","4th Recon Group","blue","recon",16,10),
  unit("b6","2nd Combat Engineers","blue","engineer",12,15),
  unit("b7","18th Infantry","blue","infantry",9,17),
  unit("b8","5th Mechanized","blue","mechanized",14,18),
  unit("b9","21st Artillery","blue","artillery",11,19),
  unit("b10","6th Logistics Command","blue","logistics",7,15,{supply:100}),
  unit("b11","9th Air Defense","blue","airDefense",13,8),
  unit("b12","31st Infantry","blue","infantry",18,20),

  unit("r1","41st Rifle Division","red","infantry",31,11,{entrenchment:41}),
  unit("r2","8th Tank Brigade","red","armor",34,14,{experience:55}),
  unit("r3","16th Mechanized","red","mechanized",30,17),
  unit("r4","5th Artillery Group","red","artillery",35,12),
  unit("r5","22nd Rifle Division","red","infantry",38,18,{entrenchment:52}),
  unit("r6","3rd Recon Battalion","red","recon",29,9),
  unit("r7","14th Engineers","red","engineer",36,20),
  unit("r8","2nd Guards Armor","red","armor",40,22,{experience:64}),
  unit("r9","19th Rifle Division","red","infantry",33,23),
  unit("r10","7th Logistics Command","red","logistics",42,18,{supply:100}),
  unit("r11","11th Air Defense","red","airDefense",37,15)
];

export const STRATEGIC_SITES=sites;