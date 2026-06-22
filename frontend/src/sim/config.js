/**
 * RESOURCE — resource economy tuning.
 *
 * Three resource types flow through the game loop:
 *   Stone  — harvested by bots from terrain zones (steady, reliable).
 *   Crystal — dropped by enemies on death (spike reward, combat-gated).
 *   Essence — passive accumulation over time (patience reward).
 *
 * Spending rules:
 *   Stone  → walls, base structures, bots, storage upgrades.
 *   Crystal → watchers, advanced turrets, mortar upgrades, storage upgrades.
 *   Essence → pulse wave, FD hasten, emergency shield.
 *
 * Units: counts are whole numbers. Rates are per tick unless noted otherwise
 * (tick = sim.tick increment, ~60 ticks/second at 60fps game loop).
 *
 * Default starting values reproduce the day-one player experience:
 *   20 Stone (one wall upgrade or one bot), 0 Crystal, 0 Essence.
 */
export const RESOURCE = {
  // ── Stone ──────────────────────────────────────────────────────────
  stone: {
    starting: 20,
    cap: 200,                     // default storage cap
    capUpgradePerLevel: 50,       // cap increase per storage upgrade level
    harvestTicks: 120,            // ticks per harvest cycle (2s at 60fps)
    harvestAmount: 1,             // Stone per completed harvest cycle
    harvestRange: 2.0,            // cells — bot must be this close to zone
    depositRange: 1.5,            // cells — distance from base center to deposit
    maxHarvestersPerZone: 3,      // prevents bot clumping
    zonesPer100Cells: 3,          // zone density in world generation
    minZoneDistance: 8,           // cells from base center — zones start here
    maxZoneDistance: 20,          // cells from base center — zones end here
    zoneClusterSize: { min: 5, max: 15 }, // zones per cluster
  },

  // ── Crystal ────────────────────────────────────────────────────────
  crystal: {
    starting: 0,
    cap: 50,                      // default storage cap
    capUpgradePerLevel: 25,
    dropAmount: 1,                // Crystal per successful standard drop
    bossDropAmount: 3,            // Crystal per boss kill
    drop: {
      scout: 0.10,                // 10% — common, low per-unit reward
      tank: 0.25,                 // 25% — tough enemy, higher reward
      artillery: 0.30,            // 30% — dangerous, highest standard reward
      crawler: 0.03,             // 3%  — swarm enemy, very low per-unit to prevent flooding
      boss: 1.0,                  // 100% — guaranteed
    },
  },

  // ── Essence ────────────────────────────────────────────────────────
  essence: {
    starting: 0,
    cap: 100,                     // default storage cap
    capUpgradePerLevel: 25,
    perTick: 1 / 600,             // fractional — 1 per 600 ticks (10s at 60fps)
    // Accumulation pauses during cinematic freeze (FD sequence, cutscenes).
  },

  // ── Ability Costs (in Essence) ────────────────────────────────────
  abilities: {
    pulseWave: { essence: 30, cooldownTicks: 3600 },        // 60s cooldown
    finalDefenseHasten: { essence: 50, cooldownTicks: 0 },  // per-FD-cycle (not time-gated)
    emergencyShield: { essence: 20, cooldownTicks: 7200 },  // 120s cooldown
  },

  // ── Storage Upgrade Costs ──────────────────────────────────────────
  // Each entry: [stoneCost, crystalCost] per upgrade level (0 = default)
  storageUpgrades: {
    stone: [
      { stone: 0, crystal: 0 },     // L0 — default
      { stone: 50, crystal: 5 },    // L1
      { stone: 80, crystal: 10 },   // L2
      { stone: 120, crystal: 20 },  // L3
    ],
    crystal: [
      { stone: 0, crystal: 0 },
      { stone: 80, crystal: 10 },
      { stone: 120, crystal: 20 },
      { stone: 180, crystal: 35 },
    ],
    essence: [
      { stone: 0, crystal: 0 },
      { stone: 100, crystal: 20 },
      { stone: 150, crystal: 35 },
      { stone: 220, crystal: 50 },
    ],
  },
};

/**
 * COST — per-action resource costs.
 */
export const COST = {
  buyBot: { stone: 15 },           // Stone cost to produce a bot
  buyWatcher: { crystal: 5 },      // Crystal cost to produce a watcher
  advancedTurret: { stone: 10, crystal: 15 }, // upgrade watcher → turret
  mortarUpgrade: { crystal: 25 },  // Mortar upgrade cost
  wallUpgradeL2: { stone: 30 },
  wallUpgradeL3: { stone: 80, crystal: 5 },   // Roots L3
  wallUpgradeL4: { stone: 150, crystal: 15 }, // Roots L4
  baseStructure: { stone: 60 },    // e.g., relay tower
};

/**
 * ECON — economic constants.
 */
export const ECON = {
  startingStone: 20,
  startingCrystal: 0,
  startingEssence: 0,
};
