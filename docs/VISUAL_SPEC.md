# Behemoth — Visual Design Specification

_Athena — Design, Specs, Architecture, Documentation_
_Version 2.0 — 2026-06-23_

---

## 1. Design Philosophy

Behemoth is an autonomous tower defense simulator set in a dark garden world. The visual language draws from three reference points:

1. **Military HUD overlays** — high-contrast amber on black, monospace readouts, tactical brevity
2. **CRT terminal aesthetic** — green phosphor glow in the Captain's Room, scanlines, slight bloom
3. **Brutalist minimalism** — flat colors, no gradients on chrome, raw zinc surfaces

The HUD is **supplementary** — the game canvas is the star. Never let UI chrome overpower the game world.

### Guiding Principles

- **Atmospheric over cinematic.** The game world should feel alive — fog, day cycle, ambient particles. The UI should recede.
- **Information hierarchy.** Critical info (integrity, wave) is amber and prominent. Supplementary info recedes into zinc.
- **Tactile UI.** Buttons have hover states, progress bars animate, the CRT terminal has scanlines.
- **No unnecessary popups.** Modals only for run stats and settings. Everything else inline or overlays.
- **Consistency across game and Captain's Room.** Different visual languages (zinc-dark vs green-CRT), same component family.
- **Dev tools are dev tools.** Accessible but visually distinct (amber). Player should never confuse dev and gameplay buttons.
- **Canvas is the star.** The game canvas is the main focus. The HUD is supplementary.

---

## 2. Color System

### 2.1 Primary Palette (UI Chrome)

The structural skeleton — backgrounds, surfaces, borders, text. Monochromatic zinc scale.

| Token | Hex | Tailwind | Role |
|-------|-----|----------|------|
| `--bg-deep` | `#09090b` | `zinc-950` | Page background, canvas container |
| `--bg-surface` | `#18181b` | `zinc-900` | Cards, panels, sections |
| `--bg-elevated` | `#1c1c1f` | — | Hover states, active panels |
| `--border-default` | `#27272a` | `zinc-800` | Section borders, dividers |
| `--border-subtle` | `#1f1f23` | — | Inner borders, subtle separators |
| `--text-bright` | `#f4f4f5` | `zinc-100` | Primary headings, critical values |
| `--text-body` | `#a1a1aa` | `zinc-400` | Body text, labels |
| `--text-dim` | `#71717a` | `zinc-500` | Secondary labels, cooldowns |
| `--text-faint` | `#52525b` | `zinc-600` | Fine print, disabled states |

The canvas background renders at `#0a0f0a` — a deep green-black, not `#09090b`. This prevents the game world from feeling like dead void; there is always a faint green undertone hinting at the garden.

### 2.2 Semantic Accent Palette

Functional colors that communicate game state. Each accent has a specific meaning — never use them decoratively.

| Token | Hex | Tailwind | Meaning | Usage |
|-------|-----|----------|---------|-------|
| `--accent-primary` | `#fbbf24` | `amber-400` | **Attention / Action** | Wave counter, integrity fill, HUD title, buy buttons, progress fills |
| `--accent-success` | `#34d399` | `emerald-400` | **Health / Growth** | Integrity bar (healthy), steel income, grass cells, bot repair |
| `--accent-danger` | `#fb7185` | `rose-400` | **Damage / Threat** | Integrity bar (critical), enemy damage, wave banner, alarm pulse |
| `--accent-info` | `#38bdf8` | `sky-400` | **Status / Neutral** | Day cycle, scout status, cooldown timers, tooltips |
| `--accent-magic` | `#c084fc` | `violet-400` | **Special / Rare** | Magic carrot, final defense, god mode, rare events |

### 2.3 Accent Variants (Hover & Active)

| Token | Hex | Derived From |
|-------|-----|-------------|
| `--accent-primary-hover` | `#fcd34d` | `amber-300` — button hover, ring glow |
| `--accent-primary-muted` | `#78350f` | `amber-900` at 15% — amber section backgrounds |
| `--accent-success-hover` | `#6ee7b7` | `emerald-300` — pulse flash |
| `--accent-success-muted` | `#064e3b` | `emerald-900` at 15% — emerald section backgrounds |
| `--accent-danger-hover` | `#fda4af` | `rose-300` — critical pulse |
| `--accent-danger-muted` | `#881337` | `rose-900` at 30% — rose section backgrounds |
| `--accent-info-hover` | `#7dd3fc` | `sky-300` — tooltip glow |
| `--accent-info-muted` | `#0c4a6e` | `sky-900` at 15% — sky section backgrounds |
| `--accent-magic-hover` | `#d8b4fe` | `violet-300` — special pulse |
| `--accent-magic-muted` | `#4c1d95` | `violet-900` at 15% — violet section backgrounds |

### 2.4 Entity Palette (Game World)

Colors representing entities on the canvas and in the legend. Fixed identifiers — the player recognizes an entity by its color before reading its label.

