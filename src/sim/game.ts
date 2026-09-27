import type {CityState,Formation,Scenario,ScenarioPreset,ScenarioTheme,Side,TerrainFeature,TerrainKind,TerrainSample,UnitKind} from "./types";

export const WORLD_W=6200;
export const WORLD_H=4200;

export const SCENARIO_PRESETS:ScenarioPreset[]=[
  {
    id:"frontier",title:"Frontier War",subtitle:"Balanced fictional operational theater",theme:"mixed",historical:false,
    location:"Fictional continental frontier",sideNames:{blue:"Blue Coalition",red:"Red Coalition"},
    cityNames:["Varen","Orlov","Karsen","Drey","Helmstadt","Serev","Vesta","Belgor","Rovina","Tarsk","Miren","Ostrel","Karvin","Dunava","Brask","Velin","Sodra","Narev"]
  },
  {
    id:"alpine",title:"Alpine Corridor",subtitle:"Mountain passes, ridges and narrow supply routes",theme:"mountain",historical:false,
    location:"Fictional alpine region",sideNames:{blue:"North Command",red:"South Command"},
    cityNames:["Aster","Kelm","Ruden","Veles","Morava","Dalen","Korda","Selin","Novar","Arden","Tovin","Rask","Savin","Korin","Merva"]
  },
  {
    id:"deep-forest",title:"Black Forest Front",subtitle:"Dense woodland, poor visibility and road-dependent logistics",theme:"forest",historical:false,
    location:"Fictional temperate forest",sideNames:{blue:"Western Corps",red:"Eastern Corps"},
    cityNames:["Lydin","Berez","Vezna","Orel","Draven","Zorin","Karvin","Brask","Velin","Sodra","Narev","Rovina","Miren","Aster","Tarsk"]
  },
  {
    id:"desert-front",title:"Desert Front",subtitle:"Open maneuver warfare with fragile long supply lines",theme:"desert",historical:false,
    location:"Fictional arid basin",sideNames:{blue:"Expeditionary Force",red:"Desert Army"},
    cityNames:["Qadir","Mersa","Tobir","Nahal","Safa","Rasif","Birat","Kharim","Dara","Hajar","Qasr","Madin","Sahil","Aqra","Faris"]
  },
  {
    id:"ardennes-1944",title:"Ardennes 1944",subtitle:"Historically inspired winter forest scenario",theme:"winter",historical:true,year:1944,
    location:"Ardennes, Belgium and Luxembourg",sideNames:{blue:"U.S. First Army",red:"German Forces"},
    cityNames:["Bastogne","St. Vith","Houffalize","Malmedy","Clervaux","Wiltz","Ettelbruck","Diekirch","La Roche","Vielsalm","Spa","Marche","Neufchateau","Echternach","Trois-Ponts"]
  },
  {
    id:"kursk-1943",title:"Kursk 1943",subtitle:"Historically inspired steppe armored battle",theme:"steppe",historical:true,year:1943,
    location:"Kursk salient, Soviet Union",sideNames:{blue:"Red Army",red:"German Forces"},
    cityNames:["Kursk","Oboyan","Belgorod","Prokhorovka","Ponyri","Olkhovatka","Tomarovka","Korocha","Rylsk","Lgov","Fatezh","Sudzha","Gubkin","Stary Oskol","Dmitriyev"]
  },
  {
    id:"el-alamein-1942",title:"El Alamein 1942",subtitle:"Historically inspired desert scenario",theme:"desert",historical:true,year:1942,
    location:"El Alamein, Egypt",sideNames:{blue:"British Eighth Army",red:"Axis Forces"},
    cityNames:["El Alamein","Ruweisat","Tel el Eisa","Kidney Ridge","Miteiriya","Alam Halfa","El Imayid","Sidi Abd el Rahman","El Daba","Burg el Arab","Qattara","Deir el Munassib","Tell Aqqaqir","El Hammam","Fuka"]
  }
];

export const TERRAIN_RULES:Record<TerrainKind,{label:string;move:number;attack:number;defense:number;supply:number}>={
  water:{label:"Water",move:0,attack:0,defense:0,supply:0},
  plains:{label:"Plains",move:1,attack:1,defense:1,supply:1},
  desert:{label:"Desert",move:.96,attack:1.02,defense:.88,supply:.56},
  forest:{label:"Forest",move:.64,attack:.8,defense:1.32,supply:.68},
  hills:{label:"Hills",move:.58,attack:.74,defense:1.42,supply:.62},
  mountain:{label:"Mountain",move:.34,attack:.56,defense:1.82,supply:.38},
  highmountain:{label:"Impassable Ridge",move:.1,attack:.46,defense:2.15,supply:.22},
  marsh:{label:"Marsh",move:.4,attack:.66,defense:1.2,supply:.44},
  urban:{label:"Urban",move:.78,attack:.68,defense:1.65,supply:1.1}
};

