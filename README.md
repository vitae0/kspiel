# KSpiel

Browser-based operational warfare simulation with supply, terrain, persistent fronts, encirclement, guerrilla troops and multiplayer commands.

## Play

**Live build:** https://vitae0.github.io/kspiel/

**Local development:**
```sh
npm install
npm run dev
```

### Combat and attrition

- Mortars, field artillery and heavy artillery carry a finite **AMMUNITION** stock (0–100). Each barrage consumes ammunition; dry guns stop dealing damage until replenished.
- Field engineers, road crews and other builders carry **MATERIALS** stock. Construction spends materials in proportion to actual building work. An engineer produces four times the ordinary progress per hour, but cannot build without materials.
- Both magazines and construction supplies refill faster in areas with live logistics links and high supply, and barely refill in isolated pockets. Basic SUPPLY remains a separate resource.
- Artillery fire produces visible tracers, muzzle flashes, explosions, shock waves and smoke; infantry engagements produce smaller tracer effects. Visual effects are bounded in quantity and disable with reduced-motion system settings.
- City recovery, entrenched defenses, shell suppression, dwindling stocks, frontline reserves and interrupted roads support longer attritional battles.

### Coordinated operations

- **Click / selection box:** select units; **1–6:** army-group hotkeys; **Ctrl+1–6:** assign to an army group.
- **Right-click:** move. When multiple combat units are selected, regardless of their army groups, select a **MARCH FORMATION** (LINE / COLUMN / WEDGE / ECHELON) to coordinate positions and slow the column to its weakest mobile combatant. Forward members wait for lagging units. Artillery and logistics move behind separately.
- **Shift+right-click:** queue an additional waypoint. **A:** attack, **F:** artillery fire, **H:** distributed group attack, **Y:** scout decoy, **Ctrl+drag:** persistent front.
- A marching column does **not** change group identity. Active marches temporarily take precedence over automatic front reassignment.
- **Multiplayer speed:** host-controlled 0.5× / 1× / 2×; solo speeds are 1× / 2.5× / 6×.

### Scenarios

Includes Spain 1937, giant Eastern Front / Balkans / Italy theaters and Yugoslav Partisans / Vietnam Central Highlands guerrilla scenarios. Historical presets are stylized wargame setups, not historically exact deployments.

### Tests

```sh
node scripts/smoke-theaters.cjs
node scripts/smoke-attrition.cjs
npm run build
```

GitHub Actions runs all tests before updating GitHub Pages.

## Architecture

- `src/sim/game.ts`, `theaters.ts`: theater generation, terrain, initial forces.
- `src/sim/attrition.ts`: ammunition budgets, supply-dependent stock recovery, material-constrained construction and marching geometry.
- `src/sim/warfare.ts`, `operations.ts`: operational commands, tactical fronts, visibility and territory.
- `src/app/page.tsx`: client battle loop, orders and visualization.
- `src/app/after-action.tsx`: match-end analysis and time-series export.
- `src/lib/multiplayer.ts`: multiplayer room transport and authoritative snapshot types.
