import type {CityState,Formation,Scenario,ScenarioPreset,ScenarioTheme,Side,TerrainFeature,TerrainKind,TerrainSample,UnitKind} from "./types";

export const WORLD_W=8400;
export const WORLD_H=5600;

export const SCENARIO_PRESETS:ScenarioPreset[]=[
  {
    id:"frontier",title:"Frontier War",subtitle:"Balanced fictional operational theater",theme:"mixed",era:"modern",historical:false,
    location:"Fictional continental frontier",sideNames:{blue:"Blue Coalition",red:"Red Coalition"},sideFlags:{blue:"generic-blue",red:"generic-red"},
    cityNames:["Varen","Orlov","Karsen","Drey","Helmstadt","Serev","Vesta","Belgor","Rovina","Tarsk","Miren","Ostrel","Karvin","Dunava","Brask","Velin","Sodra","Narev"]
  },
  {
    id:"alpine",title:"Alpine Corridor",subtitle:"Mountain passes, ridges and narrow supply routes",theme:"mountain",era:"modern",historical:false,
    location:"Fictional alpine region",sideNames:{blue:"North Command",red:"South Command"},sideFlags:{blue:"generic-blue",red:"generic-red"},
    cityNames:["Aster","Kelm","Ruden","Veles","Morava","Dalen","Korda","Selin","Novar","Arden","Tovin","Rask","Savin","Korin","Merva"]
  },
  {
    id:"deep-forest",title:"Black Forest Front",subtitle:"Dense woodland, poor visibility and road-dependent logistics",theme:"forest",era:"modern",historical:false,
    location:"Fictional temperate forest",sideNames:{blue:"Western Corps",red:"Eastern Corps"},sideFlags:{blue:"generic-blue",red:"generic-red"},
    cityNames:["Lydin","Berez","Vezna","Orel","Draven","Zorin","Karvin","Brask","Velin","Sodra","Narev","Rovina","Miren","Aster","Tarsk"]
  },
  {
    id:"desert-front",title:"Desert Front",subtitle:"Open maneuver warfare with fragile long supply lines",theme:"desert",era:"modern",historical:false,
    location:"Fictional arid basin",sideNames:{blue:"Expeditionary Force",red:"Desert Army"},sideFlags:{blue:"generic-blue",red:"generic-red"},
    cityNames:["Qadir","Mersa","Tobir","Nahal","Safa","Rasif","Birat","Kharim","Dara","Hajar","Qasr","Madin","Sahil","Aqra","Faris"]
  },
  {
    id:"varna-1444",title:"Varna 1444",subtitle:"Late-medieval field battle between the Ottoman army and the Polish-Hungarian crusading host",theme:"mixed",era:"medieval",historical:true,year:1444,
    location:"Varna, Bulgaria",sideNames:{blue:"Polish-Hungarian Crusaders",red:"Ottoman Empire"},sideFlags:{blue:"crusader",red:"ottoman"},
    cityNames:["Varna","Galata","Devnya","Beloslav","Provadia","Shumen","Aksakovo","Belogradets","Kaspichan","Novi Pazar","Dobrina","Avren","Priseltsi","Vetrino","Topoli"]
  },
  {
    id:"breitenfeld-1631",title:"Breitenfeld 1631",subtitle:"Pike-and-shot battle with cavalry wings and artillery lines",theme:"steppe",era:"early_modern",historical:true,year:1631,
    location:"Breitenfeld near Leipzig, Saxony",sideNames:{blue:"Swedish-Saxon Army",red:"Imperial-Catholic League"},sideFlags:{blue:"sweden",red:"imperial"},
    cityNames:["Leipzig","Breitenfeld","Podelwitz","Seehausen","Wiederitzsch","Rackwitz","Gohlis","Lindenthal","Eutritzsch","Mockau","Taucha","Delitzsch","Schkeuditz","Lützschena","Schoenefeld"]
  },
  {
    id:"vienna-1683",title:"Vienna 1683",subtitle:"Relief battle around a besieged capital with strongpoints and constrained approaches",theme:"mixed",era:"early_modern",historical:true,year:1683,
    location:"Vienna, Habsburg Monarchy",sideNames:{blue:"Holy League",red:"Ottoman Empire"},sideFlags:{blue:"austria",red:"ottoman"},
    cityNames:["Vienna","Kahlenberg","Leopoldsberg","Nussdorf","Döbling","Hernals","Ottakring","Schwechat","Simmering","Klosterneuburg","Heiligenstadt","Grinzing","Perchtoldsdorf","Mödling","Liesing"]
  },
  {
    id:"austerlitz-1805",title:"Austerlitz 1805",subtitle:"Napoleonic maneuver battle across villages, heights and open ground",theme:"steppe",era:"napoleonic",historical:true,year:1805,
    location:"Austerlitz, Moravia",sideNames:{blue:"French Empire",red:"Third Coalition"},sideFlags:{blue:"france",red:"austria"},
    cityNames:["Austerlitz","Pratzen","Telnitz","Sokolnitz","Kobelnitz","Bellowitz","Kruh","Holubitz","Blasowitz","Krenowitz","Tellnitz","Menitz","Zuran","Santon","Littawa"]
  },
  {
    id:"verdun-1916",title:"Verdun 1916",subtitle:"Industrial-era attritional battle dominated by forts, artillery and difficult terrain",theme:"forest",era:"industrial",historical:true,year:1916,
    location:"Verdun, France",sideNames:{blue:"French Army",red:"German Empire"},sideFlags:{blue:"france",red:"german-empire"},
    cityNames:["Verdun","Douaumont","Vaux","Mort-Homme","Côte 304","Fleury","Thiaumont","Souville","Haudromont","Forges","Avocourt","Cumières","Damloup","Bras","Bezonvaux"]
  },
  {
    id:"spain-1937",title:"Spain 1937",subtitle:"Massive four-times-area civil-war theater with several simultaneous fronts, isolated pockets and long supply corridors",theme:"mixed",era:"modern",historical:true,year:1937,mapScale:2,
    location:"Spain",sideNames:{blue:"Spanish Republic",red:"Nationalist Spain"},sideFlags:{blue:"spain-republic",red:"spain-nationalist"},
    cityNames:["A Coruña","Vigo","Santiago","Lugo","Ourense","Pontevedra","Oviedo","Gijón","León","Santander","Bilbao","San Sebastián","Pamplona","Logroño","Burgos","Palencia","Valladolid","Zamora","Salamanca","Segovia","Ávila","Soria","Madrid","Toledo","Guadalajara","Cuenca","Ciudad Real","Cáceres","Badajoz","Mérida","Huelva","Sevilla","Cádiz","Córdoba","Jaén","Granada","Málaga","Almería","Murcia","Cartagena","Albacete","Alicante","Valencia","Castellón","Teruel","Zaragoza","Huesca","Lleida","Tarragona","Barcelona","Girona"]
  },
  {
    id:"stalingrad-1942",title:"Stalingrad 1942",subtitle:"Urban attritional warfare along the Volga with dense objectives and brutal logistics",theme:"urban",era:"modern",historical:true,year:1942,
    location:"Stalingrad, Soviet Union",sideNames:{blue:"Soviet 62nd Army",red:"German Sixth Army"},sideFlags:{blue:"ussr",red:"germany-ww2"},
    cityNames:["Mamayev Kurgan","Central Station","Grain Elevator","Red October","Barrikady","Tractor Factory","Spartakovka","Rynok","Orlovka","Gumrak","Tsaritsa","Volga Landing","Kuporosnoye","Beketovka","Krasny Oktyabr"]
  },
  {
    id:"el-alamein-1942",title:"El Alamein 1942",subtitle:"Historically inspired desert scenario",theme:"desert",era:"modern",historical:true,year:1942,
    location:"El Alamein, Egypt",sideNames:{blue:"British Eighth Army",red:"Axis Forces"},sideFlags:{blue:"britain",red:"axis"},
    cityNames:["El Alamein","Ruweisat","Tel el Eisa","Kidney Ridge","Miteiriya","Alam Halfa","El Imayid","Sidi Abd el Rahman","El Daba","Burg el Arab","Qattara","Deir el Munassib","Tell Aqqaqir","El Hammam","Fuka"]
  },
  {
    id:"kursk-1943",title:"Kursk 1943",subtitle:"Historically inspired steppe armored battle",theme:"steppe",era:"modern",historical:true,year:1943,
    location:"Kursk salient, Soviet Union",sideNames:{blue:"Red Army",red:"German Forces"},sideFlags:{blue:"ussr",red:"germany-ww2"},
    cityNames:["Kursk","Oboyan","Belgorod","Prokhorovka","Ponyri","Olkhovatka","Tomarovka","Korocha","Rylsk","Lgov","Fatezh","Sudzha","Gubkin","Stary Oskol","Dmitriyev"]
  },
  {
    id:"ardennes-1944",title:"Ardennes 1944",subtitle:"Historically inspired winter forest scenario",theme:"winter",era:"modern",historical:true,year:1944,
    location:"Ardennes, Belgium and Luxembourg",sideNames:{blue:"U.S. First Army",red:"German Forces"},sideFlags:{blue:"usa",red:"germany-ww2"},
    cityNames:["Bastogne","St. Vith","Houffalize","Malmedy","Clervaux","Wiltz","Ettelbruck","Diekirch","La Roche","Vielsalm","Spa","Marche","Neufchateau","Echternach","Trois-Ponts"]
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
  infantry:"INF",mechanized:"MECH",armor:"ARM",tank:"TNK",cavalry:"CAV",mountaineer:"MNT",special_forces:"SOF",
  mortar:"MTR",artillery:"ART",heavy_artillery:"HART",recon:"REC",engineer:"ENG",logistics:"LOG"
};

function mulberry32(seed:number){
  return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
}

function coastX(s:Scenario["coast"],y:number){
  return s.base+s.amp1*Math.sin(y*s.f1+s.p1)+s.amp2*Math.sin(y*s.f2+s.p2)+s.amp3*Math.cos(y*s.f3);
}

function pointInPolygon(x:number,y:number,polygon:Array<{x:number;y:number}>){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    const crosses=((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/(b.y-a.y||1e-9)+a.x);
    if(crosses)inside=!inside;
  }
  return inside;
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

function isMountainFeatureAt(features:TerrainFeature[],x:number,y:number){
  return features.some(f=>(f.terrain==="mountain"||f.terrain==="highmountain")&&inFeature(x,y,f));
}

function relocateCitiesOffMountains(
  cities:CityState[],
  features:TerrainFeature[],
  worldWidth:number,
  worldHeight:number,
  isAllowed:(x:number,y:number)=>boolean
){
  const placed:CityState[]=[];
  const valid=(x:number,y:number)=>{
    if(x<120||x>worldWidth-120||y<120||y>worldHeight-120||!isAllowed(x,y)||isMountainFeatureAt(features,x,y))return false;
    return placed.every(other=>Math.hypot(other.x-x,other.y-y)>150);
  };
  for(const city of cities){
    if(valid(city.x,city.y)){placed.push(city);continue}
    let found:{x:number;y:number}|null=null;
    const phase=(city.name.length*.61803398875)%1*Math.PI*2;
    for(let radius=60;radius<=1500&&!found;radius+=60){
      const samples=Math.max(18,Math.ceil(Math.PI*2*radius/95));
      for(let i=0;i<samples;i++){
        const angle=phase+i/samples*Math.PI*2;
        const x=city.x+Math.cos(angle)*radius,y=city.y+Math.sin(angle)*radius;
        if(valid(x,y)){found={x,y};break}
      }
    }
    if(!found){
      let bestD=Infinity;
      for(let y=160;y<worldHeight-160;y+=90)for(let x=160;x<worldWidth-160;x+=90){
        if(!valid(x,y))continue;
        const d=Math.hypot(x-city.x,y-city.y);
        if(d<bestD){bestD=d;found={x,y}}
      }
    }
    if(!found)throw new Error("Unable to place city outside mountain terrain: "+city.name);
    placed.push({...city,x:found.x,y:found.y});
  }
  return placed;
}

function pointSegmentDistance(x:number,y:number,a:{x:number;y:number},b:{x:number;y:number}){
  const dx=b.x-a.x,dy=b.y-a.y;
  const len=dx*dx+dy*dy;
  if(!len)return Math.hypot(x-a.x,y-a.y);
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len));
  return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
}

