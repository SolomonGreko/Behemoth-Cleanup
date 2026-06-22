/**
 * turrets.test.js — Tests for the turret / watcher system.
 *
 * Covers: createWatcher, findTarget, fire (laser + mortar),
 * upgradeToTurret, addMortar, mountOnWall, tickTurrets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWatcher,
  findTarget,
  tickTurrets,
  upgradeToTurret,
  addMortar,
  mountOnWall,
  getTurretSummary,
  getTurretById,
} from '../turrets.js';
import {
  createSim,
  stepTick,
  buyWatcher,
  getStats,
} from '../engine.js';
import { TURRET, ENEMY } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function sim10x10() {
  return createSim({ worldWidth: 10, worldHeight: 10 });
}

/** Spawn a single enemy at a specific position. */
function spawnEnemyAt(sim, type, x, y) {
  const cfg = ENEMY[type];
  const enemy = {
    id: sim._nextEnemyId++,
    type,
    x, y,
    hp: cfg.hp,
    maxHp: cfg.hp,
    speed: cfg.speed,
    damage: cfg.damage,
    size: cfg.size,
    alive: true,
    wave: 1,
    state: 'moving',
    targetX: null,
    targetY: null,
    path: [],
    pathIndex: 0,
  };
  sim.enemies.push(enemy);
  sim.waveEnemiesRemaining++;
  return enemy;
}

