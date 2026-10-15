/* FFA runtime smoke test: real generated five-faction theaters, symmetric supply, colors and rosters. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
require.extensions[".ts"]=function(module,filename){
  const source=fs.readFileSync(filename,"utf8");
  const result=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,isolatedModules:true
  }});
  module._compile(result.outputText,filename);
};
const {generateScenario,terrainAt,isLand,SCENARIO_PRESETS}=require("../src/sim/game.ts");
const {scenarioTerritoryCells}=require("../src/sim/territory.ts");
const {startHistory,appendSample}=require("../src/sim/telemetry.ts");
const cases=[["ffa-triad",3],["ffa-quadrant",4],["ffa-pentagon",5]];
const ALL=["blue","red","green","yellow","purple"];
for(const [id,count] of cases)for(const seed of [1357,2468]){
  const p=SCENARIO_PRESETS.find(p=>p.id===id);
  assert(p,"Missing FFA menu preset "+id);
  const game=generateScenario(seed,id);
  assert.equal(game.presetId,id);
  const factions=ALL.slice(0,count);
  const owners=[...new Set(game.cities.map(c=>c.owner))];
  assert.deepEqual(owners,factions,id+" faction spawn mismatch");
  assert.equal(game.cities.length,count*4,id+" city count");
  assert.equal(game.formations.length>0,true,id+" missing armies");
  const cityCounts=factions.map(side=>game.cities.filter(c=>c.owner===side).length);
  const unitCounts=factions.map(side=>game.formations.filter(u=>u.side===side).length);
  assert(cityCounts.every(n=>n===4),id+" unbalanced supply cities");
  assert(unitCounts.every(n=>n===unitCounts[0]),id+" unbalanced military roster "+unitCounts);
  for(const unit of game.formations){
    assert(isLand(game,unit.x,unit.y),id+": unit offshore");
    const origin=terrainAt(game,unit.x,unit.y).objective;
    assert(game.cities.some(c=>c.name===origin&&c.owner===unit.side),id+": unit outside friendly supply city "+unit.id);
  }
  for(const city of game.cities){
    assert.equal(terrainAt(game,city.x,city.y).objective,city.name,id+": city invalid "+city.name);
  }
  const cells=scenarioTerritoryCells(game,game.cities,game.formations,420);
  assert(cells.some(c=>c.owner==="purple")===factions.includes("purple"),id+" purple territory error");
  assert(cells.some(c=>c.owner==="yellow")===factions.includes("yellow"),id+" yellow territory error");
  const report=startHistory(game.title,seed,game.formations,game.cities);
  appendSample(report,4,game.formations,game.cities,null,true);
  for(const side of factions)assert(report.samples[0].values[side].units>0,id+" missing telemetry "+side);
  console.log("PASS",id,seed,"factions",count,"units per faction",unitCounts[0],"cells",cells.length);
}
