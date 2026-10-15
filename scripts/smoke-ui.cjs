/* Server-side component smoke tests: structural UI regressions, not browser FPS tests. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith("@/")){
  const root=path.resolve(__dirname,"../src",request.slice(2));
  request=[root,root+".tsx",root+".ts",path.join(root,"index.tsx"),path.join(root,"index.ts")].find(p=>fs.existsSync(p))??root;
 }
 return resolve.call(this,request,parent,...rest);
};
for(const ext of [".ts",".tsx"]){
 require.extensions[ext]=function(module,filename){
  const content=fs.readFileSync(filename,"utf8");
  const output=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
  module._compile(output.outputText,filename);
 };
}
const {generateScenario}=require("../src/sim/game.ts");
const {GameMinimap}=require("../src/app/components/game-minimap.tsx");
const {MapUnitLayer}=require("../src/app/components/map-unit-layer.tsx");
const {GameStatusbar}=require("../src/app/components/game-statusbar.tsx");
const {GameSetup}=require("../src/app/components/game-setup.tsx");
const scenario=generateScenario(1024,"frontier");
const units=scenario.formations.slice(0,3);
const print=element=>renderToStaticMarkup(React.createElement(element.type,element.props));
const el=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const map=el(GameMinimap,{openWorld:null,mapW:16800,mapH:11200,territoryPaths:{blue:"",red:"",green:""},cities:scenario.cities,units});
assert.match(map,/class="minimap"/);
assert.match(map,/viewBox="0 0 16800 11200"/);
const small=el(GameMinimap,{openWorld:null,mapW:8400,mapH:5600,territoryPaths:{blue:"",red:"",green:""},cities:scenario.cities,units});
assert(!small.includes('class="minimap"'));
const side=units[0].side;
const counter=el(MapUnitLayer,{renderedUnits:units,localSides:new Set([side]),detectedEnemies:new Set(),selected:[units[0].id],massTargets:[],selectUnit:()=>{},issueUnitTarget:()=>{}});
assert.match(counter,/unit-counter/);
assert.match(counter,/selected/);
const hidden=el(MapUnitLayer,{renderedUnits:[{...units[0],side:"green"}],localSides:new Set(["blue"]),detectedEnemies:new Set(),selected:[],massTargets:[],selectUnit:()=>{},issueUnitTarget:()=>{}});
assert(!hidden.includes("unit-counter"),"fog should keep unseen enemy counters hidden");
const footer=el(GameStatusbar,{multiplayer:null,selectedUnits:units});
assert.match(footer,/3 FORMATIONS SELECTED/);
const setter=()=>{};
const shared={
 setupStage:"mode",setSetupStage:setter,setupCategory:"all",setSetupCategory:setter,
 selectedPresetId:"frontier",setSelectedPresetId:setter,selectedGameMode:"scenario",setSelectedGameMode:setter,
 playerSide:"blue",setPlayerSide:setter,multiplayer:null,networkPhase:"idle",networkError:"",
 pendingInviteCode:"",setPendingInviteCode:setter,inviteLink:"",nickname:"Commander",setNickname:setter,
 multiplayerTeamSize:1,setMultiplayerTeamSize:setter,onlinePlayers:[],
 beginQuickPlay:async()=>{},beginPrivateMatch:async()=>{},joinPendingInvite:async()=>{},
 cancelMultiplayer:setter,startGame:setter,setNetworkError:setter
};
const modes=el(GameSetup,shared);
assert.match(modes,/SCENARIO WAR/);
assert.match(modes,/OPEN WORLD DOMINION/);
const maps=el(GameSetup,{...shared,setupStage:"maps"});
assert.match(maps,/GAME MODES/);
assert.match(maps,/MAP SELECTION/);
assert.match(maps,/DEPLOY TO THEATER/);
console.log("PASS modular UI SSR: mode selection, maps, minimap, fog-gated unit counters, footer");
