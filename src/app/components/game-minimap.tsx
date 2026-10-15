"use client";
import {memo} from "react";
import type {CityState,Formation,Side} from "@/sim/types";
import type {OpenWorldState} from "@/sim/openworld";
import {WORLD_W} from "@/sim/game";
type Props={openWorld:OpenWorldState|null;mapW:number;mapH:number;territoryPaths:Record<Side,string>;cities:CityState[];units:Formation[]};
export const GameMinimap=memo(function GameMinimap({openWorld,mapW,mapH,territoryPaths,cities,units}:Props){
 return <>{(openWorld||mapW>WORLD_W)&&<div className="minimap"><svg viewBox={"0 0 "+mapW+" "+mapH}>{openWorld&&(["blue","red","green"] as Side[]).map(side=><path key={"mt-"+side} d={territoryPaths[side]} fillRule="evenodd" className={"territory-mini "+side}/>) }{cities.map(city=><circle key={"mc-"+city.name} cx={city.x} cy={city.y} r="52" className={city.owner}/>) }{units.map(u=><circle key={u.id} cx={u.x} cy={u.y} r="32" className={u.side}/>)}</svg></div>}</>;
});
