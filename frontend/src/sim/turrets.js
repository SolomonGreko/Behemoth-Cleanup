/**
 * turrets.js — Turret / watcher mechanics for Behemoth.
 *
 * Turrets are the player's primary defense. They target the nearest
 * enemy to the base center within range and fire lasers (single-target)
 * or mortars (AoE splash at target position).
 *
 * Architecture follows the three-way split:
 *   config.js (TURRET block) → turrets.js (policy + mechanics)
 *
 * Policy decisions:
 *   - Targeting: nearest enemy to base center within range
 *   - Fire priority: mortar fires if available AND target within splash
 *     range; otherwise laser fires on cooldown
 *   - Kill tracking: turrets increment sim.kills, drop crystal, log deaths
 *
 * Mechanics:
 *   - Cooldowns decrement each tick
 *   - Target acquisition runs each tick (target may die or move out of range)
 *   - Laser: instant damage to single target
 *   - Mortar: AoE damage at target position (splash radius)
 *
 * @module turrets
 */

import { TURRET, SCALING } from './config.js';
import { processCrystalDrop } from './enemies.js';
import { addResources } from './resource.js';

// ═══════════════════════════════════════════════════════════════════════
// TURRET CREATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a watcher turret at the given position.
 * Watchers are the basic defensive turret — laser only.
 *
 * @param {object} sim — sim state
 * @param {number} x — world x coordinate
 * @param {number} y — world y coordinate
 * @returns {object} the new turret entity
 */
export function createWatcher(sim, x, y) {
  const turret = {
    id: sim._nextTurretId++,
    type: 'watcher',
    x,
    y,
    hp: TURRET.watcher.hp,
    maxHp: TURRET.watcher.hp,
    range: TURRET.watcher.range,
    laserDamage: TURRET.watcher.laserDamage,
    laserCd: 0,
    laserCdMax: TURRET.watcher.laserCd,
    hasMortar: false,
    mortarCd: 0,
    mortarCdMax: TURRET.mortar.cd,
    mortarDamage: TURRET.mortar.damage,
    splashRadius: TURRET.mortar.splashRadius,
    mounted: false,
    alive: true,
  };

  sim.turrets.push(turret);
  return turret;
}

/**
 * Upgrade a watcher to an advanced turret.
 * Improves HP, range, and laser damage. Reduces laser cooldown.
 *
 * @param {object} turret — the turret to upgrade
 */
export function upgradeToTurret(turret) {
  if (turret.type !== 'watcher') return false;

  turret.type = 'turret';
  turret.hp = TURRET.turret.hp;
  turret.maxHp = TURRET.turret.hp;
  turret.range = TURRET.turret.range;
  turret.laserDamage = TURRET.turret.laserDamage;
  turret.laserCdMax = TURRET.turret.laserCd;

  return true;
}

/**
 * Add mortar capability to a turret.
 * Only advanced turrets can mount mortars.
 *
 * @param {object} turret
 * @returns {boolean} true if mortar was added
 */
export function addMortar(turret) {
  if (turret.type !== 'turret') return false;
  if (turret.hasMortar) return false;

  turret.hasMortar = true;
  return true;
}

/**
 * Mount a turret on a wall segment.
 * Applies mount bonuses: +30% HP, +15% range.
 *
 * @param {object} turret
 * @returns {boolean} true if mounted
 */
