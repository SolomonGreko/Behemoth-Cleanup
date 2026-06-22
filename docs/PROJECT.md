# Behemoth — Tower Defense Game

> **Phase**: Core Systems (Day 1 complete — labour system v1, muzzle flash VFX, 364 tests)
> **Last updated**: 2026-06-22 21:38 UTC
> **Maintained by**: The Scribe (Hermes)

## Overview

Behemoth is a tower-defense game with a simulation-engine core. Players defend a bastion against waves of Shroud-creatures by building walls, deploying turrets (watchers), harvesting resources (Stone/Crystal/Essence), and managing a day/night cycle (the Shroud-Tide) where enemies attack only at night.

## Architecture

```
frontend/
  package.json                # React build system (react-scripts)
  public/
    index.html                # HTML entry point
  src/
    App.js                    # React root — mounts BehemothGame, drives frame counter
    index.js                  # ReactDOM entry point
    sim/                        # Pure simulation engine (no DOM/React)
      engine.js                 # Main game loop — stepTick orchestration
      resource.js               # Resource economy (canAfford, trySpend, addResources)
      behemoth.js               # Behemoth-specific abilities (Pulse Wave, FD, Shield)
      turrets.js                # Turret/watcher system (targeting, laser, mortar, upgrades)
      walls.js                  # Wall system (placement, damage, repair, upgrade, siege)
      bots.js                   # Worker bot management (harvesting, pathfinding)
      enemies.js                # Enemy types: AI behaviors (scout gap, tank taunt, crawler stack, boss enrage/shockwave, artillery ranged)
      world.js                  # World generation (terrain zones, base placement)
      labour.js                 # Labour/construction stubs
      render.js                 # Canvas rendering (background, enemies, turrets, walls, bots, crystal drops, death particles, day/night overlay, selection ring, health bars, damage flash)
      sound.js                  # Sound playback consumer (event queue drain, mute toggle)
      config.js                 # All tuning — RESOURCE, COST, ECON, BOT, ENEMY, SCALING, WAVE, SWARM, BASE, TURRET, WALL, DAY_CYCLE
      index.js                  # Barrel exports
      __tests__/                # Vitest test suites (7 suites, 295 tests)
        render.test.js          # Render regression tests (3 tests)
    components/
      BehemothGame.jsx          # Main game React component (includes SoundToggle)
      ResourceHUD.jsx           # Resource display HUD
docs/
docs/design/                       # Game design specs (Athena)
    wall-system-design.md       # Wall system spec
    enemy-behaviors-v1-design.md # Enemy type-specific AI behaviors spec
  story/                        # Narrative and lore (Calliope)
    field-guide-shroud-creatures-and-fallen-bastions.md
    the-vigils-arsenal.md
    the-vigils-rhythm.md        # Shroud-Tide, Four Watches, Chime-Forged bots
```

## State — 2026-06-22 (Day 1, end-of-day)

