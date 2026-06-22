/**
 * walls.js — Wall entity module for Behemoth.
 *
 * Walls are buildable defensive barriers. Enemies cannot walk through
 * wall cells — they enter a `sieging` state instead. Walls can be
 * repaired by bots, upgraded through 4 tiers, and destroyed by enemies.
 *
 * Architecture follows the three-way split:
 *   config.js (WALL block) → walls.js (mechanics)
 *
 * Mechanics:
 *   - Placement: bounds-checked to [placementMinDistance, placementMaxDistance]
 *   - Blocking: enemies switch to sieging when wall is on path to base
 *   - Repair: bots restore HP at repairRate/tick within repairRange
 *   - Upgrade: full-HP replacement at higher tier
 *   - Destruction: wall removed from grid, sieging enemies resume movement
 *
 * @module walls
 */

import { WALL } from './config.js';
import { removeStoneZone } from './world.js';

// ═══════════════════════════════════════════════════════════════════════
// CREATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a wall segment at the given grid cell.
 * Level 0 = L1 Barricade, 1 = L2, 2 = L3, 3 = L4.
 *
 * @param {object} sim — sim state
 * @param {number} x — world x coordinate (cell center)
 * @param {number} y — world y coordinate (cell center)
 * @param {number} level — wall level index (0-3, default 0)
 * @returns {object} the new wall entity
 */
export function createWall(sim, x, y, level = 0) {
  const clampedLevel = Math.max(0, Math.min(3, level));
  const cfg = WALL.levels[clampedLevel];

  if (sim._nextWallId === undefined) sim._nextWallId = 1;
  const wid = sim._nextWallId++;

  const wall = {
    id: wid,
    x,
    y,
    level: clampedLevel,
    hp: cfg.hp,
    maxHp: cfg.hp,
    buildTicks: cfg.buildTicks,
    radius: cfg.radius,
    label: cfg.label,
    alive: true,
    building: false,          // true while a bot is constructing/upgrading
    buildProgress: 0,         // ticks of build completed
    builderId: null,          // bot ID currently building this wall
  };

  // Destroy any stone zone at this cell — wall placement overrides harvesting
  const gx = Math.round(x);
  const gy = Math.round(y);
  const cell = sim.world?.grid?.[gy]?.[gx];
  if (cell?.harvestable === 'stone' && sim.stoneZones) {
    const zone = sim.stoneZones.find(
      (z) => z.x === gx && z.y === gy
    );
    if (zone) {
      removeStoneZone(sim, zone.id);
    }
  }

  sim.walls.push(wall);
  return wall;
}

// ═══════════════════════════════════════════════════════════════════════
// PLACEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a wall can be placed at the given coordinates.
 * Validates: bounds, max cap, no existing wall at cell.
 *
 * @param {object} sim
 * @param {number} x
 * @param {number} y
 * @returns {{ valid: boolean, reason?: string }}
 */
