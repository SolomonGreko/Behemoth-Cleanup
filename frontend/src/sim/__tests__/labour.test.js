/**
 * labour.test.js — Tests for the bot labour allocation system.
 *
 * Covers: buildJobBoard, scoreJob, detectCrisis, getUrgency,
 * getProximityBonus, getStackingMultiplier, hasHigherPriorityWork,
 * assignBotToJob, tickLabour.
 *
 * Uses small sim states constructed manually for fast, isolated testing.
 */


import {
  buildJobBoard,
  scoreJob,
  detectCrisis,
  getUrgency,
  getProximityBonus,
  getStackingMultiplier,
  hasHigherPriorityWork,
  assignBotToJob,
  tickLabour,
  getBasePriority,
} from '../labour.js';
import { LABOUR, RESOURCE } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function makeSim(overrides = {}) {
  return {
    tick: 0,
    resources: { stone: 50, crystal: 0, essence: 0 },
    resourceCaps: { stone: RESOURCE.stone.cap, crystal: 50, essence: 100 },
    crisisActive: false,
    bots: [],
    walls: [],
    stoneZones: [],
    baseCenter: { x: 25, y: 25 },
    ...overrides,
  };
}

function makeBot(id, overrides = {}) {
  return {
    id,
    x: 30,
    y: 30,
    speed: 0.015,
    state: 'IDLE',
    harvestZoneId: null,
    harvestProgress: 0,
    harvestTarget: 0,
    carryingStone: 0,
    wallId: null,
    targetX: null,
    targetY: null,
    ...overrides,
  };
}

function makeWall(id, overrides = {}) {
  return {
    id,
    x: 35,
    y: 35,
    hp: 30,
    maxHp: 30,
    alive: true,
    building: false,
    buildProgress: 0,
    builderId: null,
    buildTicks: 180,
    radius: 0.8,
    level: 0,
    ...overrides,
  };
}