### Complete
- [x] **Resource economy** — Stone/Crystal/Essence with caps, harvesting, drops, spending gates
- [x] **Engine v2** — Main game loop: wave spawning, swarm mechanics, enemy movement, base damage, game-over detection
- [x] **Day/night cycle** — Dawn→Day→Dusk→Night phases (Shroud-Tide); waves spawn only at night
- [x] **Turrets v1** — Watcher system with laser/mortar targeting, upgrades, engine integration
- [x] **Walls v1** — Wall placement, damage, repair, upgrade (4 tiers), siege AI, engine integration
- [x] **Bot harvesting loop** — Worker bots harvest Stone from terrain zones; integrated into stepTick
- [x] **Base level scaling** — LEVEL.BONUSES essenceMul drives per-level essence income; shield HP scales by level
- [x] **SCALING config** — Per-wave enemy HP/speed/damage/crystal scaling multipliers
- [x] **Sound system** — Sound playback consumer with event queue drain and mute toggle
- [x] **Render layer** — Canvas background (4-layer atmospheric), enemies (5 shape types), turrets, walls (4-tier visual), health bars
- [x] **SoundToggle UI** — Mute/unmute speaker button in BehemothGame.jsx
- [x] **Security audits** — buyBot/buyWatcher bypass fixed, all module-level mutable state scoped to sim instances, turret double-kill fixed, Pulse Wave zombie fix
- [x] **Artillery enemy behavior** — Ranged attack with wall line-of-sight blocking, fire-and-self-destruct state machine, wave 4+ gating
- [x] **Bot rendering** — Canvas drawBots with hexagonal chassis, state-coloured rendering, motion trails, cargo dots, deposit flash
- [x] **HUD data enrichment** — getLabourSummary() + buildHUD() botLabour, phaseTick, phaseDuration, phaseBlend
- [x] **BUG-003 fix** — Artillery dead-wall targeting: re-acquire target every tick to prevent firing at destroyed walls
- [x] **Enemy behaviors design spec** — Athena's design for scout/tank/artillery/crawler/boss type-specific AI behaviors
- [x] **Lore** — 4 fallen bastions named, 5 Shroud-creature types, full arsenal narrative, Shroud-Tide day/night lore, Chime-Forged bots
- [x] **Enemy behaviors v1** — Scout gap-detection AI (flank waypoint steering), Tank taunt-aura (coordinated breaches), Crawler stack-cap (prevents 80-crawler pileups), Boss enrage+shockwave (mid-fight shift + first-contact AoE)
- [x] **Enemy config blocks** — ENEMY_SCOUT, ENEMY_TANK, ENEMY_CRAWLER, ENEMY_BOSS tuning with full JSDoc rationale (Athena)
- [x] **Damage flash system** — Hit-feedback: type-tinted glow ring + warm cream-white core, quick-rise-slow-fade alpha curve over 8 ticks (Aphrodite)
- [x] **Frontend build system** — package.json, index.html, App.js, index.js entry point; production build succeeds (60KB JS bundle) (Hephaestus)
- [x] **BUG-004 fix** — Wave composition off-by-one: Math.floor rounding silently dropped up to 1 enemy per early wave; absorbed remainder into scouts (Apollo)
- [x] **.gitignore** — node_modules/, build/, .vite/ excluded from tracking
- [x] **Zeus gatekeep** — Enemy AI behaviors approved: 4/4 behaviors implemented, 276/276 tests pass
- [x] **Day/night ambient overlay** — Full-canvas phase-tinted atmospheric overlay with smooth transitions, night vignette, and phase-specific composite operations (Aphrodite)
- [x] **Crystal drop VFX** — Amber-gold diamond shard particles arc upward from enemy death points, 3-phase animation over 45 ticks (Aphrodite)
- [x] **Storage cap L3 correction** — capUpgradePerLevel scalars→arrays (Stone 350→400, Crystal 125→150, Essence 175→200); design spec at docs/design/storage-cap-tuning.md (Athena)
- [x] **BUG-005 fix** — drawDayNightOverlay latent NaN bug: sim.worldWidth/sim.worldHeight → sim.world.width/sim.world.height in night vignette fallback; 3 regression tests (Apollo)
- [x] **Garden indicator** — Live garden stats (grass/moss count, dominant phase, Pulse Wave status) rendered in BehemothGame.jsx HUD (Hephaestus, Zeus-approved t_8300286c)
- [x] **Click-to-select** — findTurretAt hit-test, selectTurret/deselectTurret engine functions, drawSelectionRing render pass (Hephaestus/Aphrodite, Zeus-approved t_4b63b4df)
- [x] **Bot speed tuned** — BOT.speed 0.025→0.015 (75% of scout — bots must be defended) (Athena)
- [x] **Labour system design spec** — Full labour.js architecture at docs/design/labour-system-design.md (Athena)
- [x] **Zeus unblock** — Integration test t_e4c7bcc2 unblocked, all 3 remediation children complete
- [x] **Labour system v1** — Bot task allocation with dynamic scoring, crisis detection, stacking penalties; 69 new tests (Hephaestus)
- [x] **Turret muzzle flash VFX** — Laser/mortar fire detection + expanding ring + core glow (Aphrodite)

### In Progress
- [ ] **Enemy behavior visuals** — Crawler jitter VFX remaining (Aphrodite task t_6b2844e1)
- [ ] **Integration test re-run** — t_e4c7bcc2 unblocked, ready for Apollo re-test

