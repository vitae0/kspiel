"use client";
import type {UnitKind} from "@/sim/types";

/** Compact, NATO-inspired branch glyphs. The faction/group colors remain on
 * the counter; only the short unit-type code changes when this view is active. */
export function UnitTypeMark({kind}:{kind:UnitKind}){
  const cross=["infantry","militia","partisan","mountaineer","special_forces","mechanized"].includes(kind);
  const armor=["armor","tank","mechanized"].includes(kind);
  const diagonal=["cavalry","recon","raider"].includes(kind);
  const gun=["artillery","heavy_artillery","mortar"].includes(kind);
  return <svg className="nato-unit-icon" viewBox="0 0 40 27" role="img"
      aria-label={kind.replaceAll("_"," ")} focusable="false">
    <rect x="1.5" y="1.5" width="37" height="24" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2"/>
    {cross&&<g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M 9 6 L 31 21 M 31 6 L 9 21"/>
    </g>}
    {armor&&<ellipse cx="20" cy="13.5" rx={armor&&cross?10:13} ry={armor&&cross?4.4:5.6}
      fill="none" stroke="currentColor" strokeWidth="2.2"/>}
    {diagonal&&<path d="M 9 20 L 31 6" stroke="currentColor" strokeWidth="2.4"/>}
    {kind==="raider"&&<path d="M 8 6 H 16 M 24 21 H 32" stroke="currentColor" strokeWidth="2"/>}
    {kind==="recon"&&<circle cx="20" cy="13.5" r="3" fill="currentColor"/>}
    {kind==="militia"&&<path d="M 18 4 H 22" stroke="currentColor" strokeWidth="2"/>}
    {kind==="partisan"&&<circle cx="20" cy="4.5" r="2" fill="currentColor"/>}
    {kind==="special_forces"&&<path d="M 15 4 L 20 1 L 25 4" fill="none" stroke="currentColor" strokeWidth="1.4"/>}
    {kind==="mountaineer"&&<path d="M 8 23 L 14 17 L 20 23 L 26 17 L 32 23" stroke="currentColor" strokeWidth="1.4" fill="none"/>}
    {gun&&<circle cx="20" cy="13.5" r={kind==="heavy_artillery"?6:kind==="mortar"?5:4.2}
      fill={kind==="mortar"?"none":"currentColor"} stroke="currentColor" strokeWidth="2"/>}
    {kind==="heavy_artillery"&&<path d="M 10 13.5 H 14 M 26 13.5 H 30" stroke="currentColor" strokeWidth="2.4"/>}
    {kind==="engineer"&&<path d="M 12 6 V 21 M 12 6 H 29 M 12 13 H 25 M 12 21 H 29" stroke="currentColor" strokeWidth="2.6" fill="none"/>}
    {kind==="logistics"&&<g stroke="currentColor" strokeWidth="2.3" fill="none">
      <path d="M 10 9 H 30 V 18 H 10 Z"/><path d="M 20 9 V 18"/>
    </g>}
  </svg>;
}
