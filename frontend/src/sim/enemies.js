/**
 * enemies.js — Crystal drop integration.
 *
 * On enemy death (HP ≤ 0, before entity removal), roll against the
 * enemy type's drop chance. Successful roll: add Crystal to pool.
 * Boss enemies have guaranteed drops with bonus amount.
 *
 * Drop is immediate — Crystal is credited on the same tick the enemy dies.
 */

import { RESOURCE, SCALING, ARTILLERY, ENEMY_SCOUT, ENEMY_TANK, ENEMY_CRAWLER, ENEMY_BOSS } from './config.js';
import { addResources } from './resource.js';

/**
 * Enemy type identifiers. Matches the existing enemy type system.
 */
export const ENEMY_TYPES = {
  SCOUT: 'scout',
  TANK: 'tank',
  ARTILLERY: 'artillery',
  CRAWLER: 'crawler',
  BOSS: 'boss',
};

/**
 * Process crystal drop on enemy death.
 * Should be called when an enemy reaches HP ≤ 0, before entity removal.
 *
 * Roll behavior:
 *   - Standard enemies: Math.random() < RESOURCE.crystal.drop[enemyType]
 *   - Boss enemies: guaranteed drop (100%), bonus amount (3 Crystal vs 1)
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the dying enemy { type: string, x: number, y: number, ... }
 * @param {function} randomFn — random number generator (defaults to Math.random)
 *   Injectable for deterministic testing.
 * @returns {object} Drop result:
 *   { dropped: boolean, amount: number, discarded: boolean }
 *   Used by the renderer to show "+1 Crystal" or "Storage Full" animation.
 */
export function processCrystalDrop(sim, enemy, randomFn = Math.random) {
  const { type, wave } = enemy;

  // Determine drop chance and amount
  let dropChance;
  let dropAmount;

  if (type === ENEMY_TYPES.BOSS) {
    dropChance = RESOURCE.crystal.drop.boss;       // 1.0 (guaranteed)
    dropAmount = RESOURCE.crystal.bossDropAmount;   // 3
  } else {
    dropChance = RESOURCE.crystal.drop[type];
    if (dropChance === undefined) {
      // Unknown enemy type — no drop
      return { dropped: false, amount: 0, discarded: false };
    }
    dropAmount = RESOURCE.crystal.dropAmount;       // 1
  }

  // Apply wave-based crystal drop scaling: scaled = base * (1 + SCALE * (wave - 1))
  if (wave != null && wave > 0) {
    const dropScale = 1 + SCALING.CRYSTAL_DROP_SCALE * (wave - 1);
    dropChance *= dropScale;
  }

  // Roll for drop
  const roll = randomFn();
  if (roll >= dropChance) {
    return { dropped: false, amount: 0, discarded: false };
  }

  // Drop succeeded — add Crystal to pool
  const result = addResources(sim, { crystal: dropAmount });

  return {
    dropped: true,
    amount: dropAmount,
    discarded: result.discarded.crystal > 0,
  };
}

/**
 * Get the expected Crystal per kill for a given enemy type.
 * Used for balance calculations and HUD rate estimation.
 *
 * @param {string} enemyType
 * @returns {number} expected Crystal per kill
 */
export function expectedCrystalPerKill(enemyType) {
  if (enemyType === ENEMY_TYPES.BOSS) {
    return RESOURCE.crystal.bossDropAmount * RESOURCE.crystal.drop.boss; // 3 * 1.0 = 3
  }

  const dropChance = RESOURCE.crystal.drop[enemyType];
  if (dropChance === undefined) return 0;

  return RESOURCE.crystal.dropAmount * dropChance; // 1 * chance
}

/**
 * Validate that drop probabilities are within [0, 1] for all enemy types.
 * Boss must be exactly 1.0. Crawler must be ≤ 0.05 to prevent swarm flooding.
 *
 * Called during config validation / startup.
 *
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateDropTables() {
  const warnings = [];
  const drop = RESOURCE.crystal.drop;

  for (const [type, chance] of Object.entries(drop)) {
    if (chance < 0 || chance > 1) {
      warnings.push(`Drop chance for ${type} is ${chance} — must be in [0, 1]`);
    }
  }

  // Boss must be guaranteed
  if (drop.boss !== 1.0) {
    warnings.push(`Boss drop chance is ${drop.boss} — expected 1.0 (guaranteed)`);
  }

  // Crawler anti-flood guard
  if (drop.crawler > 0.05) {
    warnings.push(
      `Crawler drop chance is ${drop.crawler} — should be ≤ 0.05 to prevent swarm Crystal flooding`
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Estimate Crystal income per wave cycle from enemy composition.
 * Used for balance monitoring and HUD expected-rate display.
 *
 * A wave cycle = 5 waves (1 boss cycle).
 * Expected standard drops: ~6-8 Crystal from standard enemies.
 * Expected boss drops: 3 Crystal (guaranteed).
 * Total per cycle: ~9-11 Crystal.
 *
 * @param {object[]} waveComposition — array of { type: string, count: number }
 * @returns {number} expected Crystal income
 */
