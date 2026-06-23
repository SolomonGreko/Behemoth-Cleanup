/**
 * render/entities.js — Entity rendering for Behemoth.
 *
 * All enemy, turret, bot, wall, and entity-related VFX drawing code.
 * Pure rendering functions that take a CanvasRenderingContext2D and
 * sim state, called from the render pipeline.
 *
 * Extracted from render.js — pure extraction, no logic changes.
 *
 * Named exports only (no default exports).
 */

import { drawHealthBar } from './hud.js';


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
// ENTITY DRAWING — ENEMIES & TURRETS
// ═══════════════════════════════════════════════════════════════════════

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
 * Barrel rotates toward _aimX/_aimY (set by tickTurrets) with a smooth
 * slew — the barrel lags behind the actual aim direction by ~10 ticks
 * for a mechanical servo feel.
 *
 * Color: steel blue-gray (#4b8bb4 for watchers, #6ba4c7 for turrets).
 * Glow is subtle — turrets are infrastructure, not spectacle.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} turret — { x, y, type, hasMortar, mounted, hp, maxHp, _aimX, _aimY, ... }
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

  // ── Shadow beneath turret (depth cue) ─────────────────────────
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = r * 0.25;
  ctx.shadowOffsetX = -r * 0.08;
  ctx.shadowOffsetY = r * 0.1;

  // ── Hexagonal base ──────────────────────────────────────────
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = r * 0.4;
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

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // ── Inner platform (advanced turrets only) ──────────────────
  if (isAdvanced) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = r * 0.15;
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
    ctx.shadowBlur = 0;
  }

  // ── Barrel — rotates toward aim target ───────────────────────
  const barrelLen = r * (turret.hasMortar ? 1.3 : isAdvanced ? 1.1 : 0.8);
  const barrelW = turret.hasMortar ? 2.5 : 1.5;

  // Compute barrel angle: aim toward _aimX/_aimY if available,
  // otherwise default to upward (-π/2). Slew toward target for
  // mechanical feel: lerp current angle toward target angle.
  let targetAngle = -Math.PI / 2; // default: up
  if (turret._aimX != null && turret._aimY != null) {
    targetAngle = Math.atan2(turret._aimY - turret.y, turret._aimX - turret.x);
  }

  // Smooth slew: init current angle if unset, then lerp toward target
  if (turret._barrelAngle == null) turret._barrelAngle = targetAngle;
  const slewRate = 0.35; // radians per tick — fast but mechanical
  let diff = targetAngle - turret._barrelAngle;
  // Wrap to [-π, π]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  turret._barrelAngle += Math.sign(diff) * Math.min(Math.abs(diff), slewRate);

  const barrelAngle = turret._barrelAngle;
  const tipX = sx + Math.cos(barrelAngle) * barrelLen;
  const tipY = sy + Math.sin(barrelAngle) * barrelLen;

  // Barrel shadow (beneath)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = Math.max(barrelW, barrelW * 0.8);
  ctx.beginPath();
  ctx.moveTo(sx + r * 0.04, sy + r * 0.04);
  ctx.lineTo(tipX + r * 0.04, tipY + r * 0.04);
  ctx.stroke();

  // Barrel body
  ctx.strokeStyle = hexToRgba(baseColor, 0.9);
  ctx.lineWidth = Math.max(barrelW * 0.5, barrelW);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Barrel tip glow (muzzle end)
  ctx.fillStyle = hexToRgba(glowColor, 0.35);
  ctx.beginPath();
  ctx.arc(tipX, tipY, barrelW * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // ── Mounted wall brace underline ────────────────────────────
  if (turret.mounted) {
    ctx.strokeStyle = hexToRgba('#a3a3a3', 0.5);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(sx - r * 0.9, sy + r * 0.7);
    ctx.lineTo(sx + r * 0.9, sy + r * 0.7);
    ctx.stroke();
  }

  ctx.restore();

  // ── Firing indicator — ring at turret base when actively firing ──
  if (turret.laserCd === turret.laserCdMax && turret.laserCdMax > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.1, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(glowColor, 0.3);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
    ctx.restore();
  }

  // ── Health bar ──────────────────────────────────────────────
  drawHealthBar(ctx, sx, sy, turret.hp, turret.maxHp, 0.7, scale);
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
 * Renders as a directional chassis — a rounded hexagonal body with
 * a forward-facing indicator arrow showing movement direction.
 * State-driven colour changes are instant (no lerp) so the player
 * can read bot intent at a glance.
 *
 * Visual elements (back to front):
 *   1. Motion trail — 3 fading dots behind the bot when moving
 *   2. Base shadow — dark offset ellipse for depth
 *   3. Hexagonal chassis — filled + stroked, state-coloured
 *   4. Inner mechanical detail — cross-hatch for the drive core
 *   5. Direction arrow — points toward movement target
 *   6. State indicator — small dot at top showing current task
 *   7. Cargo dot — amber centre dot when carryingStone > 0
 *   8. Deposit flash — emerald ring pulse when at DEPOSIT_STONE
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} bot — { x, y, state, size, carryingStone, speed, targetX, targetY, dx, dy, ... }
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

  // ── Compute movement direction for arrow and trails ──────────
  let dirX = 0, dirY = -1; // default: up
  // Prefer dx/dy from engine movement, fall back to target direction
  if (bot.dx != null && bot.dy != null && (bot.dx !== 0 || bot.dy !== 0)) {
    const len = Math.sqrt(bot.dx * bot.dx + bot.dy * bot.dy) || 1;
    dirX = bot.dx / len;
    dirY = bot.dy / len;
  } else if (bot.targetX != null && bot.targetY != null) {
    const tdx = bot.targetX - bot.x;
    const tdy = bot.targetY - bot.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    if (tlen > 0.05) {
      dirX = tdx / tlen;
      dirY = tdy / tlen;
    }
  }

  ctx.save();

  // ── Base shadow (depth cue) ───────────────────────────────────
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(sx + r * 0.1, sy + r * 0.15, r * 0.65, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Motion trail (moving bots only) ───────────────────────────
  if (isMoving && bot.speed > 0) {
    for (let t = 1; t <= 3; t++) {
      const trailAlpha = 0.25 - t * 0.07;    // 0.18, 0.11, 0.04
      if (trailAlpha <= 0.01) continue;
      const tx = sx - dirX * r * t * 1.4;
      const ty = sy - dirY * r * t * 1.4;
      const tr = r * (0.4 - t * 0.1);

      ctx.fillStyle = hexToRgba(visual.glow, trailAlpha);
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Outer glow halo ───────────────────────────────────────────
  ctx.shadowColor = visual.glow;
  ctx.shadowBlur = r * 0.5;

  // ── Directional arrow (renders behind chassis) ────────────────
  // A small filled triangle pointing in movement direction
  if (isMoving) {
    const arrowLen = r * 1.0;
    const arrowBase = r * 0.3;
    const perpX = -dirY;
    const perpY = dirX;

    ctx.fillStyle = hexToRgba(visual.glow, 0.3);
    ctx.beginPath();
    ctx.moveTo(sx + dirX * arrowLen, sy + dirY * arrowLen);           // tip
    ctx.lineTo(sx - dirX * r * 0.15 + perpX * arrowBase,
               sy - dirY * r * 0.15 + perpY * arrowBase);             // left base
    ctx.lineTo(sx - dirX * r * 0.15 - perpX * arrowBase,
               sy - dirY * r * 0.15 - perpY * arrowBase);             // right base
    ctx.closePath();
    ctx.fill();
  }

  // ── Hexagonal chassis ─────────────────────────────────────────
  const sides = 6;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * i) / sides; // flat-top
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

  // ── Inner mechanical detail — cross-hatch core ────────────────
  const coreR = r * 0.25;
  ctx.strokeStyle = hexToRgba(visual.glow, 0.3);
  ctx.lineWidth = Math.max(0.4, r * 0.06);
  // Horizontal and vertical lines through center
  ctx.beginPath();
  ctx.moveTo(sx - coreR, sy); ctx.lineTo(sx + coreR, sy);
  ctx.moveTo(sx, sy - coreR); ctx.lineTo(sx, sy + coreR);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = hexToRgba(visual.glow, 0.4);
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // ── State indicator dot (top of chassis) ──────────────────────
  const stateColors = {
    IDLE: '#4ea0c9', MOVING: '#4ea0c9',
    HARVEST_STONE: '#fbbf24', RETURN_STONE: '#38bdf8',
    DEPOSIT_STONE: '#34d399',
  };
  const stateColor = stateColors[bot.state] || '#4ea0c9';
  const statePulse = bot.state === 'HARVEST_STONE'
    ? 0.6 + Math.sin(tick * 0.3) * 0.4  // amber pulse
    : bot.state === 'DEPOSIT_STONE'
    ? 0.6 + Math.sin(tick * 0.5) * 0.4  // emerald pulse
    : 0.7;

  ctx.fillStyle = hexToRgba(stateColor, statePulse);
  ctx.shadowColor = stateColor;
  ctx.shadowBlur = r * 0.2;
  ctx.beginPath();
  ctx.arc(sx, sy - r * 0.7, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ── Cargo dot (carrying stone) ────────────────────────────────
  if (bot.carryingStone > 0) {
    const cargoR = r * 0.3;
    ctx.fillStyle = '#fbbf24';   // amber — matches stone resource
    ctx.shadowColor = '#fcd34d';
    ctx.shadowBlur = cargoR * 3;
    ctx.beginPath();
    ctx.arc(sx, sy, cargoR, 0, Math.PI * 2);
    ctx.fill();
    // Bright core
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, cargoR * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Deposit flash (unloading at base) ─────────────────────────
  if (bot.state === 'DEPOSIT_STONE') {
    const pulse = (Math.sin(tick * 0.4) + 1) / 2;   // ~4 Hz shimmer
    const ringAlpha = 0.3 + pulse * 0.4;              // 0.3–0.7
    ctx.strokeStyle = hexToRgba('#6ee7b7', ringAlpha);
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // ── Harvesting particle emanation ─────────────────────────────
  if (bot.state === 'HARVEST_STONE') {
    const particleCount = 3;
    ctx.save();
    for (let i = 0; i < particleCount; i++) {
      const angle = (tick * 0.15 + i * Math.PI * 2 / particleCount) % (Math.PI * 2);
      const dist = r * 1.1;
      const px = sx + Math.cos(angle) * dist;
      const py = sy + Math.sin(angle) * dist;
      const alpha = 0.3 + Math.sin(tick * 0.2 + i) * 0.2;

      ctx.fillStyle = hexToRgba('#fbbf24', alpha);
      ctx.beginPath();
      ctx.arc(px, py, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
