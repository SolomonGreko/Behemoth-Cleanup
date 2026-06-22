/**
 * bots.js — Bot resource harvesting integration.
 *
 * Extends the existing bot state machine with HARVEST_STONE state.
 * Bots assigned to harvest Stone move to the nearest unclaimed Stone zone,
 * harvest for a fixed number of ticks, then return to base to deposit.
 *
 * Design decisions from Athena's spec:
 *   - Sticky assignment: bot claims a zone on first assignment.
 *     assignJob is only re-called if the zone is invalidated or
 *     higher-priority work opens up.
 *   - Harvest: 1 Stone per 120 ticks (2 seconds at 60fps).
 *   - Max 3 concurrent harvesters per zone.
 *   - Deposit at base center (1.5 cell range).
 */

import { BOT, RESOURCE } from './config.js';
import { addResources } from './resource.js';

// ── Bot State Machine Extension ─────────────────────────────────────

/**
 * Bot harvesting states.
 * Extends the existing state machine (IDLE, MOVING, HARVEST, etc.)
 */
export const BOT_STATES = {
  IDLE: 'IDLE',                     // Bot is idle, awaiting assignment
  MOVING: 'MOVING',                 // Bot is moving to a target
  HARVEST_STONE: 'HARVEST_STONE',   // Bot is harvesting Stone from a zone
  RETURN_STONE: 'RETURN_STONE',     // Bot is returning to base with Stone
  DEPOSIT_STONE: 'DEPOSIT_STONE',   // Bot is depositing Stone at base
  REPAIR: 'REPAIR',                 // Bot is repairing a damaged wall
  BUILD: 'BUILD',                   // Bot is constructing/upgrading a wall
};

// ── Harvest Zone Management ─────────────────────────────────────────

/**
 * A Stone harvest zone in the world.
 * @typedef {object} StoneZone
 * @property {number} x — cell X coordinate
 * @property {number} y — cell Y coordinate
 * @property {number} id — unique zone identifier
 * @property {Set<number>} harvesters — set of bot IDs currently harvesting here
 */

/**
 * Assign a bot to harvest Stone from the nearest unclaimed zone.
 * Uses sticky assignment: the bot claims the zone and won't be
 * reassigned unless the zone is invalidated or higher-priority work appears.
 *
 * @param {object} sim — sim state
 * @param {object} bot — the bot being assigned
 * @returns {object|null} — the assigned StoneZone, or null if none available
 */
export function assignStoneHarvest(sim, bot) {
  const { stoneZones } = sim;

  if (!stoneZones || stoneZones.length === 0) {
    return null;
  }

  // Filter: zones that are not yet full (max 3 harvesters) and within range
  const maxHarvesters = RESOURCE.stone.maxHarvestersPerZone;
  const availableZones = stoneZones.filter((zone) => {
    // Skip zones at harvester capacity
    if (zone.harvesters && zone.harvesters.size >= maxHarvesters) {
      return false;
    }

    // Check range: bot must be within harvestRange cells
    const dist = distance(bot.x, bot.y, zone.x, zone.y);
    return dist <= RESOURCE.stone.harvestRange;
  });

  if (availableZones.length === 0) {
    return null;
  }

  // Find nearest zone
  availableZones.sort((a, b) => {
    const distA = distance(bot.x, bot.y, a.x, a.y);
    const distB = distance(bot.x, bot.y, b.x, b.y);
    return distA - distB;
  });

  const zone = availableZones[0];

  // Sticky claim: add bot to zone's harvester set
  if (!zone.harvesters) {
    zone.harvesters = new Set();
  }
  zone.harvesters.add(bot.id);

  // Set bot state
  bot.harvestZoneId = zone.id;
  bot.harvestProgress = 0;           // ticks spent harvesting
  bot.harvestTarget = RESOURCE.stone.harvestTicks; // 120 ticks
  bot.carryingStone = 0;
  bot.state = BOT_STATES.HARVEST_STONE;

  return zone;
}

