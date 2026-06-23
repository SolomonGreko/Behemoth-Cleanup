/**
 * render.js — Canvas rendering for Behemoth game entities.
 *
 * Pure rendering functions that take a CanvasRenderingContext2D and
 * sim state, called from the React canvas component (BehemothGame.jsx).
 *
 * Domain: Hephaestus (engine-side rendering math)
 * Visual styling: Aphrodite (colors, fonts, animation feel)
 */

import { LEVEL } from './config.js';
import { drawBackground, drawStoneZones } from './render/background.js';
import { drawDayNightOverlay, drawSelectionRing } from './render/hud.js';
import {
  hexToRgba,
  drawDeathParticles,
  drawCrystalDrops,
  drawEnemies,
  drawBossShockwaves,
  drawTurretMuzzleFlashes,
  drawTurrets,
  drawBots,
  drawWalls,
} from './render/entities.js';

import { recordBaseParticles, drawBaseParticles } from './render/effects.js';
import {
  triggerScreenShake,
  applyScreenShake,
  spawnBuildEffect,
  drawBuildEffects,
  spawnImpactEffect,
  drawImpactEffects,
} from './render/effects.js';

// ═══════════════════════════════════════════════════════════════════════
// RENDER STATE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize render-scoped VFX state on the sim object.
 *
 * All canvas VFX maps/sets/arrays live on sim.renderState instead of
 * at module scope. This prevents cross-instance state corruption on
 * hot-reload — each sim gets its own fresh render state.
 *
 * Called from engine.js createSim() once at sim creation.
 *
 * @param {object} sim — sim state object (mutated in place)
 */
export function initRenderState(sim) {
  sim.renderState = {
    deathParticles: [],
    deathEvents: [],
    processedDeaths: new Set(),
    bossShockwaves: new Map(),
    crystalDrops: [],
    prevEnemyHp: new Map(),
    crawlerTrails: new Map(),
    damageFlashes: new Map(),
    baseParticles: [],
    muzzleFlashes: [],
    prevLaserCd: new Map(),
    prevMortarCd: new Map(),
    // Screen shake state
    screenShakeIntensity: 0,      // current shake amplitude (pixels), decays each frame
    screenShakeDecay: 2.5,        // pixels per tick subtracted from intensity
    screenShakeMaxIntensity: 8,   // hard clamp to prevent disorientation
    // Build/upgrade VFX
    buildEffects: [],             // [{ x, y, bornTick, color, isUpgrade }]
    // Impact burst VFX
    impactEffects: [],            // [{ x, y, bornTick, color }]
  };
}

