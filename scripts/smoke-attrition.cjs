/* Deterministic strategic mechanics smoke tests: no DOM or graphics dependency. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
require.extensions[".ts"]=function(module,filename){
  const out=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
  }});
  module._compile(out.outputText,filename);
};
const {AMMO_BURN,SHELL_INTERVAL,resupplyRate,replenish,fireBudget,constructionWork,marchSlots,marchPaces}=require("../src/sim/attrition.ts");
const {generateScenario}=require("../src/sim/game.ts");
function eq(a,b,description){assert(Math.abs(a-b)<1e-7,description+": "+a+" ≠ "+b)}
assert.equal(Object.keys(AMMO_BURN).length,3);
assert(Object.keys(SHELL_INTERVAL).every(key=>SHELL_INTERVAL[key]>0));
for(const kind of ["mortar","artillery","heavy_artillery"]){
  const full=fireBudget(100,kind,1);
  assert(full.spent>0&&full.ratio===1&&full.remaining<100,kind+" must consume ammo");
  const partial=fireBudget(2,kind,1);
  assert(partial.ratio<1&&partial.ratio>0&&partial.remaining===0,kind+" must fire a partial volley");
  const empty=fireBudget(0,kind,1);
  eq(empty.ratio,0,kind+" must not fire from empty magazine");
  let magazine=100,rounds=0;
  while(magazine>.0001&&rounds<100){
    const result=fireBudget(magazine,kind,1);
    assert(result.remaining<=magazine&&result.remaining>=0);
    magazine=result.remaining;rounds++;
  }
  assert(rounds<40,kind+" must have finite ammunition");
  console.log("PASS finite ammunition",kind,"hours-to-empty",rounds);
}
assert(resupplyRate(2,88,4,"ammo")>resupplyRate(1,35,.5,"ammo"));
assert(resupplyRate(1,35,.5,"ammo")>resupplyRate(0,0,0,"ammo"));
assert(resupplyRate(2,90,4,"materials")>resupplyRate(0,0,0,"materials"));
eq(replenish(96,2,100,4,5,"ammo"),100,"ammo cap");
eq(replenish(100,2,100,4,5,"materials"),100,"materials cap");
assert(replenish(0,2,95,3,6,"ammo")>replenish(0,0,0,0,6,"ammo")*5);
assert(replenish(0,2,95,3,6,"materials")>replenish(0,0,0,0,6,"materials")*5);
console.log("PASS supply-dependent restock");
{
  const job=constructionWork(15,10,4,100);
  eq(job.work,15/1.65,"material bound");
  eq(job.remaining,0,"materials exhausted");
  eq(constructionWork(0,10,4,100).work,0,"no materials no construction");
  const almostBuilt=constructionWork(100,10,4,2);
  eq(almostBuilt.work,2,"no overbuild");
  eq(almostBuilt.remaining,100-3.3,"no overcharge");
  const regular=constructionWork(100,1,1,100),engineer=constructionWork(100,1,4,100);
  assert(engineer.work>regular.work,"engineer must construct faster");
  console.log("PASS constrained materials and engineer 4x work");
}
{
  const s=generateScenario(715,"balkans-1944");
  const diverse=["infantry","engineer","recon","tank"].map((kind,i)=>{
    const u=s.formations.find(u=>u.kind===kind&&u.side==="blue");
    assert(u,"no example formation "+kind);
    return {...u,groupId:"blue-army-"+(i+1),id:"example-"+i};
  });
  const gun=s.formations.find(u=>u.kind==="artillery"&&u.side==="blue");
  const combined=[...diverse,{...gun,id:"test-art",groupId:"blue-army-5"}];
  for(const shape of ["line","column","wedge","echelon"]){
    const slots=marchSlots(combined,{x:8100,y:4800},shape);
    assert.equal(slots.size,combined.length);
    const xs=[...slots.values()].map(s=>s.x);
    const ys=[...slots.values()].map(s=>s.y);
    assert(xs.every(Number.isFinite)&&ys.every(Number.isFinite),shape+" invalid slots");
    assert(new Set([...slots.values()].map(s=>s.x.toFixed(1)+"/"+s.y.toFixed(1))).size===combined.length,shape+" overlaps");
    assert(slots.get("test-art"),"guns must be in trailing slots");
    assert(combined.every((u,i)=>u.groupId==="blue-army-"+(i+1)),"formation changes must not rewrite army groups");
  }
  const marching=diverse.map((u,i)=>({...u,speed:4+i,order:{type:"move",marchId:"simultaneous"}}));
  const paces=marchPaces([...marching,{...gun,order:{type:"move",marchId:"simultaneous"},speed:.5}],u=>u.speed);
  eq(paces.get("simultaneous"),4,"slowest active combatant sets pace, not gun");
  console.log("PASS independent formations / pace synchronization");
}
console.log("ALL ATTRITION / MARCH SMOKE TESTS PASSED");
require("./smoke-navigation-orders.cjs");
