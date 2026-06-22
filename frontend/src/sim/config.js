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

// ═══════════════════════════════════════════════════════════════════════
// GAME ENTITY CONFIG
// ═══════════════════════════════════════════════════════════════════════

/**
 * ENEMY — enemy type intrinsics.
 *
 * Each enemy type has HP, speed (cells per tick), damage (HP to base on
 * contact), size (cell radius for rendering), and a type string for drop
 * tables. Crawler is the swarm unit — low HP, high speed, low damage.
 *
 * Default values produce day-one gameplay:
 *   Scouts: common, fast, moderate HP. Wave 1 bread-and-butter.
 *   Tanks: slow, tough, hard-hitting. Appear wave 2+.
 *   Artillery: ranged, dangerous, must prioritize. Appear wave 4+.
 *   Crawlers: swarm. Wave 3, 6, 9... 3× count, 2.5× spawn rate.
 *   Boss: every 5 waves. Massive HP payout.
 */
export const ENEMY = {
  scout:     { hp: 8,  speed: 0.02, damage: 2,  size: 0.8, type: 'scout' },
  tank:      { hp: 20, speed: 0.01, damage: 5,  size: 1.2, type: 'tank' },
  artillery: { hp: 12, speed: 0.008, damage: 8, size: 1.0, type: 'artillery' },
  crawler:   { hp: 3,  speed: 0.024, damage: 0.6, size: 0.4, type: 'crawler' },
  boss:      { hp: 80, speed: 0.008, damage: 20, size: 2.0, type: 'boss' },
};

/**
 * WAVE — wave timing and spawn rules.
 *
 * Controls the cadence of enemy waves. spawnIntervalTicks is the delay
 * between individual enemy spawns during a wave. baseSpawnCount is the
 * starting count for wave 1; it grows by spawnCountGrowth per wave.
 * bossInterval determines boss wave frequency (every 5 waves).
 *
 * Ticks are ~60/s at 60fps game loop.
 */
export const WAVE = {
  spawnIntervalTicks: 60,       // ticks between enemy spawns (1s at 60fps)
  startDelayTicks: 180,         // delay before first enemy spawns (3s prep time)
  cooldownTicks: 600,           // ticks between waves (10s rest)
  nightOnly: true,              // waves only spawn during night phase

  baseSpawnCount: 5,            // base count for wave 1
  spawnCountGrowth: 1,          // +1 enemy per wave number

  bossInterval: 5,              // boss every 5 waves
};

/**
 * SWARM — swarm wave tuning.
 *
 * Swarm waves occur every 3 waves (skipping multiples of 5 which are boss
 * waves). Crawlers spawn at 3× normal count and 2.5× the spawn rate.
 * Boss+swarm coincidence (every 15 waves) reduces crawler count to 40%.
 * Hard cap of 80 simultaneous crawlers prevents performance degradation.
 */
export const SWARM = {
  interval: 3,                  // swarm wave every 3 waves
  countMultiplier: 3.0,         // 3× normal enemy count
  countGrowth: 0.15,            // per-wave-tier growth factor
  spawnIntervalFactor: 0.4,     // fraction of normal spawn interval (2.5× faster)
  bossAddFraction: 0.4,         // swarm+boss coincidence: spawn this fraction
  cap: 80,                      // max simultaneous crawlers on screen
  crawlerBounty: 1,             // bonus Stone per crawler kill
  jitter: 0.3,                  // per-tick random offset magnitude (cells)
};

/**
 * LEVEL — base level-up thresholds, bonuses, and visual settings.
 *
 * Thresholds are cumulative kill counts validated against wave-20 kill budget
 * (max 191 kills across 20 waves). 4 levels: L1=default, L2=25 kills,
 * L3=75 kills, L4=140 kills.
 */
export const LEVEL = {
  THRESHOLDS: [0, 25, 75, 140],  // cumulative kills to reach each level

  BONUSES: [
    { hpMul: 1.0, steelMul: 1.0, radiusMul: 1.0 },   // L1 — base stats
    { hpMul: 1.25, steelMul: 1.4, radiusMul: 1.2 },   // L2 — 25 kills
    { hpMul: 1.6, steelMul: 1.9, radiusMul: 1.4 },     // L3 — 75 kills
    { hpMul: 2.0, steelMul: 2.5, radiusMul: 1.6 },     // L4 — 140 kills
  ],

  SHIELD_HP: [0, 15, 30, 50],      // shield maxHP per level (L1–L4)

  VISUAL: [
    { glowColor: '#22c55e', glowIntensity: 0.3, label: 'Level 1', labelColor: '#86efac' },
    { glowColor: '#06b6d4', glowIntensity: 0.55, label: 'Level 2', labelColor: '#67e8f9' },
    { glowColor: '#f59e0b', glowIntensity: 0.8, label: 'Level 3', labelColor: '#fde68a' },
    { glowColor: '#ef4444', glowIntensity: 1.0, label: 'Level 4', labelColor: '#fca5a5' },
  ],
};