| Entity | Hex | Visual Description |
|--------|-----|--------------------|
| Behemoth Base | `#2d6b3f` | Dark moss green — heart of the garden |
| Watcher Turret | `#3ea35a` | Vibrant leaf green — active defense |
| Bot Worker | `#4ea0c9` | Steel blue — mechanical, industrious |
| Enemy / Hostile | `#d65a4e` | Rust red — threat, aggression |
| Scout | `#e2a83e` | Warm amber-gold — mobile, curious |
| Bunny | `#f9a8d4` | Soft pink — gentle, non-combatant |
| Fox | `#f97316` | Orange — wild, visiting |
| Deer | `#a78b6a` | Warm brown — peaceful grazer |
| Hedgehog | `#78716c` | Stone gray — small, nocturnal |
| Owl | `#94a3b8` | Slate blue — perched, watching |
| Squirrel | `#ca8a04` | Golden brown — fast, darting |
| Wall | `#78716c` | Warm stone — structural |
| Root | `#6b7280` | Cool gray — subterranean |
| Car / House | `#64748b` | Slate — civilian, passive |
| Steel Resource | `#fbbf24` | Amber — matches primary accent |
| Grass Cell | `#14532d` | Deep green — garden foundation |
| Moss Cell | `#1a3a1a` | Darker green — early garden |
| Dirt Cell | `#2a1f14` | Dark brown — barren ground |

### 2.5 Enemy Type Visual Tokens

Each enemy archetype has a distinct color and shape identifier used in both the canvas renderer and the HUD.

| Type | Color | Glow Color | Shape | Icon |
|------|-------|------------|-------|------|
| Scout | `#60a5fa` | `#93c5fd` | Diamond | `≫` |
| Tank | `#f59e0b` | `#fcd34d` | Hexagon | `◈` |
| Artillery | `#ef4444` | `#fca5a5` | Cross | `◆` |
| Crawler | `#34d399` | `#6ee7b7` | Dot | `≋` |
| Boss | `#c084fc` | `#d8b4fe` | Pentagram | `⬡` |

### 2.6 Resource Colors

Three resource types have distinct visual identities in the HUD.

| Resource | Hex | Lore Name | Icon |
|----------|-----|-----------|------|
| Stone | `#b8a88a` | Bastion Shale | pixel-art stone PNG |
| Crystal | `#70a0e0` | Sorrowglass Shards | pixel-art crystal PNG |
| Essence | `#e8c870` | Ward-Light | pixel-art essence PNG |

### 2.7 Day/Night Cycle Colors

The day cycle has four phases with distinct ambient tints applied as the canvas renderer's final pass. HUD phase indicators use the same palette.

| Phase | Color | Hex | Canvas Composite | Description |
|-------|-------|-----|-----------------|-------------|
| Dawn | warm amber/sandy | `#F4A460` | `source-atop`, 10% alpha | Warm wash — wardstone stirs |
| Day | bright sky blue | `#87CEEB` | `source-over`, 3% alpha | Barely-there warmth |
| Dusk | dark orange | `#FF8C00` | `overlay`, 14% alpha | Deepening tension — Shroud gathers |
| Night | deep midnight | `#191970` | `multiply`, 22% alpha | Darkness absolute |

Transition gradient endpoints: start `#87CEEB` (sky) → end `#191970` (midnight).

### 2.8 Base Level Visual Identity

The base evolves visually through 4 levels. Each level has a glow color, label color, intensity, and atmospheric subtitle.

| Level | Glow Color | Label Color | Intensity | Title | Description |
|-------|-----------|-------------|-----------|-------|-------------|
| L1 | `#22c55e` | `#86efac` | 0.30 | OUTPOST | A spark in the dark |
| L2 | `#06b6d4` | `#67e8f9` | 0.55 | BASTION | Roots take hold |
| L3 | `#f59e0b` | `#fde68a` | 0.80 | FORTRESS | The Shroud recoils |
| L4 | `#ef4444` | `#fca5a5` | 1.00 | BEHEMOTH | Awakened |

L4 (BEHEMOTH) gets a 2-second ease-in-out glow pulse animation matching the renderer's ~2Hz sin wave.

### 2.9 Health Bar Color Thresholds

Both canvas health bars and HUD integrity bars use a three-zone color system:

| HP Range | Color | Hex |
|----------|-------|-----|
| >66% | Green | `#22c55e` |
| 33–66% | Amber | `#f59e0b` |
| <33% | Red | `#ef4444` |

Canvas health bars use smooth RGB-channel interpolation (green→amber→red lerp). HUD bars use hard thresholds.

### 2.10 Captain's Room Palette (DevZone)

The Captain's Room at `/dev` uses a separate visual language: CRT terminal green-on-black.

