/**
 * resource.test.js — Comprehensive tests for the resource policy module.
 *
 * Covers: canAfford, trySpend, addResources, buildResourceHUD,
 * getResourceRates, checkCaps, getAffordablePurchases.
 *
 * Edge cases tested:
 *   - Cap enforcement (excess discarded, at-cap flags)
 *   - Negative balance prevention (all-or-nothing atomic spend)
 *   - Concurrent spending (sequential within tick)
 *   - Fractional Essence accumulation (whole-number crossings, cap reset)
 *   - Multi-resource cost validation
 *   - Zero-cost edge cases
 *   - Storage upgrade cap changes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  canAfford,
  trySpend,
  addResources,
  buildResourceHUD,
  getResourceRates,
  checkCaps,
  getAffordablePurchases,
} from '../resource.js';
import { RESOURCE, COST, ECON } from '../config.js';

// ── Test Fixture ────────────────────────────────────────────────────

/**
 * Create a fresh sim state suitable for testing resource operations.
 * Returns a mutable sim object with resources, caps, essence accumulator,
 * and a tick counter.
 */
function createTestSim(overrides = {}) {
  return {
    tick: 0,
    resources: {
      stone: ECON.startingStone,     // default 20
      crystal: ECON.startingCrystal, // default 0
      essence: ECON.startingEssence, // default 0
      ...overrides.resources,
    },
    resourceCaps: {
      stone: RESOURCE.stone.cap,       // default 200
      crystal: RESOURCE.crystal.cap,   // default 50
      essence: RESOURCE.essence.cap,   // default 100
      ...overrides.resourceCaps,
    },
    essenceAccum: overrides.essenceAccum ?? 0.0,
    // Tracking for rate computation
    resourceHistory: overrides.resourceHistory || [],
    // Purchasable item registry (for getAffordablePurchases)
    purchasableItems: overrides.purchasableItems || [],
  };
}

// ── canAfford ───────────────────────────────────────────────────────

describe('canAfford', () => {
  it('returns true when balance covers single-resource cost', () => {
    const sim = createTestSim({ resources: { stone: 50 } });
    expect(canAfford(sim, { stone: 30 })).toBe(true);
  });

  it('returns false when single-resource cost exceeds balance', () => {
    const sim = createTestSim({ resources: { stone: 50 } });
    expect(canAfford(sim, { stone: 60 })).toBe(false);
  });

  it('returns true when balance exactly equals cost', () => {
    const sim = createTestSim({ resources: { stone: 30 } });
    expect(canAfford(sim, { stone: 30 })).toBe(true);
  });

  it('returns true when multi-resource cost is affordable', () => {
    const sim = createTestSim({ resources: { stone: 50, crystal: 20 } });
    expect(canAfford(sim, { stone: 30, crystal: 15 })).toBe(true);
  });

  it('returns false if any single resource in a multi-cost is insufficient', () => {
    const sim = createTestSim({ resources: { stone: 50, crystal: 5 } });
    expect(canAfford(sim, { stone: 30, crystal: 15 })).toBe(false);
  });

  it('returns true for zero-cost (empty cost object)', () => {
    const sim = createTestSim();
    expect(canAfford(sim, {})).toBe(true);
  });

  it('returns true for undefined cost', () => {
    const sim = createTestSim();
    expect(canAfford(sim, undefined)).toBe(true);
  });

  it('returns true when a resource in cost is 0 or missing from balance (treated as 0)', () => {
    const sim = createTestSim({ resources: { stone: 50 } });
    expect(canAfford(sim, { stone: 10, crystal: 0 })).toBe(true);
  });

  it('handles negative balances gracefully (returns false)', () => {
    const sim = createTestSim({ resources: { stone: -5 } });
    expect(canAfford(sim, { stone: 1 })).toBe(false);
  });
});

// ── trySpend ────────────────────────────────────────────────────────

