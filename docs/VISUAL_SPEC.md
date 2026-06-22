# Behemoth — Game HUD Visual Design Spec

_Aphrodite — Visual Design Domain_
_Version 1.0 — 2026-06-21_

---

## 1. Design Philosophy

Behemoth is an autonomous tower defense simulator. Its HUD should feel like a military command terminal — industrial, tactical, and atmospheric. The visual language draws from three reference points:

1. **Military HUD overlays** — high-contrast amber on black, monospace readouts, tactical brevity
2. **CRT terminal aesthetic** — green phosphor glow in the Captain's Room, scanlines, slight bloom
3. **Brutalist minimalism** — no gradients, no rounded corners on chrome, raw zinc surfaces

The HUD is **supplementary** — the game canvas is the star. Never let UI chrome overpower the game world.

---

## 2. Color System

### 2.1 Primary Palette (UI Chrome)

The structural skeleton of the interface — backgrounds, surfaces, borders, text.

| Token | Hex | Tailwind | Role |
|-------|-----|----------|------|
| `--bg-deep` | `#09090b` | `zinc-950` | Page background, canvas background |
| `--bg-surface` | `#18181b` | `zinc-900` | Cards, panels, sections |
| `--bg-elevated` | `#1c1c1f` | — | Hover states, active panels |
| `--border-default` | `#27272a` | `zinc-800` | Section borders, dividers |
| `--border-subtle` | `#1f1f23` | — | Inner borders, subtle separators |
| `--text-bright` | `#f4f4f5` | `zinc-100` | Primary headings, critical values |
| `--text-body` | `#a1a1aa` | `zinc-400` | Body text, labels |
| `--text-dim` | `#71717a` | `zinc-500` | Secondary labels, cooldowns |
| `--text-faint` | `#52525b` | `zinc-600` | Fine print, disabled states |

**8 base colors.** This is a monochromatic zinc scale from near-black to near-white. All UI chrome lives within this scale. The game canvas renders at `#0a0c10` — a hair bluer than `#09090b` to prevent the game world from feeling like dead void.

### 2.2 Accent Palette (Meaning & State)

Functional colors that communicate game state to the player. Each accent has a specific semantic meaning — never use them decoratively.

| Token | Hex | Tailwind | Meaning | Usage |
|-------|-----|----------|---------|-------|
| `--accent-primary` | `#fbbf24` | `amber-400` | **Attention / Action** | Wave counter, integrity bar, HUD title, buy buttons, progress fills |
| `--accent-success` | `#34d399` | `emerald-400` | **Health / Growth** | Integrity bar (healthy), steel income, grass cells, bot repair |
| `--accent-danger` | `#fb7185` | `rose-400` | **Damage / Threat** | Integrity bar (critical), enemy damage, wave banner (combat), alarm pulse |
| `--accent-info` | `#38bdf8` | `sky-400` | **Status / Neutral** | Day cycle, scout status, cooldown timers, tooltips |
| `--accent-magic` | `#c084fc` | `violet-400` | **Special / Rare** | Magic carrot, final defense, god mode, dev shortcuts |

**5 semantic accents.** Each has a clear emotional read: amber demands attention, emerald reassures, rose warns, sky informs, violet intrigues. Never cross semantic boundaries — don't use emerald for a delete button or rose for a resource counter.

### 2.3 Accent Variants (Hover & Active)

Every accent gets a lighter hover variant and a dimmer muted variant for backgrounds.

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

Colors that represent entities on the canvas and in the legend. These are fixed identifiers — the player should recognize an entity by its color before reading its label.

| Entity | Hex | Visual |
|--------|-----|--------|
| Behemoth Base | `#2d6b3f` | Dark moss green — the heart of the garden |
| Watcher Turret | `#3ea35a` | Vibrant leaf green — active defense, alive |
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

**19 game entities mapped.** The entity palette uses earth tones and military colors — greens for garden life, blues for mechanical units, reds for enemies, warm neutrals for NPCs. Muted saturation keeps entities grounded in the game world.

### 2.5 Captain's Room Palette (DevZone)

The Captain's Room at `/dev` uses a completely separate visual language: CRT terminal green-on-black.

| Token | Hex | Tailwind | Role |
|-------|-----|----------|------|
| `--crt-bg` | `#000000` | `black` | Terminal background |
| `--crt-text-bright` | `#4ade80` | `green-400` | Primary text, active tab |
| `--crt-text-body` | `#22c55e` | `green-500` | Body text |
| `--crt-text-dim` | `#166534` | `green-800` | Dim text, inactive |
| `--crt-border` | `#166534` | `green-800` at 50% | Tab borders |
| `--crt-hover` | `#86efac` | `green-300` | Hover text |
| `--crt-hover-bg` | `#052e16` | `green-950` at 20% | Hover background |
| `--crt-selected-bg` | `#052e16` | `green-950` at 50% | Selected tab background |

The CRT palette is monochrome green. No amber, no rose, no sky — pure phosphor. This separation reinforces that the Captain's Room is a different mode from gameplay.

