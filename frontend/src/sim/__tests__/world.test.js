/**
 * world.test.js — Tests for stone zone generation, destruction, and helpers.
 *
 * Covers: generateStoneZones, removeStoneZone, countActiveHarvesters,
 * wall-placement zone destruction, and all acceptance criteria from
 * resource_mechanics.md §Stone Harvesting.
 */

import { generateStoneZones, removeStoneZone, countActiveHarvesters } from '../world.js';
import { createWall } from '../walls.js';
import { createSim } from '../engine.js';
import { RESOURCE } from '../config.js';

// ── Test Fixtures ────────────────────────────────────────────────────

/** Seedable PRNG (mulberry32) for deterministic zone generation. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lightweight sim for world-only tests — no engine overhead. */
function worldTestSim(width = 40, height = 40, seed = 42) {
  const sim = {
    world: { width, height, grid: [] },
    baseCenter: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    bots: [],
    walls: [],
    stoneZones: [],
  };

  // Build a simple all-ground grid
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        type: 'ground',
        x, y,
        harvestable: null,
        built: null,
        tillProgress: 0,
        grass: false,
        moss: false,
      });
    }
    grid.push(row);
  }
  sim.world.grid = grid;
  return sim;
}

// ── generateStoneZones ───────────────────────────────────────────────

describe('world — generateStoneZones', () => {
  it('generates stone zones on a 40×40 map', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));

    expect(zones.length).toBeGreaterThan(0);
    expect(sim.stoneZones).toBe(zones);
  });

  it('produces roughly the expected zone count: ~3 per 100 reachable cells', () => {
    const width = 40, height = 40;
    const sim = worldTestSim(width, height);
    const zones = generateStoneZones(sim, 42, mulberry32(42));

    const reachableCells = width * height; // 1600
    const expected = Math.floor((reachableCells / 100) * RESOURCE.stone.zonesPer100Cells);
    // 1600/100 * 3 = 48 zones
    expect(expected).toBe(48);

    // Allow ±30% tolerance for randomness and edge clipping
    const minExpected = Math.floor(expected * 0.7);
    const maxExpected = Math.ceil(expected * 1.3);
    expect(zones.length).toBeGreaterThanOrEqual(minExpected);
    expect(zones.length).toBeLessThanOrEqual(maxExpected);
  });

  it('places clusters within 8–20 cells of the base center', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));
    const { baseCenter } = sim;

    for (const zone of zones) {
      const dist = Math.sqrt(
        (zone.x - baseCenter.x) ** 2 + (zone.y - baseCenter.y) ** 2
      );
      expect(dist).toBeGreaterThanOrEqual(RESOURCE.stone.minZoneDistance - 1);
      // maxZoneDistance + cluster spread (±2) = 20 + 2 = 22 max
      expect(dist).toBeLessThanOrEqual(RESOURCE.stone.maxZoneDistance + 3);
    }
  });

  it('does not place zones on water cells', () => {
    const sim = worldTestSim(40, 40);
    // Make the entire grid water except a small patch
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        sim.world.grid[y][x].type = 'water';
      }
    }
    // Create a small ground patch at distance ~10 from center
    const { baseCenter } = sim;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const gx = baseCenter.x + 10 + dx;
        const gy = baseCenter.y + dy;
        if (gx >= 0 && gx < 40 && gy >= 0 && gy < 40) {
          sim.world.grid[gy][gx].type = 'ground';
        }
      }
    }

    const zones = generateStoneZones(sim, 42, mulberry32(42));
    // All zones must be on ground
    for (const zone of zones) {
      const cell = sim.world.grid[zone.y]?.[zone.x];
      expect(cell?.type).toBe('ground');
    }
  });

  it('tags cells as harvestable: stone', () => {
    const sim = worldTestSim(40, 40);
    generateStoneZones(sim, 42, mulberry32(42));

    for (const zone of sim.stoneZones) {
      const cell = sim.world.grid[zone.y]?.[zone.x];
      expect(cell.harvestable).toBe('stone');
    }
  });

  it('produces deterministic results for the same seed', () => {
    const sim1 = worldTestSim(40, 40);
    const sim2 = worldTestSim(40, 40);

    const zones1 = generateStoneZones(sim1, 99, mulberry32(99));
    const zones2 = generateStoneZones(sim2, 99, mulberry32(99));

    expect(zones1.length).toBe(zones2.length);
    for (let i = 0; i < zones1.length; i++) {
      expect(zones1[i].x).toBe(zones2[i].x);
      expect(zones1[i].y).toBe(zones2[i].y);
    }
  });

  it('produces different results for different seeds', () => {
    const sim1 = worldTestSim(40, 40);
    const sim2 = worldTestSim(40, 40);

    const zones1 = generateStoneZones(sim1, 1, mulberry32(1));
    const zones2 = generateStoneZones(sim2, 999, mulberry32(999));

    // Extremely unlikely to produce identical outputs for different seeds
    const positions1 = zones1.map(z => `${z.x},${z.y}`).sort().join('|');
    const positions2 = zones2.map(z => `${z.x},${z.y}`).sort().join('|');

    expect(positions1).not.toBe(positions2);
  });

  it('does not place zones within minZoneDistance of base center', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));
    const { baseCenter } = sim;

    for (const zone of zones) {
      const dist = Math.sqrt(
        (zone.x - baseCenter.x) ** 2 + (zone.y - baseCenter.y) ** 2
      );
      expect(dist).toBeGreaterThanOrEqual(RESOURCE.stone.minZoneDistance);
    }
  });

  it('scales zone count with map size', () => {
    const small = worldTestSim(20, 20);
    const large = worldTestSim(60, 60);

    const smallZones = generateStoneZones(small, 42, mulberry32(42));
    const largeZones = generateStoneZones(large, 42, mulberry32(42));

    // Large map should have many more zones
    expect(largeZones.length).toBeGreaterThan(smallZones.length * 1.5);
  });
});

