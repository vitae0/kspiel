const assert=require("node:assert/strict");
const fs=require("node:fs"),ts=require("typescript"),path=require("node:path"),Module=require("node:module");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
  if(request.startsWith("@/"))request=path.resolve(__dirname,"../src",request.slice(2));
  return resolve.call(this,request,parent,...rest);
};
require.extensions[".ts"]=function(module,filename){
  const source=fs.readFileSync(filename,"utf8");
  const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  module._compile(out.outputText,filename);
};
const {generateScenario}=require("../src/sim/game.ts");
const {routePosition}=require("../src/sim/geometry.ts");
const {roadControlPower,routeInterdictionPoints}=require("../src/sim/logistics.ts");
const {DIRECT_COMBAT_KINDS}=require("../src/sim/rules.ts");
function original(route,side,units){
  const cuts=[];
  for(const hostile of units){
    if(hostile.side===side||!DIRECT_COMBAT_KINDS.has(hostile.kind)||hostile.strength<=18||hostile.organization<=20)continue;
    const pos=routePosition(route,hostile.x,hostile.y);
    if(pos.distance>(hostile.kind==="raider"?125:hostile.kind==="partisan"?98:58))continue;
    let hostilePower=0,friendlyPower=0;
    for(const unit of units){
      if(!DIRECT_COMBAT_KINDS.has(unit.kind)||unit.strength<=8||Math.hypot(unit.x-hostile.x,unit.y-hostile.y)>155)continue;
      if(unit.side===side)friendlyPower+=roadControlPower(unit);
      else hostilePower+=roadControlPower(unit);
    }
    const pressure=hostilePower-Math.max(.15,friendlyPower*1.08);
    if(pressure<=.05)continue;
    const existing=cuts.find(c=>Math.abs(c.along-pos.along)<135);
    if(existing){if(pressure>existing.pressure){existing.x=pos.point.x;existing.y=pos.point.y;existing.along=pos.along;existing.pressure=pressure}}
    else cuts.push({x:pos.point.x,y:pos.point.y,along:pos.along,pressure});
  }
  return cuts.sort((a,b)=>a.along-b.along);
}
const scenario=generateScenario(284,"spain-1937"),units=[...scenario.formations];
let count=0,nonempty=0;
for(const route of scenario.roadRoutes.slice(0,24)){
 const mid=route[Math.floor(route.length/2)];
 const base=scenario.formations[0];
 const local=Array.from({length:16},(_,i)=>({...base,id:"probe-"+count+"-"+i,
  side:i%3===0?"blue":i%3===1?"red":"green",kind:i%4===0?"raider":"infantry",
  x:mid.x+(i%5-2)*25,y:mid.y+(Math.floor(i/5)-1)*22,
  strength:80,organization:75,readiness:80,supply:90}));
 const force=[...units,...local];
 for(const side of ["blue","red","green"]){
  const expected=original(route,side,force),actual=routeInterdictionPoints(route,side,force);
  assert.deepEqual(actual,expected,side+" road "+count);
  if(actual.length)nonempty++;
  count++;
 }
}
assert(nonempty>0,"must exercise interdiction under nonempty cuts");
console.log("PASS supply route interdiction parity "+count+" cases, "+nonempty+" nonempty");
