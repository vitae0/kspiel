"use client";
import {memo} from "react";
import {polylinePath} from "@/sim/game";
import type {Scenario} from "@/sim/types";
export const StaticLand=memo(function StaticLand({scenario}:{scenario:Scenario}){
 return <>
  <path d={scenario.landPath} className="land-base"/>
  {scenario.terrainFeatures.map(f=><path key={f.id} d={f.path} className={"terrain-region "+f.terrain}/>)}
 </>;
});
export const StaticRoutes=memo(function StaticRoutes({scenario}:{scenario:Scenario}){
 return <>
  {scenario.riverRoutes.map((route,i)=><path key={"river"+i} d={polylinePath(route)} className="river"/>)}
  {scenario.roadRoutes.map((route,i)=><path key={"road"+i} d={polylinePath(route)} className="road"/>)}
  {scenario.roadNodes.map(node=><circle key={node.id} cx={node.x} cy={node.y} r="7" className="road-node"/>)}
 </>;
});
