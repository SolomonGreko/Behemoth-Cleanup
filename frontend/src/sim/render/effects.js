/**
 * effects.js — Ambient particle and visual effects rendering.
 *
 * Extracted from render.js: base ambient particle system (wardstone motes).
 * Pure rendering functions that take a CanvasRenderingContext2D and
 * sim state, called from the React canvas component (BehemothGame.jsx).
 *
 * Domain: Aphrodite (particles, glow, atmosphere)
 */

import { DAY_CYCLE } from '../config.js';
import { hexToRgba } from './entities.js';

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
export function recordBaseParticles(sim, scale) {
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
// SCREEN SHAKE (Aphrodite — camera feedback for heavy impacts)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Trigger a screen shake with the given intensity.
 *
 * Shake amplitude stacks (new intensity is added to current), clamped
 * to a max to prevent disorientation. Each frame the intensity decays
 * by DECAY pixels/tick, creating a natural shudder-then-settle feel.
 *
 * Call from combat events: boss shockwave spawn, base hit, big enemy death.
 *
 * @param {object} sim — sim state
 * @param {number} intensity — shake amplitude in pixels (1-4 subtle, 5-8 heavy)
 */
export function triggerScreenShake(sim, intensity) {
  const rs = sim.renderState;
  if (!rs) return;
  rs.screenShakeIntensity = Math.min(
    rs.screenShakeMaxIntensity,
    rs.screenShakeIntensity + intensity
  );
}

/**
 * Apply screen shake offset to the canvas context, then return it.
 *
 * Caller MUST wrap in ctx.save()/ctx.restore(). Returns the { ox, oy }
 * offset so callers can use it for position-sensitive checks.
 *
 * Uses deterministic per-tick seed so the shake direction doesn't
 * teleport entities — same seed gives same offset per tick even if
 * intensity changes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state
 * @param {number} tick — current sim tick
 * @returns {{ ox: number, oy: number }} the applied offset
 */
export function applyScreenShake(ctx, sim, tick) {
  const rs = sim.renderState;
  if (!rs) return { ox: 0, oy: 0 };

  let intensity = rs.screenShakeIntensity;
  if (intensity <= 0.05) {
    rs.screenShakeIntensity = 0;
    return { ox: 0, oy: 0 };
  }

  // Deterministic shake direction from tick (smooth per-frame change)
  const seed1 = ((tick * 173) % 7919) / 7919;
  const seed2 = ((tick * 449) % 7919) / 7919;

  // Random angle + magnitude within intensity range
  const angle = seed1 * Math.PI * 2;
  const mag = intensity * (0.3 + seed2 * 0.7);

  const ox = Math.cos(angle) * mag;
  const oy = Math.sin(angle) * mag;

  ctx.translate(ox, oy);

  // Decay intensity for next frame
  rs.screenShakeIntensity = Math.max(0, intensity - rs.screenShakeDecay);

  return { ox, oy };
}

// ═══════════════════════════════════════════════════════════════════════
// BUILD/UPGRADE VFX (Aphrodite — placement feedback)
// ═══════════════════════════════════════════════════════════════════════

/** Max age in ticks before a build effect is pruned (~0.5s at 60 tps). */
const BUILD_EFFECT_LIFE = 30;

/**
 * Spawn a build effect at the given world position.
 *
 * When a player buys a bot, watcher, wall, or upgrades a wall,
 * this spawns an expanding ring + upward sparkle particles.
 * Color depends on what was built:
 *   - bot: cyan-blue (#4ea0c9)
 *   - watcher: green (#3ea35a)
 *   - wall/upgrade: amber-gold (#fbbf24)
 *
 * @param {object} sim — sim state
 * @param {number} x — world x position
 * @param {number} y — world y position
 * @param {string} color — hex color for the ring
 * @param {boolean} [isUpgrade=false] — true for upgrade (bigger ring)
 */
export function spawnBuildEffect(sim, x, y, color, isUpgrade = false) {
  const rs = sim.renderState;
  if (!rs) return;

  const count = isUpgrade ? 10 : 6;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const speed = 0.3 + Math.random() * 0.7;
    const size = 0.8 + Math.random() * 2.0;
    particles.push({ angle, speed, size, alpha: 1.0 });
  }

  rs.buildEffects.push({
    x,
    y,
    bornTick: sim.tick,
    color,
    isUpgrade,
    particles,
  });

  // Cap to prevent memory leak
  while (rs.buildEffects.length > 20) {
    rs.buildEffects.shift();
  }
}

