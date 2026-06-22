/**
 * engine.js — Main game sim loop for Behemoth.
 *
 * Orchestrates the full tick cycle:
 *   1. Resource accumulation and HUD build
 *   2. Wave management (cooldown → spawning → active → cooldown)
 *   3. Enemy movement and base damage
 *   4. Shield expiration
 *   5. Game-over detection
 *
 * Wave composition follows Athena's swarm-enemy-wave-design.md:
 *   - Normal waves: mixed scouts/tanks/artillery, ratios shift over time
 *   - Swarm waves (every 3, skip multiples of 5): 3× crawlers, 2.5× spawn rate
 *   - Boss waves (every 5): single boss with high HP
 *   - Boss+swarm (every 15): boss + 40% crawler swarm
 *
 * @module engine
 */

import { RESOURCE, COST, ECON, ENEMY, WAVE, SWARM, BASE, DAY_CYCLE } from './config.js';
import {
  addResources,
  buildResourceHUD,
  canAfford,
  trySpend,
} from './resource.js';
import { tickTurrets, createWatcher } from './turrets.js';

// ═══════════════════════════════════════════════════════════════════════
// RESOURCE STATE
// ═══════════════════════════════════════════════════════════════════════

export function initResourceState(sim) {
  sim.resources = {
    stone: ECON.startingStone,
    crystal: ECON.startingCrystal,
    essence: ECON.startingEssence,
  };

  sim.resourceCaps = {
    stone: RESOURCE.stone.cap,
    crystal: RESOURCE.crystal.cap,
    essence: RESOURCE.essence.cap,
  };

  sim.essenceAccum = 0.0;
  sim.resourceHistory = [];
  sim.purchasableItems = [];
  sim._lastResourceTick = -1;
}

export function resetResources(sim) {
  initResourceState(sim);
}

export function resourceTick(sim, options = {}) {
  if (sim._lastResourceTick === sim.tick) return sim.resourceHUD;
  sim._lastResourceTick = sim.tick;

  const { isFrozen = false } = options;

  accumulateEssence(sim, isFrozen);

  if (sim.tick % 60 === 0) {
    sim.resourceHistory.push({
      tick: sim.tick,
      stone: sim.resources.stone,
      crystal: sim.resources.crystal,
      essence: sim.resources.essence,
    });

    if (sim.resourceHistory.length > 60) {
      sim.resourceHistory = sim.resourceHistory.slice(-60);
    }
  }

  sim.resourceHUD = buildResourceHUD(sim);
  return sim.resourceHUD;
}

function accumulateEssence(sim, isFrozen) {
  if (isFrozen) return;

  if (sim.resources.essence >= sim.resourceCaps.essence) {
    sim.essenceAccum = 0.0;
    return;
  }

  sim.essenceAccum += RESOURCE.essence.perTick;

  const whole = Math.floor(sim.essenceAccum);
  if (whole > sim.resources.essence) {
    const add = whole - sim.resources.essence;
    addResources(sim, { essence: add });
    if (sim.resources.essence >= sim.resourceCaps.essence) {
      sim.essenceAccum = 0.0;
    }
  }
}