export const UNIT_LABEL:Record<UnitKind,string>={
  infantry:"INF",mechanized:"MECH",armor:"ARM",tank:"TNK",cavalry:"CAV",mountaineer:"MNT",
  artillery:"ART",heavy_artillery:"HART",recon:"REC",engineer:"ENG",logistics:"LOG"
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

  const priorities:TerrainFeature["terrain"][]=["highmountain","mountain","marsh","forest","hills"];
  for(const terrain of priorities){
    const hit=scenario.terrainFeatures.find(f=>f.terrain===terrain&&inFeature(x,y,f));
    if(hit){
      const elevation=terrain==="highmountain"?.98:terrain==="mountain"?.88:terrain==="hills"?.63:terrain==="forest"?.46:.3;
      return{x,y,terrain,elevation,road:nearRoad(scenario,x,y)};
    }
  }
  const baseTerrain:TerrainKind=scenario.theme==="desert"?"desert":"plains";
  return{x,y,terrain:baseTerrain,elevation:.36+.07*Math.sin(x*.003+scenario.seed)+.04*Math.cos(y*.005),road:nearRoad(scenario,x,y)};
}

export function nearRoad(scenario:Scenario,x:number,y:number){
  return scenario.roadRoutes.some(route=>route.slice(0,-1).some((p,i)=>pointSegmentDistance(x,y,p,route[i+1])<30));
}

function featureSpec(theme:ScenarioTheme,rnd:()=>number):Array<[TerrainFeature["terrain"],number,[number,number],[number,number]]>{
  if(theme==="mountain")return[
    ["highmountain",9+Math.floor(rnd()*4),[420,820],[360,760]],
    ["mountain",14+Math.floor(rnd()*5),[480,980],[340,820]],
    ["hills",10+Math.floor(rnd()*4),[480,1000],[340,760]],
    ["forest",8+Math.floor(rnd()*4),[360,780],[280,640]]
  ];
  if(theme==="forest"||theme==="winter")return[
    ["forest",26+Math.floor(rnd()*8),[430,1050],[330,820]],
    ["hills",12+Math.floor(rnd()*5),[420,900],[300,700]],
    ["mountain",5+Math.floor(rnd()*3),[360,720],[300,620]],
    ["highmountain",2+Math.floor(rnd()*2),[300,560],[260,500]],
    ["marsh",5+Math.floor(rnd()*3),[360,800],[280,620]]
  ];
  if(theme==="desert")return[
    ["hills",10+Math.floor(rnd()*4),[520,1100],[340,760]],
    ["mountain",5+Math.floor(rnd()*3),[420,820],[300,650]],
    ["highmountain",2+Math.floor(rnd()*2),[300,560],[250,480]]
  ];
  if(theme==="steppe")return[
    ["hills",10+Math.floor(rnd()*4),[520,1150],[340,760]],
    ["forest",8+Math.floor(rnd()*4),[360,780],[260,600]],
    ["marsh",3+Math.floor(rnd()*2),[320,700],[250,560]]
  ];
  return[
    ["mountain",8+Math.floor(rnd()*4),[430,920],[300,720]],
    ["highmountain",3+Math.floor(rnd()*2),[320,620],[280,520]],
    ["hills",11+Math.floor(rnd()*5),[480,1050],[330,800]],
    ["forest",17+Math.floor(rnd()*7),[420,980],[300,760]],
    ["marsh",6+Math.floor(rnd()*4),[400,900],[300,690]]
  ];
}

function makeFeatures(rnd:()=>number,theme:ScenarioTheme){
  const spec=featureSpec(theme,rnd);
  const out:TerrainFeature[]=[];
  let id=0;
  for(const [terrain,count,rxRange,ryRange] of spec){
    for(let i=0;i<count;i++){
      let cx=500+rnd()*(WORLD_W-650),cy=180+rnd()*(WORLD_H-360);
      if(terrain==="mountain"||terrain==="highmountain"){
        if(theme==="mountain"){cx=950+rnd()*(WORLD_W-1500);cy=180+rnd()*(WORLD_H-360)}
        else{cx=1600+rnd()*(WORLD_W-1950);cy=160+rnd()*2300}
      }
      if(terrain==="marsh")cy=1900+rnd()*1900;
      const rx=rxRange[0]+rnd()*(rxRange[1]-rxRange[0]);
      const ry=ryRange[0]+rnd()*(ryRange[1]-ryRange[0]);
      const rotation=-55+rnd()*110;
      const seed=Math.floor(rnd()*100000);
      out.push({id:"t"+id++,terrain,cx,cy,rx,ry,rotation,seed,path:blobPath(cx,cy,rx,ry,rotation,seed)});
    }
  }
  return out;
}