---

## 3. Typography System

### 3.1 Font Stack

Behemoth uses a **single monospace family** project-wide. No mixed fonts, no serif headings, no sans-serif body. Consistency is the aesthetic.

```
"Fira Code", "Cascadia Code", ui-monospace, monospace
```

Fallback chain reasoning:
1. **Fira Code** — primary. Excellent readability at small sizes, programming ligatures, wide language support. Loaded from Google Fonts.
2. **Cascadia Code** — secondary. Microsoft's terminal font, slightly wider, good fallback for Windows users who have it installed.
3. **ui-monospace** — system monospace. macOS: SF Mono. Linux: DejaVu Sans Mono or similar.
4. **monospace** — browser default. Universal safety net.

### 3.2 Type Scale

All sizes in pixels. The scale is intentionally small — this is a tactical display, not a marketing page.

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

All numeric values (steel, wave, HP, kills, cooldowns) use **tabular-nums** — each digit occupies the same width so columns align. This is critical for the HUD where numbers change rapidly and should not jitter.

### 3.4 Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Weights loaded: 400, 500, 600, 700. No italics — terminal displays don't italicize.

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

## 4. Spacing & Layout Tokens

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

## 5. Dark Theme Definition

Behemoth is **always dark**. There is no light theme. The dark theme is the only theme.

### 5.1 Why No Light Theme

A tower defense game played at night benefits from a dark interface:
- **Reduced eye strain** during long sessions
- **Canvas immersion** — the game world feels larger when the UI recedes
- **CRT authenticity** — the Captain's Room terminal would look absurd with a white background
- **Focus** — bright UI elements (amber alerts, red damage) pop against dark chrome

### 5.2 Dark Theme Variant: "Tactical Night"

For situations requiring even lower brightness (e.g., player explicitly dims display), a "Tactical Night" variant shifts all values down:

| Token | Default | Tactical Night |
|-------|---------|---------------|
| `--bg-deep` | `#09090b` | `#050508` |
| `--bg-surface` | `#18181b` | `#0f0f12` |
| `--bg-elevated` | `#1c1c1f` | `#121216` |
| `--accent-primary` | `#fbbf24` | `#b45309` (amber-700 — reduced luminance) |
| `--text-bright` | `#f4f4f5` | `#d4d4d8` (zinc-300) |
| `--text-body` | `#a1a1aa` | `#71717a` (zinc-500) |

Tactical Night is **opt-in** via a settings toggle. It trades contrast for comfort — dimmer accents, darker backgrounds, less visual energy.

### 5.3 Section Background Variants

Colored sections (amber, emerald, rose) use translucent backgrounds to maintain the dark base:

| Section Type | Background | Border |
|-------------|-----------|--------|
| Neutral (default) | `#18181b` at 40% (`bg-zinc-900/40`) | `#27272a` at 80% (`border-zinc-800/80`) |
| Amber (warning/attention) | `#78350f` at 15% (`bg-amber-950/15`) | `#b45309` at 50% (`border-amber-700/50`) |
| Emerald (success/health) | `#064e3b` at 15% (`bg-emerald-950/15`) | `#065f46` at 60% (`border-emerald-900/60`) |
| Rose (danger/threat) | `#881337` at 30% (`bg-rose-950/30`) | `#9f1239` at 60% (`border-rose-900/60`) |
| Sky (info/status) | `#0c4a6e` at 15% (`bg-sky-950/15`) | `#075985` at 50% (`border-sky-800/50`) |
| Violet (magic/special) | `#4c1d95` at 15% (`bg-violet-950/15`) | `#6b21a8` at 50% (`border-violet-800/50`) |

---

## 6. Visual Hierarchy

The HUD is parsed in a specific order. The player's eye should be drawn:

1. **Wave counter** — amber, large, top of HUD — "what's happening right now?"
2. **Integrity bar** — amber/green/rose fill, animated — "am I about to die?"
3. **Resources (Steel)** — amber progress bar — "can I afford to build?"
4. **Day Cycle** — sky icon + text — "what time is it in the garden?"
5. **Fleet / Build** — zinc labels with entity-colored dots — "what do I have deployed?"
6. **Legend / Fine Print** — zinc-600, smallest text — reference only

Critical information is **amber**, prominent, and always visible. Supplementary information recedes into zinc. Decorative chrome (borders, dividers) uses the dimmest zinc tones.

---

## 7. CSS Variable Master Declaration

For implementation. Drop this into the root stylesheet.