// ═══════════════════════════════════════════════════════════════════════
// createWatcher
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — createWatcher', () => {
  it('creates a watcher at the given position', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    expect(w).toBeDefined();
    expect(w.type).toBe('watcher');
    expect(w.x).toBe(5);
    expect(w.y).toBe(5);
  });

  it('watcher has correct stats from config', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 3, 3);
    expect(w.hp).toBe(TURRET.watcher.hp);
    expect(w.maxHp).toBe(TURRET.watcher.hp);
    expect(w.range).toBe(TURRET.watcher.range);
    expect(w.laserDamage).toBe(TURRET.watcher.laserDamage);
    expect(w.laserCdMax).toBe(TURRET.watcher.laserCd);
    expect(w.laserCd).toBe(0);
    expect(w.hasMortar).toBe(false);
    expect(w.alive).toBe(true);
  });

  it('adds turret to sim.turrets array', () => {
    const sim = sim10x10();
    expect(sim.turrets).toHaveLength(0);
    createWatcher(sim, 5, 5);
    expect(sim.turrets).toHaveLength(1);
  });

  it('each watcher has a unique id', () => {
    const sim = sim10x10();
    const a = createWatcher(sim, 1, 1);
    const b = createWatcher(sim, 2, 2);
    expect(a.id).not.toBe(b.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// findTarget
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — findTarget', () => {
  let sim, turret;

  beforeEach(() => {
    sim = sim10x10();
    turret = createWatcher(sim, 5, 5);
  });

  it('returns null when no enemies exist', () => {
    expect(findTarget(sim, turret)).toBeNull();
  });

  it('returns null when all enemies are dead', () => {
    const e = spawnEnemyAt(sim, 'scout', 5, 3);
    e.alive = false;
    expect(findTarget(sim, turret)).toBeNull();
  });

  it('finds enemy within range', () => {
    const e = spawnEnemyAt(sim, 'scout', 5, 6); // distance from base center (5,5): 1 cell
    const target = findTarget(sim, turret);
    expect(target).toBe(e);
  });

  it('ignores enemy outside range', () => {
    // Place enemy at far corner (0,0). Base center is (5,5), distance ~7.07 cells
    spawnEnemyAt(sim, 'scout', 0, 0);
    expect(findTarget(sim, turret)).toBeNull();
  });

  it('prefers enemy closest to base center (nearest-first targeting)', () => {
    const far = spawnEnemyAt(sim, 'scout', 5, 7);   // dist 2
    const near = spawnEnemyAt(sim, 'scout', 5, 5.5); // dist 0.5
    const target = findTarget(sim, turret);
    expect(target).toBe(near);
  });

  it('enemy at exactly range boundary is included', () => {
    // range is 4.0. Place at (5, 9) -> dist 4.0 from base center (5,5)
    const e = spawnEnemyAt(sim, 'scout', 5, 9);
    const target = findTarget(sim, turret);
    expect(target).toBe(e);
  });

  it('enemy just beyond range boundary is excluded', () => {
    spawnEnemyAt(sim, 'scout', 5, 9.01);
    expect(findTarget(sim, turret)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Laser fire
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — laser fire', () => {
  it('laser damages target enemy', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    const enemy = spawnEnemyAt(sim, 'tank', 5, 6); // tank: 20 HP, watcher: 20 dmg
    const startHp = enemy.hp;

    // Fire laser: trigger via tickTurrets (turret has 0 cooldown, enemy in range)
    tickTurrets(sim);

    // Tank takes exactly 20 damage — dies (HP floors at 0)
    expect(enemy.hp).toBe(0);
    expect(enemy.alive).toBe(false);
  });

  it('laser goes on cooldown after firing', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    spawnEnemyAt(sim, 'scout', 5, 6);

    tickTurrets(sim);
    expect(turret.laserCd).toBe(TURRET.watcher.laserCd);
  });

  it('laser kills enemy when hp reaches 0', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    // Crawler has 3 HP, watcher does 20 damage — one-shot kill
    const enemy = spawnEnemyAt(sim, 'crawler', 5, 6);

    tickTurrets(sim);

    expect(enemy.hp).toBe(0);
    expect(enemy.alive).toBe(false);
  });

  it('kill increments sim.kills', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    spawnEnemyAt(sim, 'crawler', 5, 6);

    const before = sim.kills;
    tickTurrets(sim);

    expect(sim.kills).toBe(before + 1);
  });

  it('kill decrements waveEnemiesRemaining', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    spawnEnemyAt(sim, 'crawler', 5, 6);

    const before = sim.waveEnemiesRemaining;
    tickTurrets(sim);

    expect(sim.waveEnemiesRemaining).toBe(before - 1);
  });

  it('does not fire while on cooldown', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    const enemy = spawnEnemyAt(sim, 'scout', 5, 6);

    // First shot
    tickTurrets(sim);
    const hpAfterFirst = enemy.hp;

    // Second tick: cooldown not expired, should not fire
    tickTurrets(sim);
    expect(enemy.hp).toBe(hpAfterFirst); // unchanged
    expect(turret.laserCd).toBe(TURRET.watcher.laserCd - 1);
  });

  it('fires again after cooldown expires', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    // Boss has 80 HP, watcher does 20 dmg — needs 4 shots to kill
    const enemy = spawnEnemyAt(sim, 'boss', 5, 6);

    // First shot: 80 → 60
    tickTurrets(sim);
    expect(enemy.hp).toBe(60);
    expect(enemy.alive).toBe(true);

    // Second shot after cooldown: 60 → 40
    for (let i = 0; i < TURRET.watcher.laserCd; i++) {
      tickTurrets(sim);
    }
    expect(enemy.hp).toBe(40);
    expect(enemy.alive).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Mortar fire
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — mortar fire', () => {
  it('mortar damages target and nearby enemies (splash)', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    upgradeToTurret(turret);
    addMortar(turret);

    // Use tanks so they survive and we can see actual damage
    // tank: 20 HP, mortar: 50 dmg
    const target = spawnEnemyAt(sim, 'tank', 5, 6);
    // Splash victim at (5, 7) — dist 1 from target, within 2.0 splash
    const splash = spawnEnemyAt(sim, 'tank', 5, 7);
    // Out of range victim at (5, 9) — dist 3 from target, outside 2.0 splash
    const outOfRange = spawnEnemyAt(sim, 'tank', 5, 9);

    tickTurrets(sim);

    // Mortar does 50 damage to tanks with 20 HP — both die (HP floors at 0)
    expect(target.hp).toBe(0);
    expect(splash.hp).toBe(0);
    // Out-of-range enemy should be untouched
    expect(outOfRange.hp).toBe(ENEMY.tank.hp);
    expect(outOfRange.alive).toBe(true);
  });

  it('mortar goes on cooldown after firing', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    upgradeToTurret(turret);
    addMortar(turret);
    spawnEnemyAt(sim, 'scout', 5, 6);

    tickTurrets(sim);

    expect(turret.mortarCd).toBe(TURRET.mortar.cd);
  });

  it('mortar kills track for each enemy killed', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    upgradeToTurret(turret);
    addMortar(turret);

    // Crawlers have 3 HP, mortar does 50 — guaranteed one-shot
    spawnEnemyAt(sim, 'crawler', 5, 6);
    spawnEnemyAt(sim, 'crawler', 5, 6.5);
    spawnEnemyAt(sim, 'crawler', 5, 7);

    const before = sim.kills;
    tickTurrets(sim);

    expect(sim.kills).toBe(before + 3);
    expect(sim.waveEnemiesRemaining).toBe(3 - 3); // 3 spawned, 3 killed
  });

  it('mortar does not fire while on cooldown', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    upgradeToTurret(turret);
    addMortar(turret);
    const enemy = spawnEnemyAt(sim, 'scout', 5, 6);

    // First shot
    tickTurrets(sim);
    const hpAfterFirst = enemy.hp;

    // Second tick: cooldown not expired
    tickTurrets(sim);
    expect(enemy.hp).toBe(hpAfterFirst);
  });

  it('mortar prefers firing over laser when both are ready', () => {
    const sim = sim10x10();
    const turret = createWatcher(sim, 5, 5);
    upgradeToTurret(turret);
    addMortar(turret);

    // Use tanks (20 HP) so they survive one mortar hit
    const nearEnemy = spawnEnemyAt(sim, 'tank', 5, 6);
    const farEnemy = spawnEnemyAt(sim, 'tank', 8, 5); // dist 3 from base

    tickTurrets(sim);

    // Mortar fires first: nearEnemy takes 50 damage → HP 0 (dead)
    expect(nearEnemy.hp).toBe(0);
    expect(nearEnemy.alive).toBe(false);
    // farEnemy outside splash radius (dist 3 > 2.0) — untouched by mortar
    expect(farEnemy.hp).toBe(ENEMY.tank.hp);
    expect(farEnemy.alive).toBe(true);
    // Turret laserCd should be 0 (laser not fired), mortarCd should be set
    expect(turret.laserCd).toBe(0);
    expect(turret.mortarCd).toBe(TURRET.mortar.cd);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Upgrade and mount
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — upgradeToTurret', () => {
  it('upgrades watcher to advanced turret', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    const result = upgradeToTurret(w);
    expect(result).toBe(true);
    expect(w.type).toBe('turret');
    expect(w.hp).toBe(TURRET.turret.hp);
    expect(w.range).toBe(TURRET.turret.range);
    expect(w.laserDamage).toBe(TURRET.turret.laserDamage);
    expect(w.laserCdMax).toBe(TURRET.turret.laserCd);
  });

  it('cannot upgrade a non-watcher', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    upgradeToTurret(w);
    // Try upgrading again
    const result = upgradeToTurret(w);
    expect(result).toBe(false);
  });
});