// ── removeStoneZone ──────────────────────────────────────────────────

describe('world — removeStoneZone', () => {
  it('removes a zone by ID and clears the cell marker', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));
    const targetZone = zones[0];

    removeStoneZone(sim, targetZone.id);

    // Zone should be gone from sim.stoneZones
    expect(sim.stoneZones.find(z => z.id === targetZone.id)).toBeUndefined();

    // Cell should no longer be harvestable
    const cell = sim.world.grid[targetZone.y]?.[targetZone.x];
    expect(cell.harvestable).toBeFalsy();
  });

  it('releases bots assigned to the removed zone', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));
    const targetZone = zones[0];

    // Add a bot harvesting at this zone
    sim.bots.push({
      id: 1,
      x: targetZone.x,
      y: targetZone.y,
      state: 'HARVEST_STONE',
      harvestZoneId: targetZone.id,
      harvestProgress: 40,
      carryingStone: 1,
    });

    removeStoneZone(sim, targetZone.id);

    // Bot should be reset to IDLE
    const bot = sim.bots[0];
    expect(bot.state).toBe('IDLE');
    expect(bot.harvestZoneId).toBeNull();
    expect(bot.harvestProgress).toBe(0);
    expect(bot.carryingStone).toBe(0);
  });

  it('is a no-op for an invalid zone ID', () => {
    const sim = worldTestSim(40, 40);
    generateStoneZones(sim, 42, mulberry32(42));
    const initialCount = sim.stoneZones.length;

    // Should not throw
    removeStoneZone(sim, 99999);
    expect(sim.stoneZones.length).toBe(initialCount);
  });

  it('is a no-op when stoneZones is empty', () => {
    const sim = worldTestSim(40, 40);
    // No zones generated
    expect(() => removeStoneZone(sim, 1)).not.toThrow();
  });
});

// ── Wall placement destroys stone zones ──────────────────────────────

describe('world — wall placement destroys stone zones', () => {
  it('destroys a stone zone when a wall is placed on its cell', () => {
    const sim = worldTestSim(40, 40);
    const zones = generateStoneZones(sim, 42, mulberry32(42));
    const targetZone = zones[0];

    // Place a wall at the zone's exact coordinates
    const wall = createWall(sim, targetZone.x, targetZone.y, 0);

    // Zone should be gone
    expect(sim.stoneZones.find(z => z.id === targetZone.id)).toBeUndefined();

    // Cell should no longer be harvestable
    const cell = sim.world.grid[targetZone.y]?.[targetZone.x];
    expect(cell.harvestable).toBeFalsy();

    // Wall should still exist
    expect(wall.alive).toBe(true);
    expect(sim.walls).toContain(wall);
  });

  it('does not crash when placing a wall on a cell with no zone', () => {
    const sim = worldTestSim(40, 40);
    generateStoneZones(sim, 42, mulberry32(42));

    // Place a wall at base center (no zones there)
    const wall = createWall(sim, sim.baseCenter.x, sim.baseCenter.y, 0);

    expect(wall.alive).toBe(true);
  });

  it('handles wall placement when stoneZones is empty', () => {
    const sim = worldTestSim(40, 40);
    // No zones generated

    expect(() => createWall(sim, 10, 10, 0)).not.toThrow();
  });
});

// ── countActiveHarvesters ────────────────────────────────────────────

describe('world — countActiveHarvesters', () => {
  it('returns 0 when there are no bots', () => {
    const sim = worldTestSim(40, 40);
    expect(countActiveHarvesters(sim)).toBe(0);
  });

  it('returns 0 when bots are not harvesting', () => {
    const sim = worldTestSim(40, 40);
    sim.bots.push({ state: 'IDLE' });
    sim.bots.push({ state: 'BUILDING' });
    expect(countActiveHarvesters(sim)).toBe(0);
  });

  it('counts bots in HARVEST_STONE and RETURN_STONE states', () => {
    const sim = worldTestSim(40, 40);
    sim.bots.push({ state: 'HARVEST_STONE' });
    sim.bots.push({ state: 'RETURN_STONE' });
    sim.bots.push({ state: 'HARVEST_STONE' });
    sim.bots.push({ state: 'IDLE' });

    expect(countActiveHarvesters(sim)).toBe(3);
  });

  it('returns 0 when bots array is missing', () => {
    const sim = worldTestSim(40, 40);
    delete sim.bots;
    expect(countActiveHarvesters(sim)).toBe(0);
  });
});

// ── Integration: createSim with real engine ──────────────────────────

describe('world — engine integration', () => {
  it('createSim generates stone zones', () => {
    const sim = createSim({ worldWidth: 40, worldHeight: 40 });
    expect(sim.stoneZones.length).toBeGreaterThan(0);
  });

  it('stone zones have the expected shape', () => {
    const sim = createSim({ worldWidth: 40, worldHeight: 40 });
    for (const zone of sim.stoneZones) {
      expect(zone).toHaveProperty('id');
      expect(zone).toHaveProperty('x');
      expect(zone).toHaveProperty('y');
      expect(zone).toHaveProperty('harvesters');
      expect(zone.harvesters instanceof Set).toBe(true);
    }
  });

  it('walls array and stoneZones coexist after world init', () => {
    const sim = createSim({ worldWidth: 40, worldHeight: 40 });
    expect(sim.stoneZones.length).toBeGreaterThan(0);
    expect(Array.isArray(sim.walls)).toBe(true);
  });
});
