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

import { BOT, RESOURCE, WALL } from './config.js';
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

// ═══════════════════════════════════════════════════════════════════════
// BOT LIFECYCLE — extracted from engine.js
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a worker bot at the given position (or near base center if omitted).
 */
export function createBot(sim, x, y) {
  const bx = x ?? sim.baseCenter.x + (Math.random() - 0.5) * 2;
  const by = y ?? sim.baseCenter.y + (Math.random() - 0.5) * 2;
  return {
    id: sim._nextBotId++,
    x: bx,
    y: by,
    speed: BOT.speed,
    size: BOT.size,
    state: 'IDLE',
    harvestZoneId: null,
    harvestProgress: 0,
    harvestTarget: 0,
    carryingStone: 0,
    targetX: null,
    targetY: null,
    lastHarvestCapped: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// BOT MOVEMENT AND HARVESTING
// ═══════════════════════════════════════════════════════════════════════

export function tickBots(sim) {
  for (const bot of sim.bots) {
    switch (bot.state) {
      case 'IDLE':
        assignStoneHarvest(sim, bot);
        break;
      case 'HARVEST_STONE': {
        const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
        if (zone) {
          moveBotToward(bot, zone.x, zone.y);
          tickStoneHarvest(sim, bot);
        }
        break;
      }
      case 'RETURN_STONE': {
        moveBotToward(bot, sim.baseCenter.x, sim.baseCenter.y);
        tickStoneReturn(sim, bot);
        break;
      }
      case 'DEPOSIT_STONE':
        tickStoneReturn(sim, bot);
        break;
      case 'REPAIR': {
        const wall = sim.walls?.find((w) => w.id === bot.wallId && w.alive);
        if (wall) {
          moveBotToward(bot, wall.x, wall.y);
          tickRepair(sim, bot, wall);
        } else {
          bot.state = 'IDLE';
          bot.wallId = null;
        }
        break;
      }
      case 'BUILD': {
        const wall = sim.walls?.find((w) => w.id === bot.wallId && w.alive && w.building);
        if (wall) {
          moveBotToward(bot, wall.x, wall.y);
          tickBuild(sim, bot, wall);
        } else {
          bot.state = 'IDLE';
          bot.wallId = null;
        }
        break;
      }
    }
  }
}

export function moveBotToward(bot, tx, ty) {
  if (tx == null || ty == null) return;
  const dx = tx - bot.x;
  const dy = ty - bot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.1) return;
  const step = Math.min(bot.speed, dist);
  bot.x += (dx / dist) * step;
  bot.y += (dy / dist) * step;
}

/**
 * Process one tick of wall repair by a bot.
 * Bot must be at the wall to repair.
 *
 * @param {object} sim
 * @param {object} bot
 * @param {object} wall
 */
export function tickRepair(sim, bot, wall) {
  const dist = Math.sqrt((bot.x - wall.x) ** 2 + (bot.y - wall.y) ** 2);
  if (dist > wall.radius + 0.5) return; // not close enough yet

  // Repair the wall
  const healAmount = WALL.repairRate;
  wall.hp = Math.min(wall.maxHp, wall.hp + healAmount);

  // If fully repaired, bot goes idle
  if (wall.hp >= wall.maxHp) {
    bot.state = 'IDLE';
    bot.wallId = null;
  }
}

/**
 * Process one tick of wall construction by a bot.
 * Bot must be at the wall to build.
 *
 * @param {object} sim
 * @param {object} bot
 * @param {object} wall
 */
export function tickBuild(sim, bot, wall) {
  // Safety: if wall is missing buildTicks (state corruption), abort build
  if (!Number.isFinite(wall.buildTicks) || wall.buildTicks <= 0) {
    wall.building = false;
    wall.builderId = null;
    wall.buildProgress = 0;
    bot.state = 'IDLE';
    bot.wallId = null;
    return;
  }

  const dist = Math.sqrt((bot.x - wall.x) ** 2 + (bot.y - wall.y) ** 2);
  if (dist > wall.radius + 0.5) return; // not close enough yet

  // Progress the build
  wall.buildProgress = (wall.buildProgress || 0) + 1;

  if (wall.buildProgress >= wall.buildTicks) {
    // Build complete
    wall.building = false;
    wall.buildProgress = 0;
    wall.builderId = null;
    wall.hp = wall.maxHp;
    bot.state = 'IDLE';
    bot.wallId = null;
  }
}
