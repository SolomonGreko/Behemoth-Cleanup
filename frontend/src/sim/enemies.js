/**
 * enemies.js — Crystal drop integration.
 *
 * On enemy death (HP ≤ 0, before entity removal), roll against the
 * enemy type's drop chance. Successful roll: add Crystal to pool.
 * Boss enemies have guaranteed drops with bonus amount.
 *
 * Drop is immediate — Crystal is credited on the same tick the enemy dies.
 */

import { RESOURCE } from './config.js';
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
  const { type } = enemy;

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
