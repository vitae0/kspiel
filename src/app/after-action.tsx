"use client";
import {useState} from "react";
import type {BattleHistory,StatSide} from "@/sim/telemetry";
import type {Side} from "@/sim/types";

const COLORS:Record<Side,string>={blue:"#71a9e7",red:"#ee8c84",green:"#87c599"};
type NumericMetric=Exclude<keyof StatSide,"side">;
const METRICS:Record<NumericMetric,{label:string;unit?:string}>={
  units:{label:"Fielded formations"},effectiveStrength:{label:"Effective army strength"},cities:{label:"Cities controlled"},
  supply:{label:"Average supply",unit:"%"},organization:{label:"Army organization",unit:"%"},morale:{label:"Average morale",unit:"%"},
  isolated:{label:"Encircled formations"},territory:{label:"Controlled territory index"},dealt:{label:"Combat damage inflicted"},
  losses:{label:"Formations lost"},casualties:{label:"Estimated personnel casualties"},reinforcements:{label:"Formations reinforced"},
  captures:{label:"City captures"},construction:{label:"Completed fieldworks"},resources:{label:"Total resource stockpiles"},
  manpowerStock:{label:"Manpower reserves"},materialsStock:{label:"Construction materials"},fuelStock:{label:"Fuel reserves"},
  shortage:{label:"Formations short on supply"}
};
const TABS=["OVERVIEW","MILITARY","LOGISTICS","TERRITORY","TIMELINE"] as const;
type Tab=typeof TABS[number];
const CHARTS:Record<Exclude<Tab,"TIMELINE">,NumericMetric[]>={
  OVERVIEW:["effectiveStrength","cities","units","dealt"],
  MILITARY:["units","effectiveStrength","dealt","casualties","organization","morale","losses","reinforcements"],
  LOGISTICS:["supply","shortage","isolated","morale","reinforcements","resources","manpowerStock","materialsStock","fuelStock"],
  TERRITORY:["territory","cities","captures","construction"]
};
const SIDES:Side[]=["blue","red","green"];
const format=(v:number,digits=0)=>Number.isFinite(v)?v.toLocaleString("en-US",{maximumFractionDigits:digits}):"0";
function TrendChart({history,metric,sides}:{history:BattleHistory;metric:NumericMetric;sides:Side[]}){
  const samples=history.samples;
  const w=680,h=178,left=46,right=12,top=12,bottom=28;
  const values=samples.flatMap(s=>sides.map(side=>s.values[side][metric]));
  const min=0,max=Math.max(1,...values)*1.12,latest=samples[samples.length-1]?.hour??1,first=samples[0]?.hour??0;
  const x=(hour:number)=>left+(hour-first)/Math.max(.001,latest-first)*(w-left-right);
  const y=(value:number)=>h-bottom-value/max*(h-bottom-top);
  const marks=[0,.25,.5,.75,1];
  return <div className="aar-chart"><div className="aar-chart-head"><strong>{METRICS[metric].label}</strong><span>{METRICS[metric].unit??"IN-GAME UNITS"}</span></div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={METRICS[metric].label+" over time"}>
      {marks.map(v=><g key={v}><line x1={left} y1={y(v*max)} x2={w-right} y2={y(v*max)} className="aar-gridline"/><text x={left-5} y={y(v*max)+4} textAnchor="end" className="aar-axis">{format(v*max,max>99?0:1)}</text></g>)}
      {samples.length===1&&sides.map(side=><circle key={side} cx={x(first)} cy={y(samples[0].values[side][metric])} r={3} fill={COLORS[side]}/>)}
      {sides.map(side=><polyline key={side} fill="none" stroke={COLORS[side]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
        points={samples.map(s=>`${x(s.hour)},${y(s.values[side][metric])}`).join(" ")}/>)}
      <text x={left} y={h-7} className="aar-axis">{format(first,1)}H</text><text x={w-right} y={h-7} textAnchor="end" className="aar-axis">{format(latest,1)}H</text>
    </svg>
    <div className="aar-legend">{sides.map(side=><span key={side}><i style={{background:COLORS[side]}}/>{side.toUpperCase()}: {format(samples[samples.length-1]?.values[side][metric]??0,metric==="supply"||metric==="morale"||metric==="organization"?1:0)}{METRICS[metric].unit??""}</span>)}</div>
  </div>;
}
export default function AfterActionReport({history,winner,playerSide,onExit}:{history:BattleHistory;winner:Side|null;playerSide:Side;onExit:()=>void}){
  const [tab,setTab]=useState<Tab>("OVERVIEW");
  const [visible,setVisible]=useState<Side[]>(["blue","red","green"]);
  const duration=history.finishedAt??history.samples[history.samples.length-1]?.hour??0;
  const final=history.samples[history.samples.length-1];
  const activeSides=SIDES.filter(side=>history.records.some(u=>u.side===side)||history.startingCities[side]>0||final.values[side].cities>0);
  const toggle=(side:Side)=>setVisible(prev=>{
    const currentlyVisible=prev.filter(s=>activeSides.includes(s));
    if(prev.includes(side)&&currentlyVisible.length<=1)return prev;
    return prev.includes(side)?prev.filter(s=>s!==side):[...prev,side];
  });
  const downloadCSV=()=>{
    const fields=Object.keys(METRICS) as NumericMetric[];
    const rows=["hour,side,"+fields.join(",")];
    for(const sample of history.samples)for(const side of activeSides)
      rows.push([sample.hour,side,...fields.map(key=>sample.values[side][key])].join(","));
    const blob=new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="kspiel-after-action-"+history.seed+".csv";
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  };
  const ranks=activeSides.map(side=>{
    const snap=final.values[side],total=history.totals[side];
    const score=snap.effectiveStrength*18+snap.cities*220+snap.territory*7+total.captures*65+total.damage*2
      -total.losses*55-total.casualties*.012;
    return{side,score:Math.max(0,Math.round(750+score))};
  }).sort((a,b)=>b.score-a.score);
  const leaders=[...history.records].sort((a,b)=>b.damage-a.damage).slice(0,12);
  return <div className="aar-backdrop" role="dialog" aria-modal="true" aria-label="After action statistics">
    <div className="aar-shell">
      <header className="aar-header"><div><small>KSPIEL // AFTER-ACTION REPORT</small><h1>{winner?(winner===playerSide?"VICTORY":"DEFEAT"):"SESSION CONCLUDED"}</h1><p>{history.title} · SEED #{history.seed.toString(16).toUpperCase()} · {format(duration,1)} SIMULATION HOURS</p></div><div><span className="aar-winner">{winner?winner.toUpperCase()+" VICTORIOUS":history.reason??"ENDED"}</span><button onClick={onExit}>RETURN TO MENU ×</button></div></header>
      <div className="aar-tabs" role="tablist">{TABS.map(t=><button role="tab" aria-selected={tab===t} className={tab===t?"active":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      <div className="aar-content">
        <div className="aar-scoreboard" style={{gridTemplateColumns:"repeat("+Math.max(1,ranks.length)+", minmax(0,1fr))"}}>{ranks.map((r,i)=>{
          const snap=final.values[r.side],total=history.totals[r.side];
          return <div key={r.side} className={"aar-score "+r.side}><div className="aar-side"><i style={{background:COLORS[r.side]}}/><b>{r.side.toUpperCase()} COMMAND</b><small>#{i+1} / KSPIEL SCORE</small></div><strong>{format(r.score)}</strong>
            <div className="aar-kpis"><span>ARMY <b>{format(snap.units)}</b></span><span>CITIES <b>{format(snap.cities)}</b></span><span>DAMAGE <b>{format(total.damage,1)}</b></span><span>LOSSES <b>{format(total.losses)}</b></span></div></div>;
        })}</div>
        <div className="aar-visibility"><b>COMPARE</b>{activeSides.map(side=><label key={side} style={{color:COLORS[side]}}><input type="checkbox" checked={visible.includes(side)} onChange={()=>toggle(side)}/>{side.toUpperCase()}</label>)}
          <small>Time-series data is collected during the match. Personnel casualties are proportional estimates from strength losses.</small></div>
        {tab==="OVERVIEW"&&<section className="aar-table-wrap"><h2>COMMAND PERFORMANCE</h2><table className="aar-table"><thead><tr><th>INDICATOR</th>{activeSides.map(s=><th key={s}>{s.toUpperCase()}</th>)}</tr></thead><tbody>
          {(["cities","effectiveStrength","units","dealt","casualties","supply","morale","reinforcements","losses","captures","construction","shortage"] as NumericMetric[]).map(key=><tr key={key}><td>{METRICS[key].label}</td>{activeSides.map(side=><td key={side}>{format(final.values[side][key],key==="supply"||key==="morale"||key==="effectiveStrength"||key==="dealt"?1:0)}{METRICS[key].unit??""}</td>)}</tr>)}
        </tbody></table></section>}
        {tab==="MILITARY"&&<><section className="aar-table-wrap"><h2>MILITARY LOSSES & COMBAT PERFORMANCE</h2><table className="aar-table"><thead><tr><th>FACTION</th><th>PERSONNEL CASUALTIES*</th><th>FORMATIONS LOST</th><th>REINFORCEMENTS</th><th>DAMAGE INFLICTED</th><th>SUPPRESSION INFLICTED</th></tr></thead><tbody>
          {activeSides.map(side=><tr key={side}><td>{side.toUpperCase()}</td><td>{format(history.totals[side].casualties)}</td><td>{history.totals[side].losses}</td><td>{history.totals[side].reinforcements}</td><td>{format(history.totals[side].damage,1)}</td><td>{format(history.totals[side].suppression,1)}</td></tr>)}
        </tbody></table><small>* Estimates, not audited casualty counts. Damage uses accumulated formation-strength points.</small></section>
        <section className="aar-table-wrap"><h2>TOP FORMATIONS BY INFLICTED DAMAGE</h2><table className="aar-table"><thead><tr><th>FORMATION</th><th>FACTION</th><th>TYPE</th><th>DAMAGE</th><th>SUPPRESSION</th><th>STATUS</th></tr></thead><tbody>{leaders.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.side.toUpperCase()}</td><td>{u.kind.toUpperCase()}</td><td>{format(u.damage,1)}</td><td>{format(u.suppression,1)}</td><td>{u.active?"SURVIVED":"LOST"}</td></tr>)}</tbody></table></section>
        <section className="aar-table-wrap"><h2>FORMATION-TYPE PERFORMANCE</h2><table className="aar-table">
          <thead><tr><th>TYPE</th><th>DEPLOYED</th><th>LOST</th><th>DAMAGE</th><th>SUPPRESSION</th></tr></thead>
          <tbody>{[...new Set(history.records.map(u=>u.kind))].sort().map(kind=>{
            const roster=history.records.filter(u=>u.kind===kind);
            return <tr key={kind}><td>{kind.toUpperCase()}</td><td>{roster.length}</td><td>{roster.filter(u=>!u.active).length}</td>
              <td>{format(roster.reduce((s,u)=>s+u.damage,0),1)}</td><td>{format(roster.reduce((s,u)=>s+u.suppression,0),1)}</td></tr>
          })}</tbody></table></section></>}
        {tab==="LOGISTICS"&&<section className="aar-table-wrap"><h2>SUPPLY, MORALE & REAR AREAS</h2><table className="aar-table"><thead><tr><th>FACTION</th><th>AVG SUPPLY</th><th>SHORTAGE UNIT-HOURS</th><th>ENCIRCLED UNIT-HOURS</th><th>AVG MORALE</th><th>MP</th><th>MAT</th><th>FUEL</th></tr></thead><tbody>
          {activeSides.map(side=><tr key={side}><td>{side.toUpperCase()}</td><td>{format(final.values[side].supply,1)}%</td><td>{format(history.totals[side].shortageHours,1)}</td><td>{format(history.totals[side].isolatedHours,1)}</td><td>{format(final.values[side].morale,1)}%</td><td>{format(final.values[side].manpowerStock)}</td><td>{format(final.values[side].materialsStock)}</td><td>{format(final.values[side].fuelStock)}</td></tr>)}
        </tbody></table></section>}
        {tab==="TERRITORY"&&<section className="aar-table-wrap"><h2>CONTROL & INFRASTRUCTURE</h2><table className="aar-table"><thead><tr><th>FACTION</th><th>INITIAL CITIES</th><th>FINAL CITIES</th><th>CAPTURES</th><th>TERRITORY INDEX</th><th>FIELDWORKS</th></tr></thead><tbody>
          {activeSides.map(side=><tr key={side}><td>{side.toUpperCase()}</td><td>{history.startingCities[side]}</td><td>{final.values[side].cities}</td><td>{history.totals[side].captures}</td><td>{format(final.values[side].territory,1)}</td><td>{history.totals[side].construction}</td></tr>)}
        </tbody></table></section>}
        {tab==="TIMELINE"?<section className="aar-table-wrap aar-event-section"><h2>CHRONICLE OF THE BATTLE ({history.events.length} EVENTS)</h2>{history.events.length?history.events.slice().reverse().map((event,i)=><div key={i} className="aar-event"><time>{format(event.hour,1)}H</time><span style={{color:COLORS[event.side]}}>{event.side.toUpperCase()}</span><b>{event.title}</b><small>{event.kind.toUpperCase()}</small></div>):<p>No major events recorded.</p>}</section>
        :<div className="aar-charts">{CHARTS[tab].filter(metric=>!["resources","manpowerStock","materialsStock","fuelStock"].includes(metric)||SIDES.some(side=>final.values[side].resources>0)).map(metric=><TrendChart key={metric} history={history} metric={metric} sides={visible.filter(side=>activeSides.includes(side))}/>)}</div>}
        <footer className="aar-footer"><small>Score is a KSpiel comparative index, not the Age of Empires scoring formula. Events and trend data were recorded during play.</small><div className="aar-downloads"><button onClick={downloadCSV}>EXPORT ALL TIMELINE DATA · CSV</button><button onClick={onExit}>CLOSE REPORT / MAIN MENU</button></div></footer>
      </div>
    </div>
  </div>;
}