describe('turrets — addMortar', () => {
  it('adds mortar to an advanced turret', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    upgradeToTurret(w);
    const result = addMortar(w);
    expect(result).toBe(true);
    expect(w.hasMortar).toBe(true);
  });

  it('cannot add mortar to a watcher', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    const result = addMortar(w);
    expect(result).toBe(false);
    expect(w.hasMortar).toBe(false);
  });

  it('cannot add mortar twice', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    upgradeToTurret(w);
    addMortar(w);
    const result = addMortar(w);
    expect(result).toBe(false);
  });
});

describe('turrets — mountOnWall', () => {
  it('applies mount bonuses to turret', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    const origHp = w.hp;
    const origRange = w.range;

    const result = mountOnWall(w);
    expect(result).toBe(true);
    expect(w.mounted).toBe(true);
    expect(w.hp).toBe(Math.floor(origHp * TURRET.mountBonus.hpMul));
    expect(w.range).toBeGreaterThan(origRange);
  });

  it('cannot mount twice', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    mountOnWall(w);
    const result = mountOnWall(w);
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// tickTurrets integration
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — tickTurrets', () => {
  it('does not crash with empty turrets array', () => {
    const sim = sim10x10();
    expect(() => tickTurrets(sim)).not.toThrow();
  });

  it('respects cooldowns across multiple turrets', () => {
    const sim = sim10x10();
    const t1 = createWatcher(sim, 4, 5);
    const t2 = createWatcher(sim, 6, 5);
    // Need two enemies so both turrets can fire
    spawnEnemyAt(sim, 'tank', 5, 6);
    spawnEnemyAt(sim, 'tank', 5, 7);

    // Both fire together
    tickTurrets(sim);
    expect(t1.laserCd).toBe(TURRET.watcher.laserCd);
    expect(t2.laserCd).toBe(TURRET.watcher.laserCd);

    // Both on cooldown next tick — no new targets, no damage
    tickTurrets(sim);
    expect(t1.laserCd).toBe(TURRET.watcher.laserCd - 1);
    expect(t2.laserCd).toBe(TURRET.watcher.laserCd - 1);
  });

  it('getTurretSummary returns correct counts', () => {
    const sim = sim10x10();
    createWatcher(sim, 1, 1);
    createWatcher(sim, 2, 2);
    const w3 = createWatcher(sim, 3, 3);
    upgradeToTurret(w3);
    addMortar(w3);

    const summary = getTurretSummary(sim);
    expect(summary.total).toBe(3);
    expect(summary.watchers).toBe(2);
    expect(summary.turrets).toBe(1);
    expect(summary.mortars).toBe(1);
  });

  it('getTurretById returns correct turret', () => {
    const sim = sim10x10();
    const w = createWatcher(sim, 5, 5);
    expect(getTurretById(sim, w.id)).toBe(w);
    expect(getTurretById(sim, 9999)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Integration: turrets in engine stepTick
// ═══════════════════════════════════════════════════════════════════════

describe('turrets — engine integration', () => {
  it('buyWatcher spawns a turret', () => {
    const sim = sim10x10();
    sim.resources.crystal = 100;
    const res = buyWatcher(sim);
    expect(res.success).toBe(true);
    expect(sim.turrets).toHaveLength(1);
    expect(sim.turrets[0].type).toBe('watcher');
  });

  it('stepTick calls turret tick', () => {
    const sim = sim10x10();
    sim.resources.crystal = 100;
    buyWatcher(sim);
    spawnEnemyAt(sim, 'crawler', 5, 6);
    sim.waveEnemiesRemaining = 1;

    const beforeKills = sim.kills;
    stepTick(sim);

    expect(sim.kills).toBe(beforeKills + 1);
    const killed = sim.enemies.find((e) => e.type === 'crawler');
    expect(killed.alive).toBe(false);
  });

  it('getStats includes turret count after buyWatcher', () => {
    const sim = sim10x10();
    sim.resources.crystal = 100;
    buyWatcher(sim);
    stepTick(sim);

    const stats = getStats(sim);
    expect(stats.turretCount).toBe(1);
  });
});