function makeCities(rnd:()=>number,preset:ScenarioPreset):CityState[]{
  const names=[...preset.cityNames];
  const count=Math.min(names.length,15+Math.floor(rnd()*4));
  const shuffled=preset.historical?names:names.sort(()=>rnd()-.5);
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
  for(let i=0;i<Math.max(6,Math.floor(cities.length*.7));i++){
    const a=cities[Math.floor(rnd()*cities.length)];
    let b=cities[Math.floor(rnd()*cities.length)];
    if(a===b)b=cities[(cities.indexOf(a)+2)%cities.length];
    roads.push(routeBetween(a,b,rnd));
  }
  return roads;
}

function makeRivers(rnd:()=>number,theme:ScenarioTheme){
  const count=theme==="desert"?Math.floor(rnd()*2):theme==="mountain"||theme==="forest"?4+Math.floor(rnd()*2):3+Math.floor(rnd()*2);
  const routes:Array<Array<{x:number;y:number}>>=[];
  for(let r=0;r<count;r++){
    const base=1100+r*(4200/Math.max(1,count))+(rnd()-.5)*360;
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
    tank:{manpower:5900,hardness:.88,softAttack:76,hardAttack:86,defense:52,breakthrough:96,speed:6.4,recon:40},
    cavalry:{manpower:7200,hardness:.08,softAttack:46,hardAttack:12,defense:48,breakthrough:52,speed:8.3,recon:58},
    mountaineer:{manpower:8600,hardness:.1,softAttack:58,hardAttack:20,defense:76,breakthrough:42,speed:4.4,recon:44},
    artillery:{manpower:3900,hardness:.08,softAttack:92,hardAttack:35,defense:24,breakthrough:18,speed:3,recon:16},
    heavy_artillery:{manpower:4700,hardness:.1,softAttack:132,hardAttack:62,defense:20,breakthrough:14,speed:2.1,recon:10},
    recon:{manpower:2600,hardness:.38,softAttack:31,hardAttack:22,defense:36,breakthrough:45,speed:9,recon:92},
    engineer:{manpower:4300,hardness:.14,softAttack:35,hardAttack:14,defense:71,breakthrough:40,speed:4,recon:30},
    logistics:{manpower:2300,hardness:.1,softAttack:10,hardAttack:4,defense:22,breakthrough:8,speed:6,recon:18}
  };
  return base[kind];
}

function unit(id:string,name:string,side:Side,kind:UnitKind,x:number,y:number,rnd:()=>number,mods:Partial<Formation>={}):Formation{
  return{
    id,name,side,kind,x,y,
    strength:86+rnd()*14,
    organization:78+rnd()*16,
    supply:72+rnd()*24,
    fuel:["infantry","artillery","heavy_artillery","engineer","mountaineer","cavalry"].includes(kind)?100:70+rnd()*24,
    entrenchment:rnd()*10,
    experience:25+rnd()*45,
    readiness:74+rnd()*18,
    movementProgress:0,
    ...unitBase(kind),
    ...mods
  };
}

function repeated(kind:UnitKind,count:number){return Array.from({length:count},()=>kind)}

function rosterForTheme(theme:ScenarioTheme):UnitKind[]{
  if(theme==="mountain")return[
    ...repeated("infantry",18),...repeated("mountaineer",11),...repeated("cavalry",3),...repeated("tank",2),
    ...repeated("artillery",5),...repeated("heavy_artillery",2),...repeated("recon",3),...repeated("engineer",4),...repeated("logistics",4)
  ];
  if(theme==="forest"||theme==="winter")return[
    ...repeated("infantry",21),...repeated("mountaineer",3),...repeated("cavalry",4),...repeated("tank",5),...repeated("mechanized",4),
    ...repeated("artillery",6),...repeated("heavy_artillery",2),...repeated("recon",4),...repeated("engineer",4),...repeated("logistics",4)
  ];
  if(theme==="desert")return[
    ...repeated("infantry",10),...repeated("cavalry",8),...repeated("tank",11),...repeated("mechanized",8),
    ...repeated("artillery",5),...repeated("heavy_artillery",4),...repeated("recon",5),...repeated("engineer",2),...repeated("logistics",5)
  ];
  if(theme==="steppe")return[
    ...repeated("infantry",14),...repeated("cavalry",5),...repeated("tank",11),...repeated("mechanized",8),
    ...repeated("artillery",6),...repeated("heavy_artillery",4),...repeated("recon",4),...repeated("engineer",3),...repeated("logistics",5)
  ];
  return[
    ...repeated("infantry",18),...repeated("mountaineer",3),...repeated("cavalry",3),...repeated("tank",7),...repeated("mechanized",6),
    ...repeated("artillery",6),...repeated("heavy_artillery",3),...repeated("recon",4),...repeated("engineer",4),...repeated("logistics",4)
  ];
}