export function canPlaceWall(sim, x, y) {
  // Check max segments cap
  const aliveWalls = (sim.walls || []).filter((w) => w.alive);
  if (aliveWalls.length >= WALL.maxSegments) {
    return {
      valid: false,
      reason: `Wall cap reached (${aliveWalls.length}/${WALL.maxSegments})`,
    };
  }

  // Check distance from base center
  const cx = sim.baseCenter.x;
  const cy = sim.baseCenter.y;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < WALL.placementMinDistance) {
    return {
      valid: false,
      reason: `Too close to base (min ${WALL.placementMinDistance} cells)`,
    };
  }

  if (dist > WALL.placementMaxDistance) {
    return {
      valid: false,
      reason: `Too far from base (max ${WALL.placementMaxDistance} cells)`,
    };
  }

  // Check no existing wall at this cell (within 0.5 cell tolerance)
  if (aliveWalls.some((w) => distance(w.x, w.y, x, y) < 0.5)) {
    return { valid: false, reason: 'Wall already exists at this cell' };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════
// DAMAGE AND DESTRUCTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Apply damage to a wall segment.
 * If HP reaches 0, the wall is destroyed.
 *
 * @param {object} sim
 * @param {object} wall
 * @param {number} amount — damage to apply
 * @returns {{ destroyed: boolean, overkill: number }}
 */
export function damageWall(sim, wall, amount) {
  if (!wall.alive) return { destroyed: false, overkill: amount };

  wall.hp -= amount;

  if (wall.hp <= 0) {
    const overkill = Math.abs(wall.hp);
    wall.hp = 0;
    destroyWall(sim, wall);
    return { destroyed: true, overkill };
  }

  return { destroyed: false, overkill: 0 };
}

/**
 * Destroy a wall segment — remove from grid, release sieging enemies.
 *
 * @param {object} sim
 * @param {object} wall
 */
export function destroyWall(sim, wall) {
  wall.alive = false;

  // Release any bot building this wall
  if (wall.builderId !== null) {
    const builder = sim.bots?.find((b) => b.id === wall.builderId);
    if (builder && builder.wallId === wall.id) {
      builder.wallId = null;
      builder.buildProgress = 0;
      builder.state = 'IDLE';
    }
  }

  // Release repairing bots
  for (const bot of (sim.bots || [])) {
    if (bot.repairTargetId === wall.id) {
      bot.repairTargetId = null;
      bot.state = 'IDLE';
    }
  }

  // Release sieging enemies — they resume moving
  for (const enemy of sim.enemies) {
    if (enemy.state === 'sieging' && enemy.siegeTargetId === wall.id) {
      enemy.state = 'moving';
      enemy.siegeTargetId = null;
    }
  }

  // Debug log
  sim.debugLog.push({
    msg: `Wall #${wall.id} (${wall.label}) destroyed at (${wall.x.toFixed(0)}, ${wall.y.toFixed(0)})`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// REPAIR
// ═══════════════════════════════════════════════════════════════════════

/**
 * A bot repairs a wall segment, restoring HP at repairRate per tick.
 * Called each tick while a bot is in REPAIR state near a damaged wall.
 *
 * @param {object} sim
 * @param {object} wall
 * @param {object} bot
 * @returns {number} HP restored this tick
 */
export function repairWall(sim, wall, bot) {
  if (!wall.alive) return 0;
  if (wall.hp >= wall.maxHp) return 0;

  // Check bot is within repair range
  const dist = distance(bot.x, bot.y, wall.x, wall.y);
  if (dist > WALL.repairRange) return 0;

  const restored = Math.min(WALL.repairRate, wall.maxHp - wall.hp);
  wall.hp += restored;

  return restored;
}

/**
 * Find the nearest damaged wall segment to a bot.
 * Lowest-HP-first priority (triage behavior).
 *
 * @param {object} sim
 * @param {object} bot
 * @returns {object|null} the nearest damaged wall, or null
 */
export function findNearestDamagedWall(sim, bot) {
  const walls = (sim.walls || []).filter((w) => w.alive && w.hp < w.maxHp);
  if (walls.length === 0) return null;

  // Sort by HP ascending (lowest HP first), then by distance
  walls.sort((a, b) => {
    const hpDiff = a.hp - b.hp;
    if (hpDiff !== 0) return hpDiff;
    return distance(a.x, a.y, bot.x, bot.y) - distance(b.x, b.y, bot.x, bot.y);
  });

  // Pick the lowest-HP wall within repair range
  for (const wall of walls) {
    if (distance(wall.x, wall.y, bot.x, bot.y) <= WALL.repairRange) {
      return wall;
    }
  }

  // No wall in range — return closest damaged wall (bot will move toward it)
  return walls[0];
}

// ═══════════════════════════════════════════════════════════════════════
// UPGRADE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Upgrade a wall segment to the next level.
 * The wall is replaced in-place at full HP for the new level.
 *
 * @param {object} wall — the wall to upgrade
 * @returns {boolean} true if upgrade succeeded
 */
export function upgradeWall(wall) {
  if (!wall.alive) return false;
  if (wall.level >= 3) return false; // Already max level

  const nextLevel = wall.level + 1;
  const cfg = WALL.levels[nextLevel];

  wall.level = nextLevel;
  wall.hp = cfg.hp;
  wall.maxHp = cfg.hp;
  wall.buildTicks = cfg.buildTicks;
  wall.radius = cfg.radius;
  wall.label = cfg.label;

  return true;
}

/**
 * Get the cost for building or upgrading a wall at the given level.
 *
 * @param {number} level — 0 = L1, 1 = L2, 2 = L3, 3 = L4
 * @returns {object} cost object { stone?, crystal? }
 */
export function getWallCost(level) {
  switch (level) {
    case 0: return { stone: 0 };            // L1 — free starter wall
    case 1: return { stone: 30 };           // L2
    case 2: return { stone: 80, crystal: 5 };  // L3
    case 3: return { stone: 150, crystal: 15 }; // L4
    default: return { stone: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PER-TICK WALL LOOP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run one tick of wall mechanics for all walls.
 * Called from engine.js::stepTick().
 *
 * Currently handles: nothing per-tick (damage is applied by siege enemies,
 * repair is applied by bots). This function exists as the integration hook.
 *
 * @param {object} sim
 */
export function tickWalls(sim) {
  // Clean up dead walls from the array periodically
  // (Done here rather than immediately to avoid mid-tick array mutation issues)
  // Actual cleanup happens in engine after the tick loop to avoid iterator invalidation.
}

// ═══════════════════════════════════════════════════════════════════════
// MOUNT SUPPORT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a turret can be mounted on a wall at the given position.
 * Wall must be at least L2 (level >= 1).
 *
 * @param {object} sim
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function canMountOnWall(sim, x, y) {
  const wall = findWallAt(sim, x, y);
  if (!wall) return false;
  return wall.level >= 1; // L2 or higher
}

/**
 * Find a wall at the given position (within 0.5 cell tolerance).
 *
 * @param {object} sim
 * @param {number} x
 * @param {number} y
 * @returns {object|null}
 */
export function findWallAt(sim, x, y) {
  const walls = sim.walls || [];
  for (const wall of walls) {
    if (!wall.alive) continue;
    if (distance(wall.x, wall.y, x, y) < 0.5) {
      return wall;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// WALL SUMMARY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a summary of all walls for the HUD.
 *
 * @param {object} sim
 * @returns {object}
 */
export function getWallSummary(sim) {
  const walls = (sim.walls || []).filter((w) => w.alive);
  const byLevel = {};
  for (const wall of walls) {
    const key = `L${wall.level + 1}`;
    byLevel[key] = (byLevel[key] || 0) + 1;
  }

  return {
    total: walls.length,
    max: WALL.maxSegments,
    byLevel,
    damaged: walls.filter((w) => w.hp < w.maxHp).length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a point is within a wall's blocking radius.
 * Used by enemy movement to detect wall collisions.
 *
 * @param {object} wall
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isPointInWall(wall, x, y) {
  if (!wall.alive) return false;
  return distance(wall.x, wall.y, x, y) < wall.radius;
}

/**
 * Find the nearest wall that blocks an enemy's path to the base.
 * Checks if any wall lies between the enemy and the base center (within
 * the enemy's radius of the wall).
 *
 * @param {object} sim
 * @param {object} enemy — with x, y properties
 * @returns {object|null} the blocking wall, or null
 */
export function findBlockingWall(sim, enemy) {
  const cx = sim.baseCenter.x;
  const cy = sim.baseCenter.y;
  const walls = (sim.walls || []).filter((w) => w.alive);

  let bestWall = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    // Check if the enemy is within the wall's blocking radius
    const distToWall = distance(enemy.x, enemy.y, wall.x, wall.y);
    if (distToWall < wall.radius + enemy.size) {
      // Enemy is colliding with wall
      const distToBase = distance(wall.x, wall.y, cx, cy);
      // Prefer the wall closest to the enemy (the one they actually hit)
      if (distToWall < bestDist) {
        bestDist = distToWall;
        bestWall = wall;
      }
    }
  }

  return bestWall;
}
