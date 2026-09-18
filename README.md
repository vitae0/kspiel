# KSpiel
A browser-native modern command, logistics and political simulation.

## Principles
- Map first. UI stays deliberately minimal.
- Tick-based authoritative simulation; multiplayer-safe architecture from day one.
- Hierarchical forces: regular, asymmetric, paramilitary, contractor.
- Logistics, intelligence and politics are systems, not flat modifiers.
- Political ideology is derived from continuous political axes; combinations receive generated regime names.
- Planned Operation Composer: conditional triggers, phases, abort conditions and command latency.

## Start
```bash
npm install
npm run dev
```

Current scaffold: Next.js + TypeScript + MapLibre. Simulation types are isolated under `src/sim` so the authoritative simulation can later move to a dedicated server/Rust core without coupling the UI to it.
