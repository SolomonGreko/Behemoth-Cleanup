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
import { drawDayNightOverlay, drawHealthBar, drawSelectionRing } from './render/hud.js';

export { drawDayNightOverlay, drawSelectionRing };

// ═══════════════════════════════════════════════════════════════════════
// ENEMY VISUAL TOKENS (must be declared early — used by death particles)
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

// ═══════════════════════════════════════════════════════════════════════
// DEATH PARTICLE SYSTEM (Aphrodite — visual combat feedback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Active death particles. Each entry:
 *   { x, y, color, bornTick, particles: [{ angle, speed, radius, alpha }] }
 *
 * Particles expand outward from the death point, fading over ~30 ticks (0.5s).
 * Ring wave pulses outward at the same time for a "shockwave" effect.
 */
const deathEvents = [];

/** Set of "x|y|type" keys for deaths already processed — prevents double-emit. */
const processedDeaths = new Set();

/** Max age in ticks before a death event is pruned. */
const DEATH_PARTICLE_LIFE = 30;

// ═══════════════════════════════════════════════════════════════════════
// BOSS SHOCKWAVE VFX (Aphrodite — boss siege arrival)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Track active boss shockwave VFX.
 * When _shockwaveFired toggles on a boss, we spawn an expanding ring.
 * Key: boss.id, Value: { bornTick, x, y }
 */
const bossShockwaves = new Map();

/** Duration of the shockwave ring expansion in ticks (~0.5s at 60 tps). */
const BOSS_SHOCKWAVE_LIFE = 30;

/**
 * Register new boss shockwaves this frame.
 * @param {object[]} enemies — sim.enemies array
 * @param {number} tick
 */