export function isLand(scenario:Scenario,x:number,y:number){
  const worldWidth=scenario.worldWidth??WORLD_W,worldHeight=scenario.worldHeight??WORLD_H;
  if(x<0||x>worldWidth||y<0||y>worldHeight)return false;
  if(scenario.landPolygon?.length)return pointInPolygon(x,y,scenario.landPolygon);
  return x>=coastX(scenario.coast,y);
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
  if(theme==="urban")return[
    ["hills",8+Math.floor(rnd()*3),[360,760],[260,580]],
    ["forest",5+Math.floor(rnd()*3),[300,650],[230,520]],
    ["marsh",2+Math.floor(rnd()*2),[280,580],[220,480]]
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
        else{cx=WORLD_W*.24+rnd()*(WORLD_W*.7);cy=160+rnd()*(WORLD_H*.58)}
      }
      if(terrain==="marsh")cy=WORLD_H*.42+rnd()*(WORLD_H*.46);
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
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const nx=-dy/len,ny=dx/len;
  const bend=(rnd()-.5)*Math.min(90,len*.09);
  const mid={x:(a.x+b.x)/2+nx*bend,y:(a.y+b.y)/2+ny*bend};
  return[{x:a.x,y:a.y},mid,{x:b.x,y:b.y}];
}