| Token | Hex | Tailwind | Role |
|-------|-----|----------|------|
| `--crt-bg` | `#000000` | `black` | Terminal background |
| `--crt-text-bright` | `#4ade80` | `green-400` | Primary text, active tab |
| `--crt-text-body` | `#22c55e` | `green-500` | Body text |
| `--crt-text-dim` | `#166534` | `green-800` | Dim text, inactive |
| `--crt-border` | `#166534` | `green-800` at 50% | Tab borders |
| `--crt-hover-text` | `#86efac` | `green-300` | Hover text |
| `--crt-hover-bg` | `#052e16` | `green-950` at 20% | Hover background |
| `--crt-selected-bg` | `#052e16` | `green-950` at 50% | Selected tab background |

The CRT palette is monochrome green. No amber, no rose, no sky — pure phosphor. This separation reinforces that the Captain's Room is a different mode from gameplay.

---

## 3. Typography System

### 3.1 Font Stack

Behemoth uses a **single monospace family** project-wide. No mixed fonts, no serif headings, no sans-serif body.

```
"Fira Code", "Cascadia Code", ui-monospace, monospace
```

Fallback chain:
1. **Fira Code** — primary. Excellent readability at small sizes, programming ligatures. Loaded from Google Fonts.
2. **Cascadia Code** — secondary. Microsoft's terminal font, good fallback for Windows users.
3. **ui-monospace** — system monospace. macOS: SF Mono. Linux: DejaVu Sans Mono or similar.
4. **monospace** — browser default. Universal safety net.

Weights loaded: 400, 500, 600, 700. No italics — terminal displays don't italicize.

### 3.2 Type Scale

All sizes in pixels. Intentionally small — this is a tactical display, not a marketing page.

| Role | Size | Weight | Tracking | Case | Example Usage |
|------|------|--------|----------|------|--------------|
| **Hero Title** | `15px` | 600 (semibold) | `0.3em` | Mixed | "BEHEMOTH" HUD header |
| **Section Header** | `10px` | 400 (normal) | `widest` (0.1em) | Uppercase | "INTEGRITY", "WAVE", "FLEET" |
| **Body Text** | `11px` | 400 (normal) | Normal | Mixed | Stat labels, descriptions |
| **Fine Print** | `9px` | 400 (normal) | Normal | Mixed | Cooldowns, tooltips, legend |
| **Monospace Values** | `11px` | 400 (normal) | Normal | — | Numbers, steel count, wave count |
| **Button Text** | `12px` | 600 (semibold) | `wider` (0.05em) | Uppercase | "BUY BOT", "PAUSE", "REGENERATE" |
| **Dev Button** | `10.5px` | 500 (medium) | `wider` (0.05em) | Uppercase | "NEXT WAVE", "GOD MODE" |
| **Inspector Tooltip** | `10px` | 400 (normal) | Normal | Mixed | "(42,18) Grass steel:12" |
| **Big Stat** | `20px` | 700 (bold) | `wider` (0.05em) | — | Integrity: "120/120" |
| **Code / Terminal** | `13px` | 400 (normal) | Normal | — | Captain's Room file viewer |

### 3.3 Numeric Display

All numeric values (steel, wave, HP, kills, cooldowns) use **tabular-nums** via `font-variant-numeric: tabular-nums`. Each digit occupies the same width so columns align. This is critical for the HUD where numbers change rapidly and should not jitter.

### 3.4 Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### 3.5 CSS Variable Declaration

```css
:root {
  --font-mono: "Fira Code", "Cascadia Code", ui-monospace, monospace;
  --font-size-hero: 15px;
  --font-size-section: 10px;
  --font-size-body: 11px;
  --font-size-fine: 9px;
  --font-size-button: 12px;
  --font-size-dev: 10.5px;
  --font-size-big-stat: 20px;
  --font-size-code: 13px;
  --tracking-hero: 0.3em;
  --tracking-section: 0.1em;
  --tracking-button: 0.05em;
}
```

---

## 4. Component Design Patterns

### 4.1 Section Containers

All UI sections follow a consistent card pattern.

**Neutral (default):**
```
rounded-md border border-zinc-800/80 bg-zinc-900/40 p-3
```

**Semantic variants:**

| Type | Background | Border |
|------|-----------|--------|
| Amber (warning/attention) | `bg-amber-950/15` | `border-amber-700/50` |
| Emerald (success/health) | `bg-emerald-950/15` | `border-emerald-900/60` |
| Rose (danger/threat) | `bg-rose-950/30` | `border-rose-900/60` |
| Sky (info/status) | `bg-sky-950/15` | `border-sky-800/50` |
| Violet (magic/special) | `bg-violet-950/15` | `border-violet-800/50` |

### 4.2 Buttons

**Primary button:**
```
flex items-center justify-center gap-1.5 h-9 rounded-md border
border-zinc-700/80 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800/80
text-[12px] tracking-wider uppercase font-semibold
```

**Dev button (amber):**
```
h-8 border-amber-800/60 bg-amber-950/25 text-amber-200
hover:bg-amber-950/40
text-[10.5px] tracking-wider uppercase font-medium
```

