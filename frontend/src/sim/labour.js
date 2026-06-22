/**
 * labour.js — Bot task allocation system.
 *
 * Decides what every bot does on every tick. Builds a job board from
 * world state, scores (bot, job) pairs dynamically, and greedily assigns
 * the highest-scoring pairs. Crisis detection shifts priorities when
 * Stone is critically low.
 *
 * Architecture:
 *   config.js (LABOUR constants) → labour.js (scoring, assignment)
 *     → bots.js (execution via state machine)
 *
 * Design spec: docs/design/labour-system-design.md (Athena, 2026-06-22)
 */

import { LABOUR, RESOURCE } from './config.js';

// ═══════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run one tick of the labour allocator.
 * Called from engine.js::stepTick() after resource accumulation,
 * before bot movement.
 *
 * @param {object} sim — sim state
 */
export function tickLabour(sim) {
  // ── 1. Detect crisis state ──────────────────────────────────────
  detectCrisis(sim);

  // ── 2. Build job board from world state ────────────────────────
  const jobs = buildJobBoard(sim);

  // ── 3. Track which bots need assignment ────────────────────────
  const unassignedBots = [];

  if (sim.bots) {
    for (const bot of sim.bots) {
    // Skip bots already executing a non-interruptible task
    // (RETURN_STONE, DEPOSIT_STONE — they're mid-cycle)
    if (bot.state === 'RETURN_STONE' || bot.state === 'DEPOSIT_STONE') {
      continue;
    }

    // Check if current job is still valid
    if (bot.state === 'HARVEST_STONE') {
      const zoneStillValid = sim.stoneZones?.find(
        (z) => z.id === bot.harvestZoneId
      );
      if (!zoneStillValid) {
        // Release invalidated zone claim
        bot.harvestZoneId = null;
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }

      // Check for higher-priority preemption
      if (hasHigherPriorityWork(sim, bot, jobs)) {
        // Release current claim
        releaseBotClaim(sim, bot);
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }

      // Sticky: keep current assignment
      continue;
    }

    if (bot.state === 'REPAIR') {
      const wallStillDamaged = sim.walls?.find(
        (w) => w.id === bot.wallId && w.alive && w.hp < w.maxHp
      );
      if (!wallStillDamaged) {
        releaseBotClaim(sim, bot);
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }

      // Preemption: re-assign to more-damaged wall?
      if (hasHigherPriorityWork(sim, bot, jobs)) {
        releaseBotClaim(sim, bot);
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }
      continue;
    }

    if (bot.state === 'BUILD') {
      const buildStillValid = sim.walls?.find(
        (w) => w.id === bot.wallId && w.building
      );
      if (!buildStillValid) {
        releaseBotClaim(sim, bot);
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }

      // Preemption check
      if (hasHigherPriorityWork(sim, bot, jobs)) {
        releaseBotClaim(sim, bot);
        bot.state = 'IDLE';
        unassignedBots.push(bot);
        continue;
      }
      continue;
    }

    // IDLE bots always need assignment
    if (bot.state === 'IDLE') {
      unassignedBots.push(bot);
    }
  }
  } // end if (sim.bots)

  // ── 4. Greedy assignment: score and assign ──────────────────────
  if (unassignedBots.length > 0 && jobs.length > 0) {
    assignIdleBots(sim, unassignedBots, jobs);
  }

  // ── 5. Store labour summary for HUD ────────────────────────────
  sim.labourSummary = buildLabourSummary(sim, jobs);
}

// ═══════════════════════════════════════════════════════════════════════
// JOB BOARD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the job board from current world state.
 * Called once per tick by tickLabour().
 *
 * @param {object} sim
 * @returns {Array<object>} list of available jobs
 */