function makeRoadNetwork(cities:CityState[],rnd:()=>number){
  const edges=new Set<string>();
  const roads:Array<Array<{x:number;y:number}>>=[];
  const connect=(a:CityState,b:CityState)=>{
    const ia=cities.indexOf(a),ib=cities.indexOf(b);
    const key=ia<ib?ia+"-"+ib:ib+"-"+ia;
    if(edges.has(key)||a===b)return;
    edges.add(key);roads.push(routeBetween(a,b,rnd));
  };
  const sorted=[...cities].sort((a,b)=>a.x-b.x);
  for(let i=0;i<sorted.length-1;i++)connect(sorted[i],sorted[i+1]);
  for(const city of cities){
    const nearest=cities.filter(c=>c!==city).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y));
    for(const other of nearest.slice(0,2))connect(city,other);
  }
  return{
    nodes:cities.map((city,i)=>({id:"road-"+i,x:city.x,y:city.y,cityName:city.name})),
    routes:roads
  };
}

function makeRivers(rnd:()=>number,theme:ScenarioTheme){
  const count=theme==="desert"?Math.floor(rnd()*2):theme==="urban"?2+Math.floor(rnd()*2):theme==="mountain"||theme==="forest"?4+Math.floor(rnd()*2):3+Math.floor(rnd()*2);
  const routes:Array<Array<{x:number;y:number}>>=[];
  for(let r=0;r<count;r++){
    const base=WORLD_W*.16+r*(WORLD_W*.68/Math.max(1,count))+(rnd()-.5)*WORLD_W*.055;
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
    special_forces:{manpower:3400,hardness:.14,softAttack:64,hardAttack:26,defense:72,breakthrough:58,speed:5.2,recon:78},
    mortar:{manpower:2800,hardness:.06,softAttack:78,hardAttack:20,defense:28,breakthrough:20,speed:3.8,recon:20},
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
    fuel:["infantry","mortar","artillery","heavy_artillery","engineer","mountaineer","special_forces","cavalry"].includes(kind)?100:70+rnd()*24,
    entrenchment:rnd()*10,
    experience:25+rnd()*45,
    readiness:74+rnd()*18,
    movementProgress:0,
    ...unitBase(kind),
    ...mods
  };
}