function recordBossShockwaves(enemies, tick) {
  for (const enemy of enemies) {
    if (enemy.type !== 'boss' || !enemy.alive) continue;
    if (enemy._shockwaveFired && !bossShockwaves.has(enemy.id)) {
      bossShockwaves.set(enemy.id, {
        bornTick: tick,
        x: enemy.x,
        y: enemy.y,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRYSTAL DROP VFX (Aphrodite — post-kill resource feedback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Active crystal drop particles spawned when enemies die.
 *
 * Each entry represents a single crystal shard created at the death
 * point. Crystals arc outward with gravity-like settling, representing
 * the crystal/essence resource drops the engine processes.
 *
 *   { x, y, bornTick, particles: [{ angle, speed, size, alpha, settle }] }
 *
 * Crystal drops last ~45 ticks (0.75s at 60 tps) — longer than death
 * particles — so the player has time to register the reward.
 */
const crystalDrops = [];

/** Max age in ticks before a crystal drop event is pruned. */
const CRYSTAL_DROP_LIFE = 45;

/**
 * Spawn crystal drop particles at an enemy death position.
 * Called from recordDeathParticles for every newly-detected death.
 *
 * Crystal theme: amber/gold gem shards (#fbbf24 primary accent).
 * Slightly larger, slower, and longer-lived than death particles.
 * Each shard arcs upward and outward, then settles and fades.
 *
 * @param {object} enemy — the dead enemy { x, y, type }
 * @param {number} tick — current sim tick
 */
function spawnCrystalDrops(enemy, tick) {
  // Crystal count scales with enemy threat — bosses drop more
  const dropCount = enemy.type === 'boss' ? 6 : enemy.type === 'tank' ? 3 : 2;
  const particles = [];
  for (let i = 0; i < dropCount; i++) {
    // Fan out in a rough semicircle upward-ish
    const baseAngle = -Math.PI / 2;                             // straight up
    const spread = (i - (dropCount - 1) / 2) * (Math.PI / 5);  // fan ±36°
    const angle = baseAngle + spread + (Math.random() - 0.5) * 0.4;
    const speed = 0.3 + Math.random() * 0.6;                    // slower than death particles
    const size = 1.8 + Math.random() * 2.5;                     // slightly larger
    particles.push({ angle, speed, size, alpha: 1.0 });
  }
  crystalDrops.push({
    x: enemy.x,
    y: enemy.y,
    bornTick: tick,
    particles,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// DAMAGE FLASH SYSTEM (Aphrodite — hit-feedback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Previous HP snapshot per enemy — keyed by enemy.id.
 * Compared against current HP each frame to detect damage taken.
 */
const prevEnemyHp = new Map();

/**
 * Crawler trail particles for swarm motion-blur / skitter effect.
 * Map of crawler.enemy.id → [{ x, y, bornTick }]
 * Trails render as small fading dots behind the crawler, creating
 * a sense of speed and organic swarm movement. Pruned each frame.
 */
const crawlerTrails = new Map();

/** Max age of a crawler trail dot in ticks (~200ms at 60 tps). */
const CRAWLER_TRAIL_LIFE = 12;

/** Spawn a trail dot every N ticks per crawler (throttle prevents clutter). */
const CRAWLER_TRAIL_INTERVAL = 3;

/**
 * Active damage flashes. Keyed by enemy.id → { bornTick, color }.
 * Flash fades over DAMAGE_FLASH_LIFE ticks.
 */
const damageFlashes = new Map();

/** Duration of a damage flash in ticks (~133ms at 60 tps). */
const DAMAGE_FLASH_LIFE = 8;

/**
 * Detect enemies that took damage this frame and register a flash.
 * Called at the start of drawEnemies before drawing any live enemies.
 *
 * @param {object[]} enemies — sim.enemies array
 * @param {number} tick — current sim tick
 */
function recordDamageFlashes(enemies, tick) {
  // Prune expired flashes
  for (const [id, flash] of damageFlashes) {
    if (tick - flash.bornTick > DAMAGE_FLASH_LIFE) {
      damageFlashes.delete(id);
    }
  }

  for (const enemy of enemies) {
    if (!enemy.alive) {
      prevEnemyHp.delete(enemy.id);
      continue;
    }
    const prev = prevEnemyHp.get(enemy.id);
    if (prev !== undefined && prev > enemy.hp) {
      // Enemies takes damage — register a flash
      const visual = ENEMY_VISUAL[enemy.type] || ENEMY_VISUAL.scout;
      damageFlashes.set(enemy.id, { bornTick: tick, color: visual.glowColor });
    }
    prevEnemyHp.set(enemy.id, enemy.hp);
  }

  // Periodically clean prevEnemyHp of dead enemies (every 300 ticks)
  if (tick % 300 === 0 && prevEnemyHp.size > 500) {
    const aliveIds = new Set(enemies.filter(e => e.alive).map(e => e.id));
    for (const id of prevEnemyHp.keys()) {
      if (!aliveIds.has(id)) prevEnemyHp.delete(id);
    }
  }
}

/**
 * Draw a damage flash overlay on an enemy.
 * Renders a brief white-hot pulse that fades over DAMAGE_FLASH_LIFE ticks.
 * Uses the enemy type's glow color tinted toward white for a hit-spark feel
 * — never pure white (anti-glare dark aesthetic).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} enemyId — the enemy's .id field
 * @param {number} tick — current sim tick
 * @param {number} sx, sy — screen-space center of the enemy
 * @param {number} r — render radius in pixels
 */
function drawDamageFlash(ctx, enemyId, tick, sx, sy, r) {
  const flash = damageFlashes.get(enemyId);
  if (!flash) return;

  const age = tick - flash.bornTick;
  if (age > DAMAGE_FLASH_LIFE) {
    damageFlashes.delete(enemyId);
    return;
  }

  const lifeRatio = age / DAMAGE_FLASH_LIFE;  // 0 → 1

  // Flash alpha: quick rise (0 to 0.45 at 20%), then slow fade
  const peakAlpha = 0.4;
  let alpha;
  if (lifeRatio < 0.2) {
    alpha = (lifeRatio / 0.2) * peakAlpha;         // 0 → 0.4
  } else {
    alpha = peakAlpha * (1 - (lifeRatio - 0.2) / 0.8);  // 0.4 → 0
  }

  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer flash glow ring — expands slightly then fades
  const ringR = r * (1.0 + lifeRatio * 0.4);
  const ringAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(flash.color, ringAlpha);
  ctx.fill();

  // Inner hot core — warm cream-white, never pure #fff
  const coreR = r * 0.55;
  ctx.beginPath();
  ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba('#f5f0e8', alpha * 0.35);
  ctx.fill();

  ctx.restore();
}

/**
 * Record death particles when an enemy dies this frame.
 * Called from drawEnemies before drawing live enemies.
 *
 * @param {object[]} enemies — sim.enemies array
 * @param {number} tick — current sim tick
 */
function recordDeathParticles(enemies, tick) {
  for (const enemy of enemies) {
    if (enemy.alive) continue;
    const key = `${enemy.x.toFixed(2)}|${enemy.y.toFixed(2)}|${enemy.type}`;
    if (processedDeaths.has(key)) continue;
    processedDeaths.add(key);

    const visual = ENEMY_VISUAL[enemy.type] || ENEMY_VISUAL.scout;
    const particleCount = enemy.type === 'boss' ? 12 : enemy.type === 'tank' ? 6 : 4;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 0.4 + Math.random() * 0.8;  // cells per tick scaling
      particles.push({ angle, speed, radius: 0.5 + Math.random() * 1.5, alpha: 1.0 });
    }
    deathEvents.push({
      x: enemy.x,
      y: enemy.y,
      color: visual.glowColor,
      bornTick: tick,
      particles,
    });

    // Spawn crystal drop VFX alongside death particles
    spawnCrystalDrops(enemy, tick);
  }
}

/**
 * Draw all active death particles.
 *
 * Two-layer effect per death event:
 *   1. Expanding glow ring (shockwave) — fades from 0.7 → 0 alpha
 *   2. Scattering particles — fly outward and fade individually
 *
 * Called after drawEnemies, before any fog pass.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawDeathParticles(ctx, scale, tick) {
  // Prune expired events
  for (let i = deathEvents.length - 1; i >= 0; i--) {
    if (tick - deathEvents[i].bornTick > DEATH_PARTICLE_LIFE) {
      deathEvents.splice(i, 1);
    }
  }

  // Also prune the processedDeaths set periodically to avoid unbounded growth
  if (tick % 300 === 0 && processedDeaths.size > 1000) {
    processedDeaths.clear();
  }

  for (const event of deathEvents) {
    const age = tick - event.bornTick;
    const lifeRatio = age / DEATH_PARTICLE_LIFE; // 0 → 1
    const sx = event.x * scale;
    const sy = event.y * scale;

    ctx.save();

    // ── Layer 1: Expanding shockwave ring ──────────────────────────
    const ringRadius = lifeRatio * 2.5 * scale;
    const ringAlpha = (1 - lifeRatio) * 0.6; // 0.6 → 0
    if (ringAlpha > 0.01) {
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(event.color, ringAlpha);
      ctx.lineWidth = Math.max(0.8, (1 - lifeRatio) * 3);
      ctx.stroke();
    }

    // ── Layer 2: Scattering glow particles ─────────────────────────
    const particleAlpha = (1 - lifeRatio) * 0.85; // 0.85 → 0
    for (const p of event.particles) {
      const dist = lifeRatio * p.speed * 3 * scale;
      const px = sx + Math.cos(p.angle) * dist;
      const py = sy + Math.sin(p.angle) * dist;
      const pr = p.radius * (1 - lifeRatio * 0.6) * scale * 0.6;

      if (pr < 0.3) continue;

      // Outer glow
      ctx.shadowColor = event.color;
      ctx.shadowBlur = pr * 3;
      ctx.fillStyle = hexToRgba(event.color, particleAlpha);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Bright core
      ctx.fillStyle = hexToRgba('#ffffff', particleAlpha * 0.4);
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Draw all active crystal drop particles on the canvas.
 *
 * Crystal drops are small amber/gold diamond shapes that arc upward
 * from an enemy death point, spread outward, then settle and fade.
 * They represent the crystal/essence resource drops.
 *
 * Three-phase animation per shard:
 *   1. Ascend (0–35% life): arc upward and outward, full opacity
 *   2. Settle (35–60% life): slow descent, slight horizontal drift
 *   3. Fade   (60–100% life): dim to zero, shrink slightly
 *
 * Crystal shards render as small rotated diamonds with a warm
 * amber-gold glow — distinct from death particles' circular glow.
 * The amber color matches the --accent-primary palette (#fbbf24)
 * and the steel resource icon, creating visual continuity between
 * resource economy and combat feedback.
 *
 * Called after drawDeathParticles, before any fog/overlay pass.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawCrystalDrops(ctx, scale, tick) {
  // Prune expired events
  for (let i = crystalDrops.length - 1; i >= 0; i--) {
    if (tick - crystalDrops[i].bornTick > CRYSTAL_DROP_LIFE) {
      crystalDrops.splice(i, 1);
    }
  }

  for (const drop of crystalDrops) {
    const age = tick - drop.bornTick;
    const lifeRatio = age / CRYSTAL_DROP_LIFE; // 0 → 1
    const sx = drop.x * scale;
    const sy = drop.y * scale;

    ctx.save();

    for (const p of drop.particles) {
      // ── Three-phase motion ──────────────────────────────────────
      let px, py, shardAlpha, shardSize;

      if (lifeRatio < 0.35) {
        // Phase 1: Ascend — arc upward and outward
        const phaseProgress = lifeRatio / 0.35;
        const dist = phaseProgress * p.speed * 4 * scale;
        // Arc: initially upward, gravity slowly pulls down
        const arcY = -phaseProgress * p.speed * 2.5 * scale
          + (1 - Math.cos(phaseProgress * Math.PI * 0.5)) * 0.3 * scale;
        px = sx + Math.cos(p.angle) * dist;
        py = sy + arcY;
        shardAlpha = 1.0;
        shardSize = p.size * scale * 0.22;
      } else if (lifeRatio < 0.6) {
        // Phase 2: Settle — drift down, slow horizontal movement
        const phaseProgress = (lifeRatio - 0.35) / 0.25;
        const settleDist = p.speed * 4 * scale + phaseProgress * 0.3 * scale;
        const settleY = -p.speed * 2.5 * scale
          + phaseProgress * p.speed * 1.2 * scale;
        px = sx + Math.cos(p.angle) * settleDist;
        py = sy + settleY;
        shardAlpha = 1.0 - phaseProgress * 0.15; // barely dimmed
        shardSize = p.size * scale * 0.22;
      } else {
        // Phase 3: Fade — dim to zero
        const phaseProgress = (lifeRatio - 0.6) / 0.4;
        const fadeDist = p.speed * 4.3 * scale + (Math.random() - 0.5) * 0.6;
        const fadeY = -p.speed * 2.5 * scale + p.speed * 1.3 * scale;
        px = sx + Math.cos(p.angle) * fadeDist;
        py = sy + fadeY + phaseProgress * 0.2 * scale;
        shardAlpha = Math.max(0, 0.85 - phaseProgress * 0.85);
        shardSize = p.size * scale * (0.22 - phaseProgress * 0.08);
      }

      if (shardAlpha <= 0.01 || shardSize < 0.3) continue;

      // ── Crystal shard: rotated diamond ──────────────────────────
      const crystalColor = '#fbbf24';       // amber-400 — primary accent
      const glowColor = '#fcd34d';           // amber-300 — hover/glow variant

      // Outer glow
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = shardSize * 4;

      // Draw diamond (rhombus) — rotates slightly per shard for variety
      const rotAngle = (p.angle + lifeRatio * 1.5) % (Math.PI * 2);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotAngle);
      ctx.beginPath();
      ctx.moveTo(0, -shardSize * 1.4);
      ctx.lineTo(shardSize, 0);
      ctx.lineTo(0, shardSize * 1.4);
      ctx.lineTo(-shardSize, 0);
      ctx.closePath();

      // Semi-transparent amber fill
      ctx.fillStyle = hexToRgba(crystalColor, shardAlpha * 0.7);
      ctx.fill();

      // Bright edge stroke
      ctx.strokeStyle = hexToRgba(glowColor, shardAlpha * 0.85);
      ctx.lineWidth = Math.max(0.5, shardSize * 0.2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();

      // ── Bright core spark ───────────────────────────────────────
      const sparkAlpha = shardAlpha * 0.6;
      if (sparkAlpha > 0.05) {
        ctx.fillStyle = hexToRgba('#ffffff', sparkAlpha);
        ctx.beginPath();
        ctx.arc(px, py, shardSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

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

// ═══════════════════════════════════════════════════════════════════════
// ENTITY DRAWING — ENEMIES & TURRETS
// ═══════════════════════════════════════════════════════════════════════

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
// CRAWLER TRAIL VFX (Aphrodite — swarm motion-blur feedback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record a trail dot at the crawler's current jittered position.
 * Throttled to CRAWLER_TRAIL_INTERVAL ticks to prevent visual clutter.
 * Trail dots fade over CRAWLER_TRAIL_LIFE ticks.
 *
 * @param {object} enemy — crawler enemy entity
 * @param {number} tick — current sim tick
 * @param {number} jx — jitter offset x (cells)
 * @param {number} jy — jitter offset y (cells)
 */
function recordCrawlerTrail(enemy, tick, jx, jy) {
  // Throttle: one trail dot every CRAWLER_TRAIL_INTERVAL ticks per crawler
  if (tick % CRAWLER_TRAIL_INTERVAL !== (enemy.id || 0) % CRAWLER_TRAIL_INTERVAL) return;

  let trails = crawlerTrails.get(enemy.id);
  if (!trails) {
    trails = [];
    crawlerTrails.set(enemy.id, trails);
  }

  trails.push({
    x: enemy.x + jx,
    y: enemy.y + jy,
    bornTick: tick,
  });

  // Cap trail length per crawler
  if (trails.length > 8) trails.shift();
}

/**
 * Draw crawler motion trails — small fading dots behind moving crawlers.
 *
 * Trails create a sense of speed and skittering swarm movement.
 * Dots shrink and dim as they age, creating a comet-tail effect
 * behind each crawler. Called at the start of drawEnemies so trails
 * sit behind enemy shapes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
function drawCrawlerTrails(ctx, scale, tick) {
  // Prune expired trails
  for (const [id, trails] of crawlerTrails) {
    const live = trails.filter(t => tick - t.bornTick <= CRAWLER_TRAIL_LIFE);
    if (live.length === 0) {
      crawlerTrails.delete(id);
    } else {
      crawlerTrails.set(id, live);
    }
  }

  for (const [, trails] of crawlerTrails) {
    for (const trail of trails) {
      const age = tick - trail.bornTick;
      const lifeRatio = age / CRAWLER_TRAIL_LIFE; // 0 → 1
      const alpha = (1 - lifeRatio) * 0.55; // 0.55 → 0
      if (alpha < 0.02) continue;

      const tx = trail.x * scale;
      const ty = trail.y * scale;
      const dotR = (1 - lifeRatio * 0.6) * scale * 0.12; // shrinks slightly

      ctx.save();
      ctx.fillStyle = hexToRgba('#34d399', alpha); // crawler emerald
      ctx.shadowColor = hexToRgba('#6ee7b7', alpha * 0.5);
      ctx.shadowBlur = dotR * 2;
      ctx.beginPath();
      ctx.arc(tx, ty, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
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
  const { enemies = [], tick = 0, baseCenter } = sim;
  if (enemies.length === 0) return;

  // ── Draw crawler motion trails (behind all enemies) ──────────────
  drawCrawlerTrails(ctx, scale, tick);

  // Record deaths BEFORE drawing live enemies (so particles spawn same frame)
  recordDeathParticles(enemies, tick);

  // Detect damage taken and register flashes
  recordDamageFlashes(enemies, tick);

  // Detect new boss shockwaves for VFX
  recordBossShockwaves(enemies, tick);

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    drawEnemy(ctx, enemy, scale, tick, baseCenter);
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
 * @param {object} [baseCenter] — { x, y } base position for movement-direction calc
 */
function drawEnemy(ctx, enemy, scale, tick, baseCenter) {
  const visual = ENEMY_VISUAL[enemy.type] || { color: '#888888', glowColor: '#aaaaaa', shape: 'dot' };

  // ── Crawler smooth position jitter ──────────────────────────────
  // Jitter perpendicular to movement direction (enemy → base) for
  // organic swarm spread. Each crawler has a persistent sinusoidal
  // phase seeded from enemy.id — wobbles smoothly, never teleports.
  // If the AI provides _jitterX/_jitterY those take precedence.
  let jx = 0, jy = 0;
  if (enemy.type === 'crawler') {
    if (enemy._jitterX !== undefined && enemy._jitterY !== undefined) {
      jx = enemy._jitterX;
      jy = enemy._jitterY;
    } else {
      // Movement direction: enemy → base center (or toward enemy.x if unavailable)
      const toBaseX = (baseCenter?.x ?? enemy.x) - enemy.x;
      const toBaseY = (baseCenter?.y ?? enemy.y) - enemy.y;
      const dist = Math.sqrt(toBaseX * toBaseX + toBaseY * toBaseY) || 1;
      const dirX = toBaseX / dist;
      const dirY = toBaseY / dist;
      // Perpendicular vector (rotate 90° CW) — jitter across movement line
      const perpX = dirY;
      const perpY = -dirX;
      // Deterministic sinusoidal wobble per crawler — smooth across ticks
      const phase = ((enemy.id || 0) * 7919) % 360;
      const amp = 0.3; // cells — matches SWARM.jitter
      const speed = 0.12; // radians per tick
      const wobble = Math.sin(tick * speed + phase * 0.01745) * amp;
      jx = perpX * wobble;
      jy = perpY * wobble;

      // ── Spawn trail particles behind moving crawlers ────────────
      recordCrawlerTrail(enemy, tick, jx, jy);
    }
  }

  const sx = (enemy.x + jx) * scale;
  const sy = (enemy.y + jy) * scale;
  const r = (enemy.size || 0.8) * scale;

  ctx.save();

  // ── Outer glow ──────────────────────────────────────────────────
  let glowColor = visual.glowColor;
  let shadowBlur = r * 0.8;

  // Boss enrage: intensify glow, shift toward rose
  if (enemy.type === 'boss' && enemy._enraged) {
    glowColor = '#f472b6'; // rose
    shadowBlur = r * 1.5;
  }

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = shadowBlur;

  switch (visual.shape) {
    case 'diamond':    drawDiamondShape(ctx, sx, sy, r, visual.color); break;
    case 'hexagon':    drawHexagonShape(ctx, sx, sy, r, visual.color); break;
    case 'cross':      drawCrossShape(ctx, sx, sy, r, visual.color); break;
    case 'dot':        drawDotShape(ctx, sx, sy, r, visual.color, enemy.type, tick); break;
    case 'pentagram':  drawPentagramShape(ctx, sx, sy, r, visual.color, enemy._enraged); break;
    default:           drawDotShape(ctx, sx, sy, r, visual.color, enemy.type, tick);
  }

  // ── Tank taunt indicator ────────────────────────────────────────
  if (enemy._taunted) {
    const tauntColor = '#fbbf24'; // amber
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.3, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(tauntColor, 0.4);
    ctx.lineWidth = Math.max(1.2, r * 0.08);
    ctx.setLineDash([r * 0.4, r * 0.25]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // ── Health bar ──────────────────────────────────────────────────
  drawHealthBar(ctx, sx, sy, enemy.hp, enemy.maxHp, enemy.size || 0.8, scale);

  // ── Boss enrage particle emanation (post-restore, float above) ──
  if (enemy.type === 'boss' && enemy._enraged) {
    drawEnrageParticles(ctx, sx, sy, r, tick);
  }

  // ── Damage flash overlay ────────────────────────────────────────
  drawDamageFlash(ctx, enemy.id, tick, sx, sy, r);
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
 *
 * When enraged: brighter fill, thicker stroke, and a second pulsing
 * outer ring — the star itself radiates threat.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx — center x in pixels
 * @param {number} cy — center y in pixels
 * @param {number} r — radius in pixels
 * @param {string} color — hex color for the star
 * @param {boolean} [enraged=false] — whether the boss is enraged
 */
function drawPentagramShape(ctx, cx, cy, r, color, enraged = false) {
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
  ctx.fillStyle = hexToRgba(color, enraged ? 0.35 : 0.2);
  ctx.fill();

  // Stroke
  ctx.strokeStyle = enraged ? '#fbbf24' : color; // gold-amber when enraged
  ctx.lineWidth = Math.max(1.5, r * (enraged ? 0.18 : 0.12));
  ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR * 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(color, enraged ? 0.55 : 0.35);
  ctx.lineWidth = Math.max(0.5, r * (enraged ? 0.08 : 0.05));
  ctx.stroke();

  // Enraged: second outer ring (pulse feel)
  if (enraged) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#f472b6', 0.3); // rose
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BOSS ENRAGE PARTICLES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw floating particle emanation around an enraged boss.
 *
 * Small rose/gold dots drift outward from the boss perimeter in a
 * circular orbit, fading as they travel. Particles are seeded
 * deterministically per tick so they don't jitter randomly.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sx — boss center x in pixels
 * @param {number} sy — boss center y in pixels
 * @param {number} r — boss radius in pixels
 * @param {number} tick — current sim tick
 */
function drawEnrageParticles(ctx, sx, sy, r, tick) {
  const particleCount = 8;
  const orbitR = r * 1.3; // start at edge of outer ring
  const driftSpeed = 0.06; // pixels of outward drift per tick

  for (let i = 0; i < particleCount; i++) {
    // Deterministic per-particle angle: rotates slowly, drifts outward
    const baseAngle = (i / particleCount) * Math.PI * 2;
    const rotateSpeed = 0.04; // rad/tick
    const angle = baseAngle + tick * rotateSpeed;

    // Outward drift: particles cycle every 20 ticks
    const cycle = (tick + i * 7) % 20;
    const lifeRatio = cycle / 20;
    const dist = orbitR + lifeRatio * r * 0.8;
    const alpha = (1 - lifeRatio) * 0.5; // 0.5 → 0

    if (alpha < 0.02) continue;

    const px = sx + Math.cos(angle) * dist;
    const py = sy + Math.sin(angle) * dist;
    const pr = 1.2 + (1 - lifeRatio) * 1.5; // shrinks as it drifts

    // Glow core
    ctx.save();
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = pr * 2;
    ctx.fillStyle = hexToRgba('#fbbf24', alpha); // gold
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bright center
    ctx.fillStyle = hexToRgba('#ffffff', alpha * 0.4);
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BOSS SHOCKWAVE VFX DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw active boss shockwave expanding rings.
 *
 * Called after drawDeathParticles, before any fog pass. Each ring
 * expands from 0 → 3 cells over SHOCKWAVE_LIFE ticks (30 ticks ~ 0.5s),
 * fading from alpha 0.6 → 0. Color: cyan #22d3ee.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawBossShockwaves(ctx, scale, tick) {
  // Prune expired shockwaves
  for (const [id, sw] of bossShockwaves) {
    if (tick - sw.bornTick > BOSS_SHOCKWAVE_LIFE) {
      bossShockwaves.delete(id);
    }
  }

  for (const [, sw] of bossShockwaves) {
    const age = tick - sw.bornTick;
    const lifeRatio = age / BOSS_SHOCKWAVE_LIFE; // 0 → 1
    const sx = sw.x * scale;
    const sy = sw.y * scale;

    // Ring expands from 0 to 3.0 cells
    const maxRadius = 3.0 * scale;
    const ringRadius = lifeRatio * maxRadius;
    // Alpha: 0.6 → 0
    const ringAlpha = (1 - lifeRatio) * 0.6;

    if (ringAlpha < 0.01) continue;

    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = ringRadius * 0.15;

    // Main ring stroke
    ctx.beginPath();
    ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#22d3ee', ringAlpha);
    ctx.lineWidth = Math.max(1.5, (1 - lifeRatio) * 4);
    ctx.stroke();

    // Inner bright core ring (thinner, brighter)
    const innerAlpha = ringAlpha * 0.7;
    if (innerAlpha > 0.02) {
      ctx.beginPath();
      ctx.arc(sx, sy, ringRadius * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba('#67e8f9', innerAlpha);
      ctx.lineWidth = Math.max(0.8, (1 - lifeRatio) * 1.5);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TURRET MUZZLE FLASH VFX (Aphrodite — firing feedback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Active muzzle flash events. Each entry:
 *   { x, y, bornTick, color, isMortar }
 *
 * Spawned when a turret fires (detected via laserCd/mortarCd state
 * transition from 0 → max). Flash expands as a bright ring + core
 * glow over 6 ticks (~100ms), fading to nothing.
 */
const muzzleFlashes = [];

/** Map of turret.id → previous laserCd value for fire detection. */
const prevLaserCd = new Map();

/** Map of turret.id → previous mortarCd value for fire detection. */
const prevMortarCd = new Map();

/** Max age in ticks before a muzzle flash is pruned (~100ms at 60 tps). */
const MUZZLE_FLASH_LIFE = 6;

/**
 * Scan turrets for firing events and record muzzle flashes.
 *
 * A turret is considered to have fired when laserCd jumps from 0
 * (ready) to its max value (just fired and reset). Same for mortarCd.
 * The flash appears at the turret's world position.
 *
 * Called once per frame before drawTurrets.
 *
 * @param {object[]} turrets — sim.turrets array
 * @param {number} tick — current sim tick
 */
function recordTurretMuzzleFlashes(turrets, tick) {
  for (const turret of turrets) {
    if (!turret.alive) continue;

    const prevCd = prevLaserCd.get(turret.id) ?? 0;
    // Fire detected: previous tick at 0, current tick at max (just reset)
    if (prevCd === 0 && turret.laserCd === turret.laserCdMax && turret.laserCdMax > 0) {
      muzzleFlashes.push({
        x: turret.x,
        y: turret.y,
        bornTick: tick,
        color: turret.type === 'turret' ? '#6ba4c7' : '#4b8bb4',
        isMortar: false,
      });
    }
    prevLaserCd.set(turret.id, turret.laserCd);

    // Mortar fire detection
    if (turret.hasMortar) {
      const prevMCd = prevMortarCd.get(turret.id) ?? 0;
      if (prevMCd === 0 && turret.mortarCd === turret.mortarCdMax && turret.mortarCdMax > 0) {
        muzzleFlashes.push({
          x: turret.x,
          y: turret.y,
          bornTick: tick,
          color: '#fbbf24',  // amber — mortar has distinct explosive feel
          isMortar: true,
        });
      }
      prevMortarCd.set(turret.id, turret.mortarCd);
    }
  }
}

/**
 * Draw active muzzle flash VFX.
 *
 * Renders a two-layer flash at each event position:
 *   1. Expanding outer ring — pulses from 0.15→0.40 cells over life,
 *      fading alpha 0.7→0, with shadowBlur glow
 *   2. Bright core circle — white-hot center, shrinks 0.10→0 cells,
 *      alpha 0.9→0
 *
 * Colors: steel-blue for lasers (#6ba4c7 / #4b8bb4),
 *          amber for mortars (#fbbf24).
 *
 * Called from drawTurrets (or after), before any overlay pass.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick
 */
export function drawTurretMuzzleFlashes(ctx, scale, tick) {
  // Prune expired flashes
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    if (tick - muzzleFlashes[i].bornTick > MUZZLE_FLASH_LIFE) {
      muzzleFlashes.splice(i, 1);
    }
  }

  for (const mf of muzzleFlashes) {
    const age = tick - mf.bornTick;
    const lifeRatio = age / MUZZLE_FLASH_LIFE; // 0 → 1

    const sx = mf.x * scale;
    const sy = mf.y * scale;

    // Ring: expands 0.15 → 0.40 cells
    const ringInner = (0.15 + lifeRatio * 0.25) * scale;
    const ringOuter = ringInner + Math.max(1.5, scale * 0.08);
    // Alpha: 0.7 → 0 (quick falloff)
    const ringAlpha = (1 - lifeRatio) * 0.7;

    // Core: shrinks 0.10 → 0 cells
    const coreRadius = Math.max(0.5, (1 - lifeRatio) * 0.10 * scale);
    const coreAlpha = (1 - lifeRatio) * 0.9;

    if (ringAlpha < 0.02 && coreAlpha < 0.02) continue;

    ctx.save();

    // ── Outer glow ring ───────────────────────────────────────────
    if (ringAlpha > 0.02) {
      ctx.shadowColor = mf.color;
      ctx.shadowBlur = ringOuter * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, ringOuter, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(mf.color, ringAlpha);
      ctx.lineWidth = Math.max(1, ringOuter - ringInner);
      ctx.stroke();
    }

    // ── Bright core ───────────────────────────────────────────────
    if (coreAlpha > 0.02) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = coreRadius * 3;
      ctx.fillStyle = hexToRgba('#ffffff', coreAlpha);
      ctx.beginPath();
      ctx.arc(sx, sy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner white-hot speck
      ctx.shadowBlur = coreRadius * 5;
      ctx.fillStyle = hexToRgba('#ffffff', coreAlpha * 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, coreRadius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
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
 * Also records muzzle flash events for firing turrets (detected via
 * laserCd/mortarCd state transitions).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.turrets)
 * @param {number} scale — pixels per cell
 */
export function drawTurrets(ctx, sim, scale) {
  const { turrets = [], tick = 0 } = sim;
  if (turrets.length === 0) return;

  // Detect firing events before drawing turrets
  recordTurretMuzzleFlashes(turrets, tick);

  for (const turret of turrets) {
    if (!turret.alive) continue;
    drawTurret(ctx, turret, scale);
  }

  // Draw muzzle flashes on top of turrets
  drawTurretMuzzleFlashes(ctx, scale, tick);
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

/**
 * Draw a selection ring around the currently selected turret.
 *
 * Renders a 1–2px glow border at #6ba4c7 (60% alpha) with a subtle
 * pulse animation. Called after all turrets are drawn so the ring
 * sits on top of the selected turret.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.selectedEntityId, sim.turrets)
 * @param {number} scale — pixels per cell
 */
export function drawSelectionRing(ctx, sim, scale) {
  const { selectedEntityId, turrets = [] } = sim;
  if (selectedEntityId == null) return;

  const turret = turrets.find((t) => t.id === selectedEntityId && t.alive);
  if (!turret) return;

  const isAdvanced = turret.type === 'turret';
  const r = (isAdvanced ? 0.65 : 0.5) * (turret.mounted ? 1.15 : 1.0) * scale;
  const sx = turret.x * scale;
  const sy = turret.y * scale;
  const ringR = r * 1.3;

  ctx.save();

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(107, 164, 199, 0.6)';  // #6ba4c7 at 60%
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.stroke();

  // Inner crisp ring (1px)
  ctx.beginPath();
  ctx.arc(sx, sy, ringR * 0.88, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(107, 164, 199, 0.85)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// BOT DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Visual tokens for Chime-Forged worker bots.
 *
 * Colour palette per state — industrial steel-blue baseline with
 * functional state tints mapped to the BotLabourHUD colour scheme:
 *   MOVING/IDLE: steel blue (infrastructure)
 *   HARVEST_STONE: amber (resource-gathering)
 *   RETURN_STONE: sky-cyan (returning with cargo)
 *   DEPOSIT_STONE: emerald flash (unloading at base)
 */
const BOT_VISUAL = {
  base:       { fill: '#4ea0c9', glow: '#6ba4c7', label: 'Idle' },
  moving:     { fill: '#4ea0c9', glow: '#6ba4c7', label: 'Moving' },
  harvesting: { fill: '#fbbf24', glow: '#fcd34d', label: 'Harvesting' },  // amber — matches HRV
  returning:  { fill: '#38bdf8', glow: '#7dd3fc', label: 'Returning' },   // sky — matches RTR
  depositing: { fill: '#34d399', glow: '#6ee7b7', label: 'Depositing' },  // emerald flash
};

/** State-to-visual-key mapping. Falls back to base for unrecognised states. */
const BOT_STATE_VISUAL = {
  IDLE:           'base',
  MOVING:         'moving',
  HARVEST_STONE:  'harvesting',
  RETURN_STONE:   'returning',
  DEPOSIT_STONE:  'depositing',
};

/**
 * Draw all worker bots on the canvas.
 *
 * Bots render as small hexagonal chassis — an industrial counterpart to
 * the larger turret hex shapes. State-dependent colour tells the player
 * what each bot is doing without reading the HUD. Bots carrying stone
 * show an amber cargo dot. Moving bots leave a subtle motion trail.
 *
 * Called after turrets, before walls — bots are mobile infrastructure
 * that moves between resource zones and the base.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.bots, sim.tick)
 * @param {number} scale — pixels per cell
 */
export function drawBots(ctx, sim, scale) {
  const { bots = [], tick = 0 } = sim;
  if (bots.length === 0) return;

  for (const bot of bots) {
    drawBot(ctx, bot, scale, tick);
  }
}

/**
 * Draw a single worker bot.
 *
 * Renders as a small flat-top hexagon (echoes turret shape language at
 * reduced scale). State-driven colour changes are instant (no lerp) so
 * the player can read bot intent at a glance.
 *
 * Visual elements (back to front):
 *   1. Motion trail — 2 fading dots behind the bot when moving
 *   2. Hexagon chassis — filled + stroked, state-coloured
 *   3. Cargo dot — amber centre dot when carryingStone > 0
 *   4. Deposit flash — emerald ring pulse when at DEPOSIT_STONE
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} bot — { x, y, state, size, carryingStone, speed, ... }
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick (for deposit pulse)
 */
function drawBot(ctx, bot, scale, tick) {
  const visualKey = BOT_STATE_VISUAL[bot.state] || 'base';
  const visual = BOT_VISUAL[visualKey] || BOT_VISUAL.base;
  const sx = bot.x * scale;
  const sy = bot.y * scale;
  const r = (bot.size || 0.6) * scale;

  const isMoving = bot.state === 'MOVING'
    || bot.state === 'HARVEST_STONE'
    || bot.state === 'RETURN_STONE';

  ctx.save();

  // ── Motion trail (moving bots only) ─────────────────────────────
  if (isMoving && bot.speed > 0) {
    // Direction inferred from target or recent movement
    const dirX = bot.targetX != null ? bot.targetX - bot.x : 0;
    const dirY = bot.targetY != null ? bot.targetY - bot.y : 0;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const ndx = dirX / dirLen;
    const ndy = dirY / dirLen;

    // Two trail dots behind the bot, fading with distance
    for (let t = 1; t <= 2; t++) {
      const trailAlpha = 0.3 - t * 0.12;       // 0.18, 0.06
      if (trailAlpha <= 0.01) continue;
      const tx = sx - ndx * r * t * 1.6;
      const ty = sy - ndy * r * t * 1.6;
      const tr = r * (0.45 - t * 0.12);

      ctx.fillStyle = hexToRgba(visual.glow, trailAlpha);
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Subtle outer glow ───────────────────────────────────────────
  ctx.shadowColor = visual.glow;
  ctx.shadowBlur = r * 0.35;

  // ── Hexagonal chassis ───────────────────────────────────────────
  const sides = 6;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * i) / sides;  // flat-top
    const px = sx + r * 0.8 * Math.cos(angle);
    const py = sy + r * 0.8 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = hexToRgba(visual.fill, 0.55);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(visual.fill, 0.85);
  ctx.lineWidth = Math.max(0.8, r * 0.15);
  ctx.stroke();

  ctx.shadowBlur = 0;

  // ── Cargo dot (carrying stone) ──────────────────────────────────
  if (bot.carryingStone > 0) {
    const cargoR = r * 0.28;
    ctx.fillStyle = '#fbbf24';   // amber — matches stone resource
    ctx.shadowColor = '#fcd34d';
    ctx.shadowBlur = cargoR * 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, cargoR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Deposit flash (unloading at base) ───────────────────────────
  if (bot.state === 'DEPOSIT_STONE') {
    const pulse = (Math.sin(tick * 0.4) + 1) / 2;   // ~4 Hz shimmer
    const ringAlpha = 0.3 + pulse * 0.4;              // 0.3–0.7
    ctx.strokeStyle = hexToRgba('#6ee7b7', ringAlpha);
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// WALL DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Visual tokens per wall level — colours and styling for the renderer.
 *
 * Palette follows the "beautiful desolation" aesthetic:
 *   L1 Barricade   — rough fieldstone, warm earth tones
 *   L2 Reinforced  — dressed stone with metallic bindings
 *   L3 Root-Bound  — stone shot through with green resonance tendrils
 *   L4 Deep-Root   — dark bastion stone with amber ward-light glow
 */
const WALL_VISUAL = [
  { fill: '#8b7355', stroke: '#6b5b45', accent: '#a09080', label: 'Barricade' },
  { fill: '#6b6b7b', stroke: '#55556b', accent: '#8b8b9b', label: 'Reinforced' },
  { fill: '#5b6b4b', stroke: '#4b5b3b', accent: '#7b9b5b', label: 'Root-Bound' },
  { fill: '#5b4b3b', stroke: '#4b3b2b', accent: '#c4a44a', label: 'Deep-Root' },
];

/**
 * Draw all alive wall segments on the canvas.
 *
 * Called after turrets, before any fog/overlay pass.
 * Walls render as rectangular stone blocks with level-based coloring,
 * subtle masonry line detail, building animation (alpha pulse), and
 * health bars. Damaged walls show crack lines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.walls, sim.tick)
 * @param {number} scale — pixels per cell
 */
export function drawWalls(ctx, sim, scale) {
  const { walls = [], tick = 0 } = sim;
  if (walls.length === 0) return;

  for (const wall of walls) {
    if (!wall.alive) continue;
    drawWall(ctx, wall, scale, tick);
  }
}

/**
 * Draw a single wall segment.
 *
 * Renders as a rectangular stone block (slightly wider than tall)
 * with level-based color, masonry line details, a subtle glow on
 * higher tiers, and a health bar. Walls being built pulse their
 * alpha. Damaged walls (HP < 50%) show fracture lines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} wall — { x, y, level, hp, maxHp, radius, building, ... }
 * @param {number} scale — pixels per cell
 * @param {number} tick — current sim tick (for building pulse)
 */
function drawWall(ctx, wall, scale, tick) {
  const visual = WALL_VISUAL[Math.min(wall.level, 3)] || WALL_VISUAL[0];
  const sx = wall.x * scale;
  const sy = wall.y * scale;
  const r = (wall.radius || 0.8) * scale;
  // Block shape: slightly wider than tall, like a masonry stone
  const hw = r * 1.05;
  const hh = r * 0.85;

  // ── Building animation: alpha pulse 0.35 → 0.9 at ~3 Hz ─────────
  let alpha = 1.0;
  let buildingGlow = 0;
  if (wall.building) {
    const pulse = (Math.sin(tick * 0.3) + 1) / 2;           // 0.0–1.0
    alpha = 0.35 + pulse * 0.55;                            // 0.35–0.90
    buildingGlow = pulse * 0.4;                              // construction shimmer
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // ── Block body ───────────────────────────────────────────────────
  // Rounded rectangle — reads as a dressed stone block
  const cornerR = Math.max(2, r * 0.2);
  ctx.beginPath();
  ctx.moveTo(sx - hw + cornerR, sy - hh);
  ctx.lineTo(sx + hw - cornerR, sy - hh);
  ctx.arcTo(sx + hw, sy - hh, sx + hw, sy - hh + cornerR, cornerR);
  ctx.lineTo(sx + hw, sy + hh - cornerR);
  ctx.arcTo(sx + hw, sy + hh, sx + hw - cornerR, sy + hh, cornerR);
  ctx.lineTo(sx - hw + cornerR, sy + hh);
  ctx.arcTo(sx - hw, sy + hh, sx - hw, sy + hh - cornerR, cornerR);
  ctx.lineTo(sx - hw, sy - hh + cornerR);
  ctx.arcTo(sx - hw, sy - hh, sx - hw + cornerR, sy - hh, cornerR);
  ctx.closePath();

  ctx.fillStyle = hexToRgba(visual.fill, 0.75);
  ctx.fill();
  ctx.strokeStyle = visual.stroke;
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  ctx.stroke();

  // ── Masonry lines ────────────────────────────────────────────────
  // Two subtle horizontal lines across the block — reads as stone courses
  ctx.strokeStyle = hexToRgba(visual.stroke, 0.3);
  ctx.lineWidth = Math.max(0.5, r * 0.05);
  for (let dy = -hh * 0.35; dy <= hh * 0.35; dy += hh * 0.7) {
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.75, sy + dy);
    ctx.lineTo(sx + hw * 0.75, sy + dy);
    ctx.stroke();
  }

  // ── Level accent details ─────────────────────────────────────────
  if (wall.level >= 2) {
    // L3 Root-Bound: green resonance tendril veins
    const tendrilAlpha = wall.level === 3 ? 0.4 : 0.25;
    ctx.strokeStyle = hexToRgba(wall.level === 3 ? '#c4a44a' : '#7b9b5b', tendrilAlpha);
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    // Vertical tendrils
    for (let dx = -hw * 0.4; dx <= hw * 0.4; dx += hw * 0.4) {
      ctx.beginPath();
      ctx.moveTo(sx + dx, sy - hh * 0.8);
      ctx.lineTo(sx + dx + hw * 0.1, sy + hh * 0.8);
      ctx.stroke();
    }
  }

  // ── L4 ward-light glow ───────────────────────────────────────────
  if (wall.level === 3) {
    ctx.shadowColor = '#c4a44a';
    ctx.shadowBlur = r * 0.6;
    // Re-stroke with glow shadow for the amber ward-light aura
    ctx.beginPath();
    ctx.moveTo(sx - hw + cornerR, sy - hh);
    ctx.lineTo(sx + hw - cornerR, sy - hh);
    ctx.arcTo(sx + hw, sy - hh, sx + hw, sy - hh + cornerR, cornerR);
    ctx.lineTo(sx + hw, sy + hh - cornerR);
    ctx.arcTo(sx + hw, sy + hh, sx + hw - cornerR, sy + hh, cornerR);
    ctx.lineTo(sx - hw + cornerR, sy + hh);
    ctx.arcTo(sx - hw, sy + hh, sx - hw, sy + hh - cornerR, cornerR);
    ctx.lineTo(sx - hw, sy - hh + cornerR);
    ctx.arcTo(sx - hw, sy - hh, sx - hw + cornerR, sy - hh, cornerR);
    ctx.closePath();
    ctx.strokeStyle = hexToRgba('#c4a44a', 0.35);
    ctx.lineWidth = Math.max(2, r * 0.2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Building shimmer overlay ─────────────────────────────────────
  if (buildingGlow > 0.01) {
    ctx.fillStyle = hexToRgba('#ffffff', buildingGlow);
    ctx.beginPath();
    ctx.moveTo(sx - hw + cornerR, sy - hh);
    ctx.lineTo(sx + hw - cornerR, sy - hh);
    ctx.arcTo(sx + hw, sy - hh, sx + hw, sy - hh + cornerR, cornerR);
    ctx.lineTo(sx + hw, sy + hh - cornerR);
    ctx.arcTo(sx + hw, sy + hh, sx + hw - cornerR, sy + hh, cornerR);
    ctx.lineTo(sx - hw + cornerR, sy + hh);
    ctx.arcTo(sx - hw, sy + hh, sx - hw, sy + hh - cornerR, cornerR);
    ctx.lineTo(sx - hw, sy - hh + cornerR);
    ctx.arcTo(sx - hw, sy - hh, sx - hw + cornerR, sy - hh, cornerR);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // ── Damage cracks (below 50% HP) ─────────────────────────────────
  const hpRatio = wall.maxHp > 0 ? wall.hp / wall.maxHp : 1;
  if (hpRatio < 0.5) {
    const crackAlpha = (0.5 - hpRatio) * 1.6;  // 0 at 50%, 0.8 at 0%
    ctx.save();
    ctx.globalAlpha = crackAlpha;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    // Diagonal crack lines
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.5, sy - hh * 0.6);
    ctx.lineTo(sx + hw * 0.2, sy);
    ctx.lineTo(sx - hw * 0.3, sy + hh * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + hw * 0.4, sy - hh * 0.5);
    ctx.lineTo(sx - hw * 0.1, sy + hh * 0.1);
    ctx.lineTo(sx + hw * 0.3, sy + hh * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // ── Health bar ────────────────────────────────────────────────────
  drawHealthBar(ctx, sx, sy, wall.hp, wall.maxHp, (wall.radius || 0.8) * 1.5, scale);
}

// ═══════════════════════════════════════════════════════════════════════
// DAY/NIGHT AMBIENT OVERLAY (Aphrodite — atmospheric final pass)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Day/night phase ambient overlay tints per phase.
 *
 * Each phase has a tint color, alpha ceiling, and composite operation.
 * The overlay is the final render pass — it sits above all entities
 * and transforms the emotional register of the entire scene.
 *
 * Composite operation choices:
 *   - 'multiply' for night: darkens everything, deepens shadows
 *   - 'overlay' for dusk: rich orange-blue tension, contrast boost
 *   - 'source-atop' with alpha for dawn: warm wash
 *   - plain alpha fill for day: barely-there, doesn't flatten contrast
 */
const PHASE_AMBIENT = {
  dawn:  { color: '#F4A460', alpha: 0.10, composite: 'source-atop', desc: 'warm amber wash — the wardstone stirs' },
  day:   { color: '#FFF8E7', alpha: 0.03, composite: 'source-over', desc: 'barely-there warmth — safe, bright' },
  dusk:  { color: '#FF6B35', alpha: 0.14, composite: 'overlay',     desc: 'deepening orange-blue — the Shroud gathers' },
  night: { color: '#0a0a20', alpha: 0.22, composite: 'multiply',    desc: 'deep midnight — darkness absolute' },
};

/**
 * Draw the day/night ambient overlay as the final render pass.
 *
 * Applies a full-canvas phase-tinted overlay with smooth transitions
 * between phases (using hud.phaseBlend). The overlay sits above all
 * entity drawing — background, base, enemies, turrets, bots, walls,
 * particles, shockwaves — and below any HUD/UI chrome (which renders
 * in the React DOM layer, not on the canvas).
 *
 * Night uses 'multiply' composite mode which preserves entity glow
 * effects (shadowBlur, lighter-mode flashes) while darkening the
 * background. This creates a natural "glow pops at night" effect
 * without any entity-specific logic.
 *
 * A subtle vignette darkening is applied at night to draw the eye
 * toward the center (the base) and create a claustrophobic feel.
 *
 * Called once per frame, after all entity draw calls, before the
 * canvas is presented to the DOM.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW — canvas pixel width
 * @param {number} canvasH — canvas pixel height
 * @param {object} sim — sim state (reads sim.hud)
 * @param {number} tick — current sim tick (for subtle pulsing)
 */
export function drawDayNightOverlay(ctx, canvasW, canvasH, sim, tick) {
  const { hud } = sim;
  if (!hud?.dayPhase) return;

  const fromKey = hud.dayPhase;
  const from = PHASE_AMBIENT[fromKey] || PHASE_AMBIENT.day;

  // Blend toward next phase
  const phaseIdx = DAY_CYCLE.phaseOrder.indexOf(fromKey);
  const nextKey = DAY_CYCLE.phaseOrder[(phaseIdx + 1) % 4];
  const to = PHASE_AMBIENT[nextKey] || PHASE_AMBIENT.day;
  const blend = hud.phaseBlend ?? 0;

  // Lerp color channels
  const fc = hexToRgb(from.color);
  const tc = hexToRgb(to.color);
  const rc = Math.round(fc.r + (tc.r - fc.r) * blend);
  const gc = Math.round(fc.g + (tc.g - fc.g) * blend);
  const bc = Math.round(fc.b + (tc.b - fc.b) * blend);

  // Lerp alpha
  const alpha = from.alpha + (to.alpha - from.alpha) * blend;

  // Composite mode: use the dominant mode (from), transition at blend > 0.5
  const composite = blend < 0.5 ? from.composite : to.composite;

  if (alpha < 0.005) return; // invisible — skip

  ctx.save();

  // ── Main phase tint fill ────────────────────────────────────────
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = `rgba(${rc}, ${gc}, ${bc}, ${alpha})`;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ── Night vignette: radial darkening toward edges ────────────────
  // Only active during night and night-leaning transitions.
  // Uses screen-space center-of-mass (baseCenter) if available,
  // else falls back to canvas center.
  const nightWeight = fromKey === 'night' ? (1 - blend)
    : nextKey === 'night' ? blend
    : 0;

  if (nightWeight > 0.05) {
    // Base center for vignette origin
    const bcx = (sim.baseCenter?.x ?? sim.world.width / 2) * (canvasW / (sim.world.width || 50));
    const bcy = (sim.baseCenter?.y ?? sim.world.height / 2) * (canvasH / (sim.world.height || 50));
    const maxDim = Math.max(canvasW, canvasH);

    ctx.globalCompositeOperation = 'multiply';

    const vignette = ctx.createRadialGradient(
      bcx, bcy, maxDim * 0.1,
      canvasW / 2, canvasH / 2, maxDim * 0.75
    );
    const vAlpha = nightWeight * 0.35; // max 35% edge darkening at full night
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.4, `rgba(0, 0, 10, ${vAlpha * 0.3})`);
    vignette.addColorStop(0.75, `rgba(0, 0, 10, ${vAlpha * 0.8})`);
    vignette.addColorStop(1, `rgba(0, 0, 10, ${vAlpha})`);

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  ctx.restore();
}

/**
 * Parse a hex color string into { r, g, b } integer components.
 *
 * @param {string} hex — '#rrggbb'
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