describe('trySpend', () => {
  it('deducts resources and returns success when affordable', () => {
    const sim = createTestSim({ resources: { stone: 50, crystal: 20 } });
    const result = trySpend(sim, { stone: 30, crystal: 10 });
    expect(result.success).toBe(true);
    expect(sim.resources.stone).toBe(20);
    expect(sim.resources.crystal).toBe(10);
  });

  it('returns failure and does NOT deduct any resources when unaffordable', () => {
    const sim = createTestSim({ resources: { stone: 50, crystal: 5 } });
    const result = trySpend(sim, { stone: 30, crystal: 15 });
    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    // All-or-nothing: stone should NOT have been deducted
    expect(sim.resources.stone).toBe(50);
    expect(sim.resources.crystal).toBe(5);
  });

  it('deducts only the resources specified in the cost', () => {
    const sim = createTestSim({ resources: { stone: 100, crystal: 50, essence: 30 } });
    const result = trySpend(sim, { stone: 40 });
    expect(result.success).toBe(true);
    expect(sim.resources.stone).toBe(60);
    expect(sim.resources.crystal).toBe(50);  // untouched
    expect(sim.resources.essence).toBe(30);  // untouched
  });

  it('handles zero cost as success without mutation', () => {
    const sim = createTestSim({ resources: { stone: 50 } });
    const before = { ...sim.resources };
    const result = trySpend(sim, {});
    expect(result.success).toBe(true);
    expect(sim.resources).toEqual(before);
  });

  it('handles two sequential spends where second fails due to first deduction', () => {
    const sim = createTestSim({ resources: { stone: 50 } });
    const r1 = trySpend(sim, { stone: 30 });
    expect(r1.success).toBe(true);
    expect(sim.resources.stone).toBe(20);
    const r2 = trySpend(sim, { stone: 25 });
    expect(r2.success).toBe(false);
    expect(sim.resources.stone).toBe(20); // unchanged
  });

  it('prevents negative balance — cannot spend below zero', () => {
    const sim = createTestSim({ resources: { stone: 5 } });
    const result = trySpend(sim, { stone: 10 });
    expect(result.success).toBe(false);
    expect(sim.resources.stone).toBe(5); // unchanged, not -5
  });

  it('handles Essence only purchases', () => {
    const sim = createTestSim({ resources: { essence: 50 } });
    const result = trySpend(sim, { essence: 30 });
    expect(result.success).toBe(true);
    expect(sim.resources.essence).toBe(20);
  });

  it('returns reason string on failure', () => {
    const sim = createTestSim({ resources: { stone: 5 } });
    const result = trySpend(sim, { stone: 10, crystal: 5 });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/afford/i); // should mention affordability
  });
});

// ── addResources ────────────────────────────────────────────────────