function repeated(kind:UnitKind,count:number){return Array.from({length:count},()=>kind)}

function rosterForScenario(scenario:Scenario):UnitKind[]{
  if(scenario.presetId==="spain-1937")return[
    ...repeated("infantry",42),...repeated("mountaineer",8),...repeated("cavalry",6),...repeated("armor",3),
    ...repeated("mortar",8),...repeated("artillery",9),...repeated("heavy_artillery",2),...repeated("recon",4),...repeated("engineer",5),...repeated("logistics",6)
  ];
  if(scenario.era==="medieval")return[
    ...repeated("infantry",26),...repeated("cavalry",14),...repeated("artillery",4),...repeated("engineer",2),...repeated("logistics",2)
  ];
  if(scenario.era==="early_modern")return[
    ...repeated("infantry",30),...repeated("cavalry",10),...repeated("artillery",8),...repeated("heavy_artillery",2),...repeated("engineer",3),...repeated("logistics",3)
  ];
  if(scenario.era==="napoleonic")return[
    ...repeated("infantry",30),...repeated("cavalry",10),...repeated("artillery",9),...repeated("heavy_artillery",2),...repeated("recon",2),...repeated("engineer",3),...repeated("logistics",3)
  ];
  if(scenario.era==="industrial")return[
    ...repeated("infantry",34),...repeated("cavalry",4),...repeated("mortar",6),...repeated("artillery",10),...repeated("heavy_artillery",6),...repeated("recon",3),...repeated("engineer",5),...repeated("logistics",5)
  ];
  const theme=scenario.theme;
  if(theme==="mountain")return[
    ...repeated("infantry",16),...repeated("mountaineer",11),...repeated("special_forces",2),...repeated("cavalry",3),...repeated("tank",2),
    ...repeated("mortar",5),...repeated("artillery",5),...repeated("heavy_artillery",2),...repeated("recon",3),...repeated("engineer",4),...repeated("logistics",4)
  ];
  if(theme==="forest"||theme==="winter")return[
    ...repeated("infantry",19),...repeated("mountaineer",3),...repeated("special_forces",2),...repeated("cavalry",4),...repeated("tank",5),...repeated("mechanized",4),
    ...repeated("mortar",5),...repeated("artillery",6),...repeated("heavy_artillery",2),...repeated("recon",4),...repeated("engineer",4),...repeated("logistics",4)
  ];
  if(theme==="desert")return[
    ...repeated("infantry",9),...repeated("special_forces",1),...repeated("cavalry",8),...repeated("tank",11),...repeated("mechanized",8),
    ...repeated("mortar",4),...repeated("artillery",5),...repeated("heavy_artillery",4),...repeated("recon",5),...repeated("engineer",2),...repeated("logistics",5)
  ];
  if(theme==="steppe")return[
    ...repeated("infantry",13),...repeated("special_forces",1),...repeated("cavalry",5),...repeated("tank",11),...repeated("mechanized",8),
    ...repeated("mortar",4),...repeated("artillery",6),...repeated("heavy_artillery",4),...repeated("recon",4),...repeated("engineer",3),...repeated("logistics",5)
  ];
  if(theme==="urban")return[
    ...repeated("infantry",28),...repeated("special_forces",2),...repeated("tank",7),...repeated("mechanized",3),...repeated("mortar",6),...repeated("artillery",8),
    ...repeated("heavy_artillery",4),...repeated("recon",3),...repeated("engineer",7),...repeated("logistics",5)
  ];
  return[
    ...repeated("infantry",16),...repeated("mountaineer",3),...repeated("special_forces",2),...repeated("cavalry",3),...repeated("tank",7),...repeated("mechanized",6),
    ...repeated("mortar",5),...repeated("artillery",6),...repeated("heavy_artillery",3),...repeated("recon",4),...repeated("engineer",4),...repeated("logistics",4)
  ];
}
function spawnPoint(side:Side,cities:CityState[],scenario:Scenario,rnd:()=>number,kind:UnitKind){
  const worldWidth=scenario.worldWidth??WORLD_W,worldHeight=scenario.worldHeight??WORLD_H;
  const owned=cities.filter(c=>c.owner===side);
  const hostile=cities.filter(c=>c.owner!==side);
  for(let tries=0;tries<100;tries++){
    const anchor=owned[Math.floor(rnd()*owned.length)]??{x:side==="blue"?worldWidth*.2:worldWidth*.8,y:worldHeight*.5};
    const connected=scenario.roadRoutes.filter(route=>Math.hypot(route[0].x-anchor.x,route[0].y-anchor.y)<5||Math.hypot(route[route.length-1].x-anchor.x,route[route.length-1].y-anchor.y)<5);
    const route=connected[Math.floor(rnd()*connected.length)];
    let base:{x:number;y:number}=anchor;
    if(route){
      const startDist=Math.hypot(route[0].x-anchor.x,route[0].y-anchor.y);
      const endDist=Math.hypot(route[route.length-1].x-anchor.x,route[route.length-1].y-anchor.y);
      if(startDist<=endDist){
        base=route[Math.floor(rnd()*Math.min(2,route.length))];
      }else{
        const offset=Math.floor(rnd()*Math.min(2,route.length));
        base=route[Math.max(0,route.length-1-offset)];
      }
    }
    const angle=rnd()*Math.PI*2,radius=rnd()*34;
    const x=Math.max(330,Math.min(worldWidth-90,base.x+Math.cos(angle)*radius));
    const y=Math.max(90,Math.min(worldHeight-90,base.y+Math.sin(angle)*radius));
    const terrain=terrainAt(scenario,x,y).terrain;
    const nearHostileCity=hostile.some(c=>Math.hypot(c.x-x,c.y-y)<180);
    if(!nearHostileCity&&terrain!=="water"&&terrain!=="mountain"&&terrain!=="highmountain")return{x,y};
  }
  const anchor=owned.sort((a,b)=>{
    const da=Math.min(...hostile.map(c=>Math.hypot(c.x-a.x,c.y-a.y)),Infinity);
    const db=Math.min(...hostile.map(c=>Math.hypot(c.x-b.x,c.y-b.y)),Infinity);
    return db-da;
  })[0]??{x:side==="blue"?worldWidth*.2:worldWidth*.8,y:worldHeight*.5};
  return{x:anchor.x,y:anchor.y};
}

