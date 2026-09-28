export type ForceFamily="regular"|"asymmetric"|"paramilitary"|"contractor";
export type PoliticalVector={stateControl:number;centralization:number;militaryInfluence:number;nationalism:number;socialConservatism:number;personalism:number};

export type TerrainKind="water"|"plains"|"forest"|"hills"|"mountain"|"highmountain"|"marsh"|"urban"|"desert";
export type ScenarioTheme="mixed"|"mountain"|"forest"|"desert"|"winter"|"steppe"|"urban";
export type Era="medieval"|"early_modern"|"napoleonic"|"industrial"|"modern";
export type FlagStyle="generic-blue"|"generic-red"|"ussr"|"germany-ww2"|"ottoman"|"crusader"|"sweden"|"imperial"|"france"|"austria"|"russia"|"german-empire"|"britain"|"axis"|"usa";
export type UnitKind="infantry"|"mechanized"|"armor"|"tank"|"cavalry"|"mountaineer"|"artillery"|"heavy_artillery"|"recon"|"engineer"|"logistics";
export type Side="blue"|"red"|"green";
export type OrderType="move"|"defend"|"assault"|"probe"|"fire"|"resupply"|"dig"|"relieve"|"retreat";
export type OverlayMode="terrain"|"supply"|"intel";
export type FormationShape="line"|"column"|"wedge"|"echelon";
export type MatchMode="singleplayer"|"coop"|"pvp"|"pvpve";
export type ControllerKind="human"|"bot"|"open";

export type PlayerSlot={id:string;name:string;side:Side;controller:ControllerKind;local?:boolean};
export type MatchConfig={id:string;mode:MatchMode;players:PlayerSlot[];authoritativeTickRate:number;commandDelayTicks:number};
export type ArmyGroup={id:string;name:string;side:Side;hotkey:number};
export type AttackPlan={id:string;name:string;side:Side;formationIds:string[];targetX:number;targetY:number;status:"draft"|"executing"|"complete"};

export type ScenarioPreset={
  id:string;
  title:string;
  subtitle:string;
  theme:ScenarioTheme;
  era:Era;
  historical:boolean;
  year?:number;
  location:string;
  sideNames:{blue:string;red:string;green?:string};
  sideFlags:{blue:FlagStyle;red:FlagStyle;green?:FlagStyle};
  cityNames:string[];
};

export type CityState={name:string;x:number;y:number;owner:Side;capture:number};

export type TerrainFeature={
  id:string;
  terrain:Exclude<TerrainKind,"water"|"plains"|"urban"|"desert">;
  cx:number;cy:number;rx:number;ry:number;rotation:number;seed:number;path:string;
};

export type Scenario={
  seed:number;
  presetId:string;
  title:string;
  theme:ScenarioTheme;
  era:Era;
  historical:boolean;
  year?:number;
  location:string;
  sideNames:{blue:string;red:string;green?:string};
  sideFlags:{blue:FlagStyle;red:FlagStyle;green?:FlagStyle};
  landPath:string;
  terrainFeatures:TerrainFeature[];
  roadRoutes:Array<Array<{x:number;y:number}>>;
  riverRoutes:Array<Array<{x:number;y:number}>>;
  cities:CityState[];
  formations:Formation[];
  coast:{base:number;amp1:number;amp2:number;amp3:number;f1:number;f2:number;f3:number;p1:number;p2:number};
};

export type TerrainSample={x:number;y:number;terrain:TerrainKind;elevation:number;road:boolean;objective?:string};

export type Formation={
  id:string;name:string;side:Side;kind:UnitKind;x:number;y:number;
  manpower:number;strength:number;organization:number;supply:number;fuel:number;
  entrenchment:number;experience:number;readiness:number;hardness:number;
  softAttack:number;hardAttack:number;defense:number;breakthrough:number;
  speed:number;recon:number;movementProgress:number;
  groupId?:string;formationShape?:FormationShape;
  order?:{type:OrderType;targetX?:number;targetY?:number;targetUnitId?:string};
};

export type GameCommand=
  |{kind:"issue-order";playerId:string;side:Side;formationIds:string[];order:NonNullable<Formation["order"]>}
  |{kind:"assign-group";playerId:string;side:Side;formationIds:string[];groupId:string}
  |{kind:"set-formation";playerId:string;side:Side;formationIds:string[];shape:FormationShape}
  |{kind:"create-plan";playerId:string;side:Side;plan:AttackPlan}
  |{kind:"execute-plan";playerId:string;side:Side;planId:string};

export type SessionSnapshot={tick:number;scenarioSeed:number;formations:Formation[];cities:CityState[];plans:AttackPlan[]};


export type EmplacementKind="observatory"|"fixed_artillery";
export type Emplacement={
  id:string;
  kind:EmplacementKind;
  side:Side;
  x:number;
  y:number;
  strength:number;
  range:number;
};
export type ConstructionProject={
  id:string;
  kind:EmplacementKind;
  side:Side;
  x:number;
  y:number;
  builderIds:string[];
  progress:number;
  requiredHours:number;
};