### Next Up
- [ ] **Frontend integration tests** — React components exist but no component tests
- [ ] **Stone zone generation** — World generation creates stone zones on map init
- [ ] **Git push access** — Remote returns 403; commits are local only

### Known Issues
- **Push access blocked** — Remote `https://github.com/SolomonGreko/Behemoth.git` returns 403; commits are local only
- **Zeus heartbeat (21:19 UTC)** — t_98da4cee still needs-morpheus (git credentials), t_21909ab7 todo for Aphrodite (enemy behavior visuals), board otherwise clear

## Resources

Three resource types flow through the game loop:
| Resource | Source | Spends On |
|----------|--------|-----------|
| Stone | Bot harvesting from terrain zones | Walls, structures, bots, storage upgrades |
| Crystal | Enemy death drops | Watchers, advanced turrets, mortar upgrades |
| Essence | Passive accumulation over time (level-scaled) | Pulse Wave, Final Defense hasten, Emergency Shield |

## Config Blocks

All tuning lives in `frontend/src/sim/config.js`:
- `RESOURCE` — Stone/Crystal/Essence rates, caps, drop tables, ability costs, storage upgrades
- `COST` — Building/purchase costs (bots, watchers, walls, storage upgrades)
- `ECON` — Starting values, bot defaults
- `BOT` — Worker bot intrinsics (speed, size, max count, starting count)
- `ENEMY` — 5 enemy types (scout, tank, artillery, crawler/skitterling, boss)
- `ENEMY_SCOUT` — Scout gap-detection tuning (gapCheckInterval, gapThreshold, preferWeakestWall)
- `ENEMY_TANK` — Tank taunt-aura tuning (tauntRadius, tauntPriorityBoost)
- `ENEMY_CRAWLER` — Crawler stack-cap tuning (maxStackPerWall, jitterSmoothness)
- `ENEMY_BOSS` — Boss enrage/shockwave tuning (enrageHpThreshold, speedMul, damageMul, shockwaveDamage, shockwaveRadius)
- `ARTILLERY` — Artillery ranged-attack tuning
- `SCALING` — Per-wave enemy stat multipliers (HP, speed, damage, crystal drop), HP cap
- `WAVE` — Wave timing, enemy counts, composition ratios
- `SWARM` — Swarm wave multipliers and frequency
- `BASE` — Base HP, shield settings, game-over thresholds
- `TURRET` — Watcher stats, laser/mortar damage, upgrade tiers, targeting ranges
- `WALL` — 4 level tiers, HP, build ticks, repair rate, placement constraints
- `DAY_CYCLE` — Phase durations (dawn/day/dusk/night in ticks)
- `LEVEL` — Base level thresholds (cumulative kills) and per-level bonuses (hpMul, essenceMul, radiusMul, shield HP)

## Tests

```
Test Suites: 8
Tests:       364 total — 364 passing
```
- `resource.test.js` — 69 tests (resource accumulation, spending, caps)
- `engine.test.js` — 51 tests (wave spawning, enemy movement, day/night, game-over, bot harvesting, wall siege, artillery behavior, labour integration)
- `turrets.test.js` — 51 tests (targeting, damage, upgrades, mounting, findTurretAt, muzzle flash)
- `walls.test.js` — 66 tests (placement, damage, repair, upgrade, siege integration, engine purchase paths)
- `resource-integration.test.js` — 30 tests (cross-module resource flows)
- `security-adversarial.test.js` — 25 tests (overflow, injection, rate-limiting)
- `labour.test.js` — 69 tests (job board, scoring, assignment, crisis detection, stacking, preemption)
- `render.test.js` — 3 tests (drawDayNightOverlay regression — BUG-005 NaN guard)

## Pantheon Agents

| Agent | Domain | Status |
|-------|--------|--------|
| Hephaestus | Engineering (sim engine, turrets, walls, bots) | Active |
| Athena | Game design (config, specs, balance) | Active |
| Aphrodite | Visual (rendering, UI, canvas, sound) | Active |
| Calliope | Narrative (lore, world-building, naming) | Active |
| Ares | Security (audits, hardening, adversarial tests) | Active |
| Apollo | Bug fixes, diagnostics | Active |
| Demeter | Gap scanning, project health | Active |
| Scribe (Hermes) | SSoT, commits, digests | Active |