function makeFormations(side:Side,scenario:Scenario,rnd:()=>number){
  const kinds=rosterForScenario(scenario);
  const labels:Record<UnitKind,string>={
    infantry:"Infantry",mechanized:"Mechanized",armor:"Armored",tank:"Tank",cavalry:"Cavalry",mountaineer:"Mountain",special_forces:"Special Forces",
    mortar:"Mortar",artillery:"Field Artillery",heavy_artillery:"Heavy Artillery",recon:"Recon",engineer:"Engineers",logistics:"Logistics"
  };
  return kinds.map((kind,i)=>{
    const p=spawnPoint(side,scenario.cities,scenario,rnd,kind);
    const prefix=side[0];
    const groupId=side+"-army-"+(1+Math.floor(i/10));
    return unit(prefix+(i+1),(i+1)+"th "+labels[kind],side,kind,p.x,p.y,rnd,{groupId,...(kind==="logistics"?{supply:100}: {})});
  });
}

function coastForTheme(theme:ScenarioTheme,rnd:()=>number){
  const inland=theme==="mountain"||theme==="forest"||theme==="winter"||theme==="steppe"||theme==="urban";
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


type SpainCitySeed=[name:string,lon:number,lat:number,owner:Side];
const SPAIN_CITY_SEEDS:SpainCitySeed[]=[
  ["A Coruña",-8.41,43.36,"red"],["Vigo",-8.72,42.24,"red"],["Santiago",-8.54,42.88,"red"],["Lugo",-7.56,43.01,"red"],["Ourense",-7.86,42.34,"red"],["Pontevedra",-8.64,42.43,"red"],
  ["Oviedo",-5.85,43.36,"blue"],["Gijón",-5.66,43.54,"blue"],["León",-5.57,42.60,"red"],["Santander",-3.81,43.46,"blue"],["Bilbao",-2.94,43.26,"blue"],["San Sebastián",-1.98,43.32,"blue"],
  ["Pamplona",-1.64,42.82,"red"],["Logroño",-2.45,42.47,"red"],["Burgos",-3.70,42.34,"red"],["Palencia",-4.53,42.01,"red"],["Valladolid",-4.72,41.65,"red"],["Zamora",-5.74,41.50,"red"],
  ["Salamanca",-5.66,40.97,"red"],["Segovia",-4.12,40.95,"red"],["Ávila",-4.70,40.66,"red"],["Soria",-2.47,41.76,"red"],["Madrid",-3.70,40.42,"blue"],["Toledo",-4.03,39.86,"red"],
  ["Guadalajara",-3.17,40.63,"blue"],["Cuenca",-2.14,40.07,"blue"],["Ciudad Real",-3.93,38.99,"blue"],["Cáceres",-6.37,39.48,"red"],["Badajoz",-6.97,38.88,"red"],["Mérida",-6.34,38.92,"red"],
  ["Huelva",-6.94,37.26,"red"],["Sevilla",-5.99,37.39,"red"],["Cádiz",-6.29,36.53,"red"],["Córdoba",-4.78,37.89,"red"],["Jaén",-3.79,37.78,"blue"],["Granada",-3.60,37.18,"red"],
  ["Málaga",-4.42,36.72,"red"],["Almería",-2.46,36.84,"blue"],["Murcia",-1.13,37.99,"blue"],["Cartagena",-0.98,37.61,"blue"],["Albacete",-1.86,38.99,"blue"],["Alicante",-0.49,38.35,"blue"],
  ["Valencia",-0.38,39.47,"blue"],["Castellón",-0.05,39.99,"blue"],["Teruel",-1.11,40.34,"red"],["Zaragoza",-0.89,41.65,"red"],["Huesca",-0.41,42.14,"red"],["Lleida",0.62,41.62,"blue"],
  ["Tarragona",1.25,41.12,"blue"],["Barcelona",2.17,41.39,"blue"],["Girona",2.82,41.98,"blue"]
];

function spainPoint(lon:number,lat:number,worldWidth:number,worldHeight:number){
  const minLon=-9.55,maxLon=3.45,minLat=35.65,maxLat=43.85;
  const marginX=520,marginY=360;
  return{
    x:marginX+(lon-minLon)/(maxLon-minLon)*(worldWidth-marginX*2),
    y:marginY+(maxLat-lat)/(maxLat-minLat)*(worldHeight-marginY*2)
  };
}

function makeSpainLandPolygon(worldWidth:number,worldHeight:number){
  const outline:Array<[number,number]>=[
    [-8.95,43.34],[-7.65,43.66],[-5.80,43.58],[-3.75,43.48],[-1.82,43.38],[-1.35,43.02],[-0.25,42.88],[1.05,42.80],[2.55,42.50],[3.20,42.02],
    [3.00,41.42],[2.20,40.90],[1.15,40.48],[0.08,39.98],[-0.42,39.28],[-0.72,38.55],[-1.25,37.82],[-2.45,36.78],[-3.85,36.18],[-5.20,36.00],
    [-6.28,36.30],[-6.90,37.05],[-7.25,37.45],[-7.42,38.25],[-7.02,39.05],[-6.98,40.02],[-6.88,41.02],[-7.10,41.82],[-8.10,42.02],[-8.92,42.32]
  ];
  return outline.map(([lon,lat])=>spainPoint(lon,lat,worldWidth,worldHeight));
}

function makeSpainCities(worldWidth:number,worldHeight:number):CityState[]{
  return SPAIN_CITY_SEEDS.map(([name,lon,lat,owner])=>({...spainPoint(lon,lat,worldWidth,worldHeight),name,owner,capture:0}));
}

function makeSpainRoadNetwork(cities:CityState[],rnd:()=>number){
  const edges=new Set<string>(),routes:Array<Array<{x:number;y:number}>>=[];
  const connect=(a:CityState,b:CityState)=>{
    if(a===b)return;
    const ia=cities.indexOf(a),ib=cities.indexOf(b),key=ia<ib?ia+"-"+ib:ib+"-"+ia;
    if(edges.has(key))return;
    edges.add(key);routes.push(routeBetween(a,b,rnd));
  };
  for(const city of cities){
    const nearest=cities.filter(c=>c!==city).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y));
    for(const other of nearest.slice(0,4))connect(city,other);
  }
  const byName=new Map(cities.map(city=>[city.name,city]));
  const trunks=[
    ["A Coruña","León"],["León","Madrid"],["Madrid","Valencia"],["Madrid","Zaragoza"],["Zaragoza","Barcelona"],["Bilbao","Burgos"],["Burgos","Madrid"],
    ["Salamanca","Madrid"],["Madrid","Córdoba"],["Córdoba","Sevilla"],["Sevilla","Cádiz"],["Córdoba","Granada"],["Granada","Almería"],["Albacete","Alicante"],["Valencia","Barcelona"]
  ];
  for(const [a,b] of trunks){const ca=byName.get(a),cb=byName.get(b);if(ca&&cb)connect(ca,cb)}
  return{nodes:cities.map((city,i)=>({id:"road-"+i,x:city.x,y:city.y,cityName:city.name})),routes};
}

