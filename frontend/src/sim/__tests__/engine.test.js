/**
 * engine.test.js — Tests for the main game engine loop.
 *
 * Covers: createSim, stepTick, wave composition, swarm logic,
 * enemy spawning, base damage, game-over detection.
 *
 * Uses small worlds (10×10) for fast wave cycling.
 */

import {
  createSim,
  stepTick,
  getStats,
  getWavePreview,
} from '../engine.js';
import { BASE, WAVE, SWARM, DAY_CYCLE, BOT, ARTILLERY, WALL } from '../config.js';
import { findArtilleryTarget, tickArtilleryEnemy } from '../enemies.js';
import { damageWall } from '../walls.js';

// ═══════════════════════════════════════════════════════════════════════
// createSim
// ═══════════════════════════════════════════════════════════════════════

describe('engine — createSim', () => {
  it('creates a sim with default world dimensions', () => {
    const sim = createSim();
    expect(sim.world.width).toBe(50);
    expect(sim.world.height).toBe(50);
  });

  it('creates a sim with custom world dimensions', () => {
    const sim = createSim({ worldWidth: 30, worldHeight: 40 });
    expect(sim.world.width).toBe(30);
    expect(sim.world.height).toBe(40);
  });

  it('initializes tick to 0', () => {
    const sim = createSim();
    expect(sim.tick).toBe(0);
  });

  it('initializes wave state to cooldown', () => {
    const sim = createSim();
    expect(sim.wave).toBe(0);
    expect(sim.waveState).toBe('cooldown');
    expect(sim.waveCooldownTimer).toBe(WAVE.cooldownTicks);
  });

  it('initializes base HP, level, and shield', () => {
    const sim = createSim();
    expect(sim.baseHp).toBe(BASE.startingHp);
    expect(sim.baseMaxHp).toBe(BASE.hp);
    expect(sim.baseLevel).toBe(0);
    expect(sim.shield.hp).toBe(0);
    expect(sim.shield.maxHp).toBe(0);
  });

  it('initializes base center at world midpoint', () => {
    const sim = createSim();
    expect(sim.baseCenter.x).toBe(25);
    expect(sim.baseCenter.y).toBe(25);
  });

  it('creates 4 spawn points at cardinal edges', () => {
    const sim = createSim();
    expect(sim.spawnPoints).toHaveLength(4);
    expect(sim.spawnPoints[0]).toEqual({ x: 0, y: 25 });
    expect(sim.spawnPoints[1]).toEqual({ x: 49, y: 25 });
    expect(sim.spawnPoints[2]).toEqual({ x: 25, y: 0 });
    expect(sim.spawnPoints[3]).toEqual({ x: 25, y: 49 });
  });

  it('initializes entity arrays with starting state', () => {
    const sim = createSim();
    expect(sim.enemies).toEqual([]);
    expect(sim.bots.length).toBe(BOT.startingBots);   // one free bot at start
    expect(sim.bots[0]).toMatchObject({ state: 'IDLE', carryingStone: 0 });
    expect(sim.turrets).toEqual([]);
    expect(sim.walls).toEqual([]);
    expect(sim.stoneZones.length).toBeGreaterThan(0);  // stone zones generated
  });

  it('initializes resources from ECON', () => {
    const sim = createSim();
    expect(sim.resources.stone).toBe(20);
    expect(sim.resources.crystal).toBe(0);
    expect(sim.resources.essence).toBe(0);
  });

  it('generates world grid', () => {
    const sim = createSim({ worldWidth: 10, worldHeight: 10 });
    expect(sim.world.grid).toHaveLength(10);
    expect(sim.world.grid[0]).toHaveLength(10);
    const center = sim.world.grid[5][5];
    expect(center.type).toBe('ground');
    expect(center.grass).toBe(true);
  });

  it('sets gameOver to false initially', () => {
    const sim = createSim();
    expect(sim.gameOver).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// stepTick — basic tick progression
// ═══════════════════════════════════════════════════════════════════════

describe('engine — stepTick', () => {
  it('increments tick counter', () => {
    const sim = createSim();
    const before = sim.tick;
    stepTick(sim);
    expect(sim.tick).toBe(before + 1);
  });

  it('builds HUD snapshot after each tick', () => {
    const sim = createSim();
    stepTick(sim);
    expect(sim.hud).toBeDefined();
    expect(sim.hud.tick).toBe(1);
    expect(sim.hud.baseHp).toBe(BASE.startingHp);
  });

  it('resourceHUD is built after each tick', () => {
    const sim = createSim();
    stepTick(sim);
    expect(sim.resourceHUD).toBeDefined();
    expect(sim.resourceHUD.resources.stone.current).toBe(20);
  });

  it('does not start wave 1 during early cooldown', () => {
    const sim = createSim();
    for (let i = 0; i < 100; i++) {
      stepTick(sim);
    }
    expect(sim.wave).toBe(0);
    expect(sim.waveState).toBe('cooldown');
    expect(sim.enemies).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Wave composition (10×10 world = fast walking)
// ═══════════════════════════════════════════════════════════════════════

describe('engine — wave composition', () => {
  it('wave 1 is a normal wave with scouts', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks);
    expect(sim.wave).toBe(1);
    expect(sim.waveState).toBe('spawning');
    expect(sim.swarmActive).toBe(false);
    const scouts = sim.waveComposition.find((g) => g.type === 'scout');
    expect(scouts).toBeDefined();
    expect(scouts.count).toBeGreaterThan(0);
  });

  it('wave 3 is a pure swarm wave (crawlers only)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 3);
    expect(sim.wave).toBe(3);
    expect(sim.swarmActive).toBe(true);
    expect(sim.waveComposition).toHaveLength(1);
    expect(sim.waveComposition[0].type).toBe('crawler');
    expect(sim.waveComposition[0].count).toBeGreaterThan(0);
  });

  it('wave 5 is a pure boss wave', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 5);
    expect(sim.wave).toBe(5);
    expect(sim.swarmActive).toBe(false);
    expect(sim.waveComposition).toHaveLength(1);
    expect(sim.waveComposition[0].type).toBe('boss');
    expect(sim.waveComposition[0].count).toBe(1);
  });

  it('wave 6 is a swarm wave (not boss)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 6);
    expect(sim.wave).toBe(6);
    expect(sim.swarmActive).toBe(true);
    expect(sim.waveComposition[0].type).toBe('crawler');
  });

  it('wave 9 is a swarm wave', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 9);
    expect(sim.wave).toBe(9);
    expect(sim.swarmActive).toBe(true);
    expect(sim.waveComposition[0].type).toBe('crawler');
  });

  it('wave 10 is a boss wave', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 10);
    expect(sim.wave).toBe(10);
    expect(sim.swarmActive).toBe(false);
    expect(sim.waveComposition[0].type).toBe('boss');
  });

  it('wave 15 is boss+swarm coincidence', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 15);
    expect(sim.wave).toBe(15);
    const boss = sim.waveComposition.find((g) => g.type === 'boss');
    const crawlers = sim.waveComposition.find((g) => g.type === 'crawler');
    expect(boss).toBeDefined();
    expect(crawlers).toBeDefined();
    expect(boss.count).toBe(1);
    expect(crawlers.count).toBeGreaterThan(0);
    expect(crawlers.count).toBeLessThan(80);
  });

  it('wave 20 is a boss wave', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 20);
    expect(sim.wave).toBe(20);
    expect(sim.swarmActive).toBe(false);
    expect(sim.waveComposition[0].type).toBe('boss');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Swarm Creep — late-game crawler escorts (wave 20+)
