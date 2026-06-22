/**
 * render.js — Canvas rendering for Behemoth game entities.
 *
 * Pure rendering functions that take a CanvasRenderingContext2D and
 * sim state, called from the React canvas component (BehemothGame.jsx).
 *
 * Domain: Hephaestus (engine-side rendering math)
 * Visual styling: Aphrodite (colors, fonts, animation feel)
 */

import { BASE, LEVEL, DAY_CYCLE } from './config.js';

// ═══════════════════════════════════════════════════════════════════════
// COLOR HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a hex color string to an rgba() CSS color.
 *
 * @param {string} hex — '#rrggbb' or '#rgb'
 * @param {number} alpha — 0.0–1.0
 * @returns {string} 'rgba(r, g, b, a)'
 */
export function hexToRgba(hex, alpha) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ═══════════════════════════════════════════════════════════════════════
// LABEL FORMATTING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Return a CSS font string for a base level label style.
 *
 * @param {string} style — 'normal' | 'bold' | 'bracketed' | 'pulsing'
 * @returns {string} e.g. 'bold 10px "Courier New", monospace'
 */
export function formatLabelFont(style) {
  switch (style) {
    case 'bold':
    case 'pulsing':
      return 'bold 10px "Courier New", monospace';
    case 'normal':
    case 'bracketed':
    default:
      return '9px "Courier New", monospace';
  }
}

/**
 * Format label text with level-appropriate decoration.
 *
 * @param {string} style — 'normal' | 'bold' | 'bracketed' | 'pulsing'
 * @param {string} label — raw label string (e.g. 'SAPLING')
 * @returns {string} formatted label
 */