export function estimateWaveCrystalIncome(waveComposition) {
  let total = 0;
  for (const { type, count } of waveComposition) {
    total += expectedCrystalPerKill(type) * count;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════
// ARTILLERY RANGED ATTACK BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find a valid ranged target for an artillery enemy.
 *
 * Priority: base (if directly reachable, no wall in between),
 * then nearest alive wall between artillery and base.
 *
 * "No wall in between" means no alive wall segment intersects the
 * line from the artillery's position to the base center, within
 * the wall's radius + 0.5 cell margin.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the artillery enemy
 * @returns {{ type: 'base' | 'wall', wall?: object } | null}
 */
export function findArtilleryTarget(sim, enemy) {
  const center = sim.baseCenter;
  const dx = center.x - enemy.x;
  const dy = center.y - enemy.y;
  const distToBase = Math.sqrt(dx * dx + dy * dy);

  // Check if any wall blocks line of sight to base
  let blockingWall = null;
  let bestBlockDist = Infinity;

  for (const wall of sim.walls) {
    if (!wall.alive) continue;

    // Check if wall is between artillery and base
    const wdx = wall.x - enemy.x;
    const wdy = wall.y - enemy.y;
    const wDist = Math.sqrt(wdx * wdx + wdy * wdy);

    // Wall must be closer than the base
    if (wDist >= distToBase) continue;

    // Project wall onto the line to base: is it close to the line?
    // Dot product to get projection scalar
    const t = (wdx * dx + wdy * dy) / (distToBase * distToBase);
    if (t < 0 || t > 1) continue; // wall is behind or beyond base

    // Perpendicular distance from wall to line
    const projX = enemy.x + t * dx;
    const projY = enemy.y + t * dy;
    const perpDist = Math.sqrt(
      (wall.x - projX) ** 2 + (wall.y - projY) ** 2
    );

    // Wall blocks if within its radius + margin
    const wallRadius = (wall.radius || 0.8) + 0.5;
    if (perpDist <= wallRadius) {
      // This wall blocks — track the nearest one
      if (wDist < bestBlockDist) {
        bestBlockDist = wDist;
        blockingWall = wall;
      }
    }
  }

  if (blockingWall) {
    // Target the blocking wall if within attackRange
    const wDist = Math.sqrt(
      (blockingWall.x - enemy.x) ** 2 + (blockingWall.y - enemy.y) ** 2
    );
    if (wDist <= ARTILLERY.attackRange) {
      return { type: 'wall', wall: blockingWall };
    }
    // Wall blocks but is out of range — move closer (no target yet)
    return null;
  }

  // No wall blocks — target base if within range
  if (distToBase <= ARTILLERY.attackRange) {
    return { type: 'base' };
  }

  // Nothing in range — keep moving
  return null;
}

/**
 * Tick one artillery enemy's behavior.
 *
 * State machine:
 *   'moving'  → if findArtilleryTarget returns a target, transition to 'firing'
 *   'firing'  → decrement cooldown, fire when ready, re-evaluate target
 *
 * Artillery damage is applied directly: base damage goes through shield
 * then HP; wall damage uses the wall damage system.
 *
 * Call this from engine.js tickEnemies() BEFORE the general movement
 * logic for artillery-type enemies.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the artillery enemy
 * @param {Function} damageWallFn — function(sim, wall, damage) => { destroyed: bool }
 * @param {Function} applyBaseDmgFn — function(sim, damage)
 */
export function tickArtilleryEnemy(sim, enemy, damageWallFn, applyBaseDmgFn) {
  // Cooldown management
  if (enemy._artyCooldown === undefined) {
    enemy._artyCooldown = 0;
  }
  if (enemy._artyCooldown > 0) {
    enemy._artyCooldown--;
  }

  // Shot counter — self-destruct after exhausting ammunition
  if (enemy._artyShotsFired === undefined) {
    enemy._artyShotsFired = 0;
  }
  if (enemy._artyShotsFired >= ARTILLERY.maxShots) {
    // Ammo exhausted — self-destruct. Does NOT count as a kill
    // (no crystal drop, no kill stat) since it's a natural expiration.
    enemy.alive = false;
    sim.waveEnemiesRemaining--;
    sim.debugLog.push({
      msg: `artillery exhausted (${enemy._artyShotsFired} shots fired)`,
      tick: sim.tick,
    });
    if (sim.debugLog.length > 50) {
      sim.debugLog = sim.debugLog.slice(-50);
    }
    return;
  }

  const target = findArtilleryTarget(sim, enemy);

  if (!target) {
    // No target in range — if we were firing, go back to moving
    if (enemy.state === 'firing') {
      enemy.state = 'moving';
      enemy._artyTarget = null;
    }
    return;
  }

  // We have a target — stay in firing mode and track the current target.
  // Always update _artyTarget every tick so we re-acquire if the
  // targeted wall dies (findArtilleryTarget already excludes dead walls).
  enemy.state = 'firing';
  enemy._artyTarget = target;

  // Fire when cooldown is up
  if (enemy._artyCooldown <= 0) {
    enemy._artyCooldown = ARTILLERY.attackCooldown;
    enemy._artyShotsFired++;

    const currentTarget = enemy._artyTarget || target;
    if (currentTarget.type === 'base') {
      applyBaseDmgFn(sim, ARTILLERY.attackDamage);

      sim.debugLog.push({
        msg: `artillery fires at base (${ARTILLERY.attackDamage} dmg, HP: ${Math.max(0, sim.baseHp)})`,
        tick: sim.tick,
      });
      if (sim.debugLog.length > 50) {
        sim.debugLog = sim.debugLog.slice(-50);
      }
    } else if (currentTarget.type === 'wall' && currentTarget.wall) {
      const result = damageWallFn(sim, currentTarget.wall, ARTILLERY.attackDamage);

      sim.debugLog.push({
        msg: `artillery fires at wall #${currentTarget.wall.id} (${ARTILLERY.attackDamage} dmg${result.destroyed ? ', DESTROYED' : ''})`,
        tick: sim.tick,
      });
      if (sim.debugLog.length > 50) {
        sim.debugLog = sim.debugLog.slice(-50);
      }

      if (result.destroyed) {
        // Wall destroyed — re-evaluate next tick
        enemy._artyTarget = null;
      }
    }

    // Push sound for renderer
    if (sim.sounds) {
      sim.sounds.push('mortar');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SCOUT AI — Gap Detection + Weakest-Wall Preference
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tick scout-specific AI behaviors: gap detection and weakest-wall preference.
 *
 * Gap detection: every gapCheckInterval ticks, the scout tests perpendicular
 * offsets from the direct path to base. If a flanking path intersects
 * significantly less wall HP (by the gapThreshold ratio), the scout
 * redirects toward the flank — creating emergent "probe and exploit"
 * behavior without full pathfinding.
 *
 * Weakest-wall preference: when sieging a wall, the scout periodically
 * checks if a nearby wall has lower HP and switches target. This rewards
 * the player for maintaining uniform wall health.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — scout enemy entity
 */
export function tickScoutAI(sim, enemy) {
  // ── Weakest-wall preference (during siege) ───────────────────
  if (enemy.state === 'sieging' && enemy.siegeTargetId != null) {
    const currentWall = sim.walls.find(
      (w) => w.id === enemy.siegeTargetId && w.alive
    );
    if (currentWall && ENEMY_SCOUT.preferWeakestWall) {
      const wallsInRange = sim.walls.filter(
        (w) =>
          w.alive &&
          w.id !== currentWall.id &&
          _dist(enemy.x, enemy.y, w.x, w.y) < enemy.size + (w.radius || 0.8) + 0.5
      );
      if (wallsInRange.length > 0) {
        const weakest = wallsInRange.reduce((a, b) => (a.hp < b.hp ? a : b));
        if (weakest.hp < currentWall.hp) {
          enemy.siegeTargetId = weakest.id;
        }
      }
    }
    return; // don't run gap detection while sieging
  }

  // ── Gap detection (during movement) ─────────────────────────
  if (enemy.state !== 'moving') return;

  // Track gap scan timer
  if (enemy._scoutGapTimer === undefined) enemy._scoutGapTimer = 0;
  enemy._scoutGapTimer++;
  if (enemy._scoutGapTimer < ENEMY_SCOUT.gapCheckInterval) return;
  enemy._scoutGapTimer = 0;

  const { baseCenter } = sim;
  const dx = baseCenter.x - enemy.x;
  const dy = baseCenter.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  // Normal and perpendicular directions
  const nx = dx / dist;
  const ny = dy / dist;
  const perpX = -ny;
  const perpY = nx;

  // Score direct path: total wall HP intersected
  const directHP = _traceWallHP(sim, enemy.x, enemy.y, baseCenter.x, baseCenter.y);

  // Test flanking offsets — try left and right by 2-3 cells
  const offsets = [-3, -2, 2, 3];
  let bestOffset = 0;
  let bestHP = directHP;

  for (const offset of offsets) {
    const flankX = enemy.x + perpX * offset;
    const flankY = enemy.y + perpY * offset;
    const flankHP = _traceWallHP(sim, flankX, flankY, baseCenter.x, baseCenter.y);
    if (flankHP < bestHP) {
      bestHP = flankHP;
      bestOffset = offset;
    }
  }

  // Redirect if the best flank has significantly less wall HP
  // gapThreshold = 0.20 → need at least 20% less wall HP to redirect
  if (bestHP < directHP * (1 - ENEMY_SCOUT.gapThreshold)) {
    enemy._flankOffset = bestOffset;
    // Store flank waypoint — the movement system will bias toward it
    enemy._flankWaypoint = {
      x: enemy.x + perpX * bestOffset,
      y: enemy.y + perpY * bestOffset,
    };
  } else {
    enemy._flankOffset = 0;
    enemy._flankWaypoint = null;
  }
}

/**
 * Compute total wall HP intersected by a line segment.
 * Used by scout gap detection to compare path quality.
 *
 * @param {object} sim
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @returns {number} total HP of intersecting walls
 */
function _traceWallHP(sim, fromX, fromY, toX, toY) {
  let totalHP = 0;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const sqDist = dx * dx + dy * dy;
  if (sqDist === 0) return 0;
  const dist = Math.sqrt(sqDist);

  for (const wall of sim.walls) {
    if (!wall.alive) continue;

    const wdx = wall.x - fromX;
    const wdy = wall.y - fromY;

    // Project wall onto the line
    const t = (wdx * dx + wdy * dy) / sqDist;
    if (t < 0 || t > 1) continue; // wall is behind or beyond the segment

    const projX = fromX + t * dx;
    const projY = fromY + t * dy;
    const perpDist = Math.sqrt((wall.x - projX) ** 2 + (wall.y - projY) ** 2);
    const radius = wall.radius || 0.8;

    if (perpDist <= radius + 0.3) {
      totalHP += wall.hp;
    }
  }

  return totalHP;
}

/**
 * Euclidean distance between two points.
 */
function _dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// ═══════════════════════════════════════════════════════════════════════
// TANK AI — Taunt Aura
// ═══════════════════════════════════════════════════════════════════════

/**
 * Apply the tank's taunt aura — redirect nearby enemies to the tank's
 * siege target wall.
 *
 * For each alive enemy within tauntRadius of the tank, if they're in
 * 'moving' state, set them to 'sieging' the same wall the tank is attacking.
 * This coordinates breaches and creates emergent tank-led pushes.
 *
 * Should be called in a pre-pass (before movement) so redirected enemies
 * arrive at the wall within the same tick.
 *
 * @param {object} sim — sim state
 * @param {object} tank — the tank enemy entity (must be sieging)
 */
export function tickTankAura(sim, tank) {
  if (tank.state !== 'sieging' || tank.siegeTargetId == null) return;

  const targetWall = sim.walls.find(
    (w) => w.id === tank.siegeTargetId && w.alive
  );
  if (!targetWall) {
    // Wall was destroyed — tank will resume moving next tick
    tank.siegeTargetId = null;
    tank.state = 'moving';
    return;
  }

  const radius = ENEMY_TANK.tauntRadius;
  const sqRadius = radius * radius;

  for (const other of sim.enemies) {
    if (!other.alive || other === tank) continue;
    if (other.id === tank.id) continue;

    // Only redirect enemies in 'moving' state that are close enough
    if (other.state !== 'moving') continue;

    const dx = other.x - tank.x;
    const dy = other.y - tank.y;
    if (dx * dx + dy * dy > sqRadius) continue;

    // Redirect — join the tank's siege
    other.state = 'sieging';
    other.siegeTargetId = tank.siegeTargetId;
    other._taunted = true; // marker for visual feedback / future use
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRAWLER AI — Stack Cap
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a crawler should skip sieging a wall due to the stack cap.
 *
 * When too many crawlers are already sieging a wall (≥ maxStackPerWall),
 * additional crawlers should slide past rather than piling on. This prevents
 * degenerate 80-crawler pileups that melt walls instantly.
 *
 * The crawler gets a lateral displacement if capped, creating emergent
 * flank-around behavior.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the crawler enemy
 * @param {number} crawlerCountOnWall — how many crawlers are already sieging this wall
 * @returns {boolean} true if the crawler should skip siege (stack capped)
 */
export function checkCrawlerStack(sim, enemy, crawlerCountOnWall) {
  if (crawlerCountOnWall >= ENEMY_CRAWLER.maxStackPerWall) {
    // Capped — slide laterally to bypass
    const { baseCenter } = sim;
    const dx = baseCenter.x - enemy.x;
    const dy = baseCenter.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      // Perpendicular displacement
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const slideDir = crawlerCountOnWall % 2 === 0 ? 1 : -1; // alternate sides
      enemy.x += perpX * slideDir * 0.5;
      enemy.y += perpY * slideDir * 0.5;
    }
    return true; // skip siege — stay moving
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// BOSS AI — Enrage + Shockwave
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tick boss-specific AI: enrage check and first-contact shockwave.
 *
 * Enrage: when the boss drops below enrageHpThreshold fraction of max HP,
 * its speed and damage are permanently multiplied. This creates a dramatic
 * mid-fight shift — the player must survive the enraged second half.
 *
 * Shockwave: on the boss's first wall contact (transition to 'sieging'),
 * all walls within shockwaveRadius take shockwaveDamage. This punishes the
 * player for letting the boss reach the wall line at all.
 *
 * Call this at the start of processing a boss in tickEnemies(), before
 * movement logic.
 *
 * @param {object} sim — sim state
 * @param {object} enemy — the boss enemy entity
 */
export function tickBossAI(sim, enemy) {
  // ── Enrage check ─────────────────────────────────────────────
  if (!enemy._enraged && enemy.maxHp > 0) {
    const hpFraction = enemy.hp / enemy.maxHp;
    if (hpFraction <= ENEMY_BOSS.enrageHpThreshold) {
      enemy._enraged = true;
      enemy.speed *= ENEMY_BOSS.enrageSpeedMul;
      enemy.damage *= ENEMY_BOSS.enrageDamageMul;

      sim.debugLog.push({
        msg: `BOSS ENRAGED! HP: ${enemy.hp.toFixed(0)}/${enemy.maxHp.toFixed(0)} — speed ×${ENEMY_BOSS.enrageSpeedMul}, damage ×${ENEMY_BOSS.enrageDamageMul}`,
        tick: sim.tick,
      });
      if (sim.debugLog.length > 50) {
        sim.debugLog = sim.debugLog.slice(-50);
      }

      if (sim.sounds) {
        sim.sounds.push('boss_enrage');
      }
    }
  }
}

/**
 * Fire the boss shockwave — damages all walls within shockwaveRadius.
 *
 * Called by engine.js when the boss first contacts a wall line.
 * One-time effect per boss (guarded by _shockwaveFired flag).
 *
 * @param {object} sim — sim state
 * @param {object} boss — the boss enemy entity
 * @param {Function} damageWallFn — function(sim, wall, damage) => { destroyed: bool }
 */
export function fireBossShockwave(sim, boss, damageWallFn) {
  if (boss._shockwaveFired) return;

  const radius = ENEMY_BOSS.shockwaveRadius;
  const sqRadius = radius * radius;
  let wallsHit = 0;

  for (const wall of sim.walls) {
    if (!wall.alive) continue;

    const dx = wall.x - boss.x;
    const dy = wall.y - boss.y;
    if (dx * dx + dy * dy <= sqRadius) {
      damageWallFn(sim, wall, ENEMY_BOSS.shockwaveDamage);
      wallsHit++;
    }
  }

  boss._shockwaveFired = true;

  sim.debugLog.push({
    msg: `BOSS SHOCKWAVE — ${ENEMY_BOSS.shockwaveDamage} dmg to ${wallsHit} walls within ${radius} cells`,
    tick: sim.tick,
  });
  if (sim.debugLog.length > 50) {
    sim.debugLog = sim.debugLog.slice(-50);
  }

  if (sim.sounds) {
    sim.sounds.push('boss_shockwave');
  }
}
