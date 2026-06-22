/**
 * walls.test.js — Tests for the wall system.
 *
 * Covers: createWall, canPlaceWall, damageWall, destroyWall,
 * repairWall, findNearestDamagedWall, upgradeWall, getWallCost,
 * findBlockingWall, isPointInWall, canMountOnWall, siege integration.
 */


import {
  createWall,
  canPlaceWall,
  damageWall,
  destroyWall,
  repairWall,
  findNearestDamagedWall,
  upgradeWall,
  getWallCost,
  findBlockingWall,
  isPointInWall,
  canMountOnWall,
  findWallAt,
  getWallSummary,
} from '../walls.js';
import {
  createSim,
  stepTick,
  buyWall,
  buyWallUpgrade,
  getStats,
} from '../engine.js';
import { WALL, ENEMY } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function sim10x10() {
  return createSim({ worldWidth: 30, worldHeight: 30 });
}

function simWithWalls(count, level = 0) {
  const sim = sim10x10();
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const x = sim.baseCenter.x + Math.cos(angle) * 6;
    const y = sim.baseCenter.y + Math.sin(angle) * 6;
    createWall(sim, x, y, level);
  }
  return sim;
}

function createBot(sim, x, y) {
  const bot = {
    id: (sim.bots.length || 0) + 1,
    x,
    y,
    state: 'IDLE',
    harvestZoneId: null,
    harvestProgress: 0,
    carryingStone: 0,
    wallId: null,
    buildProgress: 0,
    repairTargetId: null,
  };
  sim.bots.push(bot);
  return bot;
}

