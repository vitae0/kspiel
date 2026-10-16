/* Regression checks for manual order precedence and terrain-aware hostile approaches. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
  if(request.startsWith("@/"))request=path.join(__dirname,"../src",request.slice(2));
  return originalResolve.call(this,request,parent,...rest);
};
require.extensions[".ts"]=function(module,filename){
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
  }});
  module._compile(compiled.outputText,filename);
};

const {generateScenario}=require("../src/sim/game.ts");
const {movementRoutePlan,traversableLeg}=require("../src/sim/navigation.ts");
const {simulate}=require("../src/sim/simulation.ts");
const {playerOrderPending,canAutoAssignFront}=require("../src/sim/orders.ts");

const original=generateScenario(712,"frontier");
const infantry=original.formations.find(unit=>unit.kind==="infantry"&&unit.side==="blue");
assert(infantry,"test infantry missing");
const scenario={
  ...original,
  worldWidth:1600,worldHeight:900,
  landPolygon:[{x:0,y:0},{x:1600,y:0},{x:1600,y:900},{x:0,y:900}],
  landPolygons:undefined,
  cities:[],roadNodes:[],roadRoutes:[],riverRoutes:[],
  terrainFeatures:[{id:"mountain-block",terrain:"highmountain",cx:800,cy:450,
    rx:140,ry:190,rotation:0,seed:8,path:""}]
};
const from={x:350,y:450},goal={x:1250,y:450};
const troop={...infantry,...from,supply:100,organization:100,order:{type:"defend"}};
assert(!traversableLeg(scenario,troop,from,goal),"the direct route must be obstructed");
const planned=movementRoutePlan(scenario,[],troop,from,goal,[],null,[],true);
assert(planned.length>1,"path planner must produce a detour around impassable terrain");
for(let i=0;i<planned.length;i++){
  const start=i===0?from:planned[i-1];
  assert(traversableLeg(scenario,troop,start,planned[i]),"unsafe leg "+i);
}
console.log("PASS mountain bypass with attack destination retained");

const hostile={...troop,id:"hostile",side:"red",x:goal.x,y:goal.y,strength:95};
const hostileCity={name:"Objective",x:goal.x,y:goal.y,owner:"red",capture:0};
const assault=movementRoutePlan(scenario,[hostileCity],troop,from,goal,[],null,[troop,hostile],true);
assert(assault.length>=2,"attack target must remain reachable even within hostile control");
for(let i=0;i<assault.length;i++)assert(traversableLeg(scenario,troop,i?assault[i-1]:from,assault[i]),"unsafe hostile approach");
console.log("PASS hostile target does not suppress viable approach");

const marching={...troop,x:350,y:140,order:{type:"move",targetX:360,targetY:140,
  waypoints:[{x:375,y:140}],manual:true}};
assert(playerOrderPending(marching)&&!canAutoAssignFront(marching));
let squad=[marching],sawWaypoint=false;
for(let i=0;i<20;i++){
  squad=simulate(scenario,squad,.25,[],[],null);
  if(squad[0].order?.waypoints?.length===0&&squad[0].order?.manual)sawWaypoint=true;
  if(!playerOrderPending(squad[0]))break;
}
assert(sawWaypoint,"intermediate waypoint must retain manual priority");
assert.equal(squad[0].order?.type,"defend","finished orders return to defense");
assert(!playerOrderPending(squad[0])&&canAutoAssignFront(squad[0]),
  "automatic front control resumes only after final destination");
console.log("PASS manual waypoint priority and automatic handoff");