function makeStoneZone(id, overrides = {}) {
  return {
    id,
    x: 40,
    y: 40,
    harvesters: new Set(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// buildJobBoard
// ═══════════════════════════════════════════════════════════════════════

describe('labour — buildJobBoard', () => {
  it('returns empty array when no walls or zones exist', () => {
    const sim = makeSim();
    const jobs = buildJobBoard(sim);
    expect(jobs).toEqual([]);
  });

  it('creates REPAIR jobs for damaged walls', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 10, maxHp: 30 })],
    });
    const jobs = buildJobBoard(sim);
    const repairJobs = jobs.filter((j) => j.type === 'REPAIR');
    expect(repairJobs).toHaveLength(1);
    expect(repairJobs[0].entityId).toBe('w1');
    expect(repairJobs[0].wallHp).toBe(10);
    expect(repairJobs[0].wallMaxHp).toBe(30);
    expect(repairJobs[0].maxWorkers).toBe(LABOUR.maxWorkersPerRepair);
  });

  it('does NOT create REPAIR job for full-HP wall', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 30, maxHp: 30 })],
    });
    const jobs = buildJobBoard(sim);
    const repairJobs = jobs.filter((j) => j.type === 'REPAIR');
    expect(repairJobs).toHaveLength(0);
  });

  it('does NOT create REPAIR job for wall under construction', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 0, maxHp: 30, building: true })],
    });
    const jobs = buildJobBoard(sim);
    const repairJobs = jobs.filter((j) => j.type === 'REPAIR');
    expect(repairJobs).toHaveLength(0);
  });

  it('does NOT create REPAIR job for dead wall', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 5, maxHp: 30, alive: false })],
    });
    const jobs = buildJobBoard(sim);
    const repairJobs = jobs.filter((j) => j.type === 'REPAIR');
    expect(repairJobs).toHaveLength(0);
  });

  it('respects maxWorkers per REPAIR (already assigned bots count)', () => {
    const w1 = makeWall('w1', { hp: 5, maxHp: 30 });
    const sim = makeSim({
      walls: [w1],
      bots: [
        makeBot(1, { state: 'REPAIR', wallId: 'w1' }),
        makeBot(2, { state: 'REPAIR', wallId: 'w1' }),
        makeBot(3, { state: 'REPAIR', wallId: 'w1' }),
      ],
    });
    const jobs = buildJobBoard(sim);
    const repairJobs = jobs.filter((j) => j.type === 'REPAIR');
    // 3 bots already repairing — max is 3, so no slots left
    expect(repairJobs).toHaveLength(0);
  });

  it('creates BUILD jobs for unclaimed walls under construction', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 0, maxHp: 30, building: true })],
    });
    const jobs = buildJobBoard(sim);
    const buildJobs = jobs.filter((j) => j.type === 'BUILD');
    expect(buildJobs).toHaveLength(1);
    expect(buildJobs[0].entityId).toBe('w1');
    expect(buildJobs[0].maxWorkers).toBe(LABOUR.maxWorkersPerBuild);
  });

  it('does NOT create BUILD job for already-claimed wall', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 0, maxHp: 30, building: true, builderId: 99 })],
    });
    const jobs = buildJobBoard(sim);
    const buildJobs = jobs.filter((j) => j.type === 'BUILD');
    expect(buildJobs).toHaveLength(0);
  });

  it('creates HARVEST_STONE jobs for available stone zones', () => {
    const sim = makeSim({
      stoneZones: [makeStoneZone('z1')],
    });
    const jobs = buildJobBoard(sim);
    const harvestJobs = jobs.filter((j) => j.type === 'HARVEST_STONE');
    expect(harvestJobs).toHaveLength(1);
    expect(harvestJobs[0].entityId).toBe('z1');
    expect(harvestJobs[0].maxWorkers).toBe(LABOUR.maxWorkersPerHarvest);
  });

  it('respects maxWorkers per HARVEST zone (filled harvesters)', () => {
    const z1 = makeStoneZone('z1');
    z1.harvesters.add(1);
    z1.harvesters.add(2);
    z1.harvesters.add(3);
    const sim = makeSim({
      stoneZones: [z1],
    });
    const jobs = buildJobBoard(sim);
    const harvestJobs = jobs.filter((j) => j.type === 'HARVEST_STONE');
    expect(harvestJobs).toHaveLength(0);
  });

  it('handles multiple jobs of mixed types', () => {
    const sim = makeSim({
      walls: [
        makeWall('w1', { hp: 10, maxHp: 30 }),                // REPAIR
        makeWall('w2', { hp: 5, maxHp: 30 }),                  // REPAIR
        makeWall('w3', { hp: 0, maxHp: 30, building: true }),  // BUILD
      ],
      stoneZones: [
        makeStoneZone('z1'),
        makeStoneZone('z2'),
      ],
    });
    const jobs = buildJobBoard(sim);
    expect(jobs.filter((j) => j.type === 'REPAIR')).toHaveLength(2);
    expect(jobs.filter((j) => j.type === 'BUILD')).toHaveLength(1);
    expect(jobs.filter((j) => j.type === 'HARVEST_STONE')).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// detectCrisis
// ═══════════════════════════════════════════════════════════════════════

describe('labour — detectCrisis', () => {
  it('activates crisis when stone drops below threshold', () => {
    const sim = makeSim({ resources: { stone: 5 } });
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(true);
  });

  it('does NOT activate crisis when stone is above threshold', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(false);
  });

  it('recovers from crisis when stone exceeds recovery threshold', () => {
    const sim = makeSim({
      resources: { stone: 31 },
      crisisActive: true,
    });
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(false);
  });

  it('maintains crisis when stone is between threshold and recovery', () => {
    const sim = makeSim({
      resources: { stone: 20 },
      crisisActive: true,
    });
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(true);
  });

  it('initializes crisisActive on first call when undefined', () => {
    const sim = makeSim({
      resources: { stone: 5 },
    });
    delete sim.crisisActive;
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(true);
  });

  it('initializes crisisActive to false when stone is above threshold', () => {
    const sim = makeSim({
      resources: { stone: 50 },
    });
    delete sim.crisisActive;
    detectCrisis(sim);
    expect(sim.crisisActive).toBe(false);
  });

  it('handles missing resources gracefully', () => {
    const sim = makeSim();
    delete sim.resources;
    detectCrisis(sim);
    expect(sim.crisisActive).toBeDefined();
    // Stone defaults to 0, which is below threshold (15), so crisis should activate
    expect(sim.crisisActive).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getBasePriority
// ═══════════════════════════════════════════════════════════════════════

describe('labour — getBasePriority', () => {
  it('returns REPAIR base priority (100)', () => {
    const sim = makeSim();
    expect(getBasePriority(sim, 'REPAIR')).toBe(100);
  });

  it('returns BUILD base priority (70)', () => {
    const sim = makeSim();
    expect(getBasePriority(sim, 'BUILD')).toBe(70);
  });

  it('returns HARVEST_STONE base priority (40) in normal mode', () => {
    const sim = makeSim();
    expect(getBasePriority(sim, 'HARVEST_STONE')).toBe(40);
  });

  it('returns crisisHARVEST_PRIORITY (70) in crisis mode', () => {
    const sim = makeSim({ crisisActive: true });
    expect(getBasePriority(sim, 'HARVEST_STONE')).toBe(
      LABOUR.crisis.crisisHarvestPriority
    );
  });

  it('returns 0 for unknown job type', () => {
    const sim = makeSim();
    expect(getBasePriority(sim, 'UNKNOWN')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getUrgency
// ═══════════════════════════════════════════════════════════════════════

describe('labour — getUrgency', () => {
  it('REPAIR urgency: 10% HP wall → ~2.8×', () => {
    const sim = makeSim();
    const job = { type: 'REPAIR', wallHp: 3, wallMaxHp: 30 };
    const urgency = getUrgency(sim, job);
    // 1.0 + (1.0 - 0.1) * 2.0 = 2.8
    expect(urgency).toBeCloseTo(2.8, 1);
  });

  it('REPAIR urgency: 90% HP wall → ~1.2×', () => {
    const sim = makeSim();
    const job = { type: 'REPAIR', wallHp: 27, wallMaxHp: 30 };
    const urgency = getUrgency(sim, job);
    // 1.0 + (1.0 - 0.9) * 2.0 = 1.2
    expect(urgency).toBeCloseTo(1.2, 1);
  });

  it('REPAIR urgency: full HP wall → 1.0×', () => {
    const sim = makeSim();
    const job = { type: 'REPAIR', wallHp: 30, wallMaxHp: 30 };
    const urgency = getUrgency(sim, job);
    expect(urgency).toBe(1.0);
  });

  it('REPAIR urgency capped during crisis', () => {
    const sim = makeSim({ crisisActive: true });
    const job = { type: 'REPAIR', wallHp: 3, wallMaxHp: 30 };
    const urgency = getUrgency(sim, job);
    // 2.8 would be normal, but crisis cap = 1.5
    expect(urgency).toBe(LABOUR.crisis.crisisRepairCap);
  });

  it('REPAIR urgency: missing HP fields → default 1.0', () => {
    const sim = makeSim();
    const job = { type: 'REPAIR' };
    expect(getUrgency(sim, job)).toBe(1.0);
  });

  it('HARVEST_STONE urgency: at cap → floor (0.3)', () => {
    const sim = makeSim({
      resources: { stone: RESOURCE.stone.cap },
    });
    const job = { type: 'HARVEST_STONE' };
    expect(getUrgency(sim, job)).toBe(LABOUR.stoneUrgencyFloor);
  });

  it('HARVEST_STONE urgency: zero stone → ceiling (2.0)', () => {
    const sim = makeSim({
      resources: { stone: 0 },
    });
    const job = { type: 'HARVEST_STONE' };
    expect(getUrgency(sim, job)).toBe(LABOUR.stoneUrgencyCeiling);
  });

  it('HARVEST_STONE urgency: at threshold → ~1.0', () => {
    const sim = makeSim({
      resources: { stone: Math.floor(RESOURCE.stone.cap * LABOUR.stoneUrgencyThreshold) },
    });
    const job = { type: 'HARVEST_STONE' };
    const urgency = getUrgency(sim, job);
    expect(urgency).toBeCloseTo(1.0, 1);
  });

  it('BUILD urgency: always 1.0', () => {
    const sim = makeSim();
    const job = { type: 'BUILD' };
    expect(getUrgency(sim, job)).toBe(1.0);
  });

  it('unknown job type → 1.0', () => {
    const sim = makeSim();
    const job = { type: 'FIGHT' };
    expect(getUrgency(sim, job)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getProximityBonus
// ═══════════════════════════════════════════════════════════════════════

describe('labour — getProximityBonus', () => {
  it('max bonus when bot is on the job', () => {
    const bot = makeBot(1, { x: 35, y: 35 });
    const job = { position: { x: 35, y: 35 } };
    expect(getProximityBonus(bot, job)).toBeCloseTo(LABOUR.proximityMaxBonus, 2);
  });

  it('half bonus at midpoint distance', () => {
    const bot = makeBot(1, { x: 35, y: 35 });
    const halfDist = LABOUR.proximityMaxBonus / LABOUR.proximityDecay / 2;
    const job = { position: { x: 35 + halfDist, y: 35 } };
    const bonus = getProximityBonus(bot, job);
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThan(LABOUR.proximityMaxBonus);
  });

  it('zero bonus beyond max range', () => {
    const bot = makeBot(1, { x: 0, y: 0 });
    const farDist = LABOUR.proximityMaxBonus / LABOUR.proximityDecay + 5;
    const job = { position: { x: farDist, y: farDist } };
    expect(getProximityBonus(bot, job)).toBe(0);
  });

  it('zero bonus when job has no position', () => {
    const bot = makeBot(1);
    const job = { type: 'REPAIR' };
    expect(getProximityBonus(bot, job)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getStackingMultiplier
// ═══════════════════════════════════════════════════════════════════════

describe('labour — getStackingMultiplier', () => {
  it('1.0 for job with no workers', () => {
    const job = { maxWorkers: 3, currentWorkers: 0 };
    expect(getStackingMultiplier(job)).toBe(1.0);
  });

  it('0.85 for first additional worker (n=1)', () => {
    const job = { maxWorkers: 3, currentWorkers: 1 };
    // 1.0 - 0.15 * 1 = 0.85
    expect(getStackingMultiplier(job)).toBeCloseTo(0.85, 2);
  });

  it('0.70 for second additional worker (n=2)', () => {
    const job = { maxWorkers: 3, currentWorkers: 2 };
    // 1.0 - 0.15 * 2 = 0.70
    expect(getStackingMultiplier(job)).toBeCloseTo(0.70, 2);
  });

  it('floors at 0 when penalty exceeds 1.0', () => {
    const job = { maxWorkers: 3, currentWorkers: 10 };
    expect(getStackingMultiplier(job)).toBe(0);
  });

  it('1.0 when maxWorkers is 1 (no stacking possible)', () => {
    const job = { maxWorkers: 1, currentWorkers: 1 };
    expect(getStackingMultiplier(job)).toBe(1.0);
  });

  it('1.0 when currentWorkers is 0', () => {
    const job = { maxWorkers: 3, currentWorkers: 0 };
    expect(getStackingMultiplier(job)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// scoreJob
// ═══════════════════════════════════════════════════════════════════════

describe('labour — scoreJob', () => {
  it('REPAIR scores higher than HARVEST for same proximity', () => {
    const sim = makeSim();
    const bot = makeBot(1, { x: 35, y: 35 });
    const repairJob = {
      type: 'REPAIR',
      position: { x: 35, y: 35 },
      wallHp: 15,
      wallMaxHp: 30,
      maxWorkers: 3,
      currentWorkers: 0,
    };
    const harvestJob = {
      type: 'HARVEST_STONE',
      position: { x: 35, y: 35 },
      maxWorkers: 3,
      currentWorkers: 0,
    };

    const repairScore = scoreJob(sim, bot, repairJob);
    const harvestScore = scoreJob(sim, bot, harvestJob);
    expect(repairScore).toBeGreaterThan(harvestScore);
  });

  it('stacking penalty reduces score', () => {
    const sim = makeSim();
    const bot = makeBot(1, { x: 35, y: 35 });
    const job = {
      type: 'REPAIR',
      position: { x: 35, y: 35 },
      wallHp: 15,
      wallMaxHp: 30,
      maxWorkers: 3,
      currentWorkers: 0,
    };
    const jobStacked = { ...job, currentWorkers: 2 };

    const scoreNoStack = scoreJob(sim, bot, job);
    const scoreStacked = scoreJob(sim, bot, jobStacked);
    expect(scoreStacked).toBeLessThan(scoreNoStack);
  });

  it('crisis mode boosts HARVEST_STONE score', () => {
    const simNormal = makeSim();
    const simCrisis = makeSim({ crisisActive: true });
    const bot = makeBot(1);
    const job = {
      type: 'HARVEST_STONE',
      position: { x: 40, y: 40 },
      maxWorkers: 3,
      currentWorkers: 0,
    };

    const normalScore = scoreJob(simNormal, bot, job);
    const crisisScore = scoreJob(simCrisis, bot, job);
    expect(crisisScore).toBeGreaterThan(normalScore);
  });

  it('proximity bonus increases score for nearby bots', () => {
    const sim = makeSim();
    const botNear = makeBot(1, { x: 35, y: 35 });
    const botFar = makeBot(2, { x: 5, y: 5 });
    const job = {
      type: 'HARVEST_STONE',
      position: { x: 35, y: 35 },
      maxWorkers: 3,
      currentWorkers: 0,
    };

    const nearScore = scoreJob(sim, botNear, job);
    const farScore = scoreJob(sim, botFar, job);
    expect(nearScore).toBeGreaterThan(farScore);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// assignBotToJob
// ═══════════════════════════════════════════════════════════════════════

describe('labour — assignBotToJob', () => {
  it('assigns bot to REPAIR job', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { x: 35, y: 35 })],
    });
    const bot = makeBot(1, { state: 'IDLE' });
    const job = {
      type: 'REPAIR',
      entityId: 'w1',
      position: { x: 35, y: 35 },
    };

    assignBotToJob(sim, bot, job);
    expect(bot.state).toBe('REPAIR');
    expect(bot.wallId).toBe('w1');
    expect(bot.targetX).toBe(35);
    expect(bot.targetY).toBe(35);
  });

  it('assigns bot to BUILD job and claims builder slot', () => {
    const wall = makeWall('w1', { building: true });
    const sim = makeSim({ walls: [wall] });
    const bot = makeBot(1, { state: 'IDLE' });
    const job = {
      type: 'BUILD',
      entityId: 'w1',
      position: { x: 35, y: 35 },
    };

    assignBotToJob(sim, bot, job);
    expect(bot.state).toBe('BUILD');
    expect(bot.wallId).toBe('w1');
    expect(wall.builderId).toBe(1);
  });

  it('assigns bot to HARVEST_STONE job and claims zone', () => {
    const zone = makeStoneZone('z1');
    const sim = makeSim({ stoneZones: [zone] });
    const bot = makeBot(1, { state: 'IDLE' });
    const job = {
      type: 'HARVEST_STONE',
      entityId: 'z1',
      position: { x: 40, y: 40 },
    };

    assignBotToJob(sim, bot, job);
    expect(bot.state).toBe('HARVEST_STONE');
    expect(bot.harvestZoneId).toBe('z1');
    expect(bot.harvestProgress).toBe(0);
    expect(bot.harvestTarget).toBe(RESOURCE.stone.harvestTicks);
    expect(zone.harvesters.has(1)).toBe(true);
  });

  it('assignBotToJob handles unknown job type gracefully', () => {
    const sim = makeSim();
    const bot = makeBot(1, { state: 'IDLE' });
    const job = { type: 'UNKNOWN', entityId: 'x' };

    assignBotToJob(sim, bot, job);
    // Bot state should not change for unknown types
    expect(bot.state).toBe('IDLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// hasHigherPriorityWork
// ═══════════════════════════════════════════════════════════════════════

describe('labour — hasHigherPriorityWork', () => {
  it('returns true for idle bot (any work is higher priority)', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 10, maxHp: 30 })],
    });
    const bot = makeBot(1, { state: 'IDLE' });
    const jobs = buildJobBoard(sim);

    expect(hasHigherPriorityWork(sim, bot, jobs)).toBe(true);
  });

  it('returns true when REPAIR job available and bot is harvesting', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 5, maxHp: 30 })],
      stoneZones: [makeStoneZone('z1')],
    });
    const bot = makeBot(1, { state: 'HARVEST_STONE', harvestZoneId: 'z1' });
    zoneAddHarvester(sim, 'z1', 1);
    const jobs = buildJobBoard(sim);

    expect(hasHigherPriorityWork(sim, bot, jobs)).toBe(true);
  });

  it('returns false when no higher-priority work exists', () => {
    const sim = makeSim({
      stoneZones: [makeStoneZone('z1')],
    });
    const bot = makeBot(1, { state: 'HARVEST_STONE', harvestZoneId: 'z1' });
    zoneAddHarvester(sim, 'z1', 1);
    const jobs = buildJobBoard(sim);

    // Only harvest jobs exist — same type, no higher priority
    expect(hasHigherPriorityWork(sim, bot, jobs)).toBe(false);
  });

  it('returns false when no jobs exist', () => {
    const sim = makeSim();
    const bot = makeBot(1, { state: 'HARVEST_STONE', harvestZoneId: 'z1' });
    expect(hasHigherPriorityWork(sim, bot, null)).toBe(false);
    expect(hasHigherPriorityWork(sim, bot, [])).toBe(false);
  });

  it('does not preempt when candidate job is at capacity', () => {
    const w1 = makeWall('w1', { hp: 5, maxHp: 30 });
    const sim = makeSim({
      walls: [w1],
      stoneZones: [makeStoneZone('z1')],
      bots: [
        makeBot(1, { state: 'HARVEST_STONE', harvestZoneId: 'z1' }),
        makeBot(2, { state: 'REPAIR', wallId: 'w1' }),
        makeBot(3, { state: 'REPAIR', wallId: 'w1' }),
        makeBot(4, { state: 'REPAIR', wallId: 'w1' }),
      ],
    });
    zoneAddHarvester(sim, 'z1', 1);
    const jobs = buildJobBoard(sim);
    const bot = sim.bots[0]; // harvesting bot

    expect(hasHigherPriorityWork(sim, bot, jobs)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// tickLabour integration
// ═══════════════════════════════════════════════════════════════════════

describe('labour — tickLabour', () => {
  it('assigns idle bots to available repair jobs', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 5, maxHp: 30 })],
      bots: [makeBot(1, { state: 'IDLE' })],
    });

    tickLabour(sim);
    expect(sim.bots[0].state).toBe('REPAIR');
    expect(sim.bots[0].wallId).toBe('w1');
    expect(sim.labourSummary).toBeDefined();
    expect(sim.labourSummary.repairingBots).toBe(1);
  });

  it('assigns idle bots to harvest when no repair needed', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 30, maxHp: 30 })], // full HP
      stoneZones: [makeStoneZone('z1')],
      bots: [makeBot(1, { state: 'IDLE' })],
    });

    tickLabour(sim);
    expect(sim.bots[0].state).toBe('HARVEST_STONE');
    expect(sim.bots[0].harvestZoneId).toBe('z1');
    expect(sim.labourSummary.harvestingBots).toBe(1);
  });

  it('does not reassign bots mid-cycle (RETURN_STONE)', () => {
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 5, maxHp: 30 })],
      stoneZones: [makeStoneZone('z1')],
      bots: [makeBot(1, { state: 'RETURN_STONE', harvestZoneId: 'z1' })],
    });

    tickLabour(sim);
    // Bot should still be returning, not reassigned to repair
    expect(sim.bots[0].state).toBe('RETURN_STONE');
  });

  it('detects crisis and updates sim.crisisActive', () => {
    const sim = makeSim({
      resources: { stone: 5 }, // below threshold
      bots: [makeBot(1, { state: 'IDLE' })],
    });

    tickLabour(sim);
    expect(sim.crisisActive).toBe(true);
  });

  it('labourSummary includes crisis state', () => {
    const sim = makeSim({
      resources: { stone: 5 },
      bots: [makeBot(1, { state: 'IDLE' })],
    });

    tickLabour(sim);
    expect(sim.labourSummary.crisisActive).toBe(true);
  });

  it('preempts harvester when repair job opens', () => {
    const z1 = makeStoneZone('z1');
    z1.harvesters.add(1);
    const sim = makeSim({
      walls: [makeWall('w1', { hp: 5, maxHp: 30 })],
      stoneZones: [z1],
      bots: [makeBot(1, { state: 'HARVEST_STONE', harvestZoneId: 'z1' })],
    });

    tickLabour(sim);
    // Bot should be preempted from harvesting and reassigned to repair
    expect(sim.bots[0].state).toBe('REPAIR');
    expect(sim.bots[0].wallId).toBe('w1');
    // Zone should be released
    expect(z1.harvesters.has(1)).toBe(false);
  });

  it('stays idle when no jobs available', () => {
    const sim = makeSim({
      bots: [makeBot(1, { state: 'IDLE' })],
    });

    tickLabour(sim);
    expect(sim.bots[0].state).toBe('IDLE');
    expect(sim.labourSummary.idleBots).toBe(1);
  });

  it('handles multiple bots and multiple jobs', () => {
    const sim = makeSim({
      walls: [
        makeWall('w1', { hp: 5, maxHp: 30 }),
        makeWall('w2', { hp: 10, maxHp: 30 }),
      ],
      stoneZones: [makeStoneZone('z1')],
      bots: [
        makeBot(1, { state: 'IDLE', x: 35, y: 35 }),
        makeBot(2, { state: 'IDLE', x: 36, y: 36 }),
        makeBot(3, { state: 'IDLE', x: 40, y: 40 }),
      ],
    });

    tickLabour(sim);

    // First two bots should be assigned to repair (two damaged walls)
    const repairing = sim.bots.filter((b) => b.state === 'REPAIR');
    expect(repairing.length).toBeGreaterThanOrEqual(2);

    // Summary should reflect 3 repairing (w1 + w2 can have up to 3 each)
    expect(sim.labourSummary.repairingBots).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════

describe('labour — edge cases', () => {
  it('handles sim with no bots array', () => {
    const sim = makeSim();
    delete sim.bots;
    // Should not throw
    expect(() => tickLabour(sim)).not.toThrow();
    expect(sim.labourSummary.idleBots).toBe(0);
  });

  it('handles sim with no walls array', () => {
    const sim = makeSim({
      bots: [makeBot(1, { state: 'IDLE' })],
    });
    delete sim.walls;
    expect(() => tickLabour(sim)).not.toThrow();
  });

  it('handles sim with no stoneZones array', () => {
    const sim = makeSim({
      bots: [makeBot(1, { state: 'IDLE' })],
    });
    delete sim.stoneZones;
    expect(() => tickLabour(sim)).not.toThrow();
  });

  it('buildJobBoard handles null walls', () => {
    const sim = makeSim({ walls: null });
    const jobs = buildJobBoard(sim);
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBe(0);
  });

  it('buildJobBoard handles null stoneZones', () => {
    const sim = makeSim({ stoneZones: null });
    const jobs = buildJobBoard(sim);
    expect(Array.isArray(jobs)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════

function zoneAddHarvester(sim, zoneId, botId) {
  const zone = sim.stoneZones?.find((z) => z.id === zoneId);
  if (zone) {
    if (!zone.harvesters) zone.harvesters = new Set();
    zone.harvesters.add(botId);
  }
}