/**
 * Draw active build/upgrade effects.
 * Expanding ring + upward arcing sparkle particles.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawBuildEffects(ctx, sim, scale, tick) {
  const rs = sim.renderState;
  if (!rs || rs.buildEffects.length === 0) return;

  // Prune expired
  for (let i = rs.buildEffects.length - 1; i >= 0; i--) {
    if (tick - rs.buildEffects[i].bornTick > BUILD_EFFECT_LIFE) {
      rs.buildEffects.splice(i, 1);
    }
  }

  for (const effect of rs.buildEffects) {
    const age = tick - effect.bornTick;
    const lifeRatio = age / BUILD_EFFECT_LIFE;
    const sx = effect.x * scale;
    const sy = effect.y * scale;

    ctx.save();

    // Expando ring
    const ringRadius = lifeRatio * (effect.isUpgrade ? 2.5 : 1.8) * scale;
    const ringAlpha = (1 - lifeRatio) * 0.7;
    if (ringAlpha > 0.01) {
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(effect.color, ringAlpha);
      ctx.lineWidth = Math.max(1, (1 - lifeRatio) * 3);
      ctx.stroke();
    }

    // Sparkle particles — arc upward and outward
    for (const p of effect.particles) {
      const dist = lifeRatio * p.speed * 2.5 * scale;
      const px = sx + Math.cos(p.angle) * dist;
      const py = sy + Math.sin(p.angle) * dist - lifeRatio * 0.5 * scale; // upward arc
      const alpha = (1 - lifeRatio) * 0.7;

      if (alpha < 0.02) continue;

      const pr = p.size * (1 - lifeRatio * 0.5) * scale * 0.15;

      ctx.shadowColor = effect.color;
      ctx.shadowBlur = pr * 4;
      ctx.fillStyle = hexToRgba('#ffffff', alpha * 0.6);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Colored outer glow
      ctx.fillStyle = hexToRgba(effect.color, alpha);
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// IMPACT BURST VFX (Aphrodite — projectile hit feedback)
// ═══════════════════════════════════════════════════════════════════════

/** Max age in ticks before an impact effect is pruned (~200ms at 60 tps). */
const IMPACT_EFFECT_LIFE = 12;

/**
 * Spawn an impact burst at the given world position.
 * Used when a projectile hits an enemy — small flash + debris particles.
 *
 * @param {object} sim — sim state
 * @param {number} x — world x
 * @param {number} y — world y
 * @param {string} color — hex color (enemy glow color)
 */
export function spawnImpactEffect(sim, x, y, color) {
  const rs = sim.renderState;
  if (!rs) return;

  rs.impactEffects.push({
    x,
    y,
    bornTick: sim.tick,
    color,
  });

  while (rs.impactEffects.length > 40) {
    rs.impactEffects.shift();
  }
}

/**
 * Draw active impact burst effects.
 * Small expanding flash ring + debris sparks.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawImpactEffects(ctx, sim, scale, tick) {
  const rs = sim.renderState;
  if (!rs || rs.impactEffects.length === 0) return;

  // Prune expired
  for (let i = rs.impactEffects.length - 1; i >= 0; i--) {
    if (tick - rs.impactEffects[i].bornTick > IMPACT_EFFECT_LIFE) {
      rs.impactEffects.splice(i, 1);
    }
  }

  for (const impact of rs.impactEffects) {
    const age = tick - impact.bornTick;
    const lifeRatio = age / IMPACT_EFFECT_LIFE;
    const sx = impact.x * scale;
    const sy = impact.y * scale;

    ctx.save();

    // Flash ring — expands slightly
    const ringRadius = lifeRatio * 0.8 * scale;
    const ringAlpha = (1 - lifeRatio) * 0.55;
    if (ringAlpha > 0.01) {
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(impact.color, ringAlpha);
      ctx.lineWidth = Math.max(1, (1 - lifeRatio) * 2.5);
      ctx.stroke();
    }

    // Bright core flash — quick fade
    const coreAlpha = (1 - lifeRatio) * 0.5;
    if (coreAlpha > 0.01) {
      ctx.shadowColor = impact.color;
      ctx.shadowBlur = (1 - lifeRatio) * 6 * scale;
      ctx.fillStyle = hexToRgba('#ffffff', coreAlpha * 0.4);
      ctx.beginPath();
      ctx.arc(sx, sy, (1 - lifeRatio) * 0.4 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
