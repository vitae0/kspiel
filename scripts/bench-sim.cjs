/* Pure simulation microbenchmark. This is not browser FPS and is never a pass/fail budget. */
const path=require("node:path"),fs=require("node:fs"),ts=require("typescript"),Module=require("node:module");
const original=Module._resolveFilename;
Module._resolveFilename=function(id,parent,...args){
 if(id.startsWith("@/"))id=path.resolve(__dirname,"../src",id.slice(2));
 return original.call(this,id,parent,...args);
};
require.extensions[".ts"]=function(module,filename){
 const out=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 module._compile(out.outputText,filename);
};
const {performance}=require("node:perf_hooks");
const {generateScenario}=require("../src/sim/game.ts");
const {simulate}=require("../src/sim/simulation.ts");
const {computeSupplyNetwork,computeLogisticsLinks}=require("../src/sim/logistics.ts");
const sizes=process.env.KSPIEL_BENCH_UNITS?[Number(process.env.KSPIEL_BENCH_UNITS)]:[100,300,500];
for(const count of sizes){
 if(!Number.isInteger(count)||count<1||count>3000)throw Error("Invalid unit count");
 const scenario=generateScenario(12345,count<300?"frontier":"spain-1937");
 const bases=scenario.formations;
 const units=Array.from({length:count},(_,i)=>{
  const b=bases[i%bases.length],row=Math.floor(i/bases.length);
  return {...b,id:"bench-"+i,x:Math.max(1,Math.min(scenario.worldWidth-2,b.x+(row%20)*130)),
   y:Math.max(1,Math.min(scenario.worldHeight-2,b.y+(Math.floor(row/20)%20)*140)),order:{type:"defend"}};
 });
 const trials=[];
 for(let i=0;i<4;i++){
  const begin=performance.now();
  const net=computeSupplyNetwork(scenario,units,scenario.cities);
  const link=computeLogisticsLinks(scenario,units,scenario.cities,net);
  const networkMs=performance.now()-begin;
  const t=performance.now();
  const updated=simulate(scenario,units,.07,scenario.cities);
  trials.push({networkMs,simulateMs:performance.now()-t,updated:updated.length,links:link.links.length});
 }
 const median=k=>trials.map(v=>v[k]).sort((a,b)=>a-b)[Math.floor(trials.length/2)];
 console.log(JSON.stringify({preset:scenario.presetId,units:count,networkMedianMs:+median("networkMs").toFixed(2),
  simulateMedianMs:+median("simulateMs").toFixed(2),heapMiB:+(process.memoryUsage().heapUsed/1048576).toFixed(1)}));
}
