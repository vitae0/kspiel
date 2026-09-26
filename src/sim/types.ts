export type ForceFamily="regular"|"asymmetric"|"paramilitary"|"contractor";
export type PoliticalVector={stateControl:number;centralization:number;militaryInfluence:number;nationalism:number;socialConservatism:number;personalism:number};

export type TerrainKind="water"|"plains"|"forest"|"hills"|"mountain"|"marsh"|"urban";
export type UnitKind="infantry"|"mechanized"|"armor"|"artillery"|"recon"|"engineer"|"logistics"|"reserve";
export type Side="blue"|"red";
export type OrderType="move"|"defend"|"assault"|"probe"|"fire"|"resupply"|"dig"|"relieve"|"retreat";
export type OverlayMode="terrain"|"supply"|"intel";

export type CityState={
  name:string;
  x:number;
  y:number;
  owner:Side;
  capture:number;
};

export type TerrainFeature={
  id:string;
  terrain:Exclude<TerrainKind,"water"|"plains"|"urban">;
  cx:number;
  cy:number;
  rx:number;
  ry:number;
  rotation:number;
  seed:number;
  path:string;
};


export type Scenario={
  seed:number;
  landPath:string;
  terrainFeatures:TerrainFeature[];
  roadRoutes:Array<Array<{x:number;y:number}>>;
  riverRoutes:Array<Array<{x:number;y:number}>>;
  cities:CityState[];
  formations:Formation[];
  coast:{base:number;amp1:number;amp2:number;amp3:number;f1:number;f2:number;f3:number;p1:number;p2:number};
};

export type TerrainSample={
  x:number;
  y:number;
  terrain:TerrainKind;
  elevation:number;
  road:boolean;
  objective?:string;
};

export type Formation={
  id:string;
  name:string;
  side:Side;
  kind:UnitKind;
  x:number;
  y:number;
  manpower:number;
  strength:number;
  organization:number;
  supply:number;
  fuel:number;
  entrenchment:number;
  experience:number;
  readiness:number;
  hardness:number;
  softAttack:number;
  hardAttack:number;
  defense:number;
  breakthrough:number;
  speed:number;
  recon:number;
  movementProgress:number;
  order?:{
    type:OrderType;
    targetX?:number;
    targetY?:number;
    targetUnitId?:string;
  };
};