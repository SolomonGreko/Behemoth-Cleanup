/**
 * security-adversarial.test.js — Ares adversarial security test suite.
 *
 * Probes the resource system with malicious inputs to validate
 * defenses against client-side resource manipulation.
 */

import { canAfford, trySpend, addResources } from '../resource.js';
import { RESOURCE, COST, ECON } from '../config.js';

// Import these for the cap validation test
import { processCrystalDrop } from '../enemies.js';
import { initResourceState, resourceTick, applyStorageUpgrade } from '../engine.js';

function makeSim(overrides = {}) {
  return {
    tick: 0,
    resources: {
      stone: ECON.startingStone,
      crystal: ECON.startingCrystal,
      essence: ECON.startingEssence,
      ...overrides.resources,
    },
    resourceCaps: {
      stone: RESOURCE.stone.cap,
      crystal: RESOURCE.crystal.cap,
      essence: RESOURCE.essence.cap,
      ...overrides.resourceCaps,
    },
    essenceAccum: overrides.essenceAccum ?? 0.0,
    resourceHistory: [],
    purchasableItems: overrides.purchasableItems || [],
  };
}

describe('SECURITY: trySpend — injection via negative costs', () => {
  it('NEGATIVE-COST-EXPLOIT: negative stone cost injects resources', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    const result = trySpend(sim, { stone: -999 });
    // BUG: canAfford skips negative check, trySpend does -= (-999) = += 999
    expect(sim.resources.stone).toBe(50); // Should still be 50
    expect(result.success).toBe(false);   // Should reject negative cost
  });

  it('NEGATIVE-COST-EXPLOIT: negative crystal cost injects resources', () => {
    const sim = makeSim({ resources: { crystal: 10 } });
    trySpend(sim, { crystal: -100 });
    expect(sim.resources.crystal).toBe(10); // Should be 10, not 110
  });

  it('NEGATIVE-COST-EXPLOIT: negative essence cost injects resources', () => {
    const sim = makeSim({ resources: { essence: 30 } });
    trySpend(sim, { essence: -50 });
    expect(sim.resources.essence).toBe(30); // Should be 30, not 80
  });

  it('NEGATIVE-COST-EXPLOIT: mixed negative/positive costs', () => {
    const sim = makeSim({ resources: { stone: 50, crystal: 30 } });
    // Negative stone + positive crystal — negative should be rejected
    trySpend(sim, { stone: -500, crystal: 10 });
    expect(sim.resources.stone).toBe(50);    // Should NOT become 550
    expect(sim.resources.crystal).toBe(30);  // Crystal spend should ALSO fail
    // Entire transaction should be rejected because negative costs
    // should be treated as invalid
  });

  it('zero-value cost is harmless but should still not mutate state', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    const before = { ...sim.resources };
    trySpend(sim, { stone: 0 });
    expect(sim.resources).toEqual(before);
  });
});

describe('SECURITY: trySpend — non-finite number injection', () => {
  it('Infinity cost should be rejected, not silently skipped', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // Infinity > 0 is true, so canAfford checks it
    // resources.stone (50) < Infinity → true → canAfford returns false
    const result = trySpend(sim, { stone: Infinity });
    expect(result.success).toBe(false);
    expect(sim.resources.stone).toBe(50);
  });

  it('NaN cost should not corrupt state', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // NaN > 0 is false → canAfford skips → returns true
    // if (NaN) is falsy → skip deduction
    // Result: success true, no mutation
    const result = trySpend(sim, { stone: NaN });
    // Success is technically wrong but harmless — no resources changed.
    // Still a bug: this should be false.
    expect(sim.resources.stone).toBe(50);
  });

  it('-Infinity cost should be rejected', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // -Infinity > 0 is false → canAfford skips → returns true
    // if (-Infinity) is truthy → sim.resources.stone -= (-Infinity) = += Infinity
    // This is exploitable!
    trySpend(sim, { stone: -Infinity });
    expect(sim.resources.stone).toBe(50); // Should be 50, not Infinity
  });
});

describe('SECURITY: trySpend — object injection / prototype pollution', () => {
  it('null cost should return success without mutation', () => {
    const sim = makeSim();
    const before = { ...sim.resources };
    const result = trySpend(sim, null);
    expect(result.success).toBe(true);
    expect(sim.resources).toEqual(before);
  });

  it('cost with __proto__ or constructor keys should not affect state', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // Cost with unexpected keys
    trySpend(sim, { stone: 5, __proto__: { stone: 999 } });
    expect(sim.resources.stone).toBe(45);
  });
});

describe('SECURITY: trySpend — rapid-fire / DoS', () => {
  it('rapid sequential spends maintain integrity', () => {
    const sim = makeSim({ resources: { stone: 1000 } });
    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = trySpend(sim, { stone: 10 });
      if (result.success) successCount++;
    }
    // All 100 spends should succeed (1000/10=100)
    expect(successCount).toBe(100);
    expect(sim.resources.stone).toBe(0);
  });

  it('rapid overspend attempts should all fail after balance exhausted', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    let failedAfterFirstSuccess = 0;
    for (let i = 0; i < 20; i++) {
      const result = trySpend(sim, { stone: 10 });
      if (!result.success) failedAfterFirstSuccess++;
    }
    // First 5 succeed (50/10), next 15 fail
    expect(sim.resources.stone).toBe(0);
    expect(failedAfterFirstSuccess).toBe(15);
  });
});

