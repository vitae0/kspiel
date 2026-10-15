import type {Side,TerrainFeature} from "./types";

export type TheaterCity=[name:string,longitude:number,latitude:number,owner:Side];
export type TheaterTerrain=[terrain:TerrainFeature["terrain"],longitude:number,latitude:number,width:number,height:number,angle:number];
export type GeographicTheater={
  id:string;
  bounds:[west:number,east:number,south:number,north:number];
  /** Simplified theater coastline/border; not a political boundary dataset. */
  outline:Array<[longitude:number,latitude:number]>;
  islands?:Array<Array<[longitude:number,latitude:number]>>;
  cities:TheaterCity[];
  relief:TheaterTerrain[];
  rivers:Array<Array<[number,number]>>;
  trunks:Array<[string,string]>;
  cover:"forest"|"mountain"|"steppe"|"desert"|"mixed";
  density:number;
};

// Each scenario uses real place names with deliberately game-balanced, fictionalized initial ownership.
// Coordinates and region outlines are approximate strategic-game geometry.
export const GEOGRAPHIC_THEATERS:Record<string,GeographicTheater>={
  "eastern-front-1943":{
    id:"eastern-front-1943",bounds:[22.0,43.0,45.2,54.4],cover:"steppe",density:1.15,
    outline:[[22.3,53.9],[27.1,54.1],[31.5,54.2],[36.9,54.0],[42.7,53.8],[42.8,47.4],[41.6,45.5],[35.1,45.4],[30.0,45.5],[25.0,45.5],[22.3,46.1]],
    cities:[
      ["Kyiv",30.52,50.45,"blue"],["Chernihiv",31.29,51.50,"blue"],["Nizhyn",31.89,51.05,"blue"],["Zhytomyr",28.66,50.25,"blue"],["Bila Tserkva",30.12,49.80,"blue"],
      ["Korosten",28.64,50.95,"blue"],["Vinnytsia",28.47,49.23,"blue"],["Uman",30.22,48.75,"blue"],["Cherkasy",32.06,49.44,"blue"],
      ["Sumy",34.80,50.91,"red"],["Konotop",33.20,51.24,"blue"],["Romny",33.48,50.75,"red"],["Poltava",34.55,49.59,"red"],["Myrhorod",33.61,49.96,"red"],
      ["Kharkiv",36.23,49.99,"red"],["Izyum",37.27,49.21,"red"],["Kupyansk",37.62,49.72,"red"],["Balakliia",36.85,49.46,"red"],
      ["Dnipro",35.05,48.46,"blue"],["Kamianske",34.61,48.52,"blue"],["Kremenchuk",33.42,49.07,"red"],["Pavlohrad",35.87,48.53,"red"],
      ["Zaporizhzhia",35.14,47.84,"red"],["Nikopol",34.39,47.57,"red"],["Kryvyi Rih",33.39,47.91,"blue"],["Oleksandriia",33.12,48.67,"blue"],
      ["Kropyvnytskyi",32.26,48.51,"blue"],["Mykolaiv",31.99,46.98,"blue"],["Kherson",32.62,46.64,"red"],["Melitopol",35.36,46.85,"red"],
      ["Mariupol",37.55,47.10,"red"],["Berdiansk",36.79,46.76,"red"],["Donetsk",37.80,48.01,"red"],["Horlivka",38.05,48.30,"red"],
      ["Luhansk",39.31,48.57,"red"],["Sievierodonetsk",38.49,48.95,"red"],["Sloviansk",37.61,48.86,"red"],["Kramatorsk",37.58,48.72,"red"],
      ["Belgorod",36.59,50.60,"red"],["Kursk",36.19,51.73,"red"],["Rylsk",34.68,51.57,"red"],["Voronezh",39.20,51.68,"red"],
      ["Bryansk",34.36,53.25,"blue"],["Oryol",36.07,52.97,"red"],["Yelets",38.50,52.62,"red"],["Stary Oskol",37.84,51.30,"red"],
      ["Prokhorovka",36.73,51.04,"red"],["Oboyan",36.28,51.21,"red"],["Kostiantynivka",37.71,48.53,"red"],["Pokrovsk",37.17,48.29,"red"]
    ],
    relief:[["hills",32.8,48.2,1.5,.65,8],["hills",35.6,51.2,1.2,.65,-15],["forest",30.0,52.0,1.6,1.1,5],["forest",34.0,53.1,1.8,.65,30],["marsh",30.5,51.7,.8,.6,22],["marsh",33.3,49.8,.8,.5,10]],
    rivers:[
      [[31.2,53.6],[30.6,51.7],[30.52,50.45],[31.7,49.9],[32.1,49.4],[33.5,48.9],[34.6,48.5],[35.05,48.46],[35.14,47.84],[34.1,46.7]],
      [[33.0,51.8],[33.5,50.8],[33.7,49.9],[33.4,49.1],[32.4,48.6]],
      [[36.1,51.1],[36.0,50.3],[36.8,49.4],[37.5,48.6],[38.3,47.3]]
    ],
    trunks:[["Kyiv","Chernihiv"],["Kyiv","Cherkasy"],["Cherkasy","Kremenchuk"],["Kremenchuk","Poltava"],["Poltava","Kharkiv"],["Kharkiv","Belgorod"],["Belgorod","Kursk"],["Kursk","Oryol"],["Dnipro","Zaporizhzhia"],["Dnipro","Pavlohrad"],["Pavlohrad","Donetsk"],["Donetsk","Luhansk"],["Kryvyi Rih","Mykolaiv"],["Kherson","Melitopol"],["Melitopol","Mariupol"]]
  },
  "balkans-1944":{
    id:"balkans-1944",bounds:[12.3,30.2,38.0,47.3],cover:"mountain",density:1.05,
    outline:[[12.7,46.9],[18.5,47.0],[24.5,46.8],[29.7,46.8],[29.8,40.0],[27.9,38.3],[22.8,38.2],[19.2,38.3],[16.1,39.1],[13.0,42.2]],
    cities:[
      ["Ljubljana",14.51,46.06,"blue"],["Maribor",15.65,46.56,"blue"],["Zagreb",15.98,45.81,"blue"],["Karlovac",15.55,45.49,"blue"],["Rijeka",14.44,45.33,"blue"],
      ["Pula",13.85,44.87,"blue"],["Zadar",15.23,44.12,"blue"],["Split",16.44,43.51,"blue"],["Dubrovnik",18.09,42.65,"blue"],["Šibenik",15.90,43.73,"blue"],
      ["Bihać",15.87,44.82,"blue"],["Banja Luka",17.19,44.78,"red"],["Sarajevo",18.41,43.85,"blue"],["Mostar",17.81,43.34,"red"],["Tuzla",18.67,44.54,"blue"],
      ["Zenica",17.91,44.20,"blue"],["Jajce",17.27,44.34,"blue"],["Brčko",18.81,44.87,"red"],["Prijedor",16.71,44.98,"red"],
      ["Belgrade",20.46,44.82,"red"],["Novi Sad",19.83,45.26,"red"],["Subotica",19.67,46.10,"red"],["Sombor",19.11,45.77,"red"],["Sremska Mitrovica",19.61,44.97,"red"],
      ["Valjevo",19.90,44.27,"blue"],["Užice",19.84,43.86,"blue"],["Čačak",20.35,43.89,"blue"],["Kragujevac",20.92,44.01,"red"],["Kraljevo",20.69,43.72,"blue"],
      ["Niš",21.90,43.32,"red"],["Leskovac",21.95,42.99,"red"],["Pirot",22.59,43.15,"red"],["Novi Pazar",20.52,43.14,"blue"],
      ["Podgorica",19.26,42.44,"blue"],["Cetinje",18.92,42.39,"blue"],["Pljevlja",19.36,43.36,"blue"],["Bijelo Polje",19.75,43.04,"blue"],
      ["Pristina",21.16,42.66,"red"],["Peja",20.29,42.66,"blue"],["Skopje",21.43,41.99,"red"],["Tetovo",21.03,42.01,"blue"],["Bitola",21.34,41.03,"blue"],
      ["Ohrid",20.80,41.12,"blue"],["Tirana",19.82,41.33,"blue"],["Shkodër",19.51,42.07,"blue"],["Durrës",19.45,41.32,"blue"],
      ["Sofia",23.32,42.70,"red"],["Pernik",23.03,42.61,"red"],["Plovdiv",24.75,42.14,"red"],["Pazardzhik",24.33,42.19,"red"],
      ["Ruse",25.97,43.85,"red"],["Pleven",24.62,43.42,"red"],["Vidin",22.87,43.99,"red"],["Veliko Tarnovo",25.63,43.08,"red"],
      ["Varna",27.92,43.21,"red"],["Burgas",27.47,42.50,"red"],["Bucharest",26.10,44.43,"red"],["Giurgiu",25.97,43.90,"red"],
      ["Timișoara",21.23,45.75,"blue"],["Arad",21.32,46.19,"red"],["Drobeta",22.66,44.63,"red"],["Craiova",23.79,44.32,"red"]
    ],
    relief:[["highmountain",19.2,43.5,1.6,1.5,12],["mountain",17.4,44.1,1.8,1.4,-12],["mountain",21.0,42.6,1.2,1.0,20],["mountain",23.2,42.0,1.1,.7,8],["mountain",24.5,41.7,1.5,.8,-18],["forest",17.5,45.5,1.8,1.0,11],["forest",20.3,44.4,1.5,.9,9]],
    rivers:[
      [[18.1,46.3],[19.5,45.9],[20.4,45.1],[21.4,44.8],[22.8,44.5],[24.8,43.9],[26.4,43.9],[28.4,44.1]],
      [[16.7,44.9],[17.4,44.5],[18.4,44.1],[19.2,44.2],[20.46,44.82]]
    ],
    trunks:[["Zagreb","Belgrade"],["Zagreb","Sarajevo"],["Sarajevo","Mostar"],["Sarajevo","Užice"],["Belgrade","Niš"],["Niš","Sofia"],["Sofia","Plovdiv"],["Plovdiv","Burgas"],["Belgrade","Novi Sad"],["Banja Luka","Bihać"],["Podgorica","Skopje"],["Skopje","Sofia"],["Timișoara","Belgrade"],["Sofia","Bucharest"]]
  },
  "italy-1944":{
    id:"italy-1944",bounds:[6.1,19.0,35.5,47.6],cover:"mixed",density:1.1,
    islands:[[[12.0,38.1],[12.6,38.5],[13.8,38.5],[15.7,38.25],[15.25,37.02],[14.2,36.94],[12.7,37.2],[12.0,37.8]]],
    outline:[[6.6,46.3],[8.3,47.1],[11.1,47.0],[13.4,46.7],[13.8,45.6],[13.2,44.8],[12.4,44.0],[13.0,43.5],[13.9,42.4],[15.6,41.8],[16.7,41.0],[17.9,40.7],[18.5,40.3],[18.4,39.8],[17.4,39.0],[16.2,38.0],[15.8,37.2],[15.4,38.1],[16.5,39.0],[15.9,39.8],[15.3,40.0],[14.3,39.2],[15.3,39.8],[15.6,40.5],[14.0,41.1],[13.0,41.6],[12.2,42.3],[11.5,43.0],[10.1,43.9],[9.0,44.0],[7.5,43.5],[6.8,44.2]],
    cities:[
      ["Turin",7.69,45.07,"red"],["Milan",9.19,45.46,"red"],["Como",9.09,45.81,"red"],["Bergamo",9.67,45.69,"red"],["Brescia",10.21,45.54,"red"],
      ["Verona",10.99,45.44,"red"],["Trento",11.12,46.07,"red"],["Bolzano",11.35,46.50,"red"],["Venice",12.32,45.44,"red"],["Padua",11.88,45.41,"red"],
      ["Treviso",12.25,45.67,"red"],["Udine",13.24,46.06,"red"],["Trieste",13.77,45.65,"red"],["Parma",10.33,44.80,"red"],["Piacenza",9.69,45.05,"red"],
      ["Modena",10.93,44.65,"red"],["Bologna",11.34,44.49,"red"],["Ravenna",12.20,44.42,"red"],["Ferrara",11.62,44.84,"red"],["Rimini",12.57,44.06,"red"],
      ["Genoa",8.94,44.41,"red"],["La Spezia",9.83,44.11,"red"],["Pisa",10.40,43.72,"blue"],["Livorno",10.31,43.55,"blue"],["Florence",11.25,43.77,"blue"],
      ["Lucca",10.50,43.84,"blue"],["Pistoia",10.92,43.94,"blue"],["Arezzo",11.88,43.46,"blue"],["Siena",11.33,43.32,"blue"],["Perugia",12.39,43.11,"blue"],
      ["Ancona",13.52,43.62,"blue"],["Pesaro",12.91,43.91,"blue"],["Urbino",12.63,43.72,"blue"],["Gubbio",12.58,43.35,"blue"],
      ["Terni",12.65,42.56,"blue"],["Orvieto",12.11,42.72,"blue"],["Rome",12.50,41.90,"blue"],["Viterbo",12.11,42.42,"blue"],["Civitavecchia",11.80,42.09,"blue"],
      ["Cassino",13.83,41.49,"blue"],["Frosinone",13.35,41.64,"blue"],["Pescara",14.22,42.46,"blue"],["L'Aquila",13.40,42.35,"blue"],["Termoli",15.00,42.00,"blue"],
      ["Naples",14.27,40.85,"blue"],["Salerno",14.76,40.68,"blue"],["Benevento",14.78,41.13,"blue"],["Campobasso",14.66,41.56,"blue"],
      ["Foggia",15.54,41.46,"blue"],["Bari",16.87,41.12,"blue"],["Brindisi",17.94,40.64,"blue"],["Taranto",17.23,40.47,"blue"],
      ["Potenza",15.81,40.64,"blue"],["Matera",16.60,40.67,"blue"],["Cosenza",16.25,39.30,"blue"],["Catanzaro",16.59,38.91,"blue"],["Reggio Calabria",15.65,38.11,"blue"],
      ["Palermo",13.36,38.12,"blue"],["Messina",15.55,38.19,"blue"],["Catania",15.09,37.51,"blue"]
    ],
    relief:[["highmountain",10.4,46.3,1.8,.55,-18],["mountain",11.5,43.9,.8,1.5,-25],["mountain",13.1,42.6,.65,1.2,-25],["mountain",15.0,40.8,.8,1.15,-20],["mountain",16.6,39.2,.6,.8,-12],["forest",11.6,44.0,.8,.75,20],["forest",13.1,41.9,.6,.75,10],["hills",9.5,44.1,1.0,.7,-18]],
    rivers:[
      [[9.4,45.0],[10.1,45.03],[11.4,44.98],[12.4,44.98],[13.0,44.95]],
      [[11.9,43.5],[12.15,43.2],[12.7,42.9],[13.45,42.6]]
    ],
    trunks:[["Turin","Milan"],["Milan","Verona"],["Verona","Venice"],["Milan","Genoa"],["Genoa","La Spezia"],["Parma","Bologna"],["Bologna","Rimini"],["Bologna","Florence"],["Rimini","Ancona"],["Ancona","Pescara"],["Florence","Rome"],["Rome","Cassino"],["Cassino","Naples"],["Naples","Salerno"],["Foggia","Bari"],["Taranto","Potenza"]]
  },
  "yugoslav-partisans-1943":{
    id:"yugoslav-partisans-1943",bounds:[14.0,24.2,40.8,46.5],cover:"mountain",density:.9,
    outline:[[14.2,46.2],[17.2,46.3],[20.4,46.0],[24.0,45.9],[24.0,41.3],[21.3,41.1],[18.1,41.1],[16.1,42.0],[14.4,43.6]],
    cities:[
      ["Zagreb",15.98,45.81,"red"],["Sisak",16.37,45.49,"red"],["Karlovac",15.55,45.49,"red"],["Ogulin",15.23,45.27,"blue"],["Gospić",15.37,44.55,"blue"],
      ["Bihać",15.87,44.82,"blue"],["Drvar",16.38,44.38,"blue"],["Bosanski Petrovac",16.37,44.56,"blue"],["Glamoč",16.85,44.04,"blue"],["Livno",17.00,43.83,"blue"],
      ["Kupres",17.29,44.00,"blue"],["Jajce",17.27,44.34,"blue"],["Mrkonjić Grad",17.08,44.42,"blue"],["Banja Luka",17.19,44.78,"red"],["Prijedor",16.71,44.98,"red"],
      ["Sanski Most",16.66,44.76,"red"],["Travnik",17.67,44.23,"red"],["Zenica",17.91,44.20,"red"],["Sarajevo",18.41,43.85,"red"],["Mostar",17.81,43.34,"red"],
      ["Foča",18.78,43.51,"blue"],["Goražde",18.97,43.67,"blue"],["Pljevlja",19.36,43.36,"blue"],["Bijelo Polje",19.75,43.04,"blue"],["Nikšić",18.94,42.77,"blue"],
      ["Podgorica",19.26,42.44,"red"],["Cetinje",18.92,42.39,"blue"],["Prijepolje",19.64,43.39,"blue"],["Užice",19.84,43.86,"blue"],["Valjevo",19.90,44.27,"red"],
      ["Čačak",20.35,43.89,"red"],["Kraljevo",20.69,43.72,"red"],["Kragujevac",20.92,44.01,"red"],["Belgrade",20.46,44.82,"red"],["Novi Sad",19.83,45.26,"red"],
      ["Niš",21.90,43.32,"red"],["Novi Pazar",20.52,43.14,"blue"],["Peja",20.29,42.66,"red"],["Pristina",21.16,42.66,"red"],
      ["Split",16.44,43.51,"red"],["Zadar",15.23,44.12,"red"],["Dubrovnik",18.09,42.65,"red"],["Šibenik",15.90,43.73,"red"],["Trebinje",18.34,42.71,"blue"]
    ],
    relief:[["mountain",16.8,44.25,2.1,1.2,-22],["mountain",18.1,43.25,1.7,1.1,8],["mountain",19.4,43.0,1.3,.85,22],["forest",16.5,44.6,1.4,1.2,-9],["forest",18.6,44.1,1.2,1.2,15],["forest",20.2,43.7,1.0,1.0,9],["highmountain",19.0,42.85,.75,.5,12]],
    rivers:[[[17.2,45.8],[17.0,44.7],[17.3,44.2],[17.1,43.5]],[[19.0,45.2],[19.3,44.6],[19.9,44.3],[20.4,44.8]]],
    trunks:[["Zagreb","Karlovac"],["Karlovac","Bihać"],["Banja Luka","Jajce"],["Jajce","Travnik"],["Travnik","Sarajevo"],["Sarajevo","Foča"],["Mostar","Sarajevo"],["Belgrade","Valjevo"],["Valjevo","Užice"],["Užice","Novi Pazar"],["Podgorica","Nikšić"],["Niš","Kraljevo"]]
  },
  "central-highlands-1968":{
    id:"central-highlands-1968",bounds:[105.0,110.5,11.2,16.8],cover:"forest",density:.95,
    outline:[[105.2,16.6],[107.1,16.6],[108.0,16.2],[109.3,16.2],[109.5,15.2],[109.9,14.0],[109.6,12.8],[109.4,11.5],[107.4,11.3],[105.2,11.4]],
    cities:[
      ["Da Nang",108.20,16.05,"red"],["Hoi An",108.34,15.88,"red"],["Tam Ky",108.48,15.57,"red"],["Quang Ngai",108.80,15.12,"red"],["Chu Lai",108.70,15.40,"red"],
      ["Bong Son",109.02,14.43,"red"],["Quy Nhon",109.22,13.77,"red"],["Tuy Hoa",109.30,13.09,"red"],["Nha Trang",109.19,12.24,"red"],
      ["Kon Tum",108.00,14.35,"red"],["Dak To",107.84,14.65,"blue"],["Tan Canh",107.86,14.70,"red"],["Ben Het",107.60,14.69,"blue"],
      ["Pleiku",108.00,13.98,"red"],["Ia Drang",107.52,13.58,"blue"],["Chu Prong",107.77,13.73,"blue"],["Plei Me",107.75,13.55,"red"],
      ["An Khe",108.65,13.95,"red"],["Mang Yang",108.34,13.96,"red"],["Cheo Reo",108.11,13.45,"red"],
      ["Ban Me Thuot",108.05,12.67,"red"],["Buon Don",107.77,12.91,"blue"],["Buon Ho",108.27,12.92,"red"],["Lak",108.18,12.42,"blue"],
      ["Da Lat",108.44,11.94,"red"],["Di Linh",108.10,11.58,"red"],["Bao Loc",107.81,11.55,"red"],["Duc Trong",108.37,11.73,"red"],
      ["Kham Duc",107.77,15.45,"blue"],["Ngoc Hoi",107.66,14.68,"blue"],["Tay Giang",107.45,15.73,"blue"],["Tra My",108.12,15.22,"blue"],
      ["Sa Thay",107.80,14.43,"blue"],["Chu Se",108.05,13.68,"red"],["Ayun Pa",108.45,13.37,"red"],["Krong Pa",108.72,13.12,"blue"],
      ["Krong Bong",108.43,12.44,"blue"],["Ea Sup",107.88,13.04,"blue"]
    ],
    relief:[["forest",107.2,15.8,1.1,.8,5],["forest",107.3,14.9,1.1,.9,9],["forest",107.4,13.9,1.0,1.0,-10],["forest",107.5,12.7,1.0,1.0,15],["forest",108.0,12.3,1.1,.75,6],["mountain",107.75,15.65,.8,.9,-12],["mountain",107.7,13.75,.65,.95,7],["hills",108.4,13.7,1.0,.75,-10],["marsh",109.0,12.1,.5,.6,4]],
    rivers:[[[107.3,15.9],[107.8,15.3],[108.1,14.3],[108.4,13.2],[108.2,11.6]],[[108.0,15.0],[108.4,15.0],[108.7,15.2],[109.1,15.4]]],
    trunks:[["Da Nang","Tam Ky"],["Tam Ky","Quang Ngai"],["Quang Ngai","Quy Nhon"],["Quy Nhon","Tuy Hoa"],["Kon Tum","Pleiku"],["Pleiku","An Khe"],["An Khe","Quy Nhon"],["Pleiku","Ban Me Thuot"],["Ban Me Thuot","Da Lat"],["Dak To","Kon Tum"],["Da Lat","Nha Trang"]]
  }
};
