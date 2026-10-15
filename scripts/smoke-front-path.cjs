/* Regression test: curved fronts must survive capture, simplification and strategic movement. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const Module=require("node:module"),ts=require("typescript");
const previous=Module._resolveFilename;
Module._resolveFilename=function(spec,parent,...rest){
  if(spec.startsWith("@/")){
    const file=path.resolve(__dirname,"../src",spec.slice(2));
    spec=[file,file+".ts",file+".tsx"].find(x=>fs.existsSync(x))??file;
  }
  return previous.call(this,spec,parent,...rest);
};
for(const ext of [".ts",".tsx"])require.extensions[ext]=function(mod,file){
  const source=fs.readFileSync(file,"utf8"),output=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true
  }});
  mod._compile(output.outputText,file);
};
const {frontPathPoints,frontPathLength,frontPathFrame,nearestFrontFraction,simplifyFrontPath}=require("../src/sim/front-path.ts");
const {frontAssignments,advanceDirective}=require("../src/sim/warfare.ts");
const {generateScenario,terrainAt}=require("../src/sim/game.ts");
const bend=[{x:0,y:0},{x:400,y:0},{x:400,y:400}];
assert.equal(frontPathLength(bend),800);
const f=frontPathFrame(bend,.75);
assert.deepEqual([f.x,f.y,f.tx,f.ty,f.nx,f.ny],[400,200,0,1,-1,0]);
assert(Math.abs(nearestFrontFraction(bend,{x:440,y:300})-.875)<1e-9);
assert.deepEqual(frontPathPoints({start:bend[0],end:bend[2]}),[bend[0],bend[2]],"legacy endpoints are still supported");
const jagged=[{x:0,y:0},...Array.from({length:200},(_,i)=>({x:2*i,y:Math.sin(i)*.25})),
  {x:400,y:200},...Array.from({length:200},(_,i)=>({x:400+Math.sin(i)*.25,y:201+i*2})),{x:400,y:600}];
const reduced=simplifyFrontPath(jagged,3);
assert(reduced.length<=5&&reduced.length>=3,"pointer noise removed, significant bend retained");
const huge=Array.from({length:3000},(_,i)=>({x:i*3,y:Math.sin(i*.27)*120}));
assert(simplifyFrontPath(huge,1).length<=256,"network payload bounded");
const scenario=generateScenario(1024,"frontier");
const good=(x,y)=>terrainAt(scenario,x,y).terrain!=="water";
let origin;
for(let y=650;y<scenario.worldHeight-850&&!origin;y+=340)for(let x=650;x<scenario.worldWidth-900;x+=340){
  if([[0,0],[240,0],[240,160],[0,85],[240,85],[155,160]].every(([dx,dy])=>good(x+dx,y+dy))){
    origin={x,y};break;
  }
}
assert(origin,"a safe land corridor exists for the regression");
const p=[{x:origin.x,y:origin.y},{x:origin.x+240,y:origin.y},{x:origin.x+240,y:origin.y+160}];
const template=scenario.formations.find(u=>u.side==="blue");
assert(template);
const units=Array.from({length:8},(_,i)=>({...template,id:"front-test-"+i,
  kind:"infantry",side:"blue",groupId:"front-test",strength:100,
  organization:100,x:origin.x+20+i*24,y:origin.y+20}));
const directive={id:"test",side:"blue",groupId:"front-test",start:p[0],end:p[2],points:p,
  facing:1,mode:"hold",createdAt:0,lastIssued:0,reserveFraction:.12};
const assignments=frontAssignments(directive,units,[],scenario);
assert.equal(assignments.length,8);
assert(assignments.filter(a=>a.role==="line").some(a=>a.x>origin.x+210&&a.y>origin.y+15),
  "combat units occupy the vertical bend, not the chord");
const legacy={...directive,points:undefined};
assert.equal(frontAssignments(legacy,units,[],scenario).length,8,"old front orders remain playable");
const moved=advanceDirective({...directive,mode:"advance"},4,units,[],scenario);
assert.notEqual(moved,directive,"advance can move a curved line");
assert.equal(moved.points.length,3);
const newMid=moved.points[1],newStart=moved.points[0],newEnd=moved.points[2];
assert(Math.hypot(newMid.x-(newStart.x+newEnd.x)/2,newMid.y-(newStart.y+newEnd.y)/2)>40,
  "advance must preserve curvature");
console.log("PASS freehand front geometry, legacy compatibility, placement and movement");
