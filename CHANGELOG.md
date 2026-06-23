# Behemoth — Changelog

> Maintained by The Scribe 📝

---

## v1.1.0-visual-upgrade — 2026-06-23

### Rendering Architecture Refactor
- **Render module extraction** — Split monolith `render.js` into focused modules:
  - `render/background.js` — 4-layer atmospheric background rendering
  - `render/effects.js` — Particle effects system (death particles, crystal drops, muzzle flash, crawler trails)
  - `render/entities.js` — Entity rendering (enemies, turrets, walls, bots)
  - `render/hud.js` — HUD rendering pass (selection rings, health bars, overlays)
- **Engine SLIM** — `engine.js` reduced to `createSim` + core loop orchestration; all rendering concerns moved to render modules

### Atmosphere & Environment
- **Day/night ambient overlay** — Full-canvas phase-tinted atmospheric overlay with smooth transitions, night vignette, and phase-specific composite operations (Aphrodite)
- **Base ambient particles** — Wardstone light motes emanate from base, level-scaled spawn rate, shield color shift, day/night visibility (Aphrodite)
- **Stone zone rendering** — Visual distinction for stone harvesting terrain zones
- **Garden indicator** — Live garden stats (grass/moss count, dominant phase, Pulse Wave status) in HUD (Hephaestus)

### Enemy Visuals & VFX
- **Enemy behaviors v1** — Type-specific AI visual cues: Scout gap-detection flanking, Tank taunt-aura, Crawler stack-cap, Boss enrage transformation
- **Damage flash system** — Hit-feedback: type-tinted glow ring + warm cream-white core, quick-rise-slow-fade alpha curve over 8 ticks (Aphrodite)
- **Boss enrage VFX** — Shockwave expanding rings + enrage transformation visual (Aphrodite)
- **Crawler trail VFX** — Emerald fading dot trails behind crawler enemies (Aphrodite)
- **Crystal drop VFX** — Amber-gold diamond shard particles arc upward from enemy death points, 3-phase animation over 45 ticks (Aphrodite)
- **Muzzle flash VFX** — Laser/mortar fire detection + expanding glow ring + core glow (Aphrodite)

### HUD & UI
- **GameControls** — BUILD (Bot/Watcher/Wall), PAUSE, LEGEND, REGENERATE, EDIT buttons with affordability checks and wall placement mode; enemy type legend overlay (Hephaestus)
- **IntegrityBar** — Colour-coded base HP bar (>60% green, 30-60% amber, <30% red) (Hephaestus)
- **Theme foundation** — CSS design system with 25 VISUAL_SPEC color tokens, Fira Code typography, spacing/radius tokens via `styles/theme.css` (Aphrodite)
- **Inspect panel styles** — Turret detail HUD styles for click-to-select (Aphrodite)
- **Click-to-select** — `findTurretAt` hit-test, select/deselect engine functions, drawSelectionRing render pass, InspectPanel with turret stats (Hephaestus/Aphrodite)
- **Base level visual distinction** — Level badge rendered in BehemothGame.jsx (Hephaestus)

### Bot Visuals
- **Bot rendering** — Canvas `drawBots` with hexagonal chassis, state-coloured rendering, motion trails, cargo dots, deposit flash (Aphrodite)
- **HUD enrichment** — `getLabourSummary()` + `buildHUD()`: botLabour, phaseTick, phaseDuration, phaseBlend readouts

### Visual Design System
- **VISUAL_SPEC.md** — Comprehensive game HUD visual design spec: military command terminal aesthetic, monochromatic zinc palette, CRT phosphor glow philosophy, CSS token definitions, layout composition, typography hierarchy, canvas-HUD integration rules (Aphrodite)

---

## v1.0.0 — 2026-06-22 (Day 1 Initial Build)
- Core engine: `createSim`, wave spawning, swarm mechanics, enemy movement, base damage, game-over detection
- Day/night cycle: Dawn→Day→Dusk→Night phases (Shroud-Tide)
- Resource economy: Stone/Crystal/Essence with caps, harvesting, drops, spending gates
- Turrets v1: Watcher system with laser/mortar targeting, upgrades
- Walls v1: Wall placement, damage, repair, upgrade (4 tiers), siege AI
- Bot harvesting loop: Worker bots harvest Stone from terrain zones
- Sound system: Playback consumer with event queue drain and mute toggle
- 397 tests across 8 test suites (all passing)