function makeSpainFeatures(worldWidth:number,worldHeight:number,rnd:()=>number){
  const out:TerrainFeature[]=[];let id=0;
  const add=(terrain:TerrainFeature["terrain"],lon:number,lat:number,rx:number,ry:number,rotation:number)=>{
    const p=spainPoint(lon,lat,worldWidth,worldHeight),seed=Math.floor(rnd()*100000);
    out.push({id:"spain-t"+id++,terrain,cx:p.x,cy:p.y,rx,ry,rotation,seed,path:blobPath(p.x,p.y,rx,ry,rotation,seed)});
  };
  [
    [-1.40,42.85,900,500,8],[0.10,42.72,1050,520,4],[1.55,42.55,950,480,-5],[2.45,42.38,720,430,-10]
  ].forEach(v=>add("highmountain",v[0],v[1],v[2],v[3],v[4]));
  [
    [-7.15,43.05,900,480,-8],[-5.35,43.12,1100,520,-3],[-3.45,43.08,1050,500,4],[-1.85,42.95,900,460,9],
    [-5.40,40.55,1050,420,-8],[-3.75,40.65,1050,420,3],[-2.10,41.05,980,430,22],[-0.85,40.65,900,420,28],
    [-5.10,38.20,1150,420,-4],[-3.65,37.25,950,420,-10],[-2.30,37.05,800,460,-16]
  ].forEach(v=>add("mountain",v[0],v[1],v[2],v[3],v[4]));
  [
    [-8.10,42.55,900,650,-12],[-6.20,42.45,950,650,5],[-4.45,41.80,1000,700,8],[-2.55,39.55,1000,720,12],[-0.50,39.55,900,650,18],
    [-6.00,39.40,900,650,-4],[-4.30,38.70,1050,650,5],[-1.80,38.25,850,600,-8]
  ].forEach(v=>add("hills",v[0],v[1],v[2],v[3],v[4]));
  [
    [-8.15,43.05,780,520,-10],[-6.25,43.10,900,500,2],[-3.95,43.05,880,500,5],[-1.80,42.70,650,500,8],[-6.00,40.20,650,520,-6],[-0.15,41.80,650,500,15]
  ].forEach(v=>add("forest",v[0],v[1],v[2],v[3],v[4]));
  return out;
}