**Dev button (rose):**
```
h-8 border-rose-800/60 bg-rose-950/30 text-rose-200
hover:bg-rose-950/45
text-[10.5px] tracking-wider uppercase font-medium
```

**Purchase button (cost-gated):**
```
h-8 border-zinc-800 bg-zinc-900/40 text-[11px] uppercase
tracking-wider font-semibold
Can afford: border-amber-700/50 bg-amber-950/15 text-amber-200
Cannot afford: text-zinc-600 cursor-not-allowed
```

### 4.3 Progress Bars

**Track:**
```
h-1.5 rounded-full bg-zinc-800/80 overflow-hidden
```

**Fill:**
```
h-full rounded-full bg-amber-400/80 transition-[width] duration-300
box-shadow: 0 0 8px <fill-color>88
```

**Phase bar (day cycle):**
```
h-2 rounded-full bg-zinc-800/60
fill width: <progress * 100>%
fill background: lerp(gradient.start, gradient.end, progress)
fill boxShadow: 0 0 8px <fill-color>66
```

### 4.4 Stat Bars

Used in the HUD for Steel, Integrity, and watcher HP displays.

```
Container: flex items-center gap-1.5
Label: text-[10px] uppercase tracking-widest text-zinc-500
Value: text-[11px] font-mono tabular-nums text-zinc-200
Track: h-1.5 rounded-full bg-zinc-800/80 flex-1
Fill: h-full rounded-full transition-[width] duration-300
```

### 4.5 HUD Section Inventory

The HUD is a scrollable vertical stack of collapsible/conditional sections rendered as a React overlay on the right side.

Order (top to bottom):
1. **Wave Preview Panel** — current/next wave composition with enemy type icons, counts, and labels
2. **Resource HUD** — three resource counters (stone, crystal, essence) with pixel-art icons, current/cap, +rate/s
3. **Phase Indicator** — day phase label, gradient progress bar, 4 cycle dots with active glow
4. **Bot Labour HUD** — bot activity chips: HRV (amber), RTR (sky), RPR (rose), BLD (emerald), TIL (lime), IDL (zinc)
5. **Wave Counter** — "WAVE" label + current wave number, prominent amber
6. **Watchers Panel** — per-turret health bars (green→amber→red) with upgrade badges (Chassis/◈, Optics/◎, Mortar/✦)
7. **Garden Progress** — tilled cells count, dominant phase, pulse ability status
8. **Base Level Badge** — color-coded level number, identity title, kill progress bar, L4 glow pulse
9. **Integrity Bar** — base HP bar with three-zone color thresholds
10. **Game Controls** — Pause, Regenerate, Purge, Wall Placement, Legend toggle, Editor toggle buttons

### 4.6 Inspect Panel

When a turret is selected, an Inspect panel appears above the Watchers list:

- **Header:** `◈ INSPECT` + type tag (Watcher/Turret) in sky-blue
- **Identity:** `#<id>` with position `(x, y)`
- **HP bar:** Large, prominent, three-zone color
- **Combat stats grid:** Range (cells), Damage (red), Cooldown (mini progress bar)
- **Upgrade badges:** Chassis ◈, Optics ◎, Mortar ✦ — active/dimmed
- **Dismiss hint:** "ESC to dismiss" in zinc-600

Selection ring on canvas: double-ring at `#6ba4c7`, outer at 60% alpha, inner crisp at 85% alpha, 1.3× entity radius.

### 4.7 Resource Counters

Each resource counter follows a consistent pattern:

```
[icon 28×28 pixel-art] [current/cap value] [+rate/s indicator] [source text]
```

- Icon: 48×48 PNG pixel-art, displayed at 28×28, `imageRendering: pixelated`
- Current value: 16px bold, resource-specific color
- Separator: "/" in #666, 12px
- Cap value: 13px in #888
- Rate indicator: +X.X/s in #81C784 (green tint), 11px
- When atCap: counter text turns `#FFB300` (amber), "FULL" label replaces rate
- Tooltip on hover: lore name, count, flavor text, breakdown

### 4.8 Bot Labour Chips

Compact 3-letter state indicators — only states with >0 bots are shown.

| State | Label | Color | Meaning |
|-------|-------|-------|---------|
| HRV | Harvesting | `#fbbf24` | Harvesting stone |
| RTR | Returning | `#38bdf8` | Returning with stone |
| RPR | Repairing | `#fb7185` | Repairing walls |
| BLD | Building | `#34d399` | Building structures |
| TIL | Tilling | `#a3e635` | Tilling garden |
| IDL | Idle | `#71717a` | Idle |

### 4.9 Layout System

The game screen uses a two-zone layout: canvas (left/full) + HUD overlay (right).