// ═══════════════════════════════════════════════════════════════════════
// createWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — createWall', () => {
  it('creates a wall at the given position with L1 stats', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    expect(wall).toBeDefined();
    expect(wall.level).toBe(0);
    expect(wall.hp).toBe(WALL.levels[0].hp);
    expect(wall.maxHp).toBe(WALL.levels[0].hp);
    expect(wall.radius).toBe(WALL.levels[0].radius);
    expect(wall.label).toBe(WALL.levels[0].label);
    expect(wall.alive).toBe(true);
    expect(sim.walls).toContain(wall);
  });

  it('creates walls at different levels with correct stats', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 5, 5, 1);
    expect(w1.level).toBe(1);
    expect(w1.hp).toBe(WALL.levels[1].hp);
    expect(w1.label).toBe(WALL.levels[1].label);

    const w2 = createWall(sim, 10, 10, 3);
    expect(w2.level).toBe(3);
    expect(w2.hp).toBe(WALL.levels[3].hp);
    expect(w2.label).toBe(WALL.levels[3].label);
  });

  it('clamps level to [0, 3]', () => {
    const sim = sim10x10();
    const below = createWall(sim, 5, 5, -1);
    expect(below.level).toBe(0);

    const above = createWall(sim, 10, 10, 99);
    expect(above.level).toBe(3);
  });

  it('assigns unique incrementing IDs', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 5, 5);
    const w2 = createWall(sim, 10, 10);
    const w3 = createWall(sim, 15, 15);
    expect(w1.id).toBe(1);
    expect(w2.id).toBe(2);
    expect(w3.id).toBe(3);
  });

  it('initializes as not building', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    expect(wall.building).toBe(false);
    expect(wall.buildProgress).toBe(0);
    expect(wall.builderId).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// canPlaceWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — canPlaceWall', () => {
  it('allows placement at a valid position', () => {
    const sim = sim10x10();
    const result = canPlaceWall(sim, 20, 15); // ~5 cells from base center
    expect(result.valid).toBe(true);
  });

  it('rejects placement too close to base', () => {
    const sim = sim10x10();
    const result = canPlaceWall(sim, sim.baseCenter.x + 1, sim.baseCenter.y);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Too close');
  });

  it('rejects placement too far from base', () => {
    const sim = sim10x10();
    const result = canPlaceWall(sim, 0, 0); // corner of 30x30 world
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Too far');
  });

  it('rejects placement when max segments reached', () => {
    const sim = sim10x10();
    // Place 20 walls
    for (let i = 0; i < WALL.maxSegments; i++) {
      const angle = (2 * Math.PI * i) / WALL.maxSegments;
      const x = sim.baseCenter.x + Math.cos(angle) * 8;
      const y = sim.baseCenter.y + Math.sin(angle) * 8;
      createWall(sim, x, y);
    }
    const result = canPlaceWall(sim, 20, 15);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('cap reached');
    expect(result.reason).toContain('20/20');
  });

  it('rejects placement on existing wall', () => {
    const sim = sim10x10();
    createWall(sim, 20, 15);
    const result = canPlaceWall(sim, 20, 15);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already exists');
  });

  it('allows placement at exact min distance boundary', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    const result = canPlaceWall(sim, cx + WALL.placementMinDistance, cy);
    expect(result.valid).toBe(true);
  });

  it('rejects placement just inside min distance', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    const result = canPlaceWall(sim, cx + WALL.placementMinDistance - 0.5, cy);
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// damageWall / destroyWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — damageWall / destroyWall', () => {
  it('applies damage to wall HP', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    const initialHp = wall.hp;
    const result = damageWall(sim, wall, 5);
    expect(wall.hp).toBe(initialHp - 5);
    expect(result.destroyed).toBe(false);
  });

  it('destroys wall when HP reaches 0', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    const result = damageWall(sim, wall, wall.hp);
    expect(result.destroyed).toBe(true);
    expect(wall.alive).toBe(false);
    expect(wall.hp).toBe(0);
  });

  it('reports overkill damage', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    const overkillAmount = wall.hp + 10;
    const result = damageWall(sim, wall, overkillAmount);
    expect(result.destroyed).toBe(true);
    expect(result.overkill).toBe(10);
  });

  it('is no-op on already dead wall', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.alive = false;
    const result = damageWall(sim, wall, 10);
    expect(result.destroyed).toBe(false);
    expect(result.overkill).toBe(10);
  });

  it('releases sieging enemies on destruction', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    // Add a sieging enemy
    sim.enemies.push({
      id: 1,
      type: 'scout',
      x: 10,
      y: 10,
      hp: 8,
      maxHp: 8,
      speed: 0.01,
      damage: 2,
      size: 0.8,
      alive: true,
      state: 'sieging',
      siegeTargetId: wall.id,
    });
    const enemy = sim.enemies[0];

    destroyWall(sim, wall);

    expect(enemy.state).toBe('moving');
    expect(enemy.siegeTargetId).toBe(null);
  });

  it('releases builder bot on destruction', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    const bot = createBot(sim, 10, 10);
    bot.wallId = wall.id;
    bot.state = 'BUILD_WALL';
    wall.builderId = bot.id;

    destroyWall(sim, wall);

    expect(bot.wallId).toBe(null);
    expect(bot.buildProgress).toBe(0);
    expect(bot.state).toBe('IDLE');
  });

  it('releases repair bots on destruction', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.hp = 5; // damaged
    const bot = createBot(sim, 10, 10);
    bot.repairTargetId = wall.id;
    bot.state = 'REPAIR';

    destroyWall(sim, wall);

    expect(bot.repairTargetId).toBe(null);
    expect(bot.state).toBe('IDLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// repairWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — repairWall', () => {
  it('restores HP at repairRate when bot is in range', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.hp = 10; // damaged
    const bot = createBot(sim, 10, 10); // at same position

    const restored = repairWall(sim, wall, bot);

    expect(restored).toBe(WALL.repairRate);
    expect(wall.hp).toBe(10 + WALL.repairRate);
  });

  it('does not exceed max HP', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.hp = wall.maxHp - 0.1; // almost full
    const bot = createBot(sim, 10, 10);

    const restored = repairWall(sim, wall, bot);

    expect(restored).toBeCloseTo(0.1, 5);
    expect(wall.hp).toBe(wall.maxHp);
  });

  it('returns 0 when wall is at full HP', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    const bot = createBot(sim, 10, 10);

    const restored = repairWall(sim, wall, bot);

    expect(restored).toBe(0);
  });

  it('returns 0 when bot is out of repair range', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.hp = 10;
    const bot = createBot(sim, 30, 30); // far away

    const restored = repairWall(sim, wall, bot);

    expect(restored).toBe(0);
    expect(wall.hp).toBe(10); // unchanged
  });

  it('returns 0 when wall is dead', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10);
    wall.alive = false;
    const bot = createBot(sim, 10, 10);

    const restored = repairWall(sim, wall, bot);

    expect(restored).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// findNearestDamagedWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — findNearestDamagedWall', () => {
  it('finds the nearest damaged wall', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 10, 10);
    const w2 = createWall(sim, 20, 20);
    w1.hp = 5;
    w2.hp = 10;
    const bot = createBot(sim, 9, 10); // near w1

    const found = findNearestDamagedWall(sim, bot);

    expect(found).toBe(w1); // w1 is closer AND has lower HP
  });

  it('prefers lowest-HP wall when multiple in range', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 12, 15); // same position but higher HP
    const w2 = createWall(sim, 12, 15); // NOTE: can't place at same position
    // Let's make two walls at adjacent positions
    sim.walls = [];
    const wLow = createWall(sim, 14, 15); wLow.hp = 3;
    const wHigh = createWall(sim, 16, 15); wHigh.hp = 25;
    const bot = createBot(sim, 15, 15); // between them

    const found = findNearestDamagedWall(sim, bot);

    expect(found).toBe(wLow); // lower HP wins
  });

  it('returns null when no walls are damaged', () => {
    const sim = sim10x10();
    createWall(sim, 10, 10); // full HP
    const bot = createBot(sim, 10, 10);

    const found = findNearestDamagedWall(sim, bot);

    expect(found).toBe(null);
  });

  it('returns null when no walls exist', () => {
    const sim = sim10x10();
    const bot = createBot(sim, 10, 10);

    const found = findNearestDamagedWall(sim, bot);

    expect(found).toBe(null);
  });

  it('returns closest damaged wall even if not in repair range', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 10, 10); w1.hp = 5;
    const w2 = createWall(sim, 25, 25); w2.hp = 5;
    const bot = createBot(sim, 9, 10); // near w1

    const found = findNearestDamagedWall(sim, bot);

    // Both have same HP; w1 is closer
    expect(found).toBe(w1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// upgradeWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — upgradeWall', () => {
  it('upgrades wall to next level with full HP', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    wall.hp = 5; // damaged

    const result = upgradeWall(wall);

    expect(result).toBe(true);
    expect(wall.level).toBe(1);
    expect(wall.hp).toBe(WALL.levels[1].hp);
    expect(wall.maxHp).toBe(WALL.levels[1].hp);
    expect(wall.label).toBe(WALL.levels[1].label);
  });

  it('rejects upgrade on max-level wall', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 3);

    const result = upgradeWall(wall);

    expect(result).toBe(false);
    expect(wall.level).toBe(3); // unchanged
  });

  it('rejects upgrade on dead wall', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    wall.alive = false;

    const result = upgradeWall(wall);

    expect(result).toBe(false);
  });

  it('upgrade heals wall to full new-level HP', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 1); // L2
    wall.hp = 1; // nearly dead

    upgradeWall(wall);

    expect(wall.level).toBe(2); // L3
    expect(wall.hp).toBe(WALL.levels[2].hp);
    expect(wall.maxHp).toBe(WALL.levels[2].hp);
  });

  it('upgrades through all 4 levels', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);

    expect(upgradeWall(wall)).toBe(true);
    expect(wall.level).toBe(1);

    expect(upgradeWall(wall)).toBe(true);
    expect(wall.level).toBe(2);

    expect(upgradeWall(wall)).toBe(true);
    expect(wall.level).toBe(3);

    expect(upgradeWall(wall)).toBe(false); // max level
    expect(wall.level).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getWallCost