function makeSpainRivers(worldWidth:number,worldHeight:number){
  const river=(points:Array<[number,number]>)=>points.map(([lon,lat])=>spainPoint(lon,lat,worldWidth,worldHeight));
  return[
    river([[-3.60,42.75],[-2.55,42.45],[-1.35,42.10],[-0.15,41.72],[0.85,41.35],[1.10,40.80]]),
    river([[-2.60,42.05],[-3.90,41.80],[-5.10,41.65],[-6.35,41.30],[-6.85,41.05]]),
    river([[-1.55,40.45],[-2.90,40.15],[-4.20,39.95],[-5.55,39.70],[-6.85,39.25]]),
    river([[-3.10,39.10],[-4.25,38.95],[-5.35,38.60],[-6.55,38.10],[-7.00,37.85]]),
    river([[-2.85,37.95],[-4.05,37.75],[-5.15,37.55],[-6.15,37.25]])
  ];
}

function generateSpainScenario(seed:number,preset:ScenarioPreset,rnd:()=>number):Scenario{
  const worldWidth=WORLD_W*(preset.mapScale??2),worldHeight=WORLD_H*(preset.mapScale??2);
  const rawCities=makeSpainCities(worldWidth,worldHeight);
  const roadNetwork=makeSpainRoadNetwork(rawCities,rnd);
  const landPolygon=makeSpainLandPolygon(worldWidth,worldHeight);
  const terrainFeatures=makeSpainFeatures(worldWidth,worldHeight,rnd);
  const cities=relocateCitiesOffMountains(rawCities,terrainFeatures,worldWidth,worldHeight,(x,y)=>pointInPolygon(x,y,landPolygon));
  const movedByName=new Map(cities.map(city=>[city.name,city]));
  const safeRoadRoutes=roadNetwork.routes.map(route=>{
    const next=route.map(p=>({...p}));
    const start=rawCities.find(city=>Math.hypot(city.x-route[0].x,city.y-route[0].y)<1);
    const end=rawCities.find(city=>Math.hypot(city.x-route[route.length-1].x,city.y-route[route.length-1].y)<1);
    if(start){const moved=movedByName.get(start.name);if(moved)next[0]={x:moved.x,y:moved.y}}
    if(end){const moved=movedByName.get(end.name);if(moved)next[next.length-1]={x:moved.x,y:moved.y}}
    return next;
  });
  const shell:Scenario={
    seed,presetId:preset.id,title:preset.title,theme:preset.theme,era:preset.era,historical:preset.historical,year:preset.year,
    location:preset.location,sideNames:preset.sideNames,sideFlags:preset.sideFlags,worldWidth,worldHeight,landPolygon,
    coast:{base:-999,amp1:0,amp2:0,amp3:0,f1:0,f2:0,f3:0,p1:0,p2:0},
    cities,terrainFeatures,roadNodes:cities.map((city,i)=>({id:"road-"+i,x:city.x,y:city.y,cityName:city.name})),roadRoutes:safeRoadRoutes,
    riverRoutes:makeSpainRivers(worldWidth,worldHeight),formations:[],landPath:""
  };
  shell.landPath="M "+landPolygon.map(p=>p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" L ")+" Z";
  shell.formations=[...makeFormations("blue",shell,rnd),...makeFormations("red",shell,rnd)];
  return shell;
}