/**
 * TURRET — turret/watcher constants.
 *
 * Watchers are the basic defensive turret — laser only, short range,
 * reasonable cooldown. Advanced turrets upgrade from watchers with
 * better stats. Mortar is an add-on for advanced turrets (AoE splash).
 *
 * MountBonus applies when a turret is placed on a wall segment.
 *
 * Targeting: nearest enemy to base center within range (per sim-arch spec).
 * Fire modes: laser (single-target instant), mortar (AoE at target position).
 *
 * Default values reproduce day-one balance from Athena's spec:
 *   watcher range 4.0, laser damage 20 @ 28-tick cooldown
 *   turret range 4.5, laser damage 28 @ 24-tick cooldown
 *   mortar damage 50 @ 150-tick cooldown, splash 2.0 radius
 */
export const TURRET = {
  watcher: { hp: 40, range: 4.0, laserDamage: 20, laserCd: 28 },
  turret: { hp: 60, range: 4.5, laserDamage: 28, laserCd: 24 },
  mortar: { damage: 50, cd: 150, splashRadius: 2.0 },
  mountBonus: { hpMul: 1.3, rangeMul: 1.15 },
};

/**
 * WALL — wall segment constants.
 *
 * Walls are buildable defensive barriers placed between the base and
 * enemy spawn points. Each wall segment has HP and blocks enemy
 * movement — enemies must destroy or bypass walls to reach the base.
 *
 * Four upgrade levels:
 *   L1 — basic barricade (starter wall)
 *   L2 — reinforced wall
 *   L3 — root-reinforced (requires Crystal)
 *   L4 — deep-root bastion (requires Crystal)
 *
 * Upgrades are initiated by player spend (COST entries), then a bot
 * travels to the wall segment and completes the build over buildTicks.
 *
 * Repair: bots in REPAIR state restore wall HP at repairRate per tick
 * when within repairRange of a damaged wall segment.
 */
export const WALL = {
  levels: [
    { hp: 30, buildTicks: 180, radius: 0.8, label: 'Barricade' },     // L1
    { hp: 60, buildTicks: 300, radius: 0.9, label: 'Reinforced' },     // L2
    { hp: 120, buildTicks: 480, radius: 1.0, label: 'Root-Bound' },    // L3
    { hp: 200, buildTicks: 720, radius: 1.1, label: 'Deep-Root' },     // L4
  ],
  repairRate: 0.5,          // HP restored per tick by a repairing bot
  repairRange: 1.5,         // cells — bot must be this close to repair
  placementMinDistance: 3,  // cells from base center — walls start here
  placementMaxDistance: 15, // cells from base center — walls end here
  maxSegments: 20,          // hard cap on wall segments
};

/**
 * BASE — base entity constants.
 *
 * The Behemoth base has HP, starting HP, and a cell radius for
 * collision and rendering. Level-up mechanics (shield HP, bonuses)
 * are governed by the LEVEL config above.
 */
export const BASE = {
  hp: 120,          // maximum base HP
  startingHp: 120,  // HP at game start
  radius: 1.5,      // base radius in cells
};

/**
 * DAY_CYCLE — day/night phase cycle configuration.
 *
 * Phases rotate: dawn → day → dusk → night → dawn...
 * Each phase has a tick duration (60 ticks/second at 60fps).
 * The phaseOrder list drives rotation; durations control pacing.
 *
 * Wave spawning is gated on night phase (WAVE.nightOnly: true),
 * so night duration = combat window, day/night split = risk/reward.
 *
 * Color palette used by PhaseIndicator in the HUD:
 *   - dawn:  warm amber → sky blue transition
 *   - day:   bright sky blue
 *   - dusk:  warm orange → deep indigo transition
 *   - night: deep indigo
 *
 * Athena owns balance tuning of phaseDurations.
 * Aphrodite owns the color palette.
 */
export const DAY_CYCLE = {
  /** Tick durations per phase (total cycle ~240s at 60fps). */
  phaseDurations: {
    dawn: 1200,   // 20s — short sunrise warning
    day: 7200,    // 120s — long safe building period
    dusk: 1200,   // 20s — short sunset warning
    night: 6000,  // 100s — combat window
  },

  /** Phase rotation order. First phase on game start. */
  phaseOrder: ['dawn', 'day', 'dusk', 'night'],

  /** Starting phase (first phase of the game). */
  startingPhase: 'night',

  /** Number of ticks for transition blend between phases. */
  transitionTicks: 300, // 5s smooth blend

  // ── Color Palette (Aphrodite) ─────────────────────────────────────
  colors: {
    dawn:  '#F4A460',  // warm amber/sandy-brown
    day:   '#87CEEB',  // bright sky blue
    dusk:  '#FF8C00',  // dark orange
    night: '#191970',  // deep midnight blue / indigo
  },

  /** Gradient endpoints for the progress bar. */
  gradient: {
    start: '#87CEEB',  // sky (day end)
    end:   '#191970',  // midnight (night end)
  },
};