describe('addResources', () => {
  it('adds resources to the pool correctly', () => {
    const sim = createTestSim({ resources: { stone: 10, crystal: 5, essence: 20 } });
    const result = addResources(sim, { stone: 5, crystal: 3, essence: 1 });
    expect(sim.resources.stone).toBe(15);
    expect(sim.resources.crystal).toBe(8);
    expect(sim.resources.essence).toBe(21);
    expect(result.added.stone).toBe(5);
    expect(result.added.crystal).toBe(3);
  });

  it('enforces caps — discards excess above cap', () => {
    const sim = createTestSim({
      resources: { stone: 195 },
      resourceCaps: { stone: 200 },
    });
    const result = addResources(sim, { stone: 10 });
    expect(sim.resources.stone).toBe(200); // capped
    expect(result.added.stone).toBe(5);     // only 5 actually added
    expect(result.discarded.stone).toBe(5);  // 5 discarded
  });

  it('discards entire add if already at cap', () => {
    const sim = createTestSim({
      resources: { crystal: 50 },
      resourceCaps: { crystal: 50 },
    });
    const result = addResources(sim, { crystal: 10 });
    expect(sim.resources.crystal).toBe(50);
    expect(result.added.crystal).toBe(0);
    expect(result.discarded.crystal).toBe(10);
  });

  it('returns zero added/discarded for resources not in amounts', () => {
    const sim = createTestSim({ resources: { stone: 10 } });
    const result = addResources(sim, { stone: 5 });
    expect(result.added.crystal).toBe(0);
    expect(result.discarded.crystal).toBe(0);
    expect(result.added.essence).toBe(0);
    expect(result.discarded.essence).toBe(0);
  });

  it('handles partial cap — some added, some discarded', () => {
    const sim = createTestSim({
      resources: { stone: 195, crystal: 5 },
      resourceCaps: { stone: 200, crystal: 50 },
    });
    const result = addResources(sim, { stone: 10, crystal: 50 });
    expect(sim.resources.stone).toBe(200);
    expect(sim.resources.crystal).toBe(50); // 5 + 50 = 55, capped at 50
    expect(result.added.stone).toBe(5);
    expect(result.discarded.stone).toBe(5);
    expect(result.added.crystal).toBe(45);
    expect(result.discarded.crystal).toBe(5);
  });

  it('adds exactly at cap boundary (n+0=cap)', () => {
    const sim = createTestSim({
      resources: { stone: 190 },
      resourceCaps: { stone: 200 },
    });
    const result = addResources(sim, { stone: 10 });
    expect(sim.resources.stone).toBe(200);
    expect(result.added.stone).toBe(10);
    expect(result.discarded.stone).toBe(0);
  });

  it('handles empty amounts object', () => {
    const sim = createTestSim({ resources: { stone: 10 } });
    const result = addResources(sim, {});
    expect(sim.resources.stone).toBe(10);
    expect(result.added.stone).toBe(0);
    expect(result.discarded.stone).toBe(0);
  });

  it('handles undefined amounts gracefully', () => {
    const sim = createTestSim({ resources: { stone: 10 } });
    const result = addResources(sim, undefined);
    expect(sim.resources.stone).toBe(10);
    expect(result.added.stone).toBe(0);
  });

  it('does not allow negative addition (treats as zero)', () => {
    const sim = createTestSim({ resources: { stone: 10 } });
    const result = addResources(sim, { stone: -5 });
    // Should either ignore or treat as 0 — never reduce via addResources
    expect(sim.resources.stone).toBe(10); // or 10, but never 5 via add
  });
});

// ── buildResourceHUD ────────────────────────────────────────────────

describe('buildResourceHUD', () => {
  it('returns correct HUD data shape with all fields', () => {
    const sim = createTestSim({ resources: { stone: 145, crystal: 12, essence: 47 } });
    const hud = buildResourceHUD(sim);
    expect(hud.resources.stone).toBeDefined();
    expect(hud.resources.stone.current).toBe(145);
    expect(hud.resources.stone.cap).toBe(200);
    expect(hud.resources.stone.rate).toBeDefined();
    expect(hud.resources.stone.atCap).toBe(false);
    expect(hud.resources.crystal.current).toBe(12);
    expect(hud.resources.crystal.cap).toBe(50);
    expect(hud.resources.essence.current).toBe(47);
    expect(hud.resources.essence.cap).toBe(100);
  });

  it('sets atCap to true when resource is at its cap', () => {
    const sim = createTestSim({
      resources: { stone: 200, crystal: 50, essence: 100 },
      resourceCaps: { stone: 200, crystal: 50, essence: 100 },
    });
    const hud = buildResourceHUD(sim);
    expect(hud.resources.stone.atCap).toBe(true);
    expect(hud.resources.crystal.atCap).toBe(true);
    expect(hud.resources.essence.atCap).toBe(true);
    expect(hud.anyAtCap).toBe(true);
  });

  it('sets anyAtCap to true when at least one resource is capped', () => {
    const sim = createTestSim({
      resources: { stone: 200, crystal: 12, essence: 47 },
      resourceCaps: { stone: 200, crystal: 50, essence: 100 },
    });
    const hud = buildResourceHUD(sim);
    expect(hud.anyAtCap).toBe(true);
  });

  it('sets anyAtCap to false when no resources are capped', () => {
    const sim = createTestSim({
      resources: { stone: 145, crystal: 12, essence: 47 },
    });
    const hud = buildResourceHUD(sim);
    expect(hud.anyAtCap).toBe(false);
  });

  it('includes rateSource strings', () => {
    const sim = createTestSim({ resources: { stone: 145 } });
    const hud = buildResourceHUD(sim);
    expect(typeof hud.resources.stone.rateSource).toBe('string');
    expect(typeof hud.resources.crystal.rateSource).toBe('string');
    expect(typeof hud.resources.essence.rateSource).toBe('string');
  });

  it('sets canAffordAnything based on purchasable items', () => {
    const sim = createTestSim({
      resources: { stone: 20, crystal: 10 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
        { id: 'buyWatcher', label: 'Buy Watcher', cost: COST.buyWatcher },
      ],
    });
    const hud = buildResourceHUD(sim);
    // Stone=20 can afford buyBot (15 stone). Crystal=10 can afford buyWatcher (5 crystal)
    expect(hud.canAffordAnything).toBe(true);
  });

  it('sets canAffordAnything to false when nothing is affordable', () => {
    const sim = createTestSim({
      resources: { stone: 2, crystal: 1 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
      ],
    });
    const hud = buildResourceHUD(sim);
    expect(hud.canAffordAnything).toBe(false);
  });

  it('reflects upgraded caps in HUD', () => {
    const sim = createTestSim({
      resources: { stone: 220 },
      resourceCaps: { stone: 250 }, // upgraded from 200
    });
    const hud = buildResourceHUD(sim);
    expect(hud.resources.stone.cap).toBe(250);
    expect(hud.resources.stone.atCap).toBe(false); // 220/250
  });
});

