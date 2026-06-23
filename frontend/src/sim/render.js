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
// BASE AMBIENT PARTICLES (Aphrodite — wardstone atmosphere)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ambient light motes floating around the Behemoth base.
 *
 * Tiny particles emanate from the base center, drifting upward and
 * outward in gentle arcs. They represent the wardstone's resonance
 * made visible — the old song, leaking into the air as motes of
 * amber-gold light. When the shield is active, motes shift to cyan.
 *
 * Particles spawn each frame at a rate that scales with base level,
 * drift for ~60 ticks (~1s at 60 tps), and fade out. Night intensifies
 * their visibility. This is atmosphere, not information — the base
 * should feel alive, breathing, a heart at the center of the garden.
 *
 *   { x, y, bornTick, angle, speedX, speedY, size, color, alpha }
 */
const baseParticles = [];

/** Max age in ticks before a base particle is pruned (~1s at 60 tps). */
const BASE_PARTICLE_LIFE = 60;

/** Spawn rate multiplier per base level (L1→L4). */
const BASE_PARTICLE_SPAWN = [0.4, 0.7, 1.0, 1.4];

/**
 * Spawn ambient particles around the base each frame.
 *
 * Called once per frame before drawBaseParticles. Particle count
 * scales with base level so late-game bases feel more vibrant.
 * Colors shift based on shield state: amber-gold normally,
 * cyan when shield is active.
 *
 * @param {object} sim — sim state (baseCenter, baseLevel, baseRadius, shield, tick)
 * @param {number} scale — pixels per cell
 */
function recordBaseParticles(sim, scale) {
  const { baseCenter, baseLevel = 0, baseRadius = 2, shield, tick = 0 } = sim;
  if (!baseCenter) return;

  const level = Math.max(0, Math.min(baseLevel, BASE_PARTICLE_SPAWN.length - 1));
  const spawnRate = BASE_PARTICLE_SPAWN[level] || 0.5;

  // Deterministic spawn count — 1 particle every few frames on average,
  // scaled by level. Avoids overwhelming the particle count.
  const seed = (tick * 7919 + 137) % 100;
  const shouldSpawn = seed < spawnRate * 35; // ~0.4–1.4 particles avg per frame

  if (!shouldSpawn) return;

  const cx = baseCenter.x * scale;
  const cy = baseCenter.y * scale;
  const r = baseRadius * scale;

  // Particle color: amber-gold normally, cyan when shield is up
  const shieldActive = shield && shield.hp > 0;
  const color = shieldActive ? '#22d3ee' : '#fbbf24';
  const glowColor = shieldActive ? '#67e8f9' : '#fcd34d';

  // Spawn at base perimeter, random angle
  const angle = Math.random() * Math.PI * 2;
  const spawnR = r * (0.5 + Math.random() * 0.5);

  // Drift: upward bias with slight outward spread
  const driftAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8; // mostly upward
  const speed = 0.12 + Math.random() * 0.35; // pixels per tick

  baseParticles.push({
    x: cx + Math.cos(angle) * spawnR,
    y: cy + Math.sin(angle) * spawnR,
    bornTick: tick,
    driftAngle,
    speed,
    size: 0.6 + Math.random() * 1.8, // radius in pixels
    color,
    glowColor,
  });

  // Cap total particles to prevent unbounded growth
  while (baseParticles.length > 80) {
    baseParticles.shift();
  }
}

/**
 * Draw ambient light motes floating around the base.
 *
 * Renders each particle as a soft glowing dot drifting upward and
 * outward from the base. Particles fade in over the first 20% of
 * life (ascend phase), hold briefly, then fade out over the last
 * 40% (dissolve phase). The alpha envelope creates a gentle
 * "appear, float, vanish" rhythm.
 *
 * Night intensifies particle visibility — they're nearly invisible
 * during bright day, prominent during night. Shield-active particles
 * glow cyan rather than amber.
 *
 * Called once per frame after drawBase, before drawEnemies.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.hud for night factor)
 * @param {number} tick — current sim tick
 */
export function drawBaseParticles(ctx, sim, tick) {
  // Prune expired particles
  for (let i = baseParticles.length - 1; i >= 0; i--) {
    if (tick - baseParticles[i].bornTick > BASE_PARTICLE_LIFE) {
      baseParticles.splice(i, 1);
    }
  }

  if (baseParticles.length === 0) return;

  // Night factor — particles are more visible at night
  let nightFactor = 0.5;
  const { hud } = sim;
  if (hud?.dayPhase) {
    const phaseWeights = { dawn: 0.3, day: 0.0, dusk: 0.7, night: 1.0 };
    const baseWeight = phaseWeights[hud.dayPhase] ?? 0.5;
    const phaseIdx = DAY_CYCLE.phaseOrder.indexOf(hud.dayPhase);
    const nextPhase = DAY_CYCLE.phaseOrder[(phaseIdx + 1) % 4];
    const nextWeight = phaseWeights[nextPhase] ?? 0.5;
    const blend = hud.phaseBlend ?? 0;
    nightFactor = baseWeight + (nextWeight - baseWeight) * blend;
  }
  const visibilityMul = 0.3 + nightFactor * 0.7; // 0.3 day → 1.0 night

  ctx.save();

  for (const p of baseParticles) {
    const age = tick - p.bornTick;
    const lifeRatio = age / BASE_PARTICLE_LIFE; // 0 → 1

    // ── Alpha envelope: fade in → hold → fade out ─────────────────
    let alpha;
    if (lifeRatio < 0.2) {
      alpha = (lifeRatio / 0.2) * 0.55;           // 0 → 0.55 (appear)
    } else if (lifeRatio < 0.6) {
      alpha = 0.55;                                // hold
    } else {
      alpha = 0.55 * (1 - (lifeRatio - 0.6) / 0.4); // 0.55 → 0 (dissolve)
    }
    alpha *= visibilityMul;

    if (alpha < 0.015) continue;

    // ── Position update: drift from spawn point ───────────────────
    const dist = age * p.speed;
    const px = p.x + Math.cos(p.driftAngle) * dist;
    const py = p.y + Math.sin(p.driftAngle) * dist;

    // Size: slight swell then shrink
    const sizePhase = lifeRatio < 0.3
      ? 0.7 + lifeRatio / 0.3 * 0.3   // 0.7 → 1.0
      : 1.0 - (lifeRatio - 0.3) * 0.5; // 1.0 → 0.65

    const pr = p.size * sizePhase;

    // ── Outer glow ────────────────────────────────────────────────
    ctx.shadowColor = p.glowColor;
    ctx.shadowBlur = pr * 3.5;
    ctx.fillStyle = hexToRgba(p.color, alpha);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();

    // ── Inner bright core ─────────────────────────────────────────
    ctx.shadowColor = p.glowColor;
    ctx.shadowBlur = pr * 1.5;
    ctx.fillStyle = hexToRgba('#ffffff', alpha * 0.3);
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  }

  ctx.restore();
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
