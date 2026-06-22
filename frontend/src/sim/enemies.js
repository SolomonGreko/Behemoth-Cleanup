/**
 * enemies.js — Crystal drop integration.
 *
 * On enemy death (HP ≤ 0, before entity removal), roll against the
 * enemy type's drop chance. Successful roll: add Crystal to pool.
 * Boss enemies have guaranteed drops with bonus amount.
 *
 * Drop is immediate — Crystal is credited on the same tick the enemy dies.
 */

import { RESOURCE, SCALING, ARTILLERY } from './config.js';
import { addResources } from './resource.js';

/**
 * Enemy type identifiers. Matches the existing enemy type system.
 */
export const ENEMY_TYPES = {
  SCOUT: 'scout',
  TANK: 'tank',
  ARTILLERY: 'artillery',
  CRAWLER: 'crawler',
  BOSS: 'boss',
};

/**
 * Process crystal drop on enemy death.
 * Should be called when an enemy reaches HP ≤ 0, before entity removal.
 *
 * Roll behavior:
 *   - Standard enemies: Math.random() < RESOURCE.crystal.drop[enemyType]
 *   - Boss enemies: guaranteed drop (100%), bonus amount (3 Crystal vs 1)
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the dying enemy { type: string, x: number, y: number, ... }
 * @param {function} randomFn — random number generator (defaults to Math.random)
 *   Injectable for deterministic testing.
 * @returns {object} Drop result:
 *   { dropped: boolean, amount: number, discarded: boolean }
 *   Used by the renderer to show "+1 Crystal" or "Storage Full" animation.
 */
export function processCrystalDrop(sim, enemy, randomFn = Math.random) {
  const { type, wave } = enemy;

  // Determine drop chance and amount
  let dropChance;
  let dropAmount;

  if (type === ENEMY_TYPES.BOSS) {
    dropChance = RESOURCE.crystal.drop.boss;       // 1.0 (guaranteed)
    dropAmount = RESOURCE.crystal.bossDropAmount;   // 3
  } else {
    dropChance = RESOURCE.crystal.drop[type];
    if (dropChance === undefined) {
      // Unknown enemy type — no drop
      return { dropped: false, amount: 0, discarded: false };
    }
    dropAmount = RESOURCE.crystal.dropAmount;       // 1
  }

  // Apply wave-based crystal drop scaling: scaled = base * (1 + SCALE * (wave - 1))
  if (wave != null && wave > 0) {
    const dropScale = 1 + SCALING.CRYSTAL_DROP_SCALE * (wave - 1);
    dropChance *= dropScale;
  }

  // Roll for drop
  const roll = randomFn();
  if (roll >= dropChance) {
    return { dropped: false, amount: 0, discarded: false };
  }

  // Drop succeeded — add Crystal to pool
  const result = addResources(sim, { crystal: dropAmount });

  return {
    dropped: true,
    amount: dropAmount,
    discarded: result.discarded.crystal > 0,
  };
}

/**
 * Get the expected Crystal per kill for a given enemy type.
 * Used for balance calculations and HUD rate estimation.
 *
 * @param {string} enemyType
 * @returns {number} expected Crystal per kill
 */
export function expectedCrystalPerKill(enemyType) {
  if (enemyType === ENEMY_TYPES.BOSS) {
    return RESOURCE.crystal.bossDropAmount * RESOURCE.crystal.drop.boss; // 3 * 1.0 = 3
  }

  const dropChance = RESOURCE.crystal.drop[enemyType];
  if (dropChance === undefined) return 0;

  return RESOURCE.crystal.dropAmount * dropChance; // 1 * chance
}

/**
 * Validate that drop probabilities are within [0, 1] for all enemy types.
 * Boss must be exactly 1.0. Crawler must be ≤ 0.05 to prevent swarm flooding.
 *
 * Called during config validation / startup.
 *
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateDropTables() {
  const warnings = [];
  const drop = RESOURCE.crystal.drop;

  for (const [type, chance] of Object.entries(drop)) {
    if (chance < 0 || chance > 1) {
      warnings.push(`Drop chance for ${type} is ${chance} — must be in [0, 1]`);
    }
  }

  // Boss must be guaranteed
  if (drop.boss !== 1.0) {
    warnings.push(`Boss drop chance is ${drop.boss} — expected 1.0 (guaranteed)`);
  }

  // Crawler anti-flood guard
  if (drop.crawler > 0.05) {
    warnings.push(
      `Crawler drop chance is ${drop.crawler} — should be ≤ 0.05 to prevent swarm Crystal flooding`
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Estimate Crystal income per wave cycle from enemy composition.
 * Used for balance monitoring and HUD expected-rate display.
 *
 * A wave cycle = 5 waves (1 boss cycle).
 * Expected standard drops: ~6-8 Crystal from standard enemies.
 * Expected boss drops: 3 Crystal (guaranteed).
 * Total per cycle: ~9-11 Crystal.
 *
 * @param {object[]} waveComposition — array of { type: string, count: number }
 * @returns {number} expected Crystal income
 */
