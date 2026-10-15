/* Runtime smoke test for massive and irregular theaters.
 * Transpile local TypeScript modules via the installed TypeScript compiler.
 * Assertions exercise the generator itself, not merely static compilation. */
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
const ids=[
  "eastern-front-1943","balkans-1944","italy-1944",
  "yugoslav-partisans-1943","central-highlands-1968","spain-1937"
];
for(const id of ids){
  for(const seed of [1193,1937]){
    const preset=SCENARIO_PRESETS.find(p=>p.id===id);
    assert(preset,id+": missing preset");
    const scenario=generateScenario(seed,id);
    assert(scenario.worldWidth>=8400&&scenario.worldHeight>=5600,id+": world size");
    assert(scenario.cities.length>=32,id+": city count "+scenario.cities.length);
    assert(scenario.roadRoutes.length>=scenario.cities.length,id+": disconnected roads "+scenario.roadRoutes.length);
    assert(scenario.terrainFeatures.length>=16,id+": sparse terrain");
    assert(scenario.formations.length>=100,id+": missing initial forces");
    assert(scenario.formations.some(u=>u.side==="blue")&&scenario.formations.some(u=>u.side==="red"),id+": missing team");
    const cityNames=new Set(scenario.cities.map(c=>c.name));
    assert.equal(cityNames.size,scenario.cities.length,id+": duplicate city name");
    for(const city of scenario.cities){
      assert(isLand(scenario,city.x,city.y),id+": city at sea "+city.name);
      assert.equal(terrainAt(scenario,city.x,city.y).objective,city.name,id+": unreachable city "+city.name);
      assert(city.owner==="blue"||city.owner==="red",id+": unowned city");
    }
    for(const unit of scenario.formations){
      assert(isLand(scenario,unit.x,unit.y),id+": unit at sea "+unit.name);
      const origin=terrainAt(scenario,unit.x,unit.y).objective;
      assert(origin&&scenario.cities.some(c=>c.name===origin&&c.owner===unit.side),id+": spawn without owned supply "+unit.name);
      assert(unit.softAttack>0&&unit.speed>0&&unit.manpower>0,id+": uninitialized unit "+unit.name);
      assert(Number.isFinite(unit.x+unit.y+unit.softAttack),id+": nonfinite unit");
    }
    if(preset.warfare==="guerrilla"){
      for(const kind of ["militia","partisan","raider"])
        assert(scenario.formations.some(u=>u.side==="blue"&&u.kind===kind),id+": missing blue "+kind);
      assert(scenario.formations.filter(u=>u.side==="blue"&&["partisan","militia","raider"].includes(u.kind)).length>=35,
        id+": not an asymmetric irregular roster");
    }
    if(id==="italy-1944"){
      assert(scenario.landPolygons&&scenario.landPolygons.length===2,"Italy: Sicilia must be a distinct island");
      const sicily=scenario.cities.find(c=>c.name==="Palermo");
      assert(sicily&&isLand(scenario,sicily.x,sicily.y),"Italy: Palermo not on land");
    }
    console.log("PASS",id,seed,"size",scenario.worldWidth+"x"+scenario.worldHeight,
      "cities",scenario.cities.length,"roads",scenario.roadRoutes.length,"units",scenario.formations.length);
  }
}
