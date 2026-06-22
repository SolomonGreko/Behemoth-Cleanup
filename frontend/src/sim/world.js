/**
 * world.js — Stone harvest zone generation.
 *
 * Extends genWorld() with Stone zone placement.
 *
 * Zones are placed during world generation:
 *   - Clusters of 5–15 zones within 8–20 cells of the base center.
 *   - Zone count scales with map size: ~3 zones per 100 cells of reachable terrain.
 *   - Zones are visually distinct (rocky terrain patches).
 *   - Stone zones do NOT block grass/moss spread — garden can grow over them.
 */

import { RESOURCE } from './config.js';

/**
 * Generate Stone harvest zones on the world map.
 * Called during genWorld() after terrain generation.
 *
 * @param {object} sim — sim state with sim.world (grid), sim.baseCenter
 * @param {number} seed — world seed for deterministic generation
 * @param {function} rng — seeded random number generator [0, 1)
 * @returns {object[]} array of StoneZone objects placed on the map
 */
export function generateStoneZones(sim, seed, rng) {
  const zones = [];
  const { world } = sim;
  const baseX = sim.baseCenter?.x ?? world.width / 2;
  const baseY = sim.baseCenter?.y ?? world.height / 2;

  // Calculate total zones from map size
  const reachableCells = world.width * world.height; // approximate
  const targetZoneCount = Math.floor(
    (reachableCells / 100) * RESOURCE.stone.zonesPer100Cells
  );

  // Cluster generation
  let zoneId = 0;
  let attemptsRemaining = targetZoneCount * 10; // Max attempts to find valid spots

  while (zones.length < targetZoneCount && attemptsRemaining > 0) {
    attemptsRemaining--;

    // Pick a random cluster center within min/max distance from base
    const angle = rng() * Math.PI * 2;
    const distRange =
      RESOURCE.stone.maxZoneDistance - RESOURCE.stone.minZoneDistance;
    const dist = RESOURCE.stone.minZoneDistance + rng() * distRange;

    const clusterX = Math.floor(baseX + Math.cos(angle) * dist);
    const clusterY = Math.floor(baseY + Math.sin(angle) * dist);

    // Bounds check
    if (
      clusterX < 0 || clusterX >= world.width ||
      clusterY < 0 || clusterY >= world.height
    ) {
      continue;
    }

    // Determine cluster size (5-15 zones per cluster)
    const clusterSize =
      RESOURCE.stone.zoneClusterSize.min +
      Math.floor(rng() * (RESOURCE.stone.zoneClusterSize.max - RESOURCE.stone.zoneClusterSize.min + 1));

    // Place zones within the cluster (±2 cells from cluster center)
    for (let i = 0; i < clusterSize && zones.length < targetZoneCount; i++) {
      const offsetX = Math.floor((rng() - 0.5) * 4); // -2 to +2
      const offsetY = Math.floor((rng() - 0.5) * 4);

      const zx = clusterX + offsetX;
      const zy = clusterY + offsetY;

      // Bounds check
      if (zx < 0 || zx >= world.width || zy < 0 || zy >= world.height) {
        continue;
      }

      // Check cell is valid terrain (not water, not base center area)
      const cell = world.grid[zy]?.[zx];
      if (!cell || cell.type === 'water') continue;

      // Don't place zones too close to base center (within minZoneDistance)
      const baseDist = Math.sqrt(
        (zx - baseX) ** 2 + (zy - baseY) ** 2
      );
      if (baseDist < RESOURCE.stone.minZoneDistance) continue;

      // Don't overlap existing zones
      const tooClose = zones.some(
        (z) => Math.abs(z.x - zx) < 2 && Math.abs(z.y - zy) < 2
      );
      if (tooClose) continue;

      // Mark cell as harvestable stone
      cell.harvestable = 'stone';

      zones.push({
        id: zoneId++,
        x: zx,
        y: zy,
        harvesters: new Set(),
      });
    }
  }

  sim.stoneZones = zones;
  return zones;
}

/**
 * Remove a stone zone from the world (e.g., destroyed by enemy attack).
 * Releases all bots currently assigned to this zone.
 *
 * @param {object} sim
 * @param {number} zoneId
 */
export function removeStoneZone(sim, zoneId) {
  const idx = sim.stoneZones?.findIndex((z) => z.id === zoneId);
  if (idx === undefined || idx === -1) return;

  const zone = sim.stoneZones[idx];

  // Clear cell marker
  const cell = sim.world?.grid?.[zone.y]?.[zone.x];
  if (cell) {
    delete cell.harvestable;
  }

  // Release all bots harvesting at this zone
  if (sim.bots) {
    for (const bot of sim.bots) {
      if (bot.harvestZoneId === zoneId) {
        bot.harvestZoneId = null;
        bot.harvestProgress = 0;
        bot.carryingStone = 0;
        bot.state = 'IDLE';
      }
    }
  }

  // Remove zone
  sim.stoneZones.splice(idx, 1);
}

/**
 * Count active bots harvesting Stone.
 * Used for HUD rate display.
 *
 * @param {object} sim
 * @returns {number}
 */
export function countActiveHarvesters(sim) {
  if (!sim.bots) return 0;
  return sim.bots.filter(
    (bot) => bot.state === 'HARVEST_STONE' || bot.state === 'RETURN_STONE'
  ).length;
}
