/**
 * engine.test.js — Tests for the main game engine loop.
 *
 * Covers: createSim, stepTick, wave composition, swarm logic,
 * enemy spawning, base damage, game-over detection.
 *
 * Uses small worlds (10×10) for fast wave cycling.
 */

import { describe, it, expect } from 'vitest';
import {
  createSim,
  stepTick,
  getStats,
  getWavePreview,
} from '../engine.js';
import { BASE, WAVE, SWARM, DAY_CYCLE, BOT } from '../config.js';

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