// ═══════════════════════════════════════════════════════════════════════

describe('walls — getWallCost', () => {
  it('L1 is free', () => {
    const cost = getWallCost(0);
    expect(cost.stone).toBe(0);
    expect(cost.crystal).toBeUndefined();
  });

  it('L2 costs 30 Stone', () => {
    const cost = getWallCost(1);
    expect(cost.stone).toBe(30);
  });

  it('L3 costs 80 Stone + 5 Crystal', () => {
    const cost = getWallCost(2);
    expect(cost.stone).toBe(80);
    expect(cost.crystal).toBe(5);
  });

  it('L4 costs 150 Stone + 15 Crystal', () => {
    const cost = getWallCost(3);
    expect(cost.stone).toBe(150);
    expect(cost.crystal).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// findBlockingWall / isPointInWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — findBlockingWall / isPointInWall', () => {
  it('isPointInWall returns true for point inside wall radius', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    expect(isPointInWall(wall, 10, 10)).toBe(true);
    expect(isPointInWall(wall, 10.4, 10.4)).toBe(true); // within radius 0.8
  });

  it('isPointInWall returns false for point outside wall radius', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    expect(isPointInWall(wall, 20, 20)).toBe(false);
  });

  it('isPointInWall returns false for dead wall', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 10, 0);
    wall.alive = false;
    expect(isPointInWall(wall, 10, 10)).toBe(false);
  });

  it('findBlockingWall finds wall enemy is colliding with', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 15);
    const enemy = {
      id: 1,
      type: 'scout',
      x: 10,
      y: 14.5,
      size: 0.8,
      alive: true,
    };

    const found = findBlockingWall(sim, enemy);
    expect(found).toBe(wall);
  });

  it('findBlockingWall returns null when no collision', () => {
    const sim = sim10x10();
    createWall(sim, 10, 15);
    const enemy = {
      id: 1,
      type: 'scout',
      x: 0,
      y: 0,
      size: 0.8,
      alive: true,
    };

    const found = findBlockingWall(sim, enemy);
    expect(found).toBe(null);
  });

  it('findBlockingWall returns null when no walls exist', () => {
    const sim = sim10x10();
    const enemy = {
      id: 1,
      type: 'scout',
      x: 10,
      y: 10,
      size: 0.8,
      alive: true,
    };

    const found = findBlockingWall(sim, enemy);
    expect(found).toBe(null);
  });

  it('findBlockingWall ignores dead walls', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 15);
    wall.alive = false;
    const enemy = {
      id: 1,
      type: 'scout',
      x: 10,
      y: 14.5,
      size: 0.8,
      alive: true,
    };

    const found = findBlockingWall(sim, enemy);
    expect(found).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// findWallAt / canMountOnWall