export function generateScenario(seed:number,presetId="frontier"):Scenario{
  const preset=SCENARIO_PRESETS.find(p=>p.id===presetId)??SCENARIO_PRESETS[0];
  const rnd=mulberry32(seed||1);
  if(preset.id==="spain-1937")return generateSpainScenario(seed,preset,rnd);
  const coast=coastForTheme(preset.theme,rnd);
  const rawCities=makeCities(rnd,preset);
  const terrainFeatures=makeFeatures(rnd,preset.theme);
  const cities=relocateCitiesOffMountains(rawCities,terrainFeatures,WORLD_W,WORLD_H,(x,y)=>x>=coastX(coast,y));
  const roadNetwork=makeRoadNetwork(cities,rnd);
  const roadRoutes=roadNetwork.routes;
  const riverRoutes=makeRivers(rnd,preset.theme);
  const shell:Scenario={
    seed,presetId:preset.id,title:preset.title,theme:preset.theme,era:preset.era,historical:preset.historical,year:preset.year,
    location:preset.location,sideNames:preset.sideNames,sideFlags:preset.sideFlags,worldWidth:WORLD_W,worldHeight:WORLD_H,coast,cities,terrainFeatures,roadNodes:roadNetwork.nodes,roadRoutes,riverRoutes,formations:[],landPath:""
  };

  const pts:Array<{x:number;y:number}>=[];
  for(let y=0;y<=WORLD_H;y+=70)pts.push({x:coastX(coast,y),y});
  shell.landPath="M "+WORLD_W+" 0 L "+coastX(coast,0)+" 0 "+pts.slice(1).map(p=>"L "+p.x.toFixed(1)+" "+p.y).join(" ")+" L "+WORLD_W+" "+WORLD_H+" Z";
  shell.formations=[...makeFormations("blue",shell,rnd),...makeFormations("red",shell,rnd)];
  return shell;
}