describe('SECURITY: addResources — negative/malformed input', () => {
  it('negative stone addition is safely ignored', () => {
    const sim = makeSim({ resources: { stone: 10 } });
    addResources(sim, { stone: -999 });
    expect(sim.resources.stone).toBe(10);
  });

  it('negative crystal addition is safely ignored', () => {
    const sim = makeSim({ resources: { crystal: 10 } });
    addResources(sim, { crystal: -999 });
    expect(sim.resources.crystal).toBe(10);
  });

  it('NaN amount addition is safely ignored', () => {
    const sim = makeSim({ resources: { stone: 10 } });
    addResources(sim, { stone: NaN });
    expect(sim.resources.stone).toBe(10);
  });

  it('Infinity amount caps correctly at storage limit', () => {
    const sim = makeSim({
      resources: { stone: 0 },
      resourceCaps: { stone: 200 },
    });
    addResources(sim, { stone: Infinity });
    // Infinity > space (200), so it caps
    expect(sim.resources.stone).toBe(200);
  });
});

describe('SECURITY: canAfford — edge case cost values', () => {
  it('cost with string values is handled (coercion)', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // String "30" > 0 is true, comparison: 50 < "30" is false
    expect(canAfford(sim, { stone: "30" })).toBe(true);
  });

  it('cost with boolean values is handled', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // true > 0 is true (coerced to 1), 50 < 1 is false
    expect(canAfford(sim, { stone: true })).toBe(true);
  });

  it('cost with very large values (above Number.MAX_SAFE_INTEGER)', () => {
    const sim = makeSim({ resources: { stone: 50 } });
    // 9007199254740992 > 0 is true, 50 < 9e15 is true → can't afford
    expect(canAfford(sim, { stone: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });
});

describe('SECURITY: engine — cap boundary manipulation', () => {
  it('applyStorageUpgrade rejects invalid level (negative)', () => {
    const sim = {};
    initResourceState(sim);
    sim.resourceCaps = { stone: 200, crystal: 50, essence: 100 };
    applyStorageUpgrade(sim, 'stone', -1);
    // Should not change caps with negative level
    expect(sim.resourceCaps.stone).toBe(200);
  });

  it('applyStorageUpgrade rejects invalid level (too high)', () => {
    const sim = {};
    initResourceState(sim);
    sim.resourceCaps = { stone: 200, crystal: 50, essence: 100 };
    applyStorageUpgrade(sim, 'stone', 99);
    // Level 99 doesn't exist in the array (max is 3)
    expect(sim.resourceCaps.stone).toBe(200);
  });

  it('applyStorageUpgrade rejects invalid type', () => {
    const sim = {};
    initResourceState(sim);
    sim.resourceCaps = { stone: 200, crystal: 50, essence: 100 };
    applyStorageUpgrade(sim, '__proto__', 1);
    expect(sim.resourceCaps.stone).toBe(200);
  });
});

describe('SECURITY: engine — essence accumulation rate limit bypass attempt', () => {
  it('cannot accelerate essence by calling resourceTick multiple times per frame', () => {
    const sim = {};
    initResourceState(sim);
    // Each call should only advance by perTick = 1/600
    for (let i = 0; i < 600; i++) {
      sim.tick = i;
      resourceTick(sim);
    }
    expect(sim.resources.essence).toBe(1);
    // Calling extra ticks at same tick number should at most accumulate
    // once (though currently it would accumulate every call since tick
    // number doesn't gate accumulation)
  });

  it('essence accumulator is now rate-limited per tick — multiple calls at same tick are no-ops', () => {
    // After the _lastResourceTick guard fix, multiple calls at the same tick
    // are no-ops. Only the first call accumulates essence.
    const sim = {};
    initResourceState(sim);
    sim.tick = 0;
    resourceTick(sim);
    resourceTick(sim); // Second call at same tick — no-op (rate-limited)
    resourceTick(sim); // Third call at same tick — no-op (rate-limited)
    // Only the first call adds 1/600 to essenceAccum
    expect(sim.essenceAccum).toBeCloseTo(1 / 600, 5);
    // The rate-limit guard prevents attackers from calling resourceTick()
    // in a loop to accelerate Essence beyond the intended 1/10s rate.
  });
});

describe('SECURITY: enemies — drop RNG manipulation', () => {
  it('processCrystalDrop respects injected RNG but could be called repeatedly', () => {
    const sim = {};
    initResourceState(sim);
    const enemy = { type: 'boss', x: 0, y: 0 };
    // Multiple drops from the same enemy death
    processCrystalDrop(sim, enemy, () => 0.0);
    processCrystalDrop(sim, enemy, () => 0.0);
    processCrystalDrop(sim, enemy, () => 0.0);
    // Each call adds 3 Crystal (boss guaranteed). No dedup by enemy ID.
    // The caller (death handler) is responsible for calling once/enemy.
    expect(sim.resources.crystal).toBe(9); // 3 × 3 = 9
    // This is NOT a bug in processCrystalDrop — it's the caller's
    // responsibility to ensure it's called once per death.
  });
});