// ═══════════════════════════════════════════════════════════════════════

describe('walls — findWallAt / canMountOnWall', () => {
  it('findWallAt returns wall at exact position', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 15);
    expect(findWallAt(sim, 10, 15)).toBe(wall);
  });

  it('findWallAt returns wall within 0.5 cell tolerance', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 15);
    expect(findWallAt(sim, 10.3, 15.3)).toBe(wall);
  });

  it('findWallAt returns null when no wall nearby', () => {
    const sim = sim10x10();
    createWall(sim, 10, 15);
    expect(findWallAt(sim, 25, 25)).toBe(null);
  });

  it('canMountOnWall returns true for L2+ wall', () => {
    const sim = sim10x10();
    createWall(sim, 10, 15, 1); // L2
    expect(canMountOnWall(sim, 10, 15)).toBe(true);
  });

  it('canMountOnWall returns false for L1 wall', () => {
    const sim = sim10x10();
    createWall(sim, 10, 15, 0); // L1
    expect(canMountOnWall(sim, 10, 15)).toBe(false);
  });

  it('canMountOnWall returns false when no wall present', () => {
    const sim = sim10x10();
    expect(canMountOnWall(sim, 10, 15)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getWallSummary
// ═══════════════════════════════════════════════════════════════════════

describe('walls — getWallSummary', () => {
  it('returns empty summary when no walls exist', () => {
    const sim = sim10x10();
    const summary = getWallSummary(sim);
    expect(summary.total).toBe(0);
    expect(summary.max).toBe(WALL.maxSegments);
    expect(summary.damaged).toBe(0);
  });

  it('counts walls by level', () => {
    const sim = sim10x10();
    createWall(sim, 10, 15, 0); // L1
    createWall(sim, 12, 15, 1); // L2
    createWall(sim, 14, 15, 2); // L3

    const summary = getWallSummary(sim);
    expect(summary.total).toBe(3);
    expect(summary.byLevel).toEqual({ L1: 1, L2: 1, L3: 1 });
  });

  it('counts damaged walls', () => {
    const sim = sim10x10();
    const w1 = createWall(sim, 10, 15);
    const w2 = createWall(sim, 12, 15);
    w1.hp = 10; // damaged

    const summary = getWallSummary(sim);
    expect(summary.damaged).toBe(1);
  });

  it('ignores dead walls', () => {
    const sim = sim10x10();
    const wall = createWall(sim, 10, 15);
    wall.alive = false;

    const summary = getWallSummary(sim);
    expect(summary.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Engine integration — buyWall / buyWallUpgrade
// ═══════════════════════════════════════════════════════════════════════

describe('walls — engine integration', () => {
  it('buyWall places a wall at valid position', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    const result = buyWall(sim, cx + 8, cy);

    expect(result.success).toBe(true);
    expect(result.wallId).toBe(1);
    expect(sim.walls.length).toBe(1);
    expect(sim.walls[0].alive).toBe(true);
  });

  it('buyWall rejects invalid placement', () => {
    const sim = sim10x10();
    const result = buyWall(sim, sim.baseCenter.x + 1, sim.baseCenter.y);

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(sim.walls.length).toBe(0);
  });

  it('buyWallupgrade upgrades existing wall', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    // Place L1 wall at cost 0
    const placeResult = buyWall(sim, cx + 8, cy);
    expect(placeResult.success).toBe(true);

    // Give enough stone for L2 upgrade
    sim.resources.stone = 100;

    const upgradeResult = buyWallUpgrade(sim, placeResult.wallId);
    expect(upgradeResult.success).toBe(true);
    expect(sim.walls[0].level).toBe(1); // L2
    expect(sim.walls[0].label).toBe(WALL.levels[1].label);
    expect(sim.resources.stone).toBe(100 - 30); // L2 cost
  });

  it('buyWallupgrade rejects max-level wall', () => {
    const sim = sim10x10();
    sim.resources.stone = 500;
    sim.resources.crystal = 50;
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    buyWall(sim, cx + 8, cy);

    // Upgrade to L4
    buyWallUpgrade(sim, 1); // L2
    buyWallUpgrade(sim, 1); // L3
    buyWallUpgrade(sim, 1); // L4

    const result = buyWallUpgrade(sim, 1); // Already max
    expect(result.success).toBe(false);
    expect(result.reason).toContain('max level');
  });

  it('buyWallupgrade rejects insufficient resources', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    buyWall(sim, cx + 8, cy);

    // No resources
    sim.resources.stone = 0;
    sim.resources.crystal = 0;

    const result = buyWallUpgrade(sim, 1);
    expect(result.success).toBe(false);
  });

  it('buyWallupgrade rejects nonexistent wall', () => {
    const sim = sim10x10();
    const result = buyWallUpgrade(sim, 999);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('getStats includes wall data after placement', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;
    buyWall(sim, cx + 8, cy);

    const stats = getStats(sim);
    expect(stats.wallCount).toBe(1);
    expect(stats.walls.total).toBe(1);
    expect(stats.walls.byLevel.L1).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Enemy siege integration
// ═══════════════════════════════════════════════════════════════════════

describe('walls — enemy siege integration', () => {
  it('enemy enters siege state when hitting a wall', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;

    // Place wall between enemy and base
    createWall(sim, cx + 5, cy);

    // Spawn enemy at edge, moving toward base
    sim.enemies.push({
      id: 1,
      type: 'scout',
      x: cx + 10,
      y: cy,
      hp: 8,
      maxHp: 8,
      speed: 0.5,
      damage: 2,
      size: 0.8,
      alive: true,
      state: 'moving',
      wave: 1,
    });

    // Step until enemy reaches the wall
    let sieged = false;
    for (let i = 0; i < 50; i++) {
      stepTick(sim);
      if (sim.enemies[0]?.state === 'sieging') {
        sieged = true;
        break;
      }
      if (!sim.enemies[0]?.alive) break;
    }

    expect(sieged).toBe(true);
    expect(sim.enemies[0].siegeTargetId).toBe(1);
  });

  it('sieging enemy damages wall each tick', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;

    const wall = createWall(sim, cx + 5, cy);
    const initialHp = wall.hp;

    // Place enemy directly on the wall in siege state
    sim.enemies.push({
      id: 1,
      type: 'scout',
      x: cx + 5,
      y: cy,
      hp: 8,
      maxHp: 8,
      speed: 0.5,
      damage: 2,
      size: 0.8,
      alive: true,
      state: 'sieging',
      siegeTargetId: wall.id,
      wave: 1,
    });

    stepTick(sim);
    expect(wall.hp).toBe(initialHp - 2); // enemy damage = 2

    stepTick(sim);
    expect(wall.hp).toBe(initialHp - 4);
  });

  it('enemy resumes moving when wall is destroyed', () => {
    const sim = sim10x10();
    const cx = sim.baseCenter.x;
    const cy = sim.baseCenter.y;

    const wall = createWall(sim, cx + 5, cy);
    wall.hp = 1; // nearly dead

    sim.enemies.push({
      id: 1,
      type: 'scout',
      x: cx + 5,
      y: cy,
      hp: 8,
      maxHp: 8,
      speed: 0.5,
      damage: 2,
      size: 0.8,
      alive: true,
      state: 'sieging',
      siegeTargetId: wall.id,
      wave: 1,
    });

    stepTick(sim); // enemy deals 2 damage, wall dies (1 HP)

    expect(wall.alive).toBe(false);
    expect(sim.enemies[0].state).toBe('moving');
    expect(sim.enemies[0].siegeTargetId).toBe(null);
  });

  it('sieging enemy stops if wall vanishes (cleanup)', () => {
    const sim = sim10x10();

    sim.enemies.push({
      id: 1,
      type: 'scout',
      x: 15,
      y: 15,
      hp: 8,
      maxHp: 8,
      speed: 0.5,
      damage: 2,
      size: 0.8,
      alive: true,
      state: 'sieging',
      siegeTargetId: 999, // nonexistent wall
      wave: 1,
    });

    stepTick(sim);

    // Should resume moving since wall doesn't exist
    expect(sim.enemies[0].state).toBe('moving');
    expect(sim.enemies[0].siegeTargetId).toBe(null);
  });
});