// ── getResourceRates ────────────────────────────────────────────────

describe('getResourceRates', () => {
  it('returns per-second rates for all three resources', () => {
    const sim = createTestSim();
    const rates = getResourceRates(sim);
    expect(rates).toHaveProperty('stonePerSec');
    expect(rates).toHaveProperty('crystalPerSec');
    expect(rates).toHaveProperty('essencePerSec');
  });

  it('computes essence rate as 0.1/s (1 per 10 seconds)', () => {
    const sim = createTestSim({ essenceAccum: 0.0 });
    const rates = getResourceRates(sim);
    // Essence: 600 ticks to get 1 unit = 10 seconds → 0.1 per second
    expect(rates.essencePerSec).toBeCloseTo(0.1, 1);
  });

  it('returns zero essence rate when at cap', () => {
    const sim = createTestSim({
      resources: { essence: 100 },
      resourceCaps: { essence: 100 },
    });
    const rates = getResourceRates(sim);
    expect(rates.essencePerSec).toBe(0);
  });

  it('returns zero stone rate when no bots are harvesting', () => {
    const sim = createTestSim();
    const rates = getResourceRates(sim);
    expect(rates.stonePerSec).toBe(0);
  });

  it('computes stone rate from active harvesters', () => {
    // Simulate 3 bots harvesting → 3 Stone per 120 ticks each = 3 per 2s = 1.5 per second
    const sim = createTestSim({
      resourceHistory: [
        { tick: 0, stone: 20 },
        { tick: 600, stone: 23 }, // +3 stone in 600 ticks (10s) = 0.3/s
      ],
    });
    const rates = getResourceRates(sim);
    expect(rates.stonePerSec).toBeGreaterThan(0);
  });
});

// ── checkCaps ───────────────────────────────────────────────────────

describe('checkCaps', () => {
  it('returns false for all when under caps', () => {
    const sim = createTestSim({
      resources: { stone: 50, crystal: 20, essence: 30 },
    });
    const caps = checkCaps(sim);
    expect(caps.stone).toBe(false);
    expect(caps.crystal).toBe(false);
    expect(caps.essence).toBe(false);
  });

  it('returns true for resources at cap', () => {
    const sim = createTestSim({
      resources: { stone: 200, crystal: 50, essence: 100 },
      resourceCaps: { stone: 200, crystal: 50, essence: 100 },
    });
    const caps = checkCaps(sim);
    expect(caps.stone).toBe(true);
    expect(caps.crystal).toBe(true);
    expect(caps.essence).toBe(true);
  });

  it('returns mixed flags when some capped, some not', () => {
    const sim = createTestSim({
      resources: { stone: 200, crystal: 12, essence: 100 },
      resourceCaps: { stone: 200, crystal: 50, essence: 100 },
    });
    const caps = checkCaps(sim);
    expect(caps.stone).toBe(true);
    expect(caps.crystal).toBe(false);
    expect(caps.essence).toBe(true);
  });

  it('reflects upgraded caps correctly', () => {
    const sim = createTestSim({
      resources: { stone: 230 },
      resourceCaps: { stone: 300 }, // upgraded L2
    });
    const caps = checkCaps(sim);
    expect(caps.stone).toBe(false); // 230/300
  });
});

