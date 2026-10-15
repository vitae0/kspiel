import type {Formation,FormationShape} from "./types";

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const AMMO_TYPES=new Set<Formation["kind"]>(["mortar","artillery","heavy_artillery"]);
export const AMMO_BURN:Partial<Record<Formation["kind"],number>>={mortar:8,artillery:6,heavy_artillery:4.8};
export const SHELL_INTERVAL:Partial<Record<Formation["kind"],number>>={mortar:.34,artillery:.55,heavy_artillery:.82};
export type GunEvent={
  id:string;kind:"rifle"|"mortar"|"artillery"|"heavy_artillery";side:Formation["side"];
  fromX:number;fromY:number;x:number;y:number;birth:number;
};
/** Refill is slow away from the network and rapid only with a real supply connection.
 * Ordinary supply % alone never permits an isolated pocket to replenish ammunition.
 */
export function resupplyRate(level:number,supply:number,flow:number,kind:"ammo"|"materials"){
  if(level<=0)return kind==="ammo"?.04:.035;
  const flowFactor=clamp(flow/2.5,.4,2.5);
  return (kind==="ammo"?.8:1.15)*flowFactor*(.36+.64*clamp(supply,0,100)/100)*(level>=2?1.4:1);
}
export function replenish(current:number|undefined,level:number,supply:number,flow:number,hours:number,kind:"ammo"|"materials"){
  const start=clamp(current??100,0,100);
  if(hours<=0)return start;
  return clamp(start+hours*resupplyRate(level,supply,flow,kind),0,100);
}
export function fireBudget(current:number|undefined,gun:Formation["kind"],hours:number){
  const stock=clamp(current??100,0,100);
  const demand=(AMMO_BURN[gun]??0)*Math.max(0,hours);
  if(demand<=0||stock<=0)return{ratio:0,remaining:stock,spent:0};
  const spent=Math.min(stock,demand);
  return{ratio:spent/demand,remaining:stock-spent,spent};
}
/** Per-tick target cohesion pace: never faster than the slowest mobile member.
 * Disconnected order tokens and separate army groups can coexist.
 */
export function marchPaces(units:Formation[],effectiveSpeed:(u:Formation)=>number){
  const minimum=new Map<string,number>();
  for(const u of units){
    const id=u.order?.marchId;
    if(!id||u.order?.type!=="move"||AMMO_TYPES.has(u.kind)||u.kind==="logistics")continue;
    const pace=Math.max(.02,effectiveSpeed(u));
    minimum.set(id,Math.min(minimum.get(id)??Infinity,pace));
  }
  return minimum;
}
export function marchSlots(units:Formation[],goal:{x:number;y:number},shape:FormationShape){
  const combat=[...units].filter(u=>!AMMO_TYPES.has(u.kind)&&u.kind!=="logistics").sort((a,b)=>a.id.localeCompare(b.id));
  const support=[...units].filter(u=>AMMO_TYPES.has(u.kind)||u.kind==="logistics").sort((a,b)=>a.id.localeCompare(b.id));
  if(combat.length<2)return new Map<string,{x:number;y:number}>();
  const mean={x:combat.reduce((a,u)=>a+u.x,0)/combat.length,y:combat.reduce((a,u)=>a+u.y,0)/combat.length};
  const bearing=Math.atan2(goal.y-mean.y,goal.x-mean.x);
  const forward={x:Math.cos(bearing),y:Math.sin(bearing)};
  const across={x:-forward.y,y:forward.x};
  // Assign formation slots along the old lateral position to avoid crossing streams.
  combat.sort((a,b)=>((a.x-mean.x)*across.x+(a.y-mean.y)*across.y)-((b.x-mean.x)*across.x+(b.y-mean.y)*across.y)||a.id.localeCompare(b.id));
  const columns=shape==="column"?Math.min(3,combat.length):shape==="wedge"?Math.min(9,Math.ceil(Math.sqrt(combat.length)*2)):Math.min(12,combat.length);
  const rows=Math.ceil(combat.length/columns);
  const slots=new Map<string,{x:number;y:number}>();
  combat.forEach((u,index)=>{
    const row=Math.floor(index/columns),col=index%columns;
    const width=Math.min(columns,combat.length-row*columns);
    let lateral=(col-(width-1)/2)*(shape==="column"?72:82);
    let depth=-(row-(rows-1)/2)*78;
    if(shape==="echelon")depth-=lateral*.48;
    if(shape==="wedge")depth-=Math.abs(lateral)*.62;
    slots.set(u.id,{x:goal.x+across.x*lateral+forward.x*depth,y:goal.y+across.y*lateral+forward.y*depth});
  });
  support.forEach((u,i)=>{
    const lateral=(i-(support.length-1)/2)*105;
    const depth=-(rows*80+180+(u.kind==="logistics"?180:0));
    slots.set(u.id,{x:goal.x+across.x*lateral+forward.x*depth,y:goal.y+across.y*lateral+forward.y*depth});
  });
  return slots;
}

/** Turns remaining physical material into actual construction progress.
 * Work that would overshoot the completed building is never charged.
 */
export function constructionWork(materials:number|undefined,hours:number,skill:number,budget:number){
  const stock=clamp(materials??100,0,100);
  const work=Math.max(0,Math.min(hours*skill,budget,stock/1.65));
  return{work,remaining:clamp(stock-work*1.65,0,100)};
}