// Re-export for external consumers (index.js)
export {
  drawBackground,
  drawStoneZones,
  drawDayNightOverlay,
  drawSelectionRing,
  hexToRgba,
  drawDeathParticles,
  drawCrystalDrops,
  drawEnemies,
  drawBossShockwaves,
  drawTurretMuzzleFlashes,
  drawTurrets,
  drawBots,
  drawWalls,
  recordBaseParticles,
  drawBaseParticles,
  triggerScreenShake,
  applyScreenShake,
  spawnBuildEffect,
  drawBuildEffects,
  spawnImpactEffect,
  drawImpactEffects,
};

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
// BASE DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw the Behemoth base on a canvas context.
 *
 * Layers (back to front):
 *   1. Base-color glow: green (#2d6b3f) radial gradient from center,
 *      radius and alpha scale with level. L1=default, L2=+15%, L3=+30%,
 *      L4=+50%. Center alpha: L1=0.3, L2=0.35, L3=0.4, L4=0.5 — fades
 *      to 0 at edge.
 *   2. Body: green organic radial gradient (organic identity) scaled by
 *      baseRadius.
 *   3. Level-up flash: white overlay pulse (100ms fade on level change).
 *   4. Shield ring: cyan (#22d3ee) stroked arc at base perimeter +2px,
 *      pulse animation (alpha 0.5↔0.8 over 2s). Visible only when
 *      sim.shield.hp > 0.
 *   5. Label: level name centered below base.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (needs sim.baseCenter, sim.baseLevel,
 *   sim.baseRadius, sim.shield, sim.tick)
 * @param {number} scale — pixels per cell (canvas scale factor)
 */
export function drawBase(ctx, sim, scale) {
  const { baseCenter, baseLevel, baseRadius, tick, shield } = sim;

  // Clamp level to VISUAL array bounds (0-based: L1=0, L2=1, L3=2, L4=3)
  const level = Math.max(0, Math.min(baseLevel, LEVEL.VISUAL.length - 1));
  const visual = LEVEL.VISUAL[level];

  const cx = baseCenter.x * scale;
  const cy = baseCenter.y * scale;
  const radius = baseRadius * scale;

  // ── Level-up flash detection ──────────────────────────────────────
  // When baseLevel changes (upward), set a 6-tick flash timer (~100ms)
  if (sim._lastBaseLevel !== undefined && sim._lastBaseLevel !== baseLevel) {
    sim._levelUpFlashUntil = tick + 6;
  }
  sim._lastBaseLevel = baseLevel;
  const isFlashing = tick < (sim._levelUpFlashUntil ?? 0);

  // ═════════════════════════════════════════════════════════════════
  // LAYER 1: Base-color green glow (#2d6b3f) — scales with level
  // ═════════════════════════════════════════════════════════════════
  const glowMulByLevel = [1.0, 1.15, 1.3, 1.5];    // radius multiplier
  const glowAlphaByLevel = [0.3, 0.35, 0.4, 0.5];   // center alpha

  const glowMul = glowMulByLevel[level] || 1.0;
  const centerAlpha = glowAlphaByLevel[level] || 0.3;
  const baseGlowRadius = radius * glowMul;

  ctx.save();
  const baseGlowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseGlowRadius);
  baseGlowGrad.addColorStop(0, hexToRgba('#2d6b3f', centerAlpha));
  baseGlowGrad.addColorStop(1, hexToRgba('#2d6b3f', 0));

  ctx.beginPath();
  ctx.arc(cx, cy, baseGlowRadius, 0, Math.PI * 2);
  ctx.fillStyle = baseGlowGrad;
  ctx.fill();
  ctx.restore();

  // ═════════════════════════════════════════════════════════════════
  // LAYER 2: Body — green organic gradient
  // ═════════════════════════════════════════════════════════════════
  ctx.save();
  const bodyGrad = ctx.createRadialGradient(
    cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
    cx, cy, radius
  );
  bodyGrad.addColorStop(0, '#86efac');     // light green centre
  bodyGrad.addColorStop(0.5, '#22c55e');   // mid green
  bodyGrad.addColorStop(1, '#166534');     // dark green edge

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // ── Level-up flash: white overlay, fades over 6 ticks ──────────
  if (isFlashing) {
    const flashRemaining = sim._levelUpFlashUntil - tick;
    const flashAlpha = (flashRemaining / 6) * 0.4;   // 0.4 → 0 over 100ms
    ctx.fillStyle = hexToRgba('#ffffff', Math.max(0, flashAlpha));
    ctx.fill();
  }
  ctx.restore();

  // ═════════════════════════════════════════════════════════════════
  // LAYER 3: Shield ring — cyan (#22d3ee) pulse when shield HP > 0
  // ═════════════════════════════════════════════════════════════════
  if (shield && shield.hp > 0 && shield.maxHp > 0) {
    const shieldRatio = shield.hp / shield.maxHp;

    // Pulse alpha: oscillate 0.5 → 0.8 over 2s (120 ticks at 60 tps)
    const pulse = (Math.sin(tick * Math.PI / 60) + 1) / 2;   // 0.0–1.0 wave
    const pulseAlpha = 0.5 + pulse * 0.3;                     // 0.5–0.8

    const ringRadius = radius + 2 * scale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#22d3ee', pulseAlpha * shieldRatio);
    ctx.lineWidth = Math.max(2, 2 * scale);
    ctx.stroke();
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════
  // LAYER 4: Label — level name centred below base
  // ═════════════════════════════════════════════════════════════════
  const font = 'bold 10px "Courier New", monospace';
  const text = visual.label || `Level ${level + 1}`;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hexToRgba(visual.labelColor || '#ffffff', 0.9);
  ctx.fillText(text, cx, cy + radius + 6 * scale);
  ctx.restore();

  // ── Record ambient particles for this frame ──────────────────────
  recordBaseParticles(sim, scale);
}
