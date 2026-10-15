import type {Scenario} from "./types";
import type {ResourceNode} from "./openworld";
type Neighbor={index:number;distance:number};
type Entry={signature:string;neighbors:Neighbor[][]};
const cache=new WeakMap<Scenario,Entry>();
/** Original row order and exact Euclidean distance are retained. */
export function resourceNeighborhoods(scenario:Scenario,nodes:ResourceNode[]){
 const signature=nodes.map(n=>n.id+":"+n.x+":"+n.y).join("|");
 const cached=cache.get(scenario);
 if(cached&&cached.signature===signature)return cached.neighbors;
 const result=nodes.map(cell=>{
  const found:Neighbor[]=[];
  for(let index=0;index<nodes.length;index++){
   const neighbor=nodes[index];
   if(neighbor.id===cell.id)continue;
   const distance=Math.hypot(neighbor.x-cell.x,neighbor.y-cell.y);
   if(distance<850)found.push({index,distance});
  }
  return found;
 });
 cache.set(scenario,{signature,neighbors:result});
 return result;
}