```
┌────────────────────────────────────────┬──────────────┐
│                                        │  RESOURCES   │
│                                        │  43/200 +0.5 │
│           CANVAS (full bleed)          │              │
│                                        │  WAVE 5      │
│                                        │  ▶ NEXT      │
│                                        │              │
│                                        │  DAWN ▓▓▓▓░░ │
│                                        │  BOTS ▒ HRV 2│
│                                        │              │
│                                        │  ◈ WATCHERS 2│
│                                        │  #3 ████░░░░ │
│                                        │              │
│                                        │  GARDEN ▒ 45 │
│                                        │              │
│                                        │  LV.2 BASTION│
│                                        │              │
│                                        │  ◆ INTEGRITY │
│                                        │  120/120     │
│                                        │              │
│                                        │ [PAUSE][REGEN]│
└────────────────────────────────────────┴──────────────┘
```

**Critical rules:**
- Canvas must be anchored top-left — never float or shift with HUD content
- Canvas width must equal `COLS × CELL` (currently 128×8 = 1024px)
- HUD is `w-[300px] xl:w-[320px]` on large screens, stacks below canvas on small
- No `flex items-center justify-center` on main container
- No viewport-height-dependent canvas sizing
- In Modern UI mode (F-key), canvas goes full-bleed with no max-width, rounded corners, or border

### 4.10 Overlay System

Fixed-position elements rendered in BehemothGame.jsx:

| Element | Position | z-index |
|---------|----------|---------|
| Fullscreen indicator | bottom-right | z-50 |
| Run stats modal | inset-0 (full-screen) | z-50 |
| Hotkey reference (?) | bottom-left | z-50 |
| Debug log overlay | right side, full height | z-40 |
| DEV link | bottom-right | z-50 |
| Settings gear | bottom-left | z-50 |
| Wave banner | top-center, on canvas | (within canvas, absolute) |
| Pause overlay | inset-0, on canvas | (within canvas, absolute) |

### 4.11 DevZone / Captain's Room

Separate route (`/dev`). CRT green-on-black with scanlines overlay, radial vignette, and monospace terminal aesthetic.

Eight tabs: mainframe, log, terminal, files, kanban, features, chat, bridge.

Tab styling:
- Inactive: `text-green-600 hover:text-green-300 hover:bg-green-950/20`
- Active: `text-green-400 bg-green-950/50 border-green-800/50`

New features must be added as tabs, not floating buttons or overlays.

---

## 5. Canvas Rendering Conventions

### 5.1 Canvas Configuration

- Dimensions: 1024×1024 pixels
- Grid: 128×128 cells at CELL=8px
- Resolution: 1:1 device pixel ratio (no HiDPI scaling — keeps rendering fast)
- Background: `#0a0f0a` (deep green-black)
- Target: 60 FPS via requestAnimationFrame

### 5.2 Render Pipeline Order

The canvas draw order is strictly back-to-front:

1. **Background** — terrain fill + tactical grid + radial vignette + ambient dust motes
2. **Stone harvest zones** — rocky terrain patches on harvestable cells (below base/walls)
3. **Base** — the Behemoth wardstone at center, size scales with level
4. **Base ambient particles** — amber-gold motes drifting upward (cyan when shield active)
5. **Walls** — stone structures drawn at their world positions
6. **Enemies** — all hostile entities with type-specific shapes and colors
7. **Turrets / Watchers** — defensive structures with mounted indicators
8. **Bots** — worker units drawn at their world positions
9. **Selection ring** — double-ring at `#6ba4c7` around selected turret
10. **Death particles** — type-colored outward-expanding particles from killed enemies
11. **Crystal drops** — amber/gold gem shards arcing upward from dead enemies
12. **Boss shockwaves** — expanding ring from boss siege arrival
13. **Day/night ambient overlay** — full-canvas tint with composite blending

This order ensures: terrain is always behind entities, particles render on top of all game objects, and the day/night tint is the final visual pass.

### 5.3 Background Layer

The background establishes the "beautiful desolation" aesthetic:

- **Layer 1:** Terrain fill `#0a0f0a` (deep green-black earth)
- **Layer 2:** Tactical grid — green-500 lines at `rgba(34, 197, 94, 0.02–0.08)` depending on night factor. Day: 2% alpha, Night: 8% alpha.
- **Layer 3:** Radial vignette — darkness at edges, brightness at center (base). Intensity: 0.55 day → 0.90 night.
- **Layer 4:** Ambient dust motes — tiny slow-drifting particles, deterministic per-tick. Color: `rgba(180, 200, 180, 0.08–0.22)`.

### 5.4 Entity Health Bars (Canvas)

Health bars are drawn above entities in world space:

- Bar width: 1.6× entity size (cells × scale)
- Bar height: max(2px, scale × 0.25)
- Position: 0.7× entity size above center
- Background track: `rgba(0, 0, 0, 0.55)`
- Fill: smooth RGB lerp green → amber → red
- Border: `rgba(255, 255, 255, 0.1)`, 0.5px width

### 5.5 Enemy Rendering

Each enemy type has a distinct shape drawn in its type color:

