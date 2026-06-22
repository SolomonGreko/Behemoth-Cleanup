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

import { RESOURCE, COST, ECON, ENEMY, WAVE, SWARM, SCALING, BASE, DAY_CYCLE, BOT, LEVEL, ENEMY_CRAWLER } from './config.js';
import {
  addResources,
  buildResourceHUD,
  canAfford,
  trySpend,
} from './resource.js';
import { tickTurrets, createWatcher } from './turrets.js';
import {
  createWall,
  canPlaceWall,
  damageWall,
  findBlockingWall,
  tickWalls,
  getWallCost,
  upgradeWall,
  getWallSummary,
} from './walls.js';
import { generateStoneZones } from './world.js';
import { assignStoneHarvest, tickStoneHarvest, tickStoneReturn } from './bots.js';
import { tickArtilleryEnemy, tickScoutAI, tickTankAura, checkCrawlerStack, tickBossAI, fireBossShockwave } from './enemies.js';

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

/** Find the highest level index whose kill threshold ≤ current kills. */
export function getBaseLevel(kills) {
  let level = 0;
  for (let i = LEVEL.THRESHOLDS.length - 1; i > 0; i--) {
    if (kills >= LEVEL.THRESHOLDS[i]) {
      level = i;
      break;
    }
  }
  return level;
}

/**
 * Apply damage to the base, absorbing through shield first.
 * Shield takes the hit before base HP. Records lastHitTick for regen cooldown.
 */
function _applyBaseDamage(sim, damage) {
  const shield = sim.shield;
  if (shield.hp > 0) {
    const absorbed = Math.min(shield.hp, damage);
    shield.hp -= absorbed;
    shield.lastHitTick = sim.tick;
    damage -= absorbed;
  }
  if (damage > 0) {
    sim.baseHp -= damage;
  }
}

function accumulateEssence(sim, isFrozen) {
  if (isFrozen) return;

  if (sim.resources.essence >= sim.resourceCaps.essence) {
    sim.essenceAccum = 0.0;
    return;
  }

  // Level-scaling: higher base levels get faster essence income.
  // BONUSES[0]=L1 (×1.0), BONUSES[1]=L2 (×1.4), BONUSES[2]=L3 (×1.9), BONUSES[3]=L4 (×2.5)
  const level = getBaseLevel(sim.kills);
  const essenceMul = LEVEL.BONUSES[level].essenceMul;
  sim.essenceAccum += RESOURCE.essence.perTick * essenceMul;

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
    RESOURCE[resourceType].capUpgradePerLevel[level];
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
    shield: { hp: 0, maxHp: 0, regen: 0.5, lastHitTick: 0 },
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
    soundEnabled: true,

    // Selection state — set by click-to-select on turrets
    selectedEntityId: null,

    // Scoped mutable state (prevents cross-instance corruption on hot-reload)
    _nextEnemyId: 1,
    _nextTurretId: 1,
    _nextWallId: 1,
    _nextBotId: 1,
    _abilityCooldowns: {},
  };

  initResourceState(sim);
  genWorld(sim);
  generateStoneZones(sim, Date.now(), Math.random);

  // Create starting bot(s) — placed after genWorld so stoneZones exist
  for (let i = 0; i < BOT.startingBots; i++) {
    sim.bots.push(createBot(sim));
  }

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

/**
 * Create a worker bot at the given position (or near base center if omitted).
 */
