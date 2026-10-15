"use client";
import type {FlagStyle} from "@/sim/types";
import {pct} from "@/app/ui-utils";
export function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span><small>{label}</small><b>{pct(value)}%</b></span><i><em style={{width:pct(value)+"%"}}/></i></div>}
export function Row({k,v}:{k:string;v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}
export function Flag({styleName}:{styleName:FlagStyle}){return <span className={"flag flag-"+styleName} aria-label={styleName}><i/><em/></span>}
