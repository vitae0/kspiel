# KSpiel code architecture

The simulation has been extracted from the original monolithic `src/app/page.tsx` without altering its rules.

| Module | Responsibility |
| --- | --- |
| `src/sim/geometry.ts` | Geometry, path sampling, distances and point helpers |
| `src/sim/rules.ts` | Static gameplay parameters, combat and movement modifiers |
| `src/sim/navigation.ts` | Road planning, travel costs and unit routes |
| `src/sim/logistics.ts` | Supply connectivity, road interdiction, relays, depots |
| `src/sim/strategy.ts` | Enemy command AI and city capture |
| `src/sim/simulation.ts` | Tick simulation, combat resolution and unit updates |
| `src/sim/construction.ts` | Building projects and emplaced weapons |
| `src/app/ui-utils.ts` | Presentation-only formatting and labels |
| `src/app/page.tsx` | Match orchestration, React state, input and view |

## Rules for future work
- Simulation modules must not import React or browser DOM APIs.
- Modules must avoid circular imports. `geometry` and `rules` are low-level dependencies.
- Terrain and spatial indexes must preserve the original proximity semantics.
- Optimize hot paths with benchmarks before changing tactical outcomes.
- Run `node scripts/smoke-theaters.cjs`, `node scripts/smoke-attrition.cjs`, and `npm run build` on every behavior-affecting change.
- Treat all performance targets as hypotheses until measured in a production browser profile.

## Performance
- Static road queries use a WeakMap-scoped indexed geometry lookup, validated against full scans.
- Combat pairs use local spatial queries, preserving original pair order.
- Territory path calculations are presentation-only snapshots updated at most every 600ms, immediately on owner changes.
- React hover changes no longer rebuild derived supply/link graphs.

- Constructed-road topology and connection-source calculations are shared between units in a simulation snapshot; caches are invalidated on input identity changes.
- Scouting visibility calculations are reused inside a view, and hover sampling is limited to 70ms.

- Static geography paths are separately memoized. Offscreen army counter DOM nodes are skipped without changing simulation, fog, or minimap rules.

- Tactical supply interdiction queries reuse a spatial hash for nearby units, with an exact baseline parity smoke test that checks nonempty road cuts and preserves accumulation order.

- Open World influence neighbor topology is precomputed and reused until the resource-node geometry changes.
- Run `npm run bench:sim` for 100/300/500 unit simulation/network CPU timings (not FPS). CI runs a non-gating 100-unit baseline sample.
