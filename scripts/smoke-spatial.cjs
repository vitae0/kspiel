const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
require.extensions[".ts"]=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f)};
const {generateScenario,nearRoad}=require("../src/sim/game.ts");
const {SpatialGrid}=require("../src/sim/spatial-grid.ts");
function full(s,x,y){
 for(const route of s.roadRoutes)for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0;
  if(Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy))<30)return true;
 }return false;
}
let count=0;
for(const preset of ["frontier","spain-1937","balkans-1944","vietnam-1968"]){
 const s=generateScenario(500,preset);let seed=123456789;
 const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 for(let i=0;i<400;i++){
  const x=rnd()*s.worldWidth,y=rnd()*s.worldHeight;
  assert.equal(nearRoad(s,x,y),full(s,x,y),preset+" "+x+" "+y);count++;
 }
 for(const road of s.roadRoutes.slice(0,10)){
  for(const off of [0,5,29.999,30,40]){
   assert.equal(nearRoad(s,road[0].x+off,road[0].y),full(s,road[0].x+off,road[0].y));count++;
  }
 }
}
const pts=[{x:0,y:0,id:0},{x:20,y:0,id:1},{x:-130,y:0,id:2},{x:500,y:600,id:3}],grid=new SpatialGrid(pts);
for(const [x,y,r] of [[0,0,20],[150,0,120],[-120,0,25],[500,600,80]]){
 assert.deepEqual(grid.within(x,y,r).map(v=>v.id).sort(),pts.filter(v=>Math.hypot(v.x-x,v.y-y)<=r).map(v=>v.id).sort());
}
console.log("PASS indexed roads and grid, "+count+" parity points");