| Type | Shape | Size (cells) |
|------|-------|-------------|
| Scout | Diamond | 0.8 |
| Tank | Hexagon | 1.2 |
| Artillery | Cross | 1.0 |
| Crawler | Dot (circle) | 0.4 |
| Boss | Pentagram | 2.0 |

### 5.6 Particle Systems

All particle systems are deterministic per-tick (no `Math.random()` drift across frames) and have hard caps to prevent unbounded growth.

| System | Color | Lifespan | Cap | Behavior |
|--------|-------|----------|-----|----------|
| Base ambient motes | `#fbbf24` (amber) / `#22d3ee` (cyan shield) | 60 ticks | 80 particles | Drift upward from base perimeter, fade in first 20% then out over last 40% |
| Death particles | Per enemy type color | 30 ticks | — | Outward expansion + ring shockwave |
| Crystal drops | `#fbbf24` (amber/gold) | 45 ticks | — | Arc upward-outward, settle and fade |
| Boss shockwave | `#c084fc` (violet) tint | 30 ticks | Per-boss | Expanding ring from boss position |
| Crawler trails | `#34d399` (emerald) fade | 8 ticks | Per-crawler | Fading dots behind crawler, skitter effect |

### 5.7 Day/Night Overlay (Final Pass)

The day/night overlay is the final canvas drawing operation. It applies a full-canvas tint using Canvas `globalCompositeOperation`:

| Phase | Composite Mode | Alpha | Color |
|-------|---------------|-------|-------|
| Dawn | `source-atop` | 0.10 | `#F4A460` |
| Day | `source-over` | 0.03 | `#FFF8E7` |
| Dusk | `overlay` | 0.14 | `#FF6B35` |
| Night | `multiply` | 0.22 | `#0a0a20` |

Night adds a secondary radial vignette (`multiply`, 35% max) to deepen edges. Transitions use a 300-tick (5s) smooth blend with color channel lerp between adjacent phases.

---

## 6. Animation & Transition Guidelines

### 6.1 Design Principles for Animation

- **Purpose-driven.** Every animation communicates something: damage taken, resource gained, phase changed. No decorative motion.
- **Fast and crisp.** Transitions complete in 200–300ms. Particles live 0.5–1.0 seconds. No slow fades.
- **Deterministic.** Particle positions and behavior derive from tick + seed, not `Math.random()`. This ensures game replays would render identically.
- **GPU-friendly.** Use `requestAnimationFrame`, `globalCompositeOperation`, and CSS `transform`/`opacity` transitions. Avoid layout-triggering animations.

### 6.2 CSS Transitions

| Element | Property | Duration | Easing |
|---------|----------|----------|--------|
| Progress bar fills | `width` | `duration-300` (300ms) | default (ease) |
| Phase dots | `background, box-shadow, transform` | 0.7s, 0.7s, 0.3s | ease |
| Button hover | background | implicit (~150ms) | default |
| Resource counter hover | background | 0.2s | default |

### 6.3 CSS Keyframe Animations

**L4 (BEHEMOTH) pulse glow:**
```css
@keyframes bl-pulse-L3 {
  0%, 100% { box-shadow: 0 0 6px <glow>55, inset 0 0 12px <glow>18; }
  50%      { box-shadow: 0 0 14px <glow>88, inset 0 0 22px <glow>2a; }
}
```
Duration: 2s, easing: ease-in-out, iteration: infinite. Matches the renderer's `sin(tick * 0.05)` ~2Hz frequency.

### 6.4 Canvas Animations (Tick-Based)

All canvas animations are driven by `sim.tick` (increments once per frame at 60fps):

| Animation | Tick-Based Formula | Duration |
|-----------|-------------------|----------|
| Death particles | Outward expansion: `radius = speed * age` | 30 ticks (0.5s) |
| Crystal drops | Arc: `x += cos(angle)*speed`, `y += sin(angle)*speed`, settle with `alpha *= 0.97` | 45 ticks (0.75s) |
| Boss shockwave | Ring: `radius = 1.5 + age * 0.6` cells | 30 ticks (0.5s) |
| Base motes | Drift: `x += cos(angle)*speed`, `y += sin(angle)*speed` | 60 ticks (1.0s) |
| Day phase transition | `phaseBlend = timer / transitionTicks` (300 ticks = 5s) | 300 ticks (5s) |
| L4 glow | `alpha = 0.5 + 0.5 * sin(tick * 0.05)` | Continuous (~2Hz) |
| Damage flash | White flash → entity color fade | ~8 ticks (0.13s) |

### 6.5 State Transition Patterns

**Wave banner:**
- On wave start: banner appears top-center, 2-second dissolve
- Active wave: "⚡ Spawning" pulse label
- Between waves: "▶ Next" static label with next wave composition

**Phase transitions:**
- Cross-fade between adjacent phases using `phaseBlend` (0→1 over 5 seconds)
- Color channels lerp: `R, G, B, alpha` interpolated between from and to phase
- Composite mode switches at `blend > 0.5`

