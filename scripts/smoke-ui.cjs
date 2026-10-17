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
const {LeftSidebar}=require("../src/app/components/left-sidebar.tsx");
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

// Selecting one unit focuses its army group without selecting the other units.
const blueRoster=scenario.formations.filter(unit=>unit.side==="blue").slice(0,2);
assert.equal(blueRoster.length,2);
const a={...blueRoster[0],name:"Focused unit sentinel",groupId:"blue-army-1",order:{type:"move",manual:true}};
const b={...blueRoster[1],name:"Other group sentinel",groupId:"blue-army-2",order:{type:"defend"}};
const armyGroups=[{id:"blue-army-1",name:"1st Army",side:"blue",hotkey:1},
  {id:"blue-army-2",name:"2nd Army",side:"blue",hotkey:2}];
const sidebarProps={
 mobilePanel:"none",setMobilePanel:setter,armyGroups,blue:[a,b],selected:[a.id],selectGroup:setter,
 unitSymbols:false,setUnitSymbols:setter,pendingMassAttack:false,setPendingMassAttack:setter,
 setMassTargets:setter,setPendingOrder:setter,setPendingPlan:setter,massTargets:[],launchGroupAttack:setter,
 frontDirectives:[],playerSide:"blue",units:[a,b],changeFrontMode:setter,
 attackPlans:[],setSelected:setter,executePlan:setter,cancelPlan:setter,
 openWorld:null,pendingStrategicBuild:null,setPendingStrategicBuild:setter,setStrategicBuildAnchor:setter,
 setPendingBuild:setter,setConstructionAnchor:setter,localSides:new Set(["blue"]),
 constructionProjects:[],isMobile:false,IRREGULAR_TRAITS:{},onRecruit:setter
};
const focused=el(LeftSidebar,sidebarProps);
assert.match(focused,/SELECTED COMMAND/);
assert.match(focused,/1 DIRECT/);
assert.match(focused,/Focused unit sentinel/);
assert(!focused.includes("Other group sentinel"),"other army's units must stay out of focused roster");
assert.match(focused,/aria-pressed="true"/);
const second=el(LeftSidebar,{...sidebarProps,selected:[b.id]});
assert.match(second,/Other group sentinel/);
assert(!second.includes("Focused unit sentinel"),"focused roster must follow selected unit");
const unfocused=el(LeftSidebar,{...sidebarProps,selected:[]});
assert.match(unfocused,/Focused unit sentinel/);
assert.match(unfocused,/Other group sentinel/);
console.log("PASS sidebar army focus and manually commanded formation status");

console.log("PASS modular UI SSR: mode selection, maps, minimap, fog-gated unit counters, footer");