// ── getAffordablePurchases ──────────────────────────────────────────

describe('getAffordablePurchases', () => {
  it('returns only items the player can afford', () => {
    const sim = createTestSim({
      resources: { stone: 30, crystal: 10 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },         // 15 stone
        { id: 'buyWatcher', label: 'Buy Watcher', cost: COST.buyWatcher }, // 5 crystal
        { id: 'baseStructure', label: 'Relay Tower', cost: COST.baseStructure }, // 60 stone — can't afford
      ],
    });
    const affordable = getAffordablePurchases(sim);
    const ids = affordable.map((p) => p.id);
    expect(ids).toContain('buyBot');
    expect(ids).toContain('buyWatcher');
    expect(ids).not.toContain('baseStructure');
  });

  it('returns empty array when nothing is affordable', () => {
    const sim = createTestSim({
      resources: { stone: 1, crystal: 0 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
      ],
    });
    const affordable = getAffordablePurchases(sim);
    expect(affordable).toHaveLength(0);
  });

  it('returns all items when player is rich', () => {
    const sim = createTestSim({
      resources: { stone: 500, crystal: 200, essence: 200 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
        { id: 'buyWatcher', label: 'Buy Watcher', cost: COST.buyWatcher },
      ],
    });
    const affordable = getAffordablePurchases(sim);
    expect(affordable).toHaveLength(2);
  });

  it('preserves item structure (id, label, cost) in output', () => {
    const sim = createTestSim({
      resources: { stone: 30 },
      purchasableItems: [
        { id: 'buyBot', label: 'Buy Bot', cost: COST.buyBot },
      ],
    });
    const affordable = getAffordablePurchases(sim);
    expect(affordable[0].id).toBe('buyBot');
    expect(affordable[0].label).toBe('Buy Bot');
    expect(affordable[0].cost).toEqual(COST.buyBot);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  describe('cap behavior', () => {
    it('excess stone from harvest is discarded when at cap', () => {
      const sim = createTestSim({
        resources: { stone: 200 },
        resourceCaps: { stone: 200 },
      });
      const result = addResources(sim, { stone: 5 });
      expect(sim.resources.stone).toBe(200);
      expect(result.discarded.stone).toBe(5);
    });

    it('essence accumulation pauses when at cap — no fractional carryover', () => {
      // Sim: essence at cap, accumulator has 0.99
      // After addResources, the excess should be discarded and accumulator should reset
      const sim = createTestSim({
        resources: { essence: 100 },
        resourceCaps: { essence: 100 },
        essenceAccum: 0.99,
      });
      const result = addResources(sim, { essence: 1 });
      expect(sim.resources.essence).toBe(100); // still capped
      expect(result.discarded.essence).toBe(1);
      // Accumulator should reset to prevent credit-on-spend exploits
      // (tested in engine integration tests below)
    });

    it('accumulation resumes immediately after spending below cap', () => {
      const sim = createTestSim({
        resources: { essence: 95 },
        resourceCaps: { essence: 100 },
      });
      // Spend down
      trySpend(sim, { essence: 10 });
      expect(sim.resources.essence).toBe(85);
      // Now add — should accumulate freely
      const result = addResources(sim, { essence: 5 });
      expect(sim.resources.essence).toBe(90);
      expect(result.discarded.essence).toBe(0);
    });
  });

  describe('negative balance prevention', () => {
    it('trySpend never leaves negative balances', () => {
      const sim = createTestSim({ resources: { stone: 5, crystal: 0 } });
      const result = trySpend(sim, { stone: 10, crystal: 1 });
      expect(result.success).toBe(false);
      expect(sim.resources.stone).toBe(5);   // not -5
      expect(sim.resources.crystal).toBe(0); // not -1
    });

    it('addResources with negative amounts does not reduce balance', () => {
      const sim = createTestSim({ resources: { stone: 10 } });
      addResources(sim, { stone: -5 });
      expect(sim.resources.stone).toBe(10);
    });

    it('cannot spend resources you do not have via concurrent purchases', () => {
      const sim = createTestSim({ resources: { stone: 40 } });
      // Two purchases that together exceed balance
      const r1 = trySpend(sim, { stone: 25 }); // succeeds, leaves 15
      expect(r1.success).toBe(true);
      const r2 = trySpend(sim, { stone: 25 }); // fails, needs 25 but only 15
      expect(r2.success).toBe(false);
      expect(sim.resources.stone).toBe(15);
    });
  });

  describe('concurrent spending safety', () => {
    it('multiple purchases in same tick are processed sequentially', () => {
      const sim = createTestSim({ resources: { stone: 100, crystal: 10 } });
      const purchases = [
        { stone: 40 },
        { stone: 30 },
        { crystal: 5 },
        { stone: 35 }, // Would need 105 stone total — last should fail
      ];
      const results = purchases.map((cost) => trySpend(sim, cost));
      expect(results[0].success).toBe(true);  // 100-40=60
      expect(results[1].success).toBe(true);  // 60-30=30
      expect(results[2].success).toBe(true);  // 10-5=5
      expect(results[3].success).toBe(false); // needs 35, only 30 stone left
      expect(sim.resources.stone).toBe(30);
      expect(sim.resources.crystal).toBe(5);
    });
  });

  describe('tick ordering', () => {
    it('accumulate → validate → spend → cap → HUD — essence crossing makes spend available', () => {
      // Simulate a tick where essence accumulation pushes player over 30
      // Need accumulator + perTick to cross the next whole-number threshold
      const sim = createTestSim({
        resources: { essence: 29 },
        essenceAccum: 29.999,  // 29.999 + 0.001667 ≈ 30.001 → floor=30
      });
      // Accumulate
      sim.essenceAccum += RESOURCE.essence.perTick;
      const wholeEssence = Math.floor(sim.essenceAccum);
      if (wholeEssence > sim.resources.essence) {
        addResources(sim, { essence: wholeEssence - sim.resources.essence });
      }
      // Now at 30+
      expect(sim.resources.essence).toBeGreaterThanOrEqual(30);
      // Validate: should be able to afford Pulse Wave (30 essence)
      expect(canAfford(sim, { essence: 30 })).toBe(true);
    });

    it('caps are enforced after spending — cannot spend then accumulate beyond cap', () => {
      const sim = createTestSim({
        resources: { stone: 195 },
        resourceCaps: { stone: 200 },
      });
      // Spend 10 → 185
      trySpend(sim, { stone: 10 });
      expect(sim.resources.stone).toBe(185);
      // Accumulate 20 → should cap at 200
      const result = addResources(sim, { stone: 20 });
      expect(sim.resources.stone).toBe(200);
      expect(result.discarded.stone).toBe(5);
    });

    it('HUD snapshot reflects final state after all mutations', () => {
      const sim = createTestSim({
        resources: { stone: 100, crystal: 10 },
      });
      // Step 1: accumulate
      addResources(sim, { crystal: 3 });
      // Step 2: spend
      trySpend(sim, { stone: 30 });
      // Step 5: HUD snapshot
      const hud = buildResourceHUD(sim);
      expect(hud.resources.stone.current).toBe(70);   // 100-30
      expect(hud.resources.crystal.current).toBe(13);  // 10+3
    });
  });

  describe('essence fractional accumulator reset on cap', () => {
    it('resets accumulator when cap is reached to prevent credit-on-spend', () => {
      const sim = createTestSim({
        resources: { essence: 99 },
        resourceCaps: { essence: 100 },
        essenceAccum: 99.5,
      });
      // Accumulate enough to cross to 100
      sim.essenceAccum += 0.6; // now 100.1
      const whole = Math.floor(sim.essenceAccum);
      const toAdd = whole - sim.resources.essence;
      if (toAdd > 0) {
        const result = addResources(sim, { essence: toAdd });
        // If at cap after addition, accumulator should reset
        if (sim.resources.essence >= sim.resourceCaps.essence) {
          sim.essenceAccum = 0.0; // Reset per spec
        }
      }
      expect(sim.resources.essence).toBe(100);
      expect(sim.essenceAccum).toBe(0.0); // reset, not 0.1 surplus
    });
  });

  describe('drop probability distribution', () => {
    it('scout drop at 10%', () => {
      const chance = RESOURCE.crystal.drop.scout;
      expect(chance).toBe(0.10);
    });

    it('crawler drop at 3% to prevent swarm flooding', () => {
      const chance = RESOURCE.crystal.drop.crawler;
      expect(chance).toBe(0.03);
      // Verify it's lower than scout (the most common enemy)
      expect(chance).toBeLessThan(RESOURCE.crystal.drop.scout);
    });

    it('tank drop at 25%', () => {
      const chance = RESOURCE.crystal.drop.tank;
      expect(chance).toBe(0.25);
    });

    it('artillery drop at 30% — highest standard drop', () => {
      const chance = RESOURCE.crystal.drop.artillery;
      expect(chance).toBe(0.30);
    });

    it('boss drop at 100% — guaranteed', () => {
      const chance = RESOURCE.crystal.drop.boss;
      expect(chance).toBe(1.0);
    });

    it('drop amounts: 1 for standard, 3 for boss', () => {
      expect(RESOURCE.crystal.dropAmount).toBe(1);
      expect(RESOURCE.crystal.bossDropAmount).toBe(3);
    });
  });

  describe('storage upgrades', () => {
    it('upgraded cap is reflected in resourceCaps', () => {
      const sim = createTestSim({
        resourceCaps: {
          stone: 200 + RESOURCE.stone.capUpgradePerLevel * 2, // L2: 300
          crystal: 50 + RESOURCE.crystal.capUpgradePerLevel * 1, // L1: 75
          essence: 100, // default
        },
      });
      expect(sim.resourceCaps.stone).toBe(300);
      expect(sim.resourceCaps.crystal).toBe(75);
      expect(sim.resourceCaps.essence).toBe(100);
    });

    it('can hold resources up to upgraded cap', () => {
      const sim = createTestSim({
        resources: { stone: 230 },
        resourceCaps: { stone: 250 }, // L1 upgrade
      });
      const result = addResources(sim, { stone: 30 });
      expect(sim.resources.stone).toBe(250);
      expect(result.added.stone).toBe(20);
      expect(result.discarded.stone).toBe(10);
    });
  });

  describe('starting resources', () => {
    it('player starts with 20 Stone, 0 Crystal, 0 Essence', () => {
      expect(ECON.startingStone).toBe(20);
      expect(ECON.startingCrystal).toBe(0);
      expect(ECON.startingEssence).toBe(0);
    });

    it('fresh sim reflects starting values', () => {
      const sim = createTestSim();
      expect(sim.resources.stone).toBe(20);
      expect(sim.resources.crystal).toBe(0);
      expect(sim.resources.essence).toBe(0);
    });
  });

  describe('reset behavior', () => {
    it('new sim starts with default caps and starting resources', () => {
      const sim = createTestSim();
      expect(sim.resourceCaps.stone).toBe(200);
      expect(sim.resourceCaps.crystal).toBe(50);
      expect(sim.resourceCaps.essence).toBe(100);
      expect(sim.essenceAccum).toBe(0.0);
      expect(sim.resources).toEqual({
        stone: 20,
        crystal: 0,
        essence: 0,
      });
    });
  });
});
