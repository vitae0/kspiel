"use client";
import {useMemo,useRef} from "react";
import {WORLD_W} from "@/sim/game";
import {scenarioTerritoryCells,type TerritoryCell} from "@/sim/territory";
import {organicTerritoryBoundaryPath} from "@/sim/organic-territory";
import type {CityState,Formation,Scenario,Side} from "@/sim/types";
import type {OpenWorldState} from "@/sim/openworld";
const REFRESH_MS=600;
type Snapshot={scenario:Scenario;owners:string;stamp:number;cells:TerritoryCell[]};
/** Visual only. Does not affect capture, control income, or server game state. */
export function useTerritoryView(scenario:Scenario|null,cities:CityState[],units:Formation[],openWorld:OpenWorldState|null){
 const cached=useRef<Snapshot|null>(null);
 const step=scenario&&scenario.worldWidth>WORLD_W?560:360;
 let theaterTerritory:TerritoryCell[]=[];
 if(scenario&&!openWorld){
  const owners=cities.map(c=>c.name+":"+c.owner).join("|"),now=performance.now(),previous=cached.current;
  if(!previous||previous.scenario!==scenario||previous.owners!==owners||now-previous.stamp>=REFRESH_MS){
   cached.current={scenario,owners,stamp:now,cells:scenarioTerritoryCells(scenario,cities,units,step)};
  }
  theaterTerritory=cached.current!.cells;
 }
 const cells=openWorld?.resourceNodes??theaterTerritory,contourStep=openWorld?560:step;
 const paths=useMemo<Record<Side,string>>(()=>({
  blue:organicTerritoryBoundaryPath(cells,"blue",contourStep),
  red:organicTerritoryBoundaryPath(cells,"red",contourStep),
  green:organicTerritoryBoundaryPath(cells,"green",contourStep)
 }),[cells,contourStep]);
 return{theaterTerritory,territoryPaths:paths};
}