function createBot(sim, x, y) {
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

/** Tick the base: shield regen, level-up, radius scaling. */
function tickBase(sim) {
  const shield = sim.shield;

  // Shield regen: 0.5 HP/tick after 90-tick cooldown since last hit (1.5s at 60tps)
  if (shield.hp < shield.maxHp && sim.tick - shield.lastHitTick > 90) {
    shield.hp = Math.min(shield.hp + shield.regen, shield.maxHp);
  }

  // Level-up check
  const newLevel = getBaseLevel(sim.kills);
  if (newLevel > sim.baseLevel) {
    sim.baseLevel = newLevel;
    const bonus = LEVEL.BONUSES[newLevel];

    // Scale base max HP
    sim.baseMaxHp = Math.round(BASE.hp * bonus.hpMul);
    sim.baseHp = sim.baseMaxHp; // full heal on level-up

    // Scale shield
    shield.maxHp = LEVEL.SHIELD_HP[newLevel];
    shield.hp = shield.maxHp; // refill shield on level-up

    // Scale radius
    sim.baseRadius = BASE.radius * bonus.radiusMul;

    // Sound
    sim.sounds.push('base_upgrade');
  }
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
  tickWalls(sim);
  tickBots(sim);
  tickBase(sim);

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
  // Artillery appears wave 4+ per ENEMY config — early waves split
  // the artillery budget between scouts and tanks instead.
  const artyUnlocked = waveNum >= 4;
  const artyRatio = artyUnlocked ? (1.0 - scoutRatio - tankRatio) : 0;
  const spillover = 1.0 - scoutRatio - tankRatio - artyRatio; // >0 when arty locked

  let scouts = Math.floor(actualCount * (scoutRatio + spillover * 0.6));
  let tanks = Math.floor(actualCount * (tankRatio + spillover * 0.4));
  let arty = 0;

  if (artyUnlocked) {
    arty = Math.max(0, actualCount - scouts - tanks);
  } else {
    // When artillery is locked, absorb any rounding remainder into scouts
    // (the dominant enemy type in early waves) so no enemy is silently dropped.
    const remainder = actualCount - scouts - tanks;
    if (remainder > 0) {
      scouts += remainder;
    }
  }

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

  // Wave scaling factor: stat = base * (1 + SCALE * (wave - 1))
  const scaleFactor = wave - 1;

  const scaledHp = Math.min(
    config.hp * (1 + SCALING.HP_SCALE * scaleFactor),
    config.hp * SCALING.HP_CAP
  );
  const scaledSpeed = config.speed * (1 + SCALING.SPEED_SCALE * scaleFactor);
  const scaledDamage = config.damage * (1 + SCALING.DAMAGE_SCALE * scaleFactor);

  return {
    id: sim._nextEnemyId++,
    type,
    x: spawnPoint.x,
    y: spawnPoint.y,
    hp: scaledHp,
    maxHp: scaledHp,
    speed: scaledSpeed,
    damage: scaledDamage,
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

  // ═══════════════════════════════════════════════════════════════
  // FIRST PASS — build crawler stack counts per wall
  // ═══════════════════════════════════════════════════════════════
  const crawlerCounts = new Map();
  for (const enemy of sim.enemies) {
    if (
      enemy.alive &&
      enemy.type === 'crawler' &&
      enemy.state === 'sieging' &&
      enemy.siegeTargetId != null
    ) {
      crawlerCounts.set(
        enemy.siegeTargetId,
        (crawlerCounts.get(enemy.siegeTargetId) || 0) + 1
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FIRST PASS — tank taunt auras
  // ═══════════════════════════════════════════════════════════════
  for (const enemy of sim.enemies) {
    if (!enemy.alive) continue;
    if (enemy.type === 'tank') {
      tickTankAura(sim, enemy);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECOND PASS — enemy movement + type-specific AI
  // ═══════════════════════════════════════════════════════════════
  for (const enemy of sim.enemies) {
    if (!enemy.alive) continue;

    // ── Boss: enrage check ──────────────────────────────────
    if (enemy.type === 'boss') {
      tickBossAI(sim, enemy);
    }

    // ── Scout: gap detection + weakest-wall preference ──────
    if (enemy.type === 'scout') {
      tickScoutAI(sim, enemy);
    }

    // ── Artillery: ranged attack behavior ───────────────────
    if (enemy.type === 'artillery') {
      tickArtilleryEnemy(sim, enemy, damageWall, _applyBaseDamage);
      if (enemy.state === 'firing') continue;
    }

    if (enemy.state === 'moving') {
      // ── Scout flank waypoint steering ────────────────────
      if (enemy._flankWaypoint) {
        const wdx = enemy._flankWaypoint.x - enemy.x;
        const wdy = enemy._flankWaypoint.y - enemy.y;
        const wdist = Math.sqrt(wdx * wdx + wdy * wdy);
        if (wdist > 0.1) {
          const fstep = Math.min(enemy.speed, wdist);
          enemy.x += (wdx / wdist) * fstep;
          enemy.y += (wdy / wdist) * fstep;
          // Fall through to wall collision check after waypoint steer
        } else {
          // Reached waypoint — clear it
          enemy._flankWaypoint = null;
        }
      }

      // Check for wall collision before moving
      const blockingWall = findBlockingWall(sim, enemy);
      if (blockingWall) {
        // Crawler stack cap check
        if (enemy.type === 'crawler') {
          const count = crawlerCounts.get(blockingWall.id) || 0;
          if (checkCrawlerStack(sim, enemy, count)) {
            continue; // skip siege — keep moving
          }
        }

        // Boss shockwave on first wall contact
        if (enemy.type === 'boss') {
          fireBossShockwave(sim, enemy, damageWall);
        }

        enemy.state = 'sieging';
        enemy.siegeTargetId = blockingWall.id;
        continue;
      }

      const dx = baseCenter.x - enemy.x;
      const dy = baseCenter.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.75) {
        if (!sim.emergencyShield?.active) {
          _applyBaseDamage(sim, enemy.damage);
        }
        sim.kills++;
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

        // Crawler smooth jitter (lerp-based, replaces raw random teleport)
        if (enemy.type === 'crawler') {
          if (enemy._jitterX === undefined) {
            enemy._jitterX = 0;
            enemy._jitterY = 0;
          }
          const targetJitterX = (Math.random() - 0.5) * SWARM.jitter * 2;
          const targetJitterY = (Math.random() - 0.5) * SWARM.jitter * 2;
          const smooth = ENEMY_CRAWLER.jitterSmoothness;
          enemy._jitterX += (targetJitterX - enemy._jitterX) * smooth;
          enemy._jitterY += (targetJitterY - enemy._jitterY) * smooth;
          enemy.x += enemy._jitterX;
          enemy.y += enemy._jitterY;
        }

        // Check wall collision after movement
        const wall = findBlockingWall(sim, enemy);
        if (wall) {
          // Crawler stack cap check
          if (enemy.type === 'crawler') {
            const count = crawlerCounts.get(wall.id) || 0;
            if (checkCrawlerStack(sim, enemy, count)) {
              continue; // skip siege — keep moving
            }
          }

          // Boss shockwave on first wall contact
          if (enemy.type === 'boss') {
            fireBossShockwave(sim, enemy, damageWall);
          }

          enemy.state = 'sieging';
          enemy.siegeTargetId = wall.id;
        }
      }
    }

    if (enemy.state === 'sieging') {
      const wall = sim.walls.find((w) => w.id === enemy.siegeTargetId && w.alive);
      if (!wall) {
        // Wall destroyed — resume moving
        enemy.state = 'moving';
        enemy.siegeTargetId = null;
        continue;
      }

      // Attack the wall
      const result = damageWall(sim, wall, enemy.damage);
      if (result.destroyed) {
        enemy.state = 'moving';
        enemy.siegeTargetId = null;
      }
    }
  }

  sim.enemies = sim.enemies.filter((e) => e.alive);
}

// ═══════════════════════════════════════════════════════════════════════
// BOT MOVEMENT AND HARVESTING
// ═══════════════════════════════════════════════════════════════════════

function tickBots(sim) {
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
    }
  }
}

function moveBotToward(bot, tx, ty) {
  if (tx == null || ty == null) return;
  const dx = tx - bot.x;
  const dy = ty - bot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.1) return;
  const step = Math.min(bot.speed, dist);
  bot.x += (dx / dist) * step;
  bot.y += (dy / dist) * step;
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

/**
 * Summarise bot activity by state for the HUD's BotLabourHUD component.
 *
 * Maps internal bot states to the display keys the HUD expects:
 *   harvesting — HARVEST_STONE + DEPOSIT_STONE
 *   returning  — RETURN_STONE
 *   repairing  — (reserved for future wall-repair bots)
 *   building   — (reserved for future construction bots)
 *   tilling    — (reserved for future garden bots)
 *   idle       — IDLE + any unrecognised state
 *
 * @param {object} sim — sim state
 * @returns {{ harvesting: number, returning: number, repairing: number, building: number, tilling: number, idle: number }}
 */
export function getLabourSummary(sim) {
  const summary = {
    harvesting: 0,
    returning: 0,
    repairing: 0,
    building: 0,
    tilling: 0,
    idle: 0,
  };

  for (const bot of sim.bots) {
    switch (bot.state) {
      case 'HARVEST_STONE':
      case 'DEPOSIT_STONE':
        summary.harvesting++;
        break;
      case 'RETURN_STONE':
        summary.returning++;
        break;
      case 'IDLE':
        summary.idle++;
        break;
      default:
        summary.idle++;
    }
  }

  return summary;
}

function buildHUD(sim) {
  const phaseDuration = DAY_CYCLE.phaseDurations[sim.dayPhase] ?? 1;

  return {
    tick: sim.tick,
    wave: sim.wave,
    waveState: sim.waveState,
    baseHp: sim.baseHp,
    baseMaxHp: sim.baseMaxHp,
    baseLevel: sim.baseLevel,
    baseShield: { hp: sim.shield.hp, maxHp: sim.shield.maxHp },
    kills: sim.kills,
    enemyCount: sim.enemies.length,
    botCount: sim.bots.length,
    turretCount: sim.turrets.length,
    wallCount: sim.walls.filter((w) => w.alive).length,
    walls: getWallSummary(sim),
    dayPhase: sim.dayPhase,
    phaseTick: sim.dayTimer,
    phaseDuration,
    phaseBlend: sim.dayTransition,
    botLabour: getLabourSummary(sim),
    gameOver: sim.gameOver,
    soundEnabled: sim.soundEnabled,
    resources: sim.resourceHUD?.resources || null,
    selectedEntityId: sim.selectedEntityId,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

export function getStats(sim) {
  return buildHUD(sim);
}

export function toggleSound(sim) {
  sim.soundEnabled = !sim.soundEnabled;
}

export function setSoundEnabled(sim, value) {
  sim.soundEnabled = Boolean(value);
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
  if (sim.bots.length >= BOT.maxBots) {
    return { success: false, reason: 'Max bots reached' };
  }
  const cost = COST.buyBot;
  const result = trySpend(sim, cost);
  if (!result.success) return result;

  const bot = createBot(sim);
  sim.bots.push(bot);
  sim.sounds.push('build');

  sim.debugLog.push({
    msg: `Bot #${bot.id} built (${sim.bots.length}/${BOT.maxBots})`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }

  return { success: true, botId: bot.id };
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

export function buyWall(sim, x, y) {
  // Validate placement
  const check = canPlaceWall(sim, x, y);
  if (!check.valid) return { success: false, reason: check.reason };

  // L1 walls are free; higher levels require payment later via upgrade
  const cost = getWallCost(0); // Start with L1 (free)
  const result = trySpend(sim, cost);
  if (!result.success) return result;

  // Create the wall
  const wall = createWall(sim, x, y, 0);
  sim.sounds.push('build');

  sim.debugLog.push({
    msg: `Wall #${wall.id} (${wall.label}) placed at (${x}, ${y})`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }

  return { success: true, wallId: wall.id };
}

export function buyWallUpgrade(sim, wallId) {
  const wall = sim.walls.find((w) => w.id === wallId);
  if (!wall || !wall.alive) {
    return { success: false, reason: 'Wall not found' };
  }

  if (wall.level >= 3) {
    return { success: false, reason: 'Wall already at max level' };
  }

  const nextLevel = wall.level + 1;
  const cost = getWallCost(nextLevel);
  const result = trySpend(sim, cost);
  if (!result.success) return result;

  upgradeWall(wall);
  sim.sounds.push('build');

  sim.debugLog.push({
    msg: `Wall #${wall.id} upgraded to ${wall.label}`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }

  return { success: true, wallId: wall.id };
}

// ═══════════════════════════════════════════════════════════════════════
// SELECTION — click-to-select for turret inspect panel
// ═══════════════════════════════════════════════════════════════════════

/**
 * Set the selected entity (turret) for the inspect panel.
 *
 * @param {object} sim
 * @param {number} turretId — the turret to select
 * @returns {object|null} the selected turret, or null if not found
 */
export function selectTurret(sim, turretId) {
  const turret = sim.turrets.find((t) => t.id === turretId && t.alive);
  if (!turret) return null;

  sim.selectedEntityId = turretId;
  return turret;
}

/**
 * Clear the current selection.
 *
 * @param {object} sim
 */
export function deselectTurret(sim) {
  sim.selectedEntityId = null;
}