export function buildJobBoard(sim) {
  const jobs = [];

  // ── REPAIR jobs: damaged walls with slots available ─────────────
  if (sim.walls) {
    for (const wall of sim.walls) {
      if (!wall.alive) continue;
      if (wall.building) continue; // can't repair a wall under construction
      if (wall.hp >= wall.maxHp) continue;

      // Count bots already assigned to this wall
      const currentWorkers = countWorkersOnWall(sim, wall.id, 'REPAIR');

      if (currentWorkers >= LABOUR.maxWorkersPerRepair) continue;

      jobs.push({
        id: `repair_${wall.id}`,
        type: 'REPAIR',
        position: { x: wall.x, y: wall.y },
        entityId: wall.id,
        maxWorkers: LABOUR.maxWorkersPerRepair,
        currentWorkers,
        wallHp: wall.hp,
        wallMaxHp: wall.maxHp,
      });
    }
  }

  // ── BUILD jobs: walls being constructed (unclaimed) ─────────────
  if (sim.walls) {
    for (const wall of sim.walls) {
      if (!wall.alive) continue;
      if (!wall.building) continue;
      if (wall.builderId !== null) continue; // already claimed

      jobs.push({
        id: `build_${wall.id}`,
        type: 'BUILD',
        position: { x: wall.x, y: wall.y },
        entityId: wall.id,
        maxWorkers: LABOUR.maxWorkersPerBuild,
        currentWorkers: 0,
      });
    }
  }

  // ── HARVEST_STONE jobs: available stone zones ──────────────────
  if (sim.stoneZones) {
    for (const zone of sim.stoneZones) {
      const harvesterCount = zone.harvesters?.size || 0;

      if (harvesterCount >= LABOUR.maxWorkersPerHarvest) continue;

      jobs.push({
        id: `harvest_${zone.id}`,
        type: 'HARVEST_STONE',
        position: { x: zone.x, y: zone.y },
        entityId: zone.id,
        maxWorkers: LABOUR.maxWorkersPerHarvest,
        currentWorkers: harvesterCount,
      });
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════
// CRISIS DETECTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect and update steel crisis state with hysteresis.
 *
 * Crisis activates when Stone < crisisStoneThreshold (15).
 * Crisis deactivates when Stone > crisisStoneRecoveryThreshold (30).
 * Uses sim.crisisActive boolean — toggles only on threshold crossing.
 *
 * @param {object} sim
 */
export function detectCrisis(sim) {
  const stone = sim.resources?.stone ?? 0;
  const cfg = LABOUR.crisis;

  // Initialize crisis state if not present
  if (sim.crisisActive === undefined) {
    sim.crisisActive = stone < cfg.stoneThreshold;
    return;
  }

  if (sim.crisisActive && stone >= cfg.stoneRecoveryThreshold) {
    sim.crisisActive = false;
  } else if (!sim.crisisActive && stone < cfg.stoneThreshold) {
    sim.crisisActive = true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Score a (bot, job) pair.
 *
 * priority = basePriority × urgency × (1 + proximityBonus) × stacking
 *
 * Higher is better. Stacking penalty and proximity bonus are
 * multiplicative, not additive.
 *
 * @param {object} sim
 * @param {object} bot
 * @param {object} job
 * @returns {number} final priority score
 */
export function scoreJob(sim, bot, job) {
  const base = getBasePriority(sim, job.type);
  const urgency = getUrgency(sim, job);
  const proximity = getProximityBonus(bot, job);
  const stacking = getStackingMultiplier(job);

  return base * urgency * (1.0 + proximity) * stacking;
}

/**
 * Get the base priority for a job type, accounting for crisis state.
 *
 * @param {object} sim
 * @param {string} type — job type enum
 * @returns {number}
 */
export function getBasePriority(sim, type) {
  // Crisis mode: HARVEST_STONE priority jumps
  if (sim.crisisActive && type === 'HARVEST_STONE') {
    return LABOUR.crisis.crisisHarvestPriority;
  }
  return LABOUR.basePriorities[type] ?? 0;
}

/**
 * Get the urgency multiplier for a job.
 *
 * REPAIR: 1.0 + (1.0 - hp% × repairUrgencyScale)
 *   A wall at 10% HP → 1.0 + 0.9 × 2.0 = 2.8×
 *   A wall at 90% HP → 1.0 + 0.1 × 2.0 = 1.2×
 *
 * HARVEST_STONE: scales from stoneUrgencyCeiling (near 0 stone)
 *   to stoneUrgencyFloor (at cap), based on fraction of cap remaining.
 *
 * BUILD: always 1.0.
 *
 * @param {object} sim
 * @param {object} job
 * @returns {number}
 */
export function getUrgency(sim, job) {
  switch (job.type) {
    case 'REPAIR': {
      if (job.wallHp == null || job.wallMaxHp == null) return 1.0;
      const hpFraction = job.wallHp / job.wallMaxHp;
      let urgency = 1.0 + (1.0 - hpFraction) * LABOUR.repairUrgencyScale;

      // Cap repair urgency during crisis to prevent harvest starvation
      if (sim.crisisActive) {
        urgency = Math.min(urgency, LABOUR.crisis.crisisRepairCap);
      }
      return urgency;
    }

    case 'HARVEST_STONE': {
      const stone = sim.resources?.stone ?? 0;
      const cap = sim.resourceCaps?.stone ?? RESOURCE.stone.cap;
      if (cap <= 0) return 1.0;

      const fraction = stone / cap;
      const threshold = LABOUR.stoneUrgencyThreshold;

      if (fraction >= 1.0) return LABOUR.stoneUrgencyFloor;
      if (fraction <= 0) return LABOUR.stoneUrgencyCeiling;

      // Linear interpolation: at threshold → 1.0, at 0 → ceiling
      if (fraction <= threshold) {
        const t = 1.0 - fraction / threshold;
        return 1.0 + t * (LABOUR.stoneUrgencyCeiling - 1.0);
      }
      // Above threshold → interpolate from 1.0 down to floor
      const t = (fraction - threshold) / (1.0 - threshold);
      return 1.0 - t * (1.0 - LABOUR.stoneUrgencyFloor);
    }

    case 'BUILD':
    default:
      return 1.0;
  }
}

/**
 * Compute proximity bonus: how close the bot is to the job.
 *
 * Maximum bonus (proximityMaxBonus) when on top of the job.
 * Decays linearly to 0 at distance (proximityMaxBonus / proximityDecay) cells.
 *
 * @param {object} bot
 * @param {object} job
 * @returns {number} bonus in [0, proximityMaxBonus]
 */
export function getProximityBonus(bot, job) {
  if (!job.position) return 0;
  const dx = bot.x - job.position.x;
  const dy = bot.y - job.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const bonus = LABOUR.proximityMaxBonus - dist * LABOUR.proximityDecay;
  return Math.max(0, Math.min(LABOUR.proximityMaxBonus, bonus));
}

/**
 * Compute stacking penalty multiplier for a job.
 *
 * First bot: 1.0×. Each additional bot: reduce by stackingPenalty fraction.
 * At maxWorkers=3, stackingPenalty=0.15:
 *   n=0 → 1.00, n=1 → 0.85, n=2 → 0.70
 *
 * @param {object} job
 * @returns {number} multiplier in [0, 1]
 */
export function getStackingMultiplier(job) {
  if (!job.maxWorkers || job.maxWorkers <= 1) return 1.0;
  if (!job.currentWorkers || job.currentWorkers <= 0) return 1.0;

  const n = job.currentWorkers;
  const penalty = LABOUR.stackingPenalty * n;
  return Math.max(0, 1.0 - penalty);
}

// ═══════════════════════════════════════════════════════════════════════
// ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Greedily assign idle bots to available jobs.
 *
 * Computes scores for all (bot, job) pairs, sorts descending,
 * and assigns greedily. Each assignment removes the job slot
 * (or marks it full) so the next bot can't claim it.
 *
 * @param {object} sim
 * @param {Array<object>} unassignedBots — bots needing assignment
 * @param {Array<object>} jobs — available jobs (mutated)
 */
function assignIdleBots(sim, unassignedBots, jobs) {
  // Build all (bot, job) pairs with scores
  const pairs = [];
  for (const bot of unassignedBots) {
    for (const job of jobs) {
      // Skip jobs already at capacity
      if (job.currentWorkers >= job.maxWorkers) continue;
      const score = scoreJob(sim, bot, job);
      pairs.push({ bot, job, score });
    }
  }

  // Sort descending by score
  pairs.sort((a, b) => b.score - a.score);

  const assignedBotIds = new Set();

  for (const { bot, job } of pairs) {
    // Skip if bot already assigned in this round
    if (assignedBotIds.has(bot.id)) continue;
    // Skip if job is now full
    if (job.currentWorkers >= job.maxWorkers) continue;

    assignBotToJob(sim, bot, job);
    assignedBotIds.add(bot.id);
    job.currentWorkers++;
  }

  // Bots that couldn't find a job: fallback to HARVEST_STONE
  // or stay IDLE if no stone zones are available
  for (const bot of unassignedBots) {
    if (!assignedBotIds.has(bot.id)) {
      // Try to harvest as fallback
      const harvestJob = jobs.find(
        (j) => j.type === 'HARVEST_STONE' && j.currentWorkers < j.maxWorkers
      );
      if (harvestJob) {
        assignBotToJob(sim, bot, harvestJob);
        harvestJob.currentWorkers++;
      }
      // Otherwise bot stays IDLE — no work available
    }
  }
}

/**
 * Assign a bot to a specific job.
 * Sets bot state fields for the appropriate job type.
 *
 * @param {object} sim
 * @param {object} bot
 * @param {object} job
 */
export function assignBotToJob(sim, bot, job) {
  switch (job.type) {
    case 'REPAIR': {
      const wall = sim.walls?.find((w) => w.id === job.entityId);
      bot.state = 'REPAIR';
      bot.wallId = job.entityId;
      bot.targetX = wall?.x ?? job.position.x;
      bot.targetY = wall?.y ?? job.position.y;
      break;
    }

    case 'BUILD': {
      const wall = sim.walls?.find((w) => w.id === job.entityId);
      if (wall) {
        wall.builderId = bot.id;
      }
      bot.state = 'BUILD';
      bot.wallId = job.entityId;
      bot.targetX = wall?.x ?? job.position.x;
      bot.targetY = wall?.y ?? job.position.y;
      break;
    }

    case 'HARVEST_STONE': {
      const zone = sim.stoneZones?.find((z) => z.id === job.entityId);
      if (zone) {
        if (!zone.harvesters) zone.harvesters = new Set();
        zone.harvesters.add(bot.id);
      }
      bot.state = 'HARVEST_STONE';
      bot.harvestZoneId = job.entityId;
      bot.harvestProgress = 0;
      bot.harvestTarget = RESOURCE.stone.harvestTicks;
      bot.carryingStone = 0;
      bot.targetX = zone?.x ?? job.position.x;
      bot.targetY = zone?.y ?? job.position.y;
      break;
    }

    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PREEMPTION CHECK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a bot has higher-priority work available than its current job.
 *
 * Used by both labour.js (tickLabour preemption) and bots.js
 * (sticky assignment interrupt).
 *
 * Algorithm:
 *   1. Score the bot's current job
 *   2. For each job on the board with open slots, score it
 *   3. If any open job outscores the current job, return true
 *
 * @param {object} sim
 * @param {object} bot
 * @param {Array<object>} jobs — the current job board
 * @returns {boolean}
 */
export function hasHigherPriorityWork(sim, bot, jobs) {
  if (!jobs || jobs.length === 0) return false;

  // Build a synthetic "current job" for scoring
  let currentJob = null;

  if (bot.state === 'HARVEST_STONE' && bot.harvestZoneId) {
    const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
    if (zone) {
      currentJob = {
        id: `harvest_${zone.id}`,
        type: 'HARVEST_STONE',
        position: { x: zone.x, y: zone.y },
        entityId: zone.id,
        maxWorkers: LABOUR.maxWorkersPerHarvest,
        currentWorkers: 0,
      };
    }
  } else if (bot.state === 'REPAIR' && bot.wallId) {
    const wall = sim.walls?.find((w) => w.id === bot.wallId);
    if (wall) {
      currentJob = {
        id: `repair_${wall.id}`,
        type: 'REPAIR',
        position: { x: wall.x, y: wall.y },
        entityId: wall.id,
        maxWorkers: LABOUR.maxWorkersPerRepair,
        currentWorkers: 0,
        wallHp: wall.hp,
        wallMaxHp: wall.maxHp,
      };
    }
  } else if (bot.state === 'BUILD' && bot.wallId) {
    const wall = sim.walls?.find((w) => w.id === bot.wallId);
    if (wall) {
      currentJob = {
        id: `build_${wall.id}`,
        type: 'BUILD',
        position: { x: wall.x, y: wall.y },
        entityId: wall.id,
        maxWorkers: LABOUR.maxWorkersPerBuild,
        currentWorkers: 0,
      };
    }
  }

  if (!currentJob) return true; // IDLE — any work is higher priority

  const currentScore = scoreJob(sim, bot, currentJob);

  for (const job of jobs) {
    // Skip jobs already at capacity
    if (job.currentWorkers >= job.maxWorkers) continue;

    const candidateScore = scoreJob(sim, bot, job);
    if (candidateScore > currentScore) {
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Count bots currently assigned to a wall for a specific task type.
 *
 * @param {object} sim
 * @param {string} wallId
 * @param {string} state — bot state to count (e.g., 'REPAIR', 'BUILD')
 * @returns {number}
 */
function countWorkersOnWall(sim, wallId, state) {
  if (!sim.bots) return 0;
  let count = 0;
  for (const bot of sim.bots) {
    if (bot.state === state && bot.wallId === wallId) {
      count++;
    }
  }
  return count;
}

/**
 * Release a bot's claim on its current job.
 * Clears zone harvester claims, wall builder claims, and bot state fields.
 *
 * @param {object} sim
 * @param {object} bot
 */
function releaseBotClaim(sim, bot) {
  // Release stone zone claim
  if (bot.harvestZoneId) {
    const zone = sim.stoneZones?.find((z) => z.id === bot.harvestZoneId);
    if (zone?.harvesters) {
      zone.harvesters.delete(bot.id);
    }
    bot.harvestZoneId = null;
  }

  // Release wall builder claim
  if (bot.wallId) {
    const wall = sim.walls?.find((w) => w.id === bot.wallId);
    if (wall && wall.builderId === bot.id) {
      wall.builderId = null;
    }
    bot.wallId = null;
  }
}

/**
 * Build a labour summary object for the HUD.
 *
 * @param {object} sim
 * @param {Array<object>} jobs
 * @returns {object}
 */
function buildLabourSummary(sim, jobs) {
  const counts = { REPAIR: 0, BUILD: 0, HARVEST_STONE: 0, IDLE: 0 };
  let repairingBots = 0;
  let buildingBots = 0;
  let harvestingBots = 0;
  let idleBots = 0;

  if (sim.bots) {
    for (const bot of sim.bots) {
      switch (bot.state) {
        case 'REPAIR':        repairingBots++; break;
        case 'BUILD':         buildingBots++; break;
        case 'HARVEST_STONE': harvestingBots++; break;
        case 'RETURN_STONE':
        case 'DEPOSIT_STONE': harvestingBots++; break; // part of harvest cycle
        default:              idleBots++; break;
      }
    }
  }

  return {
    repairingBots,
    buildingBots,
    harvestingBots,
    idleBots,
    jobsAvailable: jobs.length,
    jobsByType: {
      REPAIR: jobs.filter((j) => j.type === 'REPAIR').length,
      BUILD: jobs.filter((j) => j.type === 'BUILD').length,
      HARVEST_STONE: jobs.filter((j) => j.type === 'HARVEST_STONE').length,
    },
    crisisActive: sim.crisisActive || false,
  };
}