```css
:root {
  /* === Primary Palette (UI Chrome) === */
  --bg-deep: #09090b;
  --bg-surface: #18181b;
  --bg-elevated: #1c1c1f;
  --border-default: #27272a;
  --border-subtle: #1f1f23;
  --text-bright: #f4f4f5;
  --text-body: #a1a1aa;
  --text-dim: #71717a;
  --text-faint: #52525b;

  /* === Accent Palette (Meaning & State) === */
  --accent-primary: #fbbf24;      /* amber-400 — attention, action */
  --accent-success: #34d399;      /* emerald-400 — health, growth */
  --accent-danger: #fb7185;       /* rose-400 — damage, threat */
  --accent-info: #38bdf8;         /* sky-400 — status, neutral */
  --accent-magic: #c084fc;        /* violet-400 — special, rare */

  /* === Accent Variants === */
  --accent-primary-hover: #fcd34d;
  --accent-primary-muted: #78350f;
  --accent-success-hover: #6ee7b7;
  --accent-success-muted: #064e3b;
  --accent-danger-hover: #fda4af;
  --accent-danger-muted: #881337;
  --accent-info-hover: #7dd3fc;
  --accent-info-muted: #0c4a6e;
  --accent-magic-hover: #d8b4fe;
  --accent-magic-muted: #4c1d95;

  /* === Entity Palette === */
  --entity-base: #2d6b3f;
  --entity-watcher: #3ea35a;
  --entity-bot: #4ea0c9;
  --entity-enemy: #d65a4e;
  --entity-scout: #e2a83e;
  --entity-bunny: #f9a8d4;
  --entity-fox: #f97316;
  --entity-deer: #a78b6a;
  --entity-hedgehog: #78716c;
  --entity-owl: #94a3b8;
  --entity-squirrel: #ca8a04;
  --entity-wall: #78716c;
  --entity-root: #6b7280;
  --entity-car: #64748b;
  --entity-steel: #fbbf24;
  --entity-grass: #14532d;
  --entity-moss: #1a3a1a;
  --entity-dirt: #2a1f14;

  /* === Captain's Room (CRT) === */
  --crt-bg: #000000;
  --crt-text-bright: #4ade80;
  --crt-text-body: #22c55e;
  --crt-text-dim: #166534;
  --crt-border: #166534;
  --crt-hover-text: #86efac;
  --crt-hover-bg: #052e16;
  --crt-selected-bg: #052e16;

  /* === Typography === */
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

  /* === Spacing === */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}
```

---

## 8. Usage Quick Reference

### 8.1 When To Use Each Accent

```
AMBER  →  Wave counter, integrity bar (fill), HUD title,
          buy buttons, progress fills, steel resource,
          active tab indicator, pulse animations

EMERALD→  Integrity bar (healthy state), steel income spark,
          grass growth indicator, bot repair notification,
          "Regenerate" button

ROSE   →  Integrity bar (critical/damaged), enemy damage flash,
          wave banner (combat phase), alarm pulse from base,
          "Purge All" button, delete/destroy actions

SKY    →  Day cycle indicator, scout status, cooldown timers,
          tooltips, neutral information, "Pause" button

VIOLET →  Magic carrot, Final Defense protocol, God Mode,
          dev shortcuts, special abilities, rare events
```

### 8.2 When NOT To Use Each Accent

```
AMBER  →  Never for enemy indicators (use rose)
          Never for health/growth (use emerald)
          Never for passive information (use zinc)

EMERALD→  Never for danger/warnings (use rose)
          Never for primary action (use amber)

ROSE   →  Never for positive states (use emerald)
          Never for neutral info (use sky)
          Never for resource gain (use emerald)

SKY    →  Never for urgent alerts (use amber or rose)
          Never for interactive elements (use amber)

VIOLET →  Never for common gameplay actions
          Never for enemy indicators
          Reserve for genuinely rare/special events
```

---

## 9. Anti-Patterns

- **No gradients on UI chrome.** Flat colors. The game canvas provides depth.
- **No box shadows on HUD elements.** The dark background provides natural contrast.
- **No rounded corners >6px on UI panels.** Brutalist. Not soft.
- **No serif or sans-serif fonts anywhere.** Monospace only.
- **No color mixing across semantic boundaries.** Amber alert + rose border = confused signal.
- **No white text (#ffffff).** Brightest text is `#f4f4f5` (zinc-100). Pure white is too harsh.
- **No pure black (#000000) for game UI.** Use `#09090b`. Pure black is reserved for the CRT terminal background.
- **No opacity-based text dimming.** Use actual zinc scale values. Opacity causes compositing issues over dark backgrounds.

---

## 10. Visual Spec Summary

| Category | Count | Key Decisions |
|----------|-------|--------------|
| Base UI colors | 9 | Monochromatic zinc scale, #09090b → #f4f4f5 |
| Semantic accents | 5 | Amber, Emerald, Rose, Sky, Violet — strict semantics |
| Accent variants | 10 | Hover + muted for each accent |
| Entity colors | 19 | Earth tones for garden, military blues, enemy reds |
| CRT colors | 8 | Monochrome green phosphor |
| Font family | 1 | Fira Code → Cascadia Code → ui-monospace → monospace |
| Type sizes | 10 | 9px fine print → 20px big stat |
| Spacing tokens | 6 | 4px base unit, 4px → 24px |
| Border radii | 4 | 4px → 9999px (full round for pills) |

**Total: 25 colors across all palettes, 1 font family, 10 type sizes.** This spec covers every visual element in the Behemoth HUD, game canvas, and Captain's Room.