**Health changes:**
- Canvas health bars smoothly interpolate RGB channels (green→amber→red)
- HUD integrity bar uses CSS `transition: width 300ms`

---

## 7. Accessibility Considerations

### 7.1 Semantic HTML & ARIA

All UI panels use semantic elements with ARIA annotations:

```jsx
// Panel regions
<div role="region" aria-label="Wave Preview">...</div>
<div role="region" aria-label="Resources">...</div>
<div role="region" aria-label="Base Integrity">...</div>
<div role="region" aria-label="Watchers">...</div>

// Interactive toggles
<button
  role="switch"
  aria-checked={enabled}
  aria-label={enabled ? 'Mute sound' : 'Unmute sound'}
  title="Mute sound (M)"
>...</button>

// Resource counters
<div
  role="button"
  tabIndex={0}
  aria-label="Bastion Shale: 43 of 200"
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
>...</div>
```

### 7.2 Keyboard Navigation

- **Escape:** Deselect turret / dismiss Inspect panel / cancel wall placement mode
- **Right-click:** Cancel wall placement mode
- **Tab / Enter / Space:** Navigate and activate resource counters
- **M:** Mute/unmute sound
- **F:** Toggle Modern UI (fullscreen overlay)
- **H:** Toggle old fullscreen
- **Ctrl+D:** Toggle dev overlay
- **Ctrl+Shift+P:** Toggle performance dashboard

### 7.3 Color & Contrast

- **No color-only communication.** Every color-coded element has a text label or icon. Enemy types have shapes + colors + labels. Health bars have numeric values alongside color fills.
- **Minimum contrast ratios:** Text on backgrounds maintains at least 4.5:1 for body text (~`#a1a1aa` on `#18181b` = 6.3:1) and 3:1 for large text.
- **Critical alerts use redundant cues:** Base alarm has both visual (red pulse ring) and auditory (sonar ping) feedback. Wave start has both a banner and ambient overlay changes.
- **Never pure white text.** Brightest is `#f4f4f5` (zinc-100). Pure white (`#ffffff`) is too harsh on the dark background.

### 7.4 Reduced Motion

While not implemented as a toggle, all animations are purpose-driven and brief:
- CSS transitions complete in ≤700ms
- Particle effects are atmospheric, not informational — losing them would not impair gameplay
- No infinite-spin loading spinners
- No parallax or scroll-driven animations

Future implementation should add a `prefers-reduced-motion` media query that:
- Replaces CSS transitions with instant changes
- Suppresses L4 pulse animation
- Reduces particle count in base ambient motes
- Sets all transition durations to 0

### 7.5 Text & Readability

- Monospace font with clear letterforms at small sizes (Fira Code tested down to 9px)
- `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` for crisp rendering
- Uppercase section headers with wide tracking (`0.1em`) for scanability
- Tabular numbers prevent column jitter during rapid value changes
- Tooltips provide expanded descriptions on hover

### 7.6 Screen Reader Support

- All dynamic content updates use `aria-live="polite"` regions where appropriate
- Storage cap warnings announce via `aria-live="polite"`
- Sound toggle state communicated via `aria-checked` on `role="switch"`
- ARIA labels on all interactive elements include current values, not just static names

---

## 8. Spacing & Layout Tokens

Consistent spacing creates visual rhythm. All spacing uses a 4px base unit.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Icon gap, tight inline |
| `--space-sm` | `8px` | Button internal padding, small gaps |
| `--space-md` | `12px` | Section padding (`p-3`), card gutters |
| `--space-lg` | `16px` | Section gaps, panel margins |
| `--space-xl` | `20px` | HUD section spacing (`space-y-5`) |
| `--space-2xl` | `24px` | Major layout gaps |
| `--radius-sm` | `4px` | Small elements, badges |
| `--radius-md` | `6px` | Cards, panels, sections (`rounded-md`) |
| `--radius-lg` | `8px` | Canvas border, large containers |
| `--radius-full` | `9999px` | Progress bar tracks, pill badges |

---

## 9. Visual Hierarchy

The HUD is parsed in a specific order. The player's eye should be drawn:

1. **Wave counter** — amber, largest numbers — "what's happening right now?"
2. **Integrity bar** — amber/green/red fill, animated — "am I about to die?"
3. **Resources (Stone/Crystal/Essence)** — resource-colored counters — "can I afford to build?"
4. **Day Cycle** — phase label + progress bar + dots — "what time is it?"
5. **Bot Activity** — color-coded chips — "what are my workers doing?"
6. **Fleet / Watchers** — zinc labels with health bars — "what do I have deployed?"
7. **Garden / Base Level** — secondary status indicators
8. **Legend / Fine Print** — zinc-600, smallest text — reference only

Critical information is **amber**, prominent, and always visible. Supplementary information recedes into zinc. Decorative chrome (borders, dividers) uses the dimmest zinc tones.

---

## 10. Anti-Patterns

These patterns are explicitly forbidden in Behemoth's visual design:

