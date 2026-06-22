/**
 * resource.js — Resource policy module.
 *
 * This module contains the DECISIONS (can I afford this? what can I afford?),
 * not the VERBS (add resource, spend resource) which live in mechanics.
 *
 * It is the single authoritative gate for all resource mutations.
 * No code outside this module mutates sim.resources directly —
 * this is the invariant that prevents negative balances.
 *
 * Tick ordering within each sim tick:
 *   1. Accumulate — Essence fractional tick, Crystal drops
 *   2. Validate   — All pending purchases check canAfford()
 *   3. Spend      — Deduct costs for validated purchases
 *   4. Cap Check  — Enforce caps on all resources
 *   5. HUD Update — Push new resource state to HUD
 */

import { RESOURCE } from './config.js';

// ── Atomic Spend Gate ───────────────────────────────────────────────

/**
 * Check if the player can afford a cost object.
 * Cost is { stone?: number, crystal?: number, essence?: number }.
 * Returns true only if ALL present fields are ≤ current balance.
 *
 * @param {object} sim — sim state with sim.resources
 * @param {object} cost — { stone?, crystal?, essence? }
 * @returns {boolean}
 */
export function canAfford(sim, cost) {
  if (!cost) return true;

  const { resources } = sim;

  // Check each resource type present in the cost
  if (cost.stone !== undefined && cost.stone > 0) {
    if (resources.stone < cost.stone) return false;
  }
  if (cost.crystal !== undefined && cost.crystal > 0) {
    if (resources.crystal < cost.crystal) return false;
  }
  if (cost.essence !== undefined && cost.essence > 0) {
    if (resources.essence < cost.essence) return false;
  }

  return true;
}

/**
 * Attempt to spend resources. Deducts only if canAfford passes.
 * Returns { success: boolean, reason?: string }.
 * On failure, no resources are deducted — all-or-nothing atomic.
 * This is the SINGLE point of resource deduction in the entire system.
 *
 * @param {object} sim — sim state (mutated on success)
 * @param {object} cost — { stone?, crystal?, essence? }
 * @returns {{ success: boolean, reason?: string }}
 */
export function trySpend(sim, cost) {
  if (!cost || Object.keys(cost).length === 0) {
    return { success: true };
  }

  // Validate cost keys against known resource types.
  // Unknown keys are rejected to prevent injection of spurious
  // resource types or key-based exploits.
  const VALID_COST_KEYS = ['stone', 'crystal', 'essence'];
  for (const key of Object.keys(cost)) {
    if (!VALID_COST_KEYS.includes(key)) {
      return { success: false, reason: `Unknown cost key: ${key}` };
    }
  }

  // Validate cost values: reject negative, NaN, Infinity, and non-number types.
  for (const [key, val] of Object.entries(cost)) {
    if (typeof val !== 'number' || val < 0 || !Number.isFinite(val)) {
      return { success: false, reason: `Invalid cost: ${key}=${val}` };
    }
  }

  if (!canAfford(sim, cost)) {
    // Build a descriptive reason
    const failures = [];
    const { resources } = sim;
    if (cost.stone && resources.stone < cost.stone) {
      failures.push(`Stone: need ${cost.stone}, have ${resources.stone}`);
    }
    if (cost.crystal && resources.crystal < cost.crystal) {
      failures.push(`Crystal: need ${cost.crystal}, have ${resources.crystal}`);
    }
    if (cost.essence && resources.essence < cost.essence) {
      failures.push(`Essence: need ${cost.essence}, have ${resources.essence}`);
    }
    return {
      success: false,
      reason: `Cannot afford: ${failures.join('; ')}`,
    };
  }

  // All-or-nothing: deduct all at once
  if (cost.stone) sim.resources.stone -= cost.stone;
  if (cost.crystal) sim.resources.crystal -= cost.crystal;
  if (cost.essence) sim.resources.essence -= cost.essence;

  return { success: true };
}

// ── Resource Accumulation ───────────────────────────────────────────

/**
 * Add resources to the pool. Enforces caps — excess is discarded.
 * Used by harvest deposits, crystal drops, and essence accumulation.
 *
 * Returns structured result showing what was added vs discarded
 * so the renderer can show "+1 Crystal" or "Storage Full" variants.
 *
 * @param {object} sim — sim state (mutated)
 * @param {object} amounts — { stone?, crystal?, essence? }
 * @returns {{ added: { stone: number, crystal: number, essence: number },
 *             discarded: { stone: number, crystal: number, essence: number } }}
 */
export function addResources(sim, amounts) {
  const result = {
    added: { stone: 0, crystal: 0, essence: 0 },
    discarded: { stone: 0, crystal: 0, essence: 0 },
  };

  if (!amounts) return result;

  const { resources, resourceCaps } = sim;

  for (const type of ['stone', 'crystal', 'essence']) {
    const amount = amounts[type];
    if (amount === undefined || amount <= 0 || Number.isNaN(amount)) continue;

    const current = resources[type];
    const cap = resourceCaps[type];
    const space = cap - current;

    if (space <= 0) {
      // Already at or above cap — discard everything
      result.discarded[type] = amount;
    } else if (amount <= space) {
      // Fits entirely
      resources[type] += amount;
      result.added[type] = amount;
    } else {
      // Partial fit — add what fits, discard the rest
      resources[type] = cap;
      result.added[type] = space;
      result.discarded[type] = amount - space;
    }
  }

  return result;
}