// ═══════════════════════════════════════════════════════════════════════

describe('engine — swarm creep', () => {
  it('creep does NOT fire for wave 19 (below startWave)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 19);
    expect(sim.wave).toBe(19);
    // Wave 19 is normal (not boss, not swarm) — no crawlers from creep
    const crawlers = sim.waveComposition.find(g => g.type === 'crawler');
    expect(crawlers).toBeUndefined();
  });

  it('creep does NOT fire for wave 20 (boss wave takes priority)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 20);
    expect(sim.wave).toBe(20);
    // Wave 20 is a boss wave — boss-only composition, no creep crawlers
    expect(sim.waveComposition).toHaveLength(1);
    expect(sim.waveComposition[0].type).toBe('boss');
    expect(sim.waveComposition[0].count).toBe(1);
  });

  it('creep does NOT fire for wave 21 (swarm wave takes priority)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 21);
    expect(sim.wave).toBe(21);
    expect(sim.swarmActive).toBe(true);
    // Swarm wave — pure crawlers, no creep mixed in
    expect(sim.waveComposition).toHaveLength(1);
    expect(sim.waveComposition[0].type).toBe('crawler');
  });

  it('creep fires for wave 22 (normal wave >= startWave)', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 22);
    expect(sim.wave).toBe(22);
    expect(sim.swarmActive).toBe(false);
    // Should have crawler group from creep
    const crawlers = sim.waveComposition.find(g => g.type === 'crawler');
    expect(crawlers).toBeDefined();
    // Wave 22: baseCount = 5 + 21 = 26, actualCount = 26
    // creepCount = floor(26 * 0.10) = 2
    expect(crawlers.count).toBe(2);
  });

  it('creep crawlers replace scouts, total wave count unchanged', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 22);
    // Wave 22 normal composition: actualCount = 26 enemies
    const total = sim.waveComposition.reduce((sum, g) => sum + g.count, 0);
    // baseCount = 5 + 21 = 26, actualCount = 26
    expect(total).toBe(26);
    // Scouts should be reduced by 2 (the creep count)
    const scouts = sim.waveComposition.find(g => g.type === 'scout');
    expect(scouts).toBeDefined();
    // With creep: original scout allocation was floor(26*(0.2+...)) ≈ 10-12
    // After creep subtraction of 2: scouts should be 8-10
    expect(scouts.count).toBeGreaterThan(0);
    expect(scouts.count).toBeLessThan(26);
  });

  it('creep count = floor(baseCount * fraction), capped at 5', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 22);
    const crawlers = sim.waveComposition.find(g => g.type === 'crawler');
    if (!crawlers) return; // safety
    // wave 22: baseCount=26, fraction=0.10 → floor(2.6)=2
    expect(crawlers.count).toBe(2);
    expect(crawlers.count).toBeLessThanOrEqual(5);
  });

  it('SWARM.creep.enabled = false suppresses creep', () => {
    const original = SWARM.creep.enabled;
    SWARM.creep.enabled = false;
    try {
      const sim = sim10x10();
      runWavesUntil(sim, 22);
      expect(sim.wave).toBe(22);
      // No crawler group — creep is disabled
      const crawlers = sim.waveComposition.find(g => g.type === 'crawler');
      expect(crawlers).toBeUndefined();
    } finally {
      SWARM.creep.enabled = original;
    }
  });

  it('capPerWave = 5 respected when creep fraction would exceed it', () => {
    const originalFraction = SWARM.creep.fraction;
    SWARM.creep.fraction = 1.0; // force more than 5 creep crawlers
    try {
      const sim = sim10x10();
      // Need a normal wave >= 20 that isn't boss or swarm
      // Wave 23: 23%5=3 (not boss), 23%3=2 (not swarm) → normal
      runWavesUntil(sim, 23);
      expect(sim.wave).toBe(23);
      expect(sim.swarmActive).toBe(false);
      const crawlers = sim.waveComposition.find(g => g.type === 'crawler');
      expect(crawlers).toBeDefined();
      // baseCount = 5+22=27, actualCount=27, fraction=1.0 → floor(27)=27
      // But capPerWave=5 should limit it
      expect(crawlers.count).toBe(5);
      expect(crawlers.count).toBeLessThanOrEqual(SWARM.creep.capPerWave);
    } finally {
      SWARM.creep.fraction = originalFraction;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Enemy spawning and movement
// ═══════════════════════════════════════════════════════════════════════

describe('engine — enemy spawning', () => {
  it('spawns enemies during spawning phase', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks * 3);
    expect(sim.wave).toBe(1);
    expect(sim.enemies.length).toBeGreaterThan(0);
    expect(sim.waveEnemiesSpawned).toBeGreaterThan(0);
  });

  it('creates enemies with correct properties', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    const enemy = sim.enemies[0];
    expect(enemy).toBeDefined();
    expect(enemy.type).toBeDefined();
    expect(enemy.hp).toBeGreaterThan(0);
    expect(enemy.maxHp).toBe(enemy.hp);
    expect(enemy.speed).toBeGreaterThan(0);
    expect(enemy.alive).toBe(true);
    expect(enemy.state).toBe('moving');
  });

  it('enemies move toward base center each tick', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    const enemy = sim.enemies[0];
    if (!enemy || !enemy.alive) return; // skip if no enemy spawned
    const startDist = dist(enemy, sim.baseCenter);
    stepTicks(sim, 5);
    if (enemy.alive) {
      const endDist = dist(enemy, sim.baseCenter);
      expect(endDist).toBeLessThan(startDist);
    }
  });

  it('crawlers have jitter applied', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 3);
    stepTicks(sim, WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    const crawlers = sim.enemies.filter((e) => e.type === 'crawler');
    expect(crawlers.length).toBeGreaterThan(0);
  });

  it('dead enemies are removed from array', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    // Manually kill all enemies
    for (const e of sim.enemies) {
      e.alive = false;
    }
    sim.waveEnemiesRemaining = 0;
    stepTick(sim);
    expect(sim.enemies).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Base damage and game over
// ═══════════════════════════════════════════════════════════════════════

describe('engine — base damage', () => {
  it('enemies deal damage on reaching base center', () => {
    const sim = sim10x10();
    const startHp = sim.baseHp;
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    const enemy = sim.enemies[0];
    if (!enemy) return;
    // Teleport to base
    enemy.x = sim.baseCenter.x;
    enemy.y = sim.baseCenter.y;
    stepTick(sim);
    expect(sim.baseHp).toBeLessThan(startHp);
    expect(enemy.alive).toBe(false);
  });

  it('gameOver stays false while base has HP', () => {
    const sim = sim10x10();
    for (let i = 0; i < 200; i++) {
      stepTick(sim);
    }
    expect(sim.gameOver).toBe(false);
  });

  it('game over triggers when base HP reaches 0', () => {
    const sim = sim10x10();
    sim.baseHp = 1;
    stepTicks(sim, WAVE.cooldownTicks + WAVE.startDelayTicks + WAVE.spawnIntervalTicks);
    const enemy = sim.enemies[0];
    if (!enemy) return;
    enemy.x = sim.baseCenter.x;
    enemy.y = sim.baseCenter.y;
    stepTick(sim);
    if (sim.baseHp <= 0) {
      expect(sim.gameOver).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

describe('engine — public API', () => {
  it('getStats returns HUD snapshot', () => {
    const sim = createSim();
    stepTick(sim);
    const stats = getStats(sim);
    expect(stats.tick).toBe(1);
    expect(stats.baseHp).toBe(BASE.startingHp);
    expect(stats.gameOver).toBe(false);
  });

  it('getWavePreview returns next wave info during cooldown', () => {
    const sim = sim10x10();
    stepTicks(sim, 10); // still in cooldown
    const preview = getWavePreview(sim);
    expect(preview).not.toBeNull();
    expect(preview.wave).toBe(1);
    expect(preview.active).toBe(false);
    expect(preview.enemies.length).toBeGreaterThan(0);
  });

  it('getWavePreview detects swarm wave 3', () => {
    const sim = sim10x10();
    // Complete waves 1 and 2 fully, arrive at cooldown before wave 3
    runWavesUntil(sim, 2);
    // Wave 2 has started (spawning). Let it finish.
    completeWave(sim);
    // Now in cooldown before wave 3
    stepTicks(sim, 10);
    const preview = getWavePreview(sim);
    expect(preview).not.toBeNull();
    expect(preview.wave).toBe(3);
    expect(preview.active).toBe(false);
    // Swarm wave 3 = crawlers only
    const crawlers = preview.enemies.find((e) => e.type === 'crawler');
    expect(crawlers).toBeDefined();
  });

  it('getWavePreview returns current wave during spawning', () => {
    const sim = sim10x10();
    stepTicks(sim, WAVE.cooldownTicks);
    const preview = getWavePreview(sim);
    expect(preview).not.toBeNull();
    expect(preview.wave).toBe(1);
    expect(preview.active).toBe(true);
    expect(preview.enemies.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Swarm cap enforcement
// ═══════════════════════════════════════════════════════════════════════

describe('engine — swarm cap', () => {
  it('crawler spawning pauses when cap is reached', () => {
    const sim = sim10x10();
    runWavesUntil(sim, 3);
    stepTicks(sim, WAVE.startDelayTicks);
    for (let i = 0; i < 500; i++) {
      stepTick(sim);
      if (sim.waveState !== 'spawning') break;
    }
    const spawned = sim.enemies.filter((e) => e.type === 'crawler' && e.alive).length;
    expect(spawned).toBeGreaterThan(0);
    expect(spawned).toBeLessThanOrEqual(SWARM.cap);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Day / Night Cycle
// ═══════════════════════════════════════════════════════════════════════

describe('engine — day/night cycle', () => {
  it('starts in the configured starting phase', () => {
    const sim = createSim();
    expect(sim.dayPhase).toBe(DAY_CYCLE.startingPhase);
    expect(sim.dayTimer).toBe(0);
  });

  it('dayTimer increments each tick', () => {
    const sim = createSim();
    stepTick(sim);
    expect(sim.dayTimer).toBe(1);
    stepTick(sim);
    expect(sim.dayTimer).toBe(2);
  });

  it('transitions to next phase after duration expires', () => {
    const sim = createSim();
    // Starting phase is 'night' (6000 ticks). Fast-forward to just before.
    stepTicks(sim, DAY_CYCLE.phaseDurations.night - 1);
    expect(sim.dayPhase).toBe('night');
    expect(sim.dayTimer).toBe(DAY_CYCLE.phaseDurations.night - 1);

    // One more tick triggers transition
    stepTick(sim);
    expect(sim.dayPhase).toBe('dawn');
    expect(sim.dayTimer).toBe(0);
  });

  it('completes full phase cycle: night → dawn → day → dusk → night', () => {
    const sim = createSim();
    // night → dawn
    stepTicks(sim, DAY_CYCLE.phaseDurations.night);
    expect(sim.dayPhase).toBe('dawn');
    expect(sim.dayTimer).toBe(0);

    // dawn → day
    stepTicks(sim, DAY_CYCLE.phaseDurations.dawn);
    expect(sim.dayPhase).toBe('day');
    expect(sim.dayTimer).toBe(0);

    // day → dusk
    stepTicks(sim, DAY_CYCLE.phaseDurations.day);
    expect(sim.dayPhase).toBe('dusk');
    expect(sim.dayTimer).toBe(0);

    // dusk → night
    stepTicks(sim, DAY_CYCLE.phaseDurations.dusk);
    expect(sim.dayPhase).toBe('night');
    expect(sim.dayTimer).toBe(0);
  });

  it('computes dayTransition for renderer interpolation', () => {
    const sim = createSim();
    // At tick 0, transition = 0 (beginning of night phase, transitionTicks=300)
    expect(sim.dayTransition).toBeUndefined(); // first tick hasn't run yet
    stepTick(sim);
    // After 1 tick, should be ~1/300
    expect(sim.dayTransition).toBeCloseTo(1 / DAY_CYCLE.transitionTicks, 1);

    // Mid-phase: transition should be 1.0 (fully settled)
    stepTicks(sim, DAY_CYCLE.transitionTicks);
    expect(sim.dayTransition).toBe(1.0);
  });

  it('debug log records phase transitions', () => {
    const sim = createSim();
    stepTicks(sim, DAY_CYCLE.phaseDurations.night);
    const transitionLogs = sim.debugLog.filter(
      (entry) => entry.msg && entry.msg.startsWith('DAY CYCLE →')
    );
    expect(transitionLogs.length).toBeGreaterThanOrEqual(1);
    expect(transitionLogs[transitionLogs.length - 1].msg).toContain('dawn');
  });

  it('waves do not start during day phase', () => {
    const sim = sim10x10();
    // Fast-forward through night to day
    sim.dayPhase = 'day';
    sim.dayTimer = 100;
    sim.waveCooldownTimer = 1;

    // Cooldown should expire but wave should NOT start (it's day)
    stepTick(sim);
    expect(sim.waveCooldownTimer).toBe(0);
    // Should remain in cooldown, not start spawning
    expect(sim.waveState).toBe('cooldown');
    expect(sim.wave).toBe(0);
  });

  it('waves start when cooldown expires during night', () => {
    const sim = sim10x10();
    sim.dayPhase = 'night';
    sim.dayTimer = 100;
    sim.waveCooldownTimer = 1;

    stepTick(sim);
    expect(sim.wave).toBe(1);
    expect(sim.waveState).toBe('spawning');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Artillery ranged attack behavior
// ═══════════════════════════════════════════════════════════════════════

describe('engine — artillery behavior', () => {
  it('artillery enemy transitions to firing state when base is in range', () => {
    const sim = sim10x10();
    // Place artillery 4 cells from base (within 5.0 attackRange)
    const arty = {
      id: 999, type: 'artillery', x: 1, y: 5, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0, _artyShotsFired: 0,
    };
    sim.enemies.push(arty);
    // Mock functions — damageWall and _applyBaseDamage aren't exported,
    // so we test via integration using stepTick or use no-op stubs.
    const noopDmg = () => {};
    tickArtilleryEnemy(sim, arty, () => ({ destroyed: false }), noopDmg);
    expect(arty.state).toBe('firing');
    expect(arty._artyTarget).not.toBeNull();
    expect(arty._artyTarget.type).toBe('base');
  });

  it('artillery enemy does not fire when out of range', () => {
    const sim = createSim({ worldWidth: 50, worldHeight: 50 });
    // Place artillery far from base (distance ~20 cells, range is 5)
    const arty = {
      id: 999, type: 'artillery', x: 5, y: 25, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0, _artyShotsFired: 0,
    };
    // baseCenter is at (25, 25), distance = 20
    sim.enemies.push(arty);
    tickArtilleryEnemy(sim, arty, () => ({}), () => {});
    expect(arty.state).toBe('moving'); // stays moving — out of range
  });

  it('artillery self-destructs after maxShots', () => {
    const sim = sim10x10();
    const arty = {
      id: 999, type: 'artillery', x: 1, y: 5, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0,
      _artyShotsFired: ARTILLERY.maxShots, // already exhausted
    };
    sim.enemies.push(arty);
    tickArtilleryEnemy(sim, arty, () => ({}), () => {});
    expect(arty.alive).toBe(false);
    expect(sim.waveEnemiesRemaining).toBe(-1); // decremented
  });

  it('artillery fires at base and increments shot counter', () => {
    const sim = sim10x10();
    const arty = {
      id: 999, type: 'artillery', x: 1, y: 5, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0, _artyShotsFired: 0,
    };
    sim.enemies.push(arty);
    let baseDmgDealt = 0;
    tickArtilleryEnemy(sim, arty, () => ({}), (_sim, dmg) => { baseDmgDealt += dmg; });
    expect(arty._artyShotsFired).toBe(1);
    expect(baseDmgDealt).toBe(ARTILLERY.attackDamage);
    expect(arty._artyCooldown).toBe(ARTILLERY.attackCooldown);
  });

  it('artillery targets wall when wall blocks line of sight to base', () => {
    const sim = createSim({ worldWidth: 30, worldHeight: 30 });
    // Place a wall between artillery and base, within attackRange (5 cells)
    sim.walls.push({
      id: 1, x: 8, y: 15, hp: 30, maxHp: 30, alive: true,
      radius: 0.8, level: 0, label: 'Barricade',
    });
    // Artillery at x=3, base at x=15, y=15. Wall at x=8 blocks, dist=5 from arty.
    const arty = {
      id: 999, type: 'artillery', x: 3, y: 15, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0, _artyShotsFired: 0,
    };
    sim.enemies.push(arty);
    let wallDmgDealt = 0;
    tickArtilleryEnemy(sim, arty,
      (_sim, wall, dmg) => { wallDmgDealt += dmg; return { destroyed: false }; },
      () => {}
    );
    expect(arty.state).toBe('firing');
    expect(arty._artyTarget.type).toBe('wall');
    expect(wallDmgDealt).toBe(ARTILLERY.attackDamage);
  });

  it('artillery excluded from waves 1-3, present wave 4+', () => {
    // Wave 1: no artillery
    const sim1 = sim10x10();
    stepTicks(sim1, WAVE.cooldownTicks); // start wave 1
    const hasArty1 = sim1.waveComposition.some(g => g.type === 'artillery');
    expect(hasArty1).toBe(false);

    // Wave 4: artillery should appear
    const sim4 = sim10x10();
    runWavesUntil(sim4, 4);
    const hasArty4 = sim4.waveComposition.some(g => g.type === 'artillery');
    expect(hasArty4).toBe(true);
  });

  it('artillery re-acquires base when target wall dies mid-cooldown', () => {
    // World 10×10: baseCenter at (5,5). Wall at (3,5) blocks LOS.
    // Artillery at (0.5,5): dist to wall=2.5 (in range), dist to base=4.5 (in range).
    const sim = createSim({ worldWidth: 10, worldHeight: 10 });
    sim.walls.push({
      id: 1, x: 3, y: 5, hp: 10, maxHp: 10, alive: true,
      radius: 0.8, level: 0, label: 'Barricade',
    });
    const arty = {
      id: 999, type: 'artillery', x: 0.5, y: 5, hp: 12, maxHp: 12,
      speed: 0.008, damage: 8, size: 1.0, alive: true, wave: 5,
      state: 'moving', _artyCooldown: 0, _artyShotsFired: 0,
    };
    sim.enemies.push(arty);

    // Tick 1: acquires wall target, fires, cooldown set to 120
    let wallDmg = 0;
    tickArtilleryEnemy(sim, arty,
      (_sim, wall, dmg) => { wallDmg += dmg; return { destroyed: false }; },
      () => {}
    );
    expect(arty.state).toBe('firing');
    expect(arty._artyTarget.type).toBe('wall');
    expect(arty._artyCooldown).toBe(ARTILLERY.attackCooldown);

    // Wall dies (killed by turret)
    sim.walls[0].alive = false;

    // Tick 2: artillery should re-acquire base, NOT the dead wall
    let baseDmg = 0;
    arty._artyCooldown = 0; // force immediate fire to verify target
    tickArtilleryEnemy(sim, arty,
      (_sim, wall, dmg) => { wallDmg += dmg; return { destroyed: false }; },
      (_sim, dmg) => { baseDmg += dmg; }
    );
    // Should have fired at base, not the dead wall
    expect(baseDmg).toBe(ARTILLERY.attackDamage);
    expect(arty._artyTarget.type).toBe('base');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// engine — tickRepair uses WALL.repairRate (BUG-007 regression)
// ═══════════════════════════════════════════════════════════════════════

describe('engine — tickRepair WALL.repairRate (BUG-007)', () => {
  it('repairs wall by WALL.repairRate HP per tick, not a hardcoded value', () => {
    const sim = createSim({ worldWidth: 20, worldHeight: 20 });
    // Remove the starting bot so labour doesn't double-assign repair
    sim.bots = [];

    // Add a wall at base center
    const wall = {
      id: 1, x: sim.baseCenter.x, y: sim.baseCenter.y,
      hp: 10, maxHp: 30, alive: true,
      radius: 1.0, level: 0, label: 'Barricade',
      building: false, buildProgress: 0, builderId: null,
      buildTicks: 1000,
    };
    sim.walls.push(wall);

    // Add a bot at the wall, set to REPAIR state
    const bot = {
      id: 1, x: wall.x, y: wall.y,
      speed: 0.04, state: 'REPAIR', wallId: wall.id,
    };
    sim.bots.push(bot);

    // Step one tick — bot should repair the wall
    stepTick(sim);

    // Wall HP should increase by WALL.repairRate (config-driven)
    expect(wall.hp).toBe(10 + WALL.repairRate);

    // Verify it's actually the config value, not coincidentally 0.5
    expect(WALL.repairRate).toBe(0.5); // canonical value
    expect(wall.hp).toBe(10.5);
  });

  it('repair stops when wall reaches maxHp', () => {
    const sim = createSim({ worldWidth: 20, worldHeight: 20 });
    // Remove starting bot
    sim.bots = [];

    const wall = {
      id: 1, x: sim.baseCenter.x, y: sim.baseCenter.y,
      hp: 29.6, maxHp: 30, alive: true,
      radius: 1.0, level: 0, label: 'Barricade',
      building: false, buildProgress: 0, builderId: null,
      buildTicks: 1000,
    };
    sim.walls.push(wall);

    const bot = {
      id: 1, x: wall.x, y: wall.y,
      speed: 0.04, state: 'REPAIR', wallId: wall.id,
    };
    sim.bots.push(bot);

    stepTick(sim);

    // HP should be capped at maxHp (30), not 29.6 + 0.5 = 30.1
    expect(wall.hp).toBe(30);
    // Bot should go idle since wall is fully repaired
    expect(bot.state).toBe('IDLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function sim10x10() {
  return createSim({ worldWidth: 10, worldHeight: 10 });
}

function stepTicks(sim, n) {
  for (let i = 0; i < n; i++) {
    stepTick(sim);
  }
}

function runWavesUntil(sim, targetWave) {
  const maxTicks = 100000;
  for (let i = 0; i < maxTicks; i++) {
    stepTick(sim);
    if (sim.wave >= targetWave) return;
  }
  throw new Error(`Failed to reach wave ${targetWave} after ${maxTicks} ticks (wave=${sim.wave}, state=${sim.waveState})`);
}

/** Complete the current wave fully: kill enemies, let state return to cooldown. */
function completeWave(sim) {
  // If still spawning, fast-forward to active
  if (sim.waveState === 'spawning') {
    // Spawn all remaining enemies instantly
    sim.waveEnemiesSpawned = sim.waveEnemiesToSpawn;
    sim.waveState = 'active';
  }
  // Kill all living enemies
  if (sim.waveState === 'active') {
    for (const e of sim.enemies) {
      e.alive = false;
    }
    sim.waveEnemiesRemaining = 0;
    stepTick(sim); // transitions to cooldown
  }
}

function completeActiveWave(sim) {
  if (sim.waveState === 'active') {
    for (const e of sim.enemies) {
      e.alive = false;
    }
    sim.waveEnemiesRemaining = 0;
    stepTick(sim);
  }
}

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