function spawnPoint(side:Side,cities:CityState[],scenario:Scenario,rnd:()=>number,kind:UnitKind){
  const owned=cities.filter(c=>c.owner===side);
  for(let tries=0;tries<80;tries++){
    const anchor=owned[Math.floor(rnd()*owned.length)]??{x:side==="blue"?1300:4900,y:WORLD_H*.5};
    const angle=rnd()*Math.PI*2;
    const radius=120+rnd()*470;
    const x=Math.max(330,Math.min(WORLD_W-90,anchor.x+Math.cos(angle)*radius));
    const y=Math.max(90,Math.min(WORLD_H-90,anchor.y+Math.sin(angle)*radius));
    const terrain=terrainAt(scenario,x,y).terrain;
    if(terrain!=="water"&&(terrain!=="highmountain"||kind==="mountaineer"))return{x,y};
  }
  return{x:side==="blue"?1300:4900,y:500+rnd()*(WORLD_H-1000)};
}

function makeFormations(side:Side,scenario:Scenario,rnd:()=>number){
  const kinds=rosterForTheme(scenario.theme);
  const labels:Record<UnitKind,string>={
    infantry:"Infantry",mechanized:"Mechanized",armor:"Armored",tank:"Tank",cavalry:"Cavalry",mountaineer:"Mountain",
    artillery:"Field Artillery",heavy_artillery:"Heavy Artillery",recon:"Recon",engineer:"Engineers",logistics:"Logistics"
  };
  return kinds.map((kind,i)=>{
    const p=spawnPoint(side,scenario.cities,scenario,rnd,kind);
    const prefix=side[0];
    const groupId=side+"-army-"+(1+Math.floor(i/10));
    return unit(prefix+(i+1),(i+1)+"th "+labels[kind],side,kind,p.x,p.y,rnd,{groupId,...(kind==="logistics"?{supply:100}: {})});
  });
}

function coastForTheme(theme:ScenarioTheme,rnd:()=>number){
  const inland=theme==="mountain"||theme==="forest"||theme==="winter"||theme==="steppe";
  return{
    base:inland?-620:210+rnd()*150,
    amp1:inland?45:85+rnd()*90,
    amp2:inland?30:50+rnd()*70,
    amp3:inland?18:28+rnd()*42,
    f1:.0018+rnd()*.001,
    f2:.0042+rnd()*.002,
    f3:.007+rnd()*.0025,
    p1:rnd()*Math.PI*2,
    p2:rnd()*Math.PI*2
  };
}

export function generateScenario(seed:number,presetId="frontier"):Scenario{
  const preset=SCENARIO_PRESETS.find(p=>p.id===presetId)??SCENARIO_PRESETS[0];
  const rnd=mulberry32(seed||1);
  const coast=coastForTheme(preset.theme,rnd);
  const cities=makeCities(rnd,preset);
  const terrainFeatures=makeFeatures(rnd,preset.theme);
  const roadRoutes=makeRoads(cities,rnd);
  const riverRoutes=makeRivers(rnd,preset.theme);
  const shell:Scenario={
    seed,presetId:preset.id,title:preset.title,theme:preset.theme,historical:preset.historical,year:preset.year,
    location:preset.location,sideNames:preset.sideNames,coast,cities,terrainFeatures,roadRoutes,riverRoutes,formations:[],landPath:""
  };

  const pts:Array<{x:number;y:number}>=[];
  for(let y=0;y<=WORLD_H;y+=70)pts.push({x:coastX(coast,y),y});
  shell.landPath="M "+WORLD_W+" 0 L "+coastX(coast,0)+" 0 "+pts.slice(1).map(p=>"L "+p.x.toFixed(1)+" "+p.y).join(" ")+" L "+WORLD_W+" "+WORLD_H+" Z";
  shell.formations=[...makeFormations("blue",shell,rnd),...makeFormations("red",shell,rnd)];
  return shell;
}