export function estimateWaveCrystalIncome(waveComposition) {
  let total = 0;
  for (const { type, count } of waveComposition) {
    total += expectedCrystalPerKill(type) * count;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════
// ARTILLERY RANGED ATTACK BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find a valid ranged target for an artillery enemy.
 *
 * Priority: base (if directly reachable, no wall in between),
 * then nearest alive wall between artillery and base.
 *
 * "No wall in between" means no alive wall segment intersects the
 * line from the artillery's position to the base center, within
 * the wall's radius + 0.5 cell margin.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the artillery enemy
 * @returns {{ type: 'base' | 'wall', wall?: object } | null}
 */
export function findArtilleryTarget(sim, enemy) {
  const center = sim.baseCenter;
  const dx = center.x - enemy.x;
  const dy = center.y - enemy.y;
  const distToBase = Math.sqrt(dx * dx + dy * dy);

  // Check if any wall blocks line of sight to base
  let blockingWall = null;
  let bestBlockDist = Infinity;

  for (const wall of sim.walls) {
    if (!wall.alive) continue;

    // Check if wall is between artillery and base
    const wdx = wall.x - enemy.x;
    const wdy = wall.y - enemy.y;
    const wDist = Math.sqrt(wdx * wdx + wdy * wdy);

    // Wall must be closer than the base
    if (wDist >= distToBase) continue;

    // Project wall onto the line to base: is it close to the line?
    // Dot product to get projection scalar
    const t = (wdx * dx + wdy * dy) / (distToBase * distToBase);
    if (t < 0 || t > 1) continue; // wall is behind or beyond base

    // Perpendicular distance from wall to line
    const projX = enemy.x + t * dx;
    const projY = enemy.y + t * dy;
    const perpDist = Math.sqrt(
      (wall.x - projX) ** 2 + (wall.y - projY) ** 2
    );

    // Wall blocks if within its radius + margin
    const wallRadius = (wall.radius || 0.8) + 0.5;
    if (perpDist <= wallRadius) {
      // This wall blocks — track the nearest one
      if (wDist < bestBlockDist) {
        bestBlockDist = wDist;
        blockingWall = wall;
      }
    }
  }

  if (blockingWall) {
    // Target the blocking wall if within attackRange
    const wDist = Math.sqrt(
      (blockingWall.x - enemy.x) ** 2 + (blockingWall.y - enemy.y) ** 2
    );
    if (wDist <= ARTILLERY.attackRange) {
      return { type: 'wall', wall: blockingWall };
    }
    // Wall blocks but is out of range — move closer (no target yet)
    return null;
  }

  // No wall blocks — target base if within range
  if (distToBase <= ARTILLERY.attackRange) {
    return { type: 'base' };
  }

  // Nothing in range — keep moving
  return null;
}

/**
 * Tick one artillery enemy's behavior.
 *
 * State machine:
 *   'moving'  → if findArtilleryTarget returns a target, transition to 'firing'
 *   'firing'  → decrement cooldown, fire when ready, re-evaluate target
 *
 * Artillery damage is applied directly: base damage goes through shield
 * then HP; wall damage uses the wall damage system.
 *
 * Call this from engine.js tickEnemies() BEFORE the general movement
 * logic for artillery-type enemies.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the artillery enemy
 * @param {Function} damageWallFn — function(sim, wall, damage) => { destroyed: bool }
 * @param {Function} applyBaseDmgFn — function(sim, damage)
 */
export function tickArtilleryEnemy(sim, enemy, damageWallFn, applyBaseDmgFn) {
  // Cooldown management
  if (enemy._artyCooldown === undefined) {
    enemy._artyCooldown = 0;
  }
  if (enemy._artyCooldown > 0) {
    enemy._artyCooldown--;
  }

  // Shot counter — self-destruct after exhausting ammunition
  if (enemy._artyShotsFired === undefined) {
    enemy._artyShotsFired = 0;
  }
  if (enemy._artyShotsFired >= ARTILLERY.maxShots) {
    // Ammo exhausted — self-destruct. Does NOT count as a kill
    // (no crystal drop, no kill stat) since it's a natural expiration.
    enemy.alive = false;
    sim.waveEnemiesRemaining--;
    sim.debugLog.push({
      msg: `artillery exhausted (${enemy._artyShotsFired} shots fired)`,
      tick: sim.tick,
    });
    if (sim.debugLog.length > 50) {
      sim.debugLog = sim.debugLog.slice(-50);
    }
    return;
  }

  const target = findArtilleryTarget(sim, enemy);

  if (!target) {
    // No target in range — if we were firing, go back to moving
    if (enemy.state === 'firing') {
      enemy.state = 'moving';
      enemy._artyTarget = null;
    }
    return;
  }

  // We have a target — stay in firing mode and track the current target.
  // Always update _artyTarget every tick so we re-acquire if the
  // targeted wall dies (findArtilleryTarget already excludes dead walls).
  enemy.state = 'firing';
  enemy._artyTarget = target;

  // Fire when cooldown is up
  if (enemy._artyCooldown <= 0) {
    enemy._artyCooldown = ARTILLERY.attackCooldown;
    enemy._artyShotsFired++;

    const currentTarget = enemy._artyTarget || target;
    if (currentTarget.type === 'base') {
      applyBaseDmgFn(sim, ARTILLERY.attackDamage);

      sim.debugLog.push({
        msg: `artillery fires at base (${ARTILLERY.attackDamage} dmg, HP: ${Math.max(0, sim.baseHp)})`,
        tick: sim.tick,
      });
      if (sim.debugLog.length > 50) {
        sim.debugLog = sim.debugLog.slice(-50);
      }
    } else if (currentTarget.type === 'wall' && currentTarget.wall) {
      const result = damageWallFn(sim, currentTarget.wall, ARTILLERY.attackDamage);

      sim.debugLog.push({
        msg: `artillery fires at wall #${currentTarget.wall.id} (${ARTILLERY.attackDamage} dmg${result.destroyed ? ', DESTROYED' : ''})`,
        tick: sim.tick,
      });
      if (sim.debugLog.length > 50) {
        sim.debugLog = sim.debugLog.slice(-50);
      }

      if (result.destroyed) {
        // Wall destroyed — re-evaluate next tick
        enemy._artyTarget = null;
      }
    }

    // Push sound for renderer
    if (sim.sounds) {
      sim.sounds.push('mortar');
    }
  }
}
