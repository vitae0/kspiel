# KSpiel UI architecture: Stage 2

The route `src/app/page.tsx` remains the authoritative **game orchestrator**. It owns simulation snapshots, player commands, multiplayer session state, and the canonical refs needed by the fixed-tick loop. Presentation is decomposed into typed client components.

| Component | Ownership |
| --- | --- |
| `game-setup.tsx` | Two-step mode selection, illustrated theater cards, lobby and deployment settings |
| `game-header.tsx` | Global battle metrics and simulation clock controls |
| `game-tutorial.tsx` | Command academy and step navigation |
| `left-sidebar.tsx` | Army groups, fronts, plans, Dominion recruitment, construction lists |
| `unit-inspector.tsx` | Selected formation metrics, logistics, formations and orders |
| `map-unit-layer.tsx` | Interactive, fog-gated unit counters and selection events |
| `game-minimap.tsx` | Miniature map and territory/units overview |
| `game-map-hud.tsx` | Cursor terrain, zoom and live map metrics |
| `mobile-toolbar.tsx` | Touch controls, front tool and mobile panel toggles |
| `game-statusbar.tsx` | Keyboard hints and selected-formation count |
| `ui-primitives.tsx` | Flag, stat-meter and key-value row primitives |

Previously extracted `static-terrain.tsx` memoizes static map paths. `hooks/use-territory-view.ts` and `hooks/use-viewport-size.ts` remain shared viewport hooks.

## Boundaries

- **Game state and mutations** remain in the Home orchestration component; children receive explicit typed inputs and callbacks.
- **UI components do not simulate ticks or authorize commands**. Existing click handlers are wired back to the original Home functions.
- **The two-stage mode/map flow is retained**. Incoming invites and connected multiplayer lobbies still open the map stage.
- **Map fog remains authoritative**. Unit counters receive only the existing visibility set; hidden hostiles are not newly rendered.
- **No new React hooks were inserted after the setup early return**, preserving hook ordering.
- **A changed component boundary is not automatically a performance win.** Measure React commits before adding heavier memoization, and compare production-browser CPU traces for large maps.

## Verification

`node scripts/smoke-ui.cjs` performs server-rendered component checks on both menu stages, minimap rules, fog-gated unit counters and status bar. Existing scenario, combat, spatial index and supply parity smoke tests must still pass, followed by `npm run build`.

Browser input/multiplayer gameplay parity and frame-rate changes still require interactive testing.