// ── Harvest Tick ────────────────────────────────────────────────────

/**
 * Process one tick of Stone harvesting for a bot.
 * Called from the main bot update loop when bot.state === HARVEST_STONE.
 *
 * @param {object} sim
 * @param {object} bot
 */
export function tickStoneHarvest(sim, bot) {
  if (bot.state !== BOT_STATES.HARVEST_STONE) return;

  // Validate zone still exists and bot is within range
  const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
  if (!zone) {
    // Zone destroyed or invalidated — abort harvest
    releaseStoneZone(sim, bot);
    return;
  }

  // Check bot is still in range
  const dist = distance(bot.x, bot.y, zone.x, zone.y);
  if (dist > RESOURCE.stone.harvestRange) {
    // Bot moved out of range — needs to move back
    // (Movement is handled by the main bot move-to-target logic)
    return;
  }

  // Progress the harvest
  bot.harvestProgress++;

  if (bot.harvestProgress >= bot.harvestTarget) {
    // Harvest complete
    bot.carryingStone = BOT.carry; // harvest capacity from config
    bot.state = BOT_STATES.RETURN_STONE;
    // Release the zone so another bot can claim it
    releaseStoneZone(sim, bot);
    // Set move target to base center
    bot.targetX = sim.baseCenter?.x ?? 0;
    bot.targetY = sim.baseCenter?.y ?? 0;
  }
}

// ── Stone Return and Deposit ────────────────────────────────────────

/**
 * Process one tick of a bot returning to base with Stone.
 * Called when bot.state === RETURN_STONE.
 *
 * @param {object} sim
 * @param {object} bot
 */
export function tickStoneReturn(sim, bot) {
  if (bot.state !== BOT_STATES.RETURN_STONE) return;

  // Check distance to base center
  const centerX = sim.baseCenter?.x ?? 0;
  const centerY = sim.baseCenter?.y ?? 0;
  const dist = distance(bot.x, bot.y, centerX, centerY);

  if (dist <= RESOURCE.stone.depositRange) {
    // Bot arrived at base — deposit the Stone
    const result = addResources(sim, { stone: bot.carryingStone });
    bot.carryingStone = 0;

    // If Stone was discarded (at cap), visual feedback from result.discarded
    if (result.discarded.stone > 0) {
      bot.lastHarvestCapped = true;
    } else {
      bot.lastHarvestCapped = false;
    }

    // Bot returns to idle / awaits next assignment
    bot.state = BOT_STATES.IDLE;
    bot.harvestZoneId = null;
    bot.harvestProgress = 0;
  }
  // Movement toward base is handled by main bot movement system
}

// ── Zone Release ────────────────────────────────────────────────────

/**
 * Release a bot's claim on a Stone harvest zone.
 * Called when harvest completes, zone is invalidated, or bot is reassigned.
 *
 * @param {object} sim
 * @param {object} bot
 */
export function releaseStoneZone(sim, bot) {
  if (!bot.harvestZoneId) return;

  const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
  if (zone && zone.harvesters) {
    zone.harvesters.delete(bot.id);
  }

  bot.harvestZoneId = null;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Euclidean distance between two points.
 */
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if the bot has higher-priority work available.
 * Used by the labour allocator to decide whether to interrupt harvesting.
 * Priority ladder: REPAIR > HARVEST_CRYSTAL > HARVEST_STONE > TILL
 *
 * @param {object} sim
 * @param {object} bot
 * @returns {boolean}
 */
export function hasHigherPriorityWork(sim, bot) {
  // If the wall needs repair (bot is idle, wall is damaged), that's higher priority
  if (sim.walls?.some((w) => w.hp < w.maxHp && w.needsRepair)) {
    return true;
  }
  // Placeholder: Crystal harvest / scavenge would have higher priority
  // if implemented
  return false;
}
