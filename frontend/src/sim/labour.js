/**
 * labour.js — Labour allocator priority ladder extension.
 *
 * Adds 'harvestStone' to the priority ladder following Athena's spec:
 *   REPAIR > HARVEST_CRYSTAL > HARVEST_STONE > TILL
 *
 * Sticky assignment: a bot claims a zone on first assignment.
 * assignJob is only re-called if (a) the zone is invalidated, or
 * (b) higher-priority work opens up (hasHigherPriorityWork check).
 */

import { hasHigherPriorityWork } from './bots.js';

/**
 * Priority ladder for bot task assignment.
 * Higher index = higher priority. Bots check from top to bottom.
 *
 * Extended with harvestStone below REPAIR but above TILL.
 */
export const LABOUR_PRIORITY = {
  IDLE: 0,
  TILL: 1,
  HARVEST_STONE: 2,      // NEW — Stone harvesting from terrain zones
  HARVEST_CRYSTAL: 3,    // Future: Crystal scavenging
  BUILD: 4,
  REPAIR: 5,              // Highest — defense always first
};

/**
 * Re-evaluate a bot's assignment.
 * Called each tick or when a higher-priority task becomes available.
 *
 * Sticky assignment rule:
 *   A bot with an active harvestStone assignment keeps it unless:
 *     (a) The zone is invalidated (destroyed, out of bounds)
 *     (b) Higher-priority work opens up (hasHigherPriorityWork returns true)
 *
 * @param {object} sim
 * @param {object} bot
 * @returns {boolean} true if the bot was reassigned
 */
export function reassignBot(sim, bot) {
  // If bot has an active harvest stone assignment, check if it should be interrupted
  if (bot.harvestZoneId != null) {
    // Check zone validity
    const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
    if (!zone) {
      // Zone destroyed — release and allow reassignment
      return true; // Reassignment needed
    }

    // Check for higher-priority work
    if (hasHigherPriorityWork(sim, bot)) {
      // Higher priority available — release current zone
      return true; // Reassignment needed
    }

    // Sticky: keep current assignment
    return false;
  }

  // No current assignment — allow reassignment
  return true;
}

/**
 * Get the current priority of a bot's task.
 * Used by the allocator to compare tasks.
 *
 * @param {object} bot
 * @returns {number} priority value (higher = more important)
 */
export function getBotPriority(bot) {
  if (!bot.state) return LABOUR_PRIORITY.IDLE;

  switch (bot.state) {
    case 'REPAIR':     return LABOUR_PRIORITY.REPAIR;
    case 'BUILD':      return LABOUR_PRIORITY.BUILD;
    case 'HARVEST_STONE': return LABOUR_PRIORITY.HARVEST_STONE;
    case 'TILL':       return LABOUR_PRIORITY.TILL;
    case 'IDLE':       return LABOUR_PRIORITY.IDLE;
    default:           return LABOUR_PRIORITY.IDLE;
  }
}