export function mountOnWall(turret) {
  if (turret.mounted) return false;

  turret.mounted = true;
  turret.hp = Math.floor(turret.hp * TURRET.mountBonus.hpMul);
  turret.maxHp = Math.floor(turret.maxHp * TURRET.mountBonus.hpMul);
  turret.range = parseFloat((turret.range * TURRET.mountBonus.rangeMul).toFixed(2));

  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// TARGETING (policy)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find the nearest alive enemy to the base center within the turret's range.
 *
 * Targeting priority: nearest enemy first (per sim-arch spec).
 * "Nearest" is measured from base center, not from turret position —
 * this ensures all turrets fire at the threat closest to breaching.
 *
 * @param {object} sim
 * @param {object} turret
 * @returns {object|null} the target enemy, or null if none in range
 */
export function findTarget(sim, turret) {
  let bestTarget = null;
  let bestDist = Infinity;
  const center = sim.baseCenter;

  for (const enemy of sim.enemies) {
    if (!enemy.alive) continue;
    if (enemy.hp <= 0) continue;

    const dx = enemy.x - center.x;
    const dy = enemy.y - center.y;
    const distToBase = Math.sqrt(dx * dx + dy * dy);

    // Must be within turret range of base center
    if (distToBase > turret.range) continue;

    // Prefer the enemy closest to the base
    if (distToBase < bestDist) {
      bestDist = distToBase;
      bestTarget = enemy;
    }
  }

  return bestTarget;
}

// ═══════════════════════════════════════════════════════════════════════
// FIRE MECHANICS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fire a laser at the target enemy.
 * Instant damage. Checks for kill and processes crystal drop.
 *
 * @param {object} sim
 * @param {object} turret
 * @param {object} target — the enemy to hit
 */
function fireLaser(sim, turret, target) {
  // Bail if target died since targeting (another turret may have killed it)
  if (!target.alive || target.hp <= 0) return;

  target.hp -= turret.laserDamage;

  turret.laserCd = turret.laserCdMax;

  if (target.hp <= 0) {
    target.hp = 0;
    handleEnemyKill(sim, target);
  }
}

/**
 * Fire a mortar shell at the target position.
 * AoE splash damage to all enemies within splashRadius of the target.
 *
 * @param {object} sim
 * @param {object} turret
 * @param {object} target — enemy at center of splash
 */
function fireMortar(sim, turret, target) {
  turret.mortarCd = turret.mortarCdMax;

  const splashR2 = turret.splashRadius * turret.splashRadius;
  const cx = target.x;
  const cy = target.y;

  // Push mortar sound
  if (sim.sounds) {
    sim.sounds.push('mortar');
  }

  for (const enemy of sim.enemies) {
    if (!enemy.alive) continue;
    if (enemy.hp <= 0) continue;

    const dx = enemy.x - cx;
    const dy = enemy.y - cy;
    const dist2 = dx * dx + dy * dy;

    if (dist2 <= splashR2) {
      enemy.hp -= turret.mortarDamage;
      if (enemy.hp <= 0) {
        enemy.hp = 0;
        handleEnemyKill(sim, enemy);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// KILL HANDLING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handle an enemy kill: mark dead, update tracking, drop crystal.
 * Called by both laser and mortar kill paths.
 *
 * @param {object} sim
 * @param {object} enemy
 */
function handleEnemyKill(sim, enemy) {
  // Guard against double-kill: if already dead, skip
  if (!enemy.alive) return;

  enemy.alive = false;
  sim.kills++;
  sim.waveEnemiesRemaining--;

  // Crystal drop
  processCrystalDrop(sim, enemy);

  // Kill stone reward — scaled by wave using SCALING.STEEL_SCALE
  // Base 1 stone per kill, multiplied by (1 + STEEL_SCALE * (wave - 1))
  if (enemy.wave != null && enemy.wave > 0) {
    const steelReward = 1 + SCALING.STEEL_SCALE * (enemy.wave - 1);
    addResources(sim, { stone: Math.round(steelReward) });
  }

  // Debug log
  sim.debugLog.push({
    msg: `${enemy.type} killed (kills: ${sim.kills})`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PER-TICK TURRET LOOP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run one tick of turret AI for all turrets.
 * Called from engine.js::stepTick() after enemy movement.
 *
 * Sequence per turret:
 *   1. Decrement cooldowns
 *   2. If mortar ready, find target, fire mortar (AoE)
 *   3. Else if laser ready, find target, fire laser (single)
 *
 * @param {object} sim
 */
export function tickTurrets(sim) {
  for (const turret of sim.turrets) {
    if (!turret.alive) continue;

    // Decrement cooldowns
    if (turret.laserCd > 0) turret.laserCd--;
    if (turret.mortarCd > 0) turret.mortarCd--;

    // Find a target in range
    const target = findTarget(sim, turret);
    if (!target) continue;

    // Mortar fires first if available (higher value shot)
    if (turret.hasMortar && turret.mortarCd <= 0) {
      fireMortar(sim, turret, target);
    } else if (turret.laserCd <= 0) {
      fireLaser(sim, turret, target);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a summary of all turrets for the HUD.
 *
 * @param {object} sim
 * @returns {object} counts and status
 */
export function getTurretSummary(sim) {
  const turrets = sim.turrets || [];
  const watchers = turrets.filter((t) => t.type === 'watcher' && t.alive);
  const advanced = turrets.filter((t) => t.type === 'turret' && t.alive);
  const withMortar = advanced.filter((t) => t.hasMortar);

  return {
    total: turrets.filter((t) => t.alive).length,
    watchers: watchers.length,
    turrets: advanced.length,
    mortars: withMortar.length,
  };
}

/**
 * Get a specific turret by id.
 *
 * @param {object} sim
 * @param {number} id
 * @returns {object|null}
 */
export function getTurretById(sim, id) {
  return sim.turrets.find((t) => t.id === id) || null;
}

/**
 * Find a turret at the given world coordinates via hit-test.
 *
 * Checks each alive turret: if the distance from (worldX, worldY) to
 * the turret's center is ≤ HIT_RADIUS, returns that turret.
 * If multiple turrets overlap, returns the one with the smallest id
 * (consistent tie-break — earliest-placed wins).
 *
 * @param {object} sim
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [hitRadius=0.75] — cells tolerance for click detection
 * @returns {object|null} the hit turret, or null
 */
export function findTurretAt(sim, worldX, worldY, hitRadius = 0.75) {
  let best = null;
  let bestId = Infinity;

  for (const turret of sim.turrets) {
    if (!turret.alive) continue;

    const dx = turret.x - worldX;
    const dy = turret.y - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= hitRadius && turret.id < bestId) {
      best = turret;
      bestId = turret.id;
    }
  }

  return best;
}