// ── HUD Data Building ───────────────────────────────────────────────

/**
 * Compute per-second accumulation rates for HUD display.
 *
 * @param {object} sim — sim state
 * @returns {{ stonePerSec: number, crystalPerSec: number, essencePerSec: number }}
 */
export function getResourceRates(sim) {
  const rates = {
    stonePerSec: 0,
    crystalPerSec: 0,
    essencePerSec: 0,
  };

  // Essence: always 0.1/s unless at cap or paused
  const atEssenceCap = sim.resources.essence >= sim.resourceCaps.essence;
  if (!atEssenceCap) {
    // 1 per 600 ticks = 1 per 10 seconds = 0.1 per second
    rates.essencePerSec = 1 / 10; // 0.1
  }

  // Stone: compute from active harvesters if history is available
  if (sim.resourceHistory && sim.resourceHistory.length >= 2) {
    const history = sim.resourceHistory;
    const recent = history.slice(-2);
    const tickDelta = recent[1].tick - recent[0].tick;
    const stoneDelta = recent[1].stone - recent[0].stone;
    if (tickDelta > 0 && stoneDelta > 0) {
      // Convert from per-tick to per-second (60 ticks/sec)
      rates.stonePerSec = (stoneDelta / tickDelta) * 60;
    }
  }

  // Crystal: volatile — use rolling window if history available
  if (sim.resourceHistory && sim.resourceHistory.length >= 2) {
    const history = sim.resourceHistory;
    const recent = history.slice(-2);
    const tickDelta = recent[1].tick - recent[0].tick;
    const crystalDelta = recent[1].crystal - recent[0].crystal;
    if (tickDelta > 0 && crystalDelta > 0) {
      rates.crystalPerSec = (crystalDelta / tickDelta) * 60;
    }
  }

  return rates;
}

/**
 * Check which resources are at their storage caps.
 *
 * @param {object} sim — sim state
 * @returns {{ stone: boolean, crystal: boolean, essence: boolean }}
 */
export function checkCaps(sim) {
  const { resources, resourceCaps } = sim;
  return {
    stone: resources.stone >= resourceCaps.stone,
    crystal: resources.crystal >= resourceCaps.crystal,
    essence: resources.essence >= resourceCaps.essence,
  };
}

/**
 * Build a complete HUD data snapshot from current sim resource state.
 * Called once per tick after all resource mutations (step 5 of tick ordering).
 *
 * @param {object} sim — sim state
 * @returns {object} ResourceHUDData
 */
export function buildResourceHUD(sim) {
  const { resources, resourceCaps } = sim;
  const caps = checkCaps(sim);
  const rates = getResourceRates(sim);

  const hud = {
    resources: {
      stone: {
        current: resources.stone,
        cap: resourceCaps.stone,
        rate: rates.stonePerSec,
        rateSource: buildRateSource('stone', sim, rates, caps),
        atCap: caps.stone,
      },
      crystal: {
        current: resources.crystal,
        cap: resourceCaps.crystal,
        rate: rates.crystalPerSec,
        rateSource: buildRateSource('crystal', sim, rates, caps),
        atCap: caps.crystal,
      },
      essence: {
        current: resources.essence,
        cap: resourceCaps.essence,
        rate: rates.essencePerSec,
        rateSource: buildRateSource('essence', sim, rates, caps),
        atCap: caps.essence,
      },
    },
    anyAtCap: caps.stone || caps.crystal || caps.essence,
    canAffordAnything: false,
  };

  // Compute canAffordAnything from purchasable items
  if (sim.purchasableItems && sim.purchasableItems.length > 0) {
    hud.canAffordAnything = sim.purchasableItems.some((item) =>
      canAfford(sim, item.cost)
    );
  }

  return hud;
}

/**
 * Build a human-readable rate source string for HUD display.
 *
 * @param {string} type — 'stone' | 'crystal' | 'essence'
 * @param {object} sim
 * @param {object} rates
 * @param {object} caps
 * @returns {string}
 */
function buildRateSource(type, sim, rates, caps) {
  if (caps[type]) {
    return 'Capped';
  }

  switch (type) {
    case 'stone': {
      if (rates.stonePerSec <= 0) return '\u2014'; // em-dash
      // Estimate bot count: each bot produces 1 stone per 120 ticks = 0.5/s
      const estimatedBots = Math.round(rates.stonePerSec / 0.5);
      return `${estimatedBots} bot${estimatedBots !== 1 ? 's' : ''} harvesting`;
    }
    case 'crystal': {
      if (rates.crystalPerSec <= 0) return '\u2014';
      return 'From combat drops';
    }
    case 'essence': {
      if (rates.essencePerSec <= 0) return caps.essence ? 'Capped' : '\u2014';
      return `+${rates.essencePerSec.toFixed(1)}/s`;
    }
    default:
      return '\u2014';
  }
}

// ── Purchase Filtering ──────────────────────────────────────────────

/**
 * Get the list of purchasable items the player can currently afford.
 * Used to drive UI button enable/disable state.
 *
 * @param {object} sim — sim state with sim.purchasableItems
 * @returns {Array<{ id: string, label: string, cost: object }>}
 */
export function getAffordablePurchases(sim) {
  if (!sim.purchasableItems || sim.purchasableItems.length === 0) {
    return [];
  }

  return sim.purchasableItems.filter((item) => canAfford(sim, item.cost));
}