export function applyStorageUpgrade(sim, resourceType, level) {
  const VALID_TYPES = ['stone', 'crystal', 'essence'];
  if (!VALID_TYPES.includes(resourceType)) return;
  if (!Number.isInteger(level) || level < 0 || level > 3) return;

  const upgrades = RESOURCE.storageUpgrades[resourceType];
  if (!upgrades || !upgrades[level]) return;

  sim.resourceCaps[resourceType] =
    (resourceType === 'stone' ? RESOURCE.stone.cap :
     resourceType === 'crystal' ? RESOURCE.crystal.cap :
     RESOURCE.essence.cap) +
    RESOURCE[resourceType].capUpgradePerLevel * level;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN GAME ENGINE
// ═══════════════════════════════════════════════════════════════════════

export function createSim(options = {}) {
  const { worldWidth = 50, worldHeight = 50 } = options;
  const baseX = Math.floor(worldWidth / 2);
  const baseY = Math.floor(worldHeight / 2);

  const sim = {
    tick: 0,
    dayPhase: DAY_CYCLE.startingPhase,
    dayTimer: 0,

    wave: 0,
    waveState: 'cooldown',
    waveSpawnTimer: 0,
    waveCooldownTimer: WAVE.cooldownTicks,
    waveEnemiesToSpawn: 0,
    waveEnemiesSpawned: 0,
    waveEnemiesRemaining: 0,
    waveComposition: [],
    swarmActive: false,

    baseHp: BASE.startingHp,
    baseMaxHp: BASE.hp,
    baseLevel: 0,
    baseShieldHp: 0,
    baseMaxShield: 0,
    baseRadius: BASE.radius,
    kills: 0,

    world: { width: worldWidth, height: worldHeight, grid: [] },
    baseCenter: { x: baseX, y: baseY },

    enemies: [],
    bots: [],
    turrets: [],
    walls: [],
    stoneZones: [],

    spawnPoints: [
      { x: 0, y: baseY },
      { x: worldWidth - 1, y: baseY },
      { x: baseX, y: 0 },
      { x: baseX, y: worldHeight - 1 },
    ],

    debugLog: [],
    sounds: [],

    finalDefense: null,
    emergencyShield: null,

    effGunRange: 6,
    effMortarCd: 60,
    effBuildFactor: 1.0,
    effRootSpeed: 1.0,

    gameOver: false,

    // Scoped mutable state (prevents cross-instance corruption on hot-reload)
    _nextEnemyId: 1,
    _nextTurretId: 1,
    _abilityCooldowns: {},
  };

  initResourceState(sim);
  genWorld(sim);

  sim.purchasableItems = [
    { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
    { id: 'buyWatcher', label: 'Buy Watcher', cost: COST.buyWatcher },
  ];

  return sim;
}

// ═══════════════════════════════════════════════════════════════════════
// WORLD GENERATION
// ═══════════════════════════════════════════════════════════════════════

function genWorld(sim) {
  const { world, baseCenter } = sim;
  const grid = [];

  for (let y = 0; y < world.height; y++) {
    const row = [];
    for (let x = 0; x < world.width; x++) {
      const dx = x - baseCenter.x;
      const dy = y - baseCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      row.push({
        type: 'ground',
        x, y,
        harvestable: null,
        built: null,
        tillProgress: 0,
        grass: dist <= 3,
        moss: dist > 3 && dist <= 8,
      });
    }
    grid.push(row);
  }

  world.grid = grid;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN TICK
// ═══════════════════════════════════════════════════════════════════════

export function stepTick(sim, options = {}) {
  sim.tick++;

  tickDayCycle(sim);

  const isFrozen = sim.finalDefense?.phase === 'firing';

  resourceTick(sim, { isFrozen });
  tickWaves(sim);
  tickEnemies(sim);
  tickTurrets(sim);

  if (sim.emergencyShield?.active && sim.tick >= sim.emergencyShield.expiresAt) {
    sim.emergencyShield.active = false;
  }

  sim.hud = buildHUD(sim);

  if (sim.baseHp <= 0) {
    sim.baseHp = 0;
    sim.gameOver = true;
  }
}

function tickWaves(sim) {
  // Night-only gate: waves only start during night phase.
  // Cooldown still counts down during day (prep time is always ticking).
  const nightOnly = WAVE.nightOnly !== false;

  switch (sim.waveState) {
    case 'cooldown':
      sim.waveCooldownTimer--;
      if (sim.waveCooldownTimer <= 0 && (!nightOnly || sim.dayPhase === 'night')) {
        startNextWave(sim);
      }
      break;

    case 'spawning':
      sim.waveSpawnTimer--;
      if (sim.waveSpawnTimer <= 0) {
        spawnNextEnemy(sim);
        const interval = sim.swarmActive
          ? Math.max(1, Math.floor(WAVE.spawnIntervalTicks * SWARM.spawnIntervalFactor))
          : WAVE.spawnIntervalTicks;
        sim.waveSpawnTimer = interval;
      }

      if (sim.waveEnemiesSpawned >= sim.waveEnemiesToSpawn) {
        sim.waveState = 'active';
      }
      break;

    case 'active':
      if (sim.waveEnemiesRemaining <= 0) {
        sim.waveState = 'cooldown';
        sim.waveCooldownTimer = WAVE.cooldownTicks;
        sim.swarmActive = false;
      }
      break;
  }
}

function startNextWave(sim) {
  sim.wave++;
  sim.waveState = 'spawning';
  sim.waveSpawnTimer = WAVE.startDelayTicks;
  sim.waveEnemiesSpawned = 0;

  const composition = getWaveComposition(sim.wave);
  sim.waveComposition = composition;
  sim.waveEnemiesToSpawn = composition.reduce((sum, g) => sum + g.count, 0);
  sim.waveEnemiesRemaining = sim.waveEnemiesToSpawn;
  sim.swarmActive = isSwarmWave(sim.wave);

  sim.debugLog.push({
    msg: `WAVE ${sim.wave} — ${sim.waveEnemiesToSpawn} enemies${sim.swarmActive ? ' (SWARM!)' : ''}`,
    tick: sim.tick,
  });

  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }
}

function getWaveComposition(waveNum) {
  const groups = [];
  const bossWave = waveNum % WAVE.bossInterval === 0;
  const swarmWave = isSwarmWave(waveNum);
  const bossAndSwarm = waveNum % (WAVE.bossInterval * SWARM.interval) === 0;

  if (bossWave && !bossAndSwarm) {
    groups.push({ type: 'boss', count: 1 });
    return groups;
  }

  if (swarmWave) {
    groups.push({ type: 'crawler', count: getSwarmCount(waveNum) });
    return groups;
  }

  if (bossAndSwarm) {
    groups.push({ type: 'boss', count: 1 });
    groups.push({ type: 'crawler', count: Math.max(1, Math.floor(getSwarmCount(waveNum) * SWARM.bossAddFraction)) });
    return groups;
  }

  const baseCount = WAVE.baseSpawnCount + (waveNum - 1) * WAVE.spawnCountGrowth;
  const actualCount = Math.min(baseCount, 40);

  const waveTier = Math.floor(waveNum / 5);
  const scoutRatio = Math.max(0.2, 0.6 - waveTier * 0.1);
  const tankRatio = Math.min(0.5, 0.2 + waveTier * 0.05);
  const artyRatio = 1.0 - scoutRatio - tankRatio;

  const scouts = Math.floor(actualCount * scoutRatio);
  const tanks = Math.floor(actualCount * tankRatio);
  const arty = actualCount - scouts - tanks;

  if (scouts > 0) groups.push({ type: 'scout', count: scouts });
  if (tanks > 0) groups.push({ type: 'tank', count: tanks });
  if (arty > 0) groups.push({ type: 'artillery', count: arty });

  return groups;
}

function isSwarmWave(waveNum) {
  return waveNum % SWARM.interval === 0 && waveNum % WAVE.bossInterval !== 0;
}

function getSwarmCount(waveNum) {
  const baseCount = WAVE.baseSpawnCount + (waveNum - 1) * WAVE.spawnCountGrowth;
  const raw = Math.floor(
    baseCount *
    SWARM.countMultiplier *
    (1 + SWARM.countGrowth * Math.floor(waveNum / SWARM.interval))
  );
  return Math.min(raw, SWARM.cap);
}

// ═══════════════════════════════════════════════════════════════════════
// ENEMY SPAWNING
// ═══════════════════════════════════════════════════════════════════════

function spawnNextEnemy(sim) {
  const comp = sim.waveComposition;

  for (const group of comp) {
    if (group.spawned == null) group.spawned = 0;
    if (group.spawned < group.count) {
      if (group.type === 'crawler') {
        const liveCrawlers = sim.enemies.filter(
          (e) => e.alive && e.type === 'crawler'
        ).length;
        if (liveCrawlers >= SWARM.cap) {
          return;
        }
      }

      const spawnPoint = sim.spawnPoints[
        Math.floor(Math.random() * sim.spawnPoints.length)
      ];
      const enemy = createEnemy(sim, group.type, spawnPoint, sim.wave);
      if (enemy) {
        sim.enemies.push(enemy);
        group.spawned++;
        sim.waveEnemiesSpawned++;
      }
      return;
    }
  }

  sim.waveState = 'active';
}

function createEnemy(sim, type, spawnPoint, wave) {
  const config = ENEMY[type];
  if (!config) return null;

  return {
    id: sim._nextEnemyId++,
    type,
    x: spawnPoint.x,
    y: spawnPoint.y,
    hp: config.hp,
    maxHp: config.hp,
    speed: config.speed,
    damage: config.damage,
    size: config.size,
    alive: true,
    wave,
    state: 'moving',
    targetX: null,
    targetY: null,
    path: [],
    pathIndex: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ENEMY MOVEMENT
// ═══════════════════════════════════════════════════════════════════════

function tickEnemies(sim) {
  const { baseCenter } = sim;

  for (const enemy of sim.enemies) {
    if (!enemy.alive) continue;

    if (enemy.state === 'moving') {
      const dx = baseCenter.x - enemy.x;
      const dy = baseCenter.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.75) {
        if (!sim.emergencyShield?.active) {
          sim.baseHp -= enemy.damage;
        }
        enemy.alive = false;
        sim.waveEnemiesRemaining--;

        sim.debugLog.push({
          msg: `${enemy.type} hit base (${enemy.damage} dmg, HP: ${Math.max(0, sim.baseHp)})`,
          tick: sim.tick,
        });
        if (sim.debugLog.length > 50) {
          sim.debugLog = sim.debugLog.slice(-50);
        }
      } else {
        const step = enemy.speed;
        enemy.x += (dx / dist) * step;
        enemy.y += (dy / dist) * step;

        if (enemy.type === 'crawler') {
          enemy.x += (Math.random() - 0.5) * SWARM.jitter * 2;
          enemy.y += (Math.random() - 0.5) * SWARM.jitter * 2;
        }
      }
    }
  }

  sim.enemies = sim.enemies.filter((e) => e.alive);
}

// ═══════════════════════════════════════════════════════════════════════
// DAY / NIGHT CYCLE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Advance the day/night phase cycle.
 *
 * Phases rotate through DAY_CYCLE.phaseOrder. Each phase lasts for
 * its configured duration (in ticks). Transitions include a smooth
 * blend period (transitionTicks) that the renderer uses for visual
 * interpolation.
 *
 * Called once per tick at the top of stepTick(), before wave logic
 * (wave spawning is gated on night phase via WAVE.nightOnly).
 *
 * @param {object} sim — sim state
 */
function tickDayCycle(sim) {
  const { phaseOrder, phaseDurations, transitionTicks } = DAY_CYCLE;

  sim.dayTimer++;

  const currentIdx = phaseOrder.indexOf(sim.dayPhase);
  if (currentIdx === -1) {
    // Safety: reset to starting phase
    sim.dayPhase = phaseOrder[0];
    sim.dayTimer = 0;
    return;
  }

  const currentDuration = phaseDurations[sim.dayPhase];
  if (currentDuration == null) return;

  // Check for phase transition
  if (sim.dayTimer >= currentDuration) {
    const nextIdx = (currentIdx + 1) % phaseOrder.length;
    sim.dayPhase = phaseOrder[nextIdx];
    sim.dayTimer = 0;

    sim.debugLog.push({
      msg: `DAY CYCLE → ${sim.dayPhase}`,
      tick: sim.tick,
    });
    if (sim.debugLog.length > 50) {
      sim.debugLog = sim.debugLog.slice(-50);
    }
  }

  // Compute transition progress for renderer (0 = start of phase, 1 = at transition point)
  sim.dayTransition =
    sim.dayTimer < transitionTicks
      ? sim.dayTimer / transitionTicks
      : currentDuration - sim.dayTimer < transitionTicks
        ? (currentDuration - sim.dayTimer) / transitionTicks
        : 1.0;
}

// ═══════════════════════════════════════════════════════════════════════
// HUD SNAPSHOT
// ═══════════════════════════════════════════════════════════════════════

function buildHUD(sim) {
  return {
    tick: sim.tick,
    wave: sim.wave,
    waveState: sim.waveState,
    baseHp: sim.baseHp,
    baseMaxHp: sim.baseMaxHp,
    baseLevel: sim.baseLevel,
    kills: sim.kills,
    enemyCount: sim.enemies.length,
    botCount: sim.bots.length,
    turretCount: sim.turrets.length,
    dayPhase: sim.dayPhase,
    gameOver: sim.gameOver,
    resources: sim.resourceHUD?.resources || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

export function getStats(sim) {
  return buildHUD(sim);
}

export function getWavePreview(sim) {
  // During active wave or spawning: return current wave info
  if (sim.waveState === 'spawning' || sim.waveState === 'active') {
    return {
      wave: sim.wave,
      enemies: sim.waveComposition.map((g) => ({ type: g.type, count: g.count })),
      active: true,
    };
  }

  // Between waves (cooldown): preview next wave
  const nextWave = sim.wave + 1;
  const comp = getWaveComposition(nextWave);

  return {
    wave: nextWave,
    enemies: comp.map((g) => ({ type: g.type, count: g.count })),
    active: false,
  };
}

export function buyBot(sim) {
  const cost = COST.buyBot;
  const result = trySpend(sim, cost);
  if (!result.success) return result;
  return { success: true };
}

export function buyWatcher(sim) {
  const cost = COST.buyWatcher;
  const result = trySpend(sim, cost);
  if (!result.success) return result;

  // Spawn watcher at base center
  const watcher = createWatcher(sim, sim.baseCenter.x, sim.baseCenter.y);
  sim.sounds.push('build');

  sim.debugLog.push({
    msg: `Watcher #${watcher.id} built at (${watcher.x.toFixed(1)}, ${watcher.y.toFixed(1)})`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }

  return { success: true, turretId: watcher.id };
}