- **No gradients on UI chrome.** Flat colors. The game canvas provides depth.
- **No box shadows on HUD elements.** The dark background provides natural contrast.
- **No rounded corners >8px on UI panels.** Brutalist. Not soft.
- **No serif or sans-serif fonts anywhere.** Monospace only.
- **No color mixing across semantic boundaries.** Amber alert + rose border = confused signal.
- **No white text (`#ffffff`).** Brightest text is `#f4f4f5` (zinc-100). Pure white is too harsh.
- **No pure black (`#000000`) for game UI.** Use `#09090b`. Pure black is reserved for CRT terminal.
- **No opacity-based text dimming.** Use actual zinc scale values. Opacity causes compositing issues.
- **No light theme.** Behemoth is always dark. A "Tactical Night" variant (dimmer) is opt-in.
- **No decorative animations.** Every motion communicates state change.
- **No modals except Run Stats and Settings.** Everything else is inline or overlay.
- **No vertical centering of canvas.** The canvas is anchored top-left.
- **No viewport-height-dependent canvas sizing.** Canvas width is fixed at `COLS × CELL`.

---

## 11. Visual Spec Summary

| Category | Count | Key Decisions |
|----------|-------|--------------|
| Base UI colors | 9 | Monochromatic zinc scale, `#09090b` → `#f4f4f5` |
| Semantic accents | 5 | Amber, Emerald, Rose, Sky, Violet — strict semantics |
| Accent variants | 10 | Hover + muted for each accent |
| Entity colors | 18 | Earth tones + military colors + NPC neutrals |
| Enemy type tokens | 5 | Color + shape + icon per archetype |
| Resource colors | 3 | Stone `#b8a88a`, Crystal `#70a0e0`, Essence `#e8c870` |
| Day cycle colors | 4 | Phase-specific tints with composite blending |
| Level visuals | 4 | Green → Cyan → Amber → Red progression |
| CRT colors | 8 | Monochrome green phosphor palette |
| Font family | 1 | Fira Code → Cascadia Code → ui-monospace → monospace |
| Type sizes | 10 | 9px fine print → 20px big stat |
| Spacing tokens | 6 | 4px base unit, 4px → 24px |
| Border radii | 4 | 4px → 9999px (full round for pills) |
| Component patterns | 10 | Section, button, progress, stat, HUD, inspect, resource, labour, layout, overlay |
| Canvas render passes | 13 | Strictly ordered back-to-front pipeline |
| Particle systems | 5 | Base motes, death, crystal, boss shockwave, crawler trails |
| Animation systems | 9 | 3 CSS transitions, 2 keyframe, 7 tick-based canvas |
| Accessibility rules | 7 | ARIA, keyboard, contrast, reduced motion, readability, screen readers, redundant cues |
| Anti-patterns | 14 | Explicitly forbidden visual choices |

**Total: 25 palettes/colors, 1 font family, 10 type sizes, 13 render passes, 5 particle systems, 9 animation systems, 7 accessibility rules.** This spec covers every visual element in the Behemoth game canvas, HUD, and Captain's Room.

---

## 12. Implementation Notes

### 12.1 CSS Variable Master Declaration

The complete CSS custom properties for the design system are in `frontend/src/styles/theme.css`. This file is the single source of truth for all color, typography, and spacing tokens.

### 12.2 Config-Driven Visuals

Several visual systems are driven by `config.js` constants, allowing designers to tune without touching render code:

- `LEVEL.VISUAL[]` — base level glow color, intensity, label color
- `DAY_CYCLE.colors` — phase indicator colors and gradient endpoints
- `DAY_CYCLE.phaseDurations` — phase timing (renderer reads these for night factor)
- `RESOURCE` — resource caps, rates, and the drop table structure
- `ENEMY` — enemy HP, speed, damage, size (affects render sizes)

### 12.3 Render Module Organization

The canvas renderer is split into focused modules under `frontend/src/sim/render/`:

| Module | Purpose |
|--------|---------|
| `background.js` | Terrain, grid, vignette, dust motes, stone zones |
| `entities.js` | Enemies, turrets, bots, walls, death particles, crystal drops, boss shockwaves, damage flash, crawler trails, base drawing |
| `hud.js` | Canvas health bars, selection ring, day/night overlay |
| `effects.js` | Base ambient particle system |

### 12.4 Updating This Spec

When visual changes are made:
1. Update the relevant config values in `config.js` (for data-driven visuals)
2. Update `theme.css` for new CSS variables or palette changes
3. Update this document to reflect the change
4. If a new component pattern is established, add it to Section 4
5. If a new animation is introduced, document it in Section 6

---

## 13. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-21 | Aphrodite | Initial spec: colors, typography, spacing, anti-patterns |
| 2.0 | 2026-06-23 | Athena | Added: component patterns, canvas rendering conventions, animation guidelines, accessibility, entity tokens, resource colors, day cycle palette, level visuals, bot labour, render pipeline, particle systems, implementation notes |
