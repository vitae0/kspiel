"use client";
import {memo} from "react";
import type {CityState,Formation,Scenario,TerrainSample} from "@/sim/types";
import {TERRAIN_RULES} from "@/sim/game";
type Props={blue:Formation[];enemy:Formation[];detectedEnemies:Set<string>;blueCities:number;cities:CityState[];hovered:TerrainSample|null;activeScenario:Scenario;zoom:number};
export const GameMapHud=memo(function GameMapHud({blue,enemy,detectedEnemies,blueCities,cities,hovered,activeScenario,zoom}:Props){
 return <div className="map-hud"><div><span className="dot friendly"/>FRIENDLY {blue.length}</div><div><span className="dot hostile"/>CONTACTS {enemy.filter(u=>detectedEnemies.has(u.id)).length}</div><div>CITIES {blueCities}/{cities.length}</div><div>{hovered?TERRAIN_RULES[hovered.terrain].label.toUpperCase()+" · "+(hovered.road?"SUPPLY ROAD":"OFF ROAD"):activeScenario.location.toUpperCase()}</div><div>ZOOM {Math.round(zoom*100)}%</div></div>;
});
