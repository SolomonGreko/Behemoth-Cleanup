# Behemoth — Tower Defense Game

> **Phase**: Core Systems (Day 1 complete)
> **Last updated**: 2026-06-22
> **Maintained by**: The Scribe (Hermes)

## Overview

Behemoth is a tower-defense game with a simulation-engine core. Players defend a bastion against waves of Shroud-creatures by building walls, deploying turrets (watchers), harvesting resources (Stone/Crystal/Essence), and managing a day/night cycle where enemies attack only at night.

## Architecture

```
frontend/
  src/
    sim/                        # Pure simulation engine (no DOM/React)
      engine.js                 # Main game loop — stepTick orchestration
      resource.js               # Resource economy (canAfford, trySpend, addResources)
      behemoth.js               # Behemoth-specific abilities (Pulse Wave, FD, Shield)
      turrets.js                # Turret/watcher system (targeting, laser, mortar, upgrades)
      bots.js                   # Worker bot management (harvesting, pathfinding stubs)
      enemies.js                # Enemy type definitions and behavior stubs
      world.js                  # World generation (terrain zones, base placement)
      labour.js                 # Labour/construction stubs
      render.js                 # Canvas rendering (background, enemies, turrets, health bars)
      config.js                 # All tuning — RESOURCE, ENEMY, WAVE, SWARM, BASE, TURRET, WALL, DAY_CYCLE
      index.js                  # Barrel exports
      __tests__/                # Vitest test suites
    components/
      BehemothGame.jsx          # Main game React component
      ResourceHUD.jsx           # Resource display HUD
  docs/
    design/                     # Game design specs (Athena)
      wall-system-design.md     # Wall system spec
    story/                      # Narrative and lore (Calliope)
      field-guide-shroud-creatures-and-fallen-bastions.md
      the-vigils-arsenal.md
```

## State — 2026-06-22 (Day 1)

### Complete
- [x] **Resource economy** — Stone/Crystal/Essence with caps, harvesting, drops, spending gates
- [x] **Engine v2** — Main game loop: wave spawning, swarm mechanics, enemy movement, base damage, game-over detection
- [x] **Day/night cycle** — Dawn→Day→Dusk→Night phases; waves spawn only at night
- [x] **Turrets v1** — Watcher system with laser/mortar targeting, upgrades, engine integration
- [x] **Render layer** — Canvas background (4-layer atmospheric), enemy shapes (5 types), turret emplacements, health bars
- [x] **Security audits** — buyBot/buyWatcher bypass fixed, all module-level mutable state scoped to sim instances
- [x] **Lore** — 4 fallen bastions named, 5 Shroud-creature types with mechanics tie-ins, full arsenal narrative

### In Progress
- _None_

### Next Up
- [ ] **Walls implementation** — Design spec complete (Athena); needs Hephaestus implementation
- [ ] **Bot harvesting loop** — bots.js has definitions but the harvesting tick is not yet integrated into stepTick
- [ ] **Frontend integration** — React components exist but no component tests

### Known Issues
- **Push access blocked** — Remote `https://github.com/SolomonGreko/Behemoth.git` returns 403; commits are local only
- **PROJECT.md** (this file) created retroactively on Day 1 — may need refinement

## Resources

Three resource types flow through the game loop:
| Resource | Source | Spends On |
|----------|--------|-----------|
| Stone | Bot harvesting from terrain zones | Walls, structures, bots, storage upgrades |
| Crystal | Enemy death drops | Watchers, advanced turrets, mortar upgrades |
| Essence | Passive accumulation over time | Pulse Wave, Final Defense hasten, Emergency Shield |

## Config Blocks

All tuning lives in `frontend/src/sim/config.js`:
- `RESOURCE` — Stone/Crystal/Essence rates, caps, drop tables, ability costs, storage upgrades
- `COST` — Building/purchase costs (bots, watchers, walls, storage upgrades)
- `ECON` — Starting values, bot defaults
- `ENEMY` — 5 enemy types (scout, tank, artillery, crawler/skitterling, boss)
- `WAVE` — Wave timing, enemy counts, composition ratios
- `SWARM` — Swarm wave multipliers and frequency
- `BASE` — Base HP, shield settings, game-over thresholds
- `TURRET` — Watcher stats, laser/mortar damage, upgrade tiers, targeting ranges
- `WALL` — 4 level tiers, HP, build ticks, repair rate, placement constraints
- `DAY_CYCLE` — Phase durations (dawn/day/dusk/night in ticks)

## Tests

```
Test Suites: 5 passed (5)
Tests:       203 passed (203)
```
- `resource.test.js` — 69 tests (resource accumulation, spending, caps)
- `engine.test.js` — 44 tests (wave spawning, enemy movement, day/night, game-over)
- `turrets.test.js` — 37 tests (targeting, damage, upgrades, mounting)
- `resource-integration.test.js` — 28 tests (cross-module resource flows)
- `security-adversarial.test.js` — 25 tests (overflow, injection, rate-limiting)

## Pantheon Agents

| Agent | Domain | Status |
|-------|--------|--------|
| Hephaestus | Engineering (sim engine, turrets, bots) | Active |
| Athena | Game design (config, specs, balance) | Active |
| Aphrodite | Visual (rendering, UI, canvas) | Active |
| Calliope | Narrative (lore, world-building, naming) | Active |
| Ares | Security (audits, hardening, adversarial tests) | Active |
| Apollo | Bug fixes, diagnostics | Active |
| Scribe (Hermes) | SSoT, commits, digests | Active |