export function formatLabelText(style, label) {
  switch (style) {
    case 'bracketed':
      return `[ ${label} ]`;
    case 'pulsing':
      return `\u25C6 ${label} \u25C6`;   // ◆ BEHEMOTH ◆
    case 'normal':
    case 'bold':
    default:
      return label;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BACKGROUND DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw atmospheric background: dark terrain, tactical grid, radial vignette.
 *
 * Establishes the "beautiful desolation" aesthetic — a dark tactical display
 * with a barely-visible green grid and soft radial lighting centered on the base.
 * The grid and vignette respond to the day/night cycle: the grid glows softly
 * during night phases and dims during day, while the vignette deepens at night.
 *
 * Called once per frame before all entity drawing (pre-fog).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW — canvas pixel width
 * @param {number} canvasH — canvas pixel height
 * @param {object} sim — sim state (reads sim.baseCenter, sim.tick, sim.hud)
 * @param {number} scale — pixels per cell
 */
export function drawBackground(ctx, canvasW, canvasH, sim, scale) {
  const { baseCenter, tick = 0, hud } = sim;
  const cx = (baseCenter?.x ?? 0) * scale;
  const cy = (baseCenter?.y ?? 0) * scale;

  // ── Night factor for phase-responsive visuals ────────────────────
  // 0.0 = broad daylight, 1.0 = deepest night
  let nightFactor = 0.5;
  if (hud?.dayPhase) {
    const phaseWeights = { dawn: 0.3, day: 0.0, dusk: 0.7, night: 1.0 };
    const baseWeight = phaseWeights[hud.dayPhase] ?? 0.5;
    // Blend toward next phase if transition is active
    const blend = hud.phaseBlend ?? 0;
    const phaseIdx = DAY_CYCLE.phaseOrder.indexOf(hud.dayPhase);
    const nextPhase = DAY_CYCLE.phaseOrder[(phaseIdx + 1) % 4];
    const nextWeight = phaseWeights[nextPhase] ?? 0.5;
    nightFactor = baseWeight + (nextWeight - baseWeight) * blend;
  }

  // ── Layer 1: base terrain fill ──────────────────────────────────
  ctx.save();
  ctx.fillStyle = '#0a0f0a';  // deep green-black earth
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();

  // ── Layer 2: subtle tactical grid ───────────────────────────────
  // Thin monospace-green lines at cell intervals — like a comms overlay.
  // Grid alpha pulses very gently with the day/night cycle.
  const gridAlpha = 0.02 + nightFactor * 0.06;  // 0.02 day → 0.08 night
  const gridColor = `rgba(34, 197, 94, ${gridAlpha})`;  // green-500
  const cellSize = scale;  // one grid cell per game cell

  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;

  // Vertical grid lines
  for (let x = cellSize; x < canvasW; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }

  // Horizontal grid lines
  for (let y = cellSize; y < canvasH; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
  ctx.restore();

  // ── Layer 3: radial vignette ────────────────────────────────────
  // Darkens toward canvas edges, softens toward the base center.
  // Night deepens the vignette — edges become nearly black.
  const vignetteIntensity = 0.55 + nightFactor * 0.35;  // 0.55 day → 0.90 night
  const maxDim = Math.max(canvasW, canvasH);

  ctx.save();
  const vignette = ctx.createRadialGradient(
    cx, cy, maxDim * 0.15,   // inner: bright zone around base
    cx, cy, maxDim * 0.75     // outer: dark edge
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.35, `rgba(0, 0, 0, ${vignetteIntensity * 0.15})`);
  vignette.addColorStop(0.7, `rgba(0, 0, 0, ${vignetteIntensity * 0.6})`);
  vignette.addColorStop(1, `rgba(0, 0, 0, ${vignetteIntensity})`);

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();

  // ── Layer 4: ambient dust motes ─────────────────────────────────
  // Tiny, slow-drifting particles in the darker zones — adds depth.
  // Seeded deterministically from tick so they don't jitter per-frame.
  const moteCount = Math.floor((canvasW * canvasH) / 8000);  // ~1 per 8000 px²
  const moteAlpha = 0.08 + nightFactor * 0.14;  // 0.08 day → 0.22 night

  ctx.save();
  for (let i = 0; i < moteCount; i++) {
    // Deterministic pseudo-random from tick + i
    const seed = (tick * 137 + i * 251) % 10007;
    const mx = ((seed * 173) % 10007) / 10007 * canvasW;
    const my = ((seed * 419) % 10007) / 10007 * canvasH;
    const mr = 0.6 + ((seed * 73) % 100) / 100 * 1.2;  // 0.6–1.8px radius
    const ma = moteAlpha * (0.4 + ((seed * 59) % 100) / 100 * 0.6);  // varied alpha

    ctx.fillStyle = `rgba(180, 200, 180, ${ma})`;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// BASE DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw the Behemoth base on a canvas context.
 *
 * Body: green radial gradient (organic identity) scaled by baseRadius.
 * Glow: level-colored outer ring, alpha modulated by VISUAL.intensity.
 * Label: level name centered on base, styled per VISUAL.fontStyle.
 * L4 (BEHEMOTH): glow alpha pulses between 0.7 and 1.0 at ~2 Hz.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (needs sim.baseCenter, sim.baseLevel,
 *   sim.baseRadius, sim.tick)
 * @param {number} scale — pixels per cell (canvas scale factor)
 */
export function drawBase(ctx, sim, scale) {
  const { baseCenter, baseLevel, baseRadius, tick } = sim;

  // Clamp level to VISUAL array bounds
  const level = Math.max(0, Math.min(baseLevel, LEVEL.VISUAL.length - 1));
  const visual = LEVEL.VISUAL[level];

  const cx = baseCenter.x * scale;
  const cy = baseCenter.y * scale;
  const radius = baseRadius * scale;

  // ── Body: green organic gradient ──────────────────────────────────
  ctx.save();
  const bodyGrad = ctx.createRadialGradient(
    cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
    cx, cy, radius
  );
  bodyGrad.addColorStop(0, '#86efac');     // light green center
  bodyGrad.addColorStop(0.5, '#22c55e');   // mid green
  bodyGrad.addColorStop(1, '#166534');     // dark green edge

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.restore();

  // ── Glow: level-colored outer ring ────────────────────────────────
  const glowRadius = radius * 1.5;
  let glowAlpha = visual.intensity;

  // L4 BEHEMOTH: pulsing glow (0.7–1.0 at ~2 Hz, sin 0.125 × tick)
  if (visual.fontStyle === 'pulsing') {
    const pulse = (Math.sin(tick * 0.125) + 1) / 2;  // 0.0–1.0 wave
    glowAlpha = 0.7 + pulse * 0.3;                    // 0.7–1.0 range
  }

  ctx.save();
  const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, glowRadius);
  glowGrad.addColorStop(0, hexToRgba(visual.color, 0));
  glowGrad.addColorStop(0.5, hexToRgba(visual.color, glowAlpha * 0.5));
  glowGrad.addColorStop(1, hexToRgba(visual.color, 0));

  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();
  ctx.restore();

  // ── Label: level name ─────────────────────────────────────────────
  const font = formatLabelFont(visual.fontStyle);
  const text = formatLabelText(visual.fontStyle, visual.label);

  let textAlpha = 1.0;
  // L4 pulsing label alpha too
  if (visual.fontStyle === 'pulsing') {
    const pulse = (Math.sin(tick * 0.125) + 1) / 2;
    textAlpha = 0.7 + pulse * 0.3;
  }

  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hexToRgba('#ffffff', textAlpha * 0.9);
  ctx.fillText(text, cx, cy + radius + 6 * scale);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// ENTITY DRAWING — ENEMIES & TURRETS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Visual tokens per enemy type — colours and shapes for the renderer.
 * Mirrors BehemothGame.jsx ENEMY_TYPE_STYLE but lives in the render
 * layer so canvas drawing doesn't depend on React component constants.
 */
const ENEMY_VISUAL = {
  scout:     { color: '#60a5fa', glowColor: '#93c5fd', shape: 'diamond' },
  tank:      { color: '#f59e0b', glowColor: '#fcd34d', shape: 'hexagon' },
  artillery: { color: '#ef4444', glowColor: '#fca5a5', shape: 'cross' },
  crawler:   { color: '#34d399', glowColor: '#6ee7b7', shape: 'dot' },
  boss:      { color: '#c084fc', glowColor: '#d8b4fe', shape: 'pentagram' },
};

/**
 * Draw a thin health bar above an entity's world position.
 *
 * The bar is 1.6× the entity's size in width, positioned 0.4 cells
 * above the entity center. Fill transitions from green (full HP) to
 * red (low HP) with a dark background track. Alpha fades below 40%.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} screenX — canvas pixel x of entity center
 * @param {number} screenY — canvas pixel y of entity center
 * @param {number} hp — current HP
 * @param {number} maxHp — maximum HP
 * @param {number} entitySize — render size in cells (for bar width)
 * @param {number} scale — pixels per cell
 */
function drawHealthBar(ctx, screenX, screenY, hp, maxHp, entitySize, scale) {
  if (maxHp <= 0) return;

  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const barW = entitySize * 1.6 * scale;
  const barH = Math.max(2, scale * 0.25);
  const barX = screenX - barW / 2;
  const barY = screenY - (entitySize * 0.7) * scale;

  // Color lerp: green (full) → amber (mid) → red (low)
  let barColor;
  if (ratio > 0.5) {
    // Green → Amber
    const t = (1 - ratio) * 2; // 0 at 1.0, 1 at 0.5
    barColor = `rgba(${Math.round(34 + (245 - 34) * t)}, ${Math.round(197 + (158 - 197) * t)}, ${Math.round(94 + (11 - 94) * t)}, 0.85)`;
  } else {
    // Amber → Red
    const t = (0.5 - ratio) * 2; // 0 at 0.5, 1 at 0.0
    barColor = `rgba(${Math.round(245 + (239 - 245) * t)}, ${Math.round(158 + (68 - 158) * t)}, ${Math.round(11 + (68 - 11) * t)}, 0.85)`;
  }

  ctx.save();

  // Background track (dark)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(barX, barY, barW, barH);

  // Health fill
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, barW * ratio, barH);

  // Subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// ENEMY DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw all alive enemies on the canvas.
 *
 * Called after drawBackground + drawBase, before any fog/overlay pass.
 * Each enemy gets its type-specific shape, a subtle glow, and a health bar.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.enemies, sim.tick)
 * @param {number} scale — pixels per cell
 */
export function drawEnemies(ctx, sim, scale) {
  const { enemies = [], tick = 0 } = sim;
  if (enemies.length === 0) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    drawEnemy(ctx, enemy, scale, tick);
  }
}

/**
 * Draw a single enemy with type-specific shape, color, and glow.
 *
 * Shape catalogue:
 *   - scout: thin diamond outline, crosses at cardinal points (tactical marker feel)
 *   - tank: filled hexagon with inner ring (heavy, deliberate)
 *   - artillery: open diamond with inner target cross (danger-read)
 *   - crawler: clustered dots with per-frame jitter (swarm chaos)
 *   - boss: pentagram star with dual rings (ominous, commanding)
 *
 * All shapes render with a subtle outer glow (shadowBlur) and are sized
 * by the enemy's config size × scale.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} enemy — { type, x, y, hp, maxHp, size, ... }
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick (for jitter/crawler animation)
 */
function drawEnemy(ctx, enemy, scale, tick) {
  const visual = ENEMY_VISUAL[enemy.type] || { color: '#888888', glowColor: '#aaaaaa', shape: 'dot' };
  const sx = enemy.x * scale;
  const sy = enemy.y * scale;
  const r = (enemy.size || 0.8) * scale;

  ctx.save();

  // ── Outer glow ──────────────────────────────────────────────────
  ctx.shadowColor = visual.glowColor;
  ctx.shadowBlur = r * 0.8;

  switch (visual.shape) {
    case 'diamond':    drawDiamondShape(ctx, sx, sy, r, visual.color); break;
    case 'hexagon':    drawHexagonShape(ctx, sx, sy, r, visual.color); break;
    case 'cross':      drawCrossShape(ctx, sx, sy, r, visual.color); break;
    case 'dot':        drawDotShape(ctx, sx, sy, r, visual.color, enemy.type, tick); break;
    case 'pentagram':  drawPentagramShape(ctx, sx, sy, r, visual.color); break;
    default:           drawDotShape(ctx, sx, sy, r, visual.color, enemy.type, tick);
  }

  ctx.restore();

  // ── Health bar ──────────────────────────────────────────────────
  drawHealthBar(ctx, sx, sy, enemy.hp, enemy.maxHp, enemy.size || 0.8, scale);
}

// ═══════════════════════════════════════════════════════════════════════
// ENEMY SHAPE PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Diamond (◆) — scout marker.
 * Thin stroke diamond with small dots at cardinal points — like a
 * tactical scanner blip on a monochrome display.
 */
function drawDiamondShape(ctx, cx, cy, r, color) {
  const hw = r * 0.7;
  const hh = r * 0.9;

  // Main diamond outline
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.stroke();

  // Subtle fill
  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.fill();

  // Cardinal point dots
  const dotR = Math.max(1, r * 0.15);
  ctx.fillStyle = color;
  for (const [dx, dy] of [[0, -hh], [hw, 0], [0, hh], [-hw, 0]]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Hexagon (⬡) — tank marker.
 * Filled hexagon with a slightly smaller inner stroke hex — reads as
 * a heavy, armored target. No outer dot clutter.
 */
function drawHexagonShape(ctx, cx, cy, r, color) {
  const sides = 6;
  const startAngle = -Math.PI / 6; // flat-top

  // Outer filled hexagon
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (Math.PI * 2 * i) / sides;
    const px = cx + r * 0.85 * Math.cos(angle);
    const py = cy + r * 0.85 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.25);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();

  // Inner ring (thinner, brighter)
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (Math.PI * 2 * i) / sides;
    const px = cx + r * 0.5 * Math.cos(angle);
    const py = cy + r * 0.5 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = hexToRgba(color, 0.5);
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.stroke();
}

/**
 * Crosshair Diamond — artillery marker.
 * Diamond outline with interior cross lines — reads as a priority
 * threat, a target-acquired blip.
 */
function drawCrossShape(ctx, cx, cy, r, color) {
  const hw = r * 0.65;
  const hh = r * 0.85;

  // Diamond outline
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.stroke();

  // Inner cross lines (target acquisition)
  ctx.strokeStyle = hexToRgba(color, 0.5);
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.7, cy - hh * 0.7);
  ctx.lineTo(cx + hw * 0.7, cy + hh * 0.7);
  ctx.moveTo(cx + hw * 0.7, cy - hh * 0.7);
  ctx.lineTo(cx - hw * 0.7, cy + hh * 0.7);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Crawler Dot Swarm — crawler marker.
 * A tight cluster of small circles with deterministic per-enemy per-tick
 * jitter. Each crawler renders as 3 overlapping dots that shift position
 * slightly based on enemy id and tick, creating a crawling, skittering
 * visual effect.
 */
function drawDotShape(ctx, cx, cy, r, color, type, tick) {
  const isCrawler = type === 'crawler';
  const dotR = isCrawler ? r * 0.5 : r * 0.6;
  const dotCount = isCrawler ? 3 : 1;

  ctx.fillStyle = isCrawler ? hexToRgba(color, 0.7) : color;

  for (let i = 0; i < dotCount; i++) {
    let dx = 0, dy = 0;
    if (isCrawler) {
      // Deterministic jitter per crawler per tick
      const seed = (tick * 173 + i * 97) % 7919;
      dx = ((seed * 263) % 1000 - 500) / 500 * r * 0.5;
      dy = ((seed * 449) % 1000 - 500) / 500 * r * 0.5;
    }
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Pentagram (★) — boss marker.
 * Five-pointed star constructed from alternating outer and inner radii.
 * Rendered with a filled interior at low opacity, a bright stroke, and
 * a thin outer ring — reads as commanding, ominous, the center of
 * attention.
 */
function drawPentagramShape(ctx, cx, cy, r, color) {
  const points = 5;
  const outerR = r * 0.85;
  const innerR = outerR * 0.4;

  // Build star path
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / points;
    const radius = i % 2 === 0 ? outerR : innerR;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Fill
  ctx.fillStyle = hexToRgba(color, 0.2);
  ctx.fill();

  // Stroke
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR * 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════════════
// TURRET DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw all alive turrets on the canvas.
 *
 * Called after enemies, before any fog/overlay pass.
 * Each turret renders as a static hexagonal emplacement with a barrel
 * line pointing toward its current target (or upward if idle).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.turrets)
 * @param {number} scale — pixels per cell
 */
export function drawTurrets(ctx, sim, scale) {
  const { turrets = [] } = sim;
  if (turrets.length === 0) return;

  for (const turret of turrets) {
    if (!turret.alive) continue;
    drawTurret(ctx, turret, scale);
  }
}

/**
 * Draw a single turret.
 *
 * Watcher: small hexagonal platform with a short barrel line.
 * Advanced turret: larger hexagonal base + raised inner platform,
 * longer barrel, mortar-capable turrets show a wider barrel indicator.
 * Mounted turrets get a slight size bump and a wall-brace underline.
 *
 * Color: steel blue-gray (#4b8bb4 for watchers, #6ba4c7 for turrets).
 * Glow is subtle — turrets are infrastructure, not spectacle.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} turret — { x, y, type, hasMortar, mounted, hp, maxHp, ... }
 * @param {number} scale — pixels per cell
 */
function drawTurret(ctx, turret, scale) {
  const isAdvanced = turret.type === 'turret';
  const baseColor = isAdvanced ? '#6ba4c7' : '#4b8bb4';
  const glowColor = isAdvanced ? '#93c5e8' : '#6b9eb8';

  const sx = turret.x * scale;
  const sy = turret.y * scale;
  const r = (isAdvanced ? 0.65 : 0.5) * (turret.mounted ? 1.15 : 1.0) * scale;

  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = r * 0.4;

  // ── Hexagonal base ──────────────────────────────────────────────
  const sides = 6;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * i) / sides;
    const px = sx + r * Math.cos(angle);
    const py = sy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = hexToRgba(baseColor, 0.3);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(baseColor, 0.85);
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();

  // ── Inner platform (advanced turrets only) ──────────────────────
  if (isAdvanced) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = -Math.PI / 6 + (Math.PI * 2 * i) / sides;
      const px = sx + r * 0.5 * Math.cos(angle);
      const py = sy + r * 0.5 * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(baseColor, 0.15);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(baseColor, 0.5);
    ctx.lineWidth = Math.max(0.5, r * 0.06);
    ctx.stroke();
  }

  // ── Barrel line ─────────────────────────────────────────────────
  const barrelLen = r * (turret.hasMortar ? 1.3 : isAdvanced ? 1.1 : 0.8);
  const barrelW = turret.hasMortar ? 2.5 : 1.5;
  ctx.strokeStyle = hexToRgba(baseColor, 0.9);
  ctx.lineWidth = Math.max(barrelW * 0.5, barrelW);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, sy - barrelLen);
  ctx.stroke();

  // ── Mounted wall brace underline ────────────────────────────────
  if (turret.mounted) {
    ctx.strokeStyle = hexToRgba('#a3a3a3', 0.5);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(sx - r * 0.9, sy + r * 0.7);
    ctx.lineTo(sx + r * 0.9, sy + r * 0.7);
    ctx.stroke();
  }

  ctx.restore();

  // ── Health bar ──────────────────────────────────────────────────
  drawHealthBar(ctx, sx, sy, turret.hp, turret.maxHp, 0.7, scale);
}
