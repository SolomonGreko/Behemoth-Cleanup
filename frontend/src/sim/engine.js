/**
 * engine.js — Resource tick integration.
 *
 * Extends the main game loop with the resource economy tick.
 * Wires resource accumulation, spending validation, cap enforcement,
 * and HUD updates into the sim tick cycle.
 *
 * Tick ordering (per sim tick):
 *   1. Accumulate — Essence fractional tick, Crystal drops (from enemies that died this tick)
 *   2. Validate   — All pending purchases check canAfford()
 *   3. Spend      — Deduct costs for validated purchases
 *   4. Cap Check  — Enforce caps on all resources
 *   5. HUD Update — Push new resource state to HUD
 */

import { RESOURCE, ECON } from './config.js';
import {
  addResources,
  buildResourceHUD,
} from './resource.js';

// ── Resource State Initialization ───────────────────────────────────

/**
 * Initialize resource state on a sim object.
 * Called once at game start and on reset.
 *
 * @param {object} sim — sim object to initialize
 */
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

  // Rolling history for rate computation (store snapshots every N ticks)
  sim.resourceHistory = [];

  // Purchasable items — populated by upgrade system, UI, etc.
  sim.purchasableItems = [];

  // Rate-limit guard: tracks last tick resourceTick was called.
  // -1 ensures the first call at tick 0 passes the guard.
  sim._lastResourceTick = -1;
}

/**
 * Reset resources to starting values (new game / regenerate).
 * Storage upgrades are lost; caps return to defaults.
 *
 * @param {object} sim
 */
export function resetResources(sim) {
  initResourceState(sim);
}

// ── Resource Tick ───────────────────────────────────────────────────

/**
 * Run the full resource tick.
 * Should be called once per sim tick from the main game loop,
 * after enemy death processing but before HUD render.
 *
 * @param {object} sim — mutable sim state
 * @param {object} [options]
 * @param {boolean} [options.isFrozen=false] — true during FD cinematic / cutscenes
 * @returns {object} HUD data snapshot for this tick
 */
export function resourceTick(sim, options = {}) {
  // Guard: at most once per tick — prevents rate-limit bypass via
  // repeated calls at the same tick number.
  if (sim._lastResourceTick === sim.tick) return sim.resourceHUD;
  sim._lastResourceTick = sim.tick;

  const { isFrozen = false } = options;

  // Step 1: Accumulate
  accumulateEssence(sim, isFrozen);
  // (Crystal drops from enemy deaths are processed inline in enemies.js
  //  before this tick — they call addResources directly.)

  // Step 2-3: Validate + Spend
  // Pending purchases are validated and spent by their respective systems
  // (bots.js, behemoth.js, upgrade UI) via trySpend().
  // This function does not process purchases — it only accumulates.

  // Step 4: Cap Check — enforced inline by addResources

  // Record history snapshot for rate computation (every 60 ticks = 1 second)
  if (sim.tick % 60 === 0) {
    sim.resourceHistory.push({
      tick: sim.tick,
      stone: sim.resources.stone,
      crystal: sim.resources.crystal,
      essence: sim.resources.essence,
    });
    // Keep only the last 60 snapshots (60 seconds of history)
    if (sim.resourceHistory.length > 60) {
      sim.resourceHistory.shift();
    }
  }

  // Step 5: HUD Update
  const hudData = buildResourceHUD(sim);
  sim.resourceHUD = hudData;

  return hudData;
}

// ── Essence Accumulation ────────────────────────────────────────────

/**
 * Accumulate Essence for one tick.
 *
 * Essence uses a fractional accumulator (sim.essenceAccum).
 * Each tick: sim.essenceAccum += RESOURCE.essence.perTick.
 * When the accumulator crosses a whole-number threshold,
 * the difference is added to the Essence pool.
 *
 * At cap: accumulation stops. The accumulator is reset to 0
 * to prevent credit-on-spend exploits (you can't bank fractional
 * Essence above cap, spend down, and immediately get credit).
 *
 * Paused during Frozen state (FD cinematic, cutscenes).
 *
 * @param {object} sim
 * @param {boolean} isFrozen
 */
function accumulateEssence(sim, isFrozen) {
  if (isFrozen) return; // Paused during cinematic freeze

  const atCap = sim.resources.essence >= sim.resourceCaps.essence;
  if (atCap) {
    // Reset accumulator to prevent credit-on-spend exploit:
    // if we kept the fraction and player spent down, they'd get
    // immediate credit from the banked fraction.
    sim.essenceAccum = 0.0;
    return;
  }

  // Accumulate fractional Essence
  sim.essenceAccum += RESOURCE.essence.perTick;

  const wholeEssence = Math.floor(sim.essenceAccum);
  const currentEssence = sim.resources.essence;

  if (wholeEssence > currentEssence) {
    const toAdd = wholeEssence - currentEssence;
    const result = addResources(sim, { essence: toAdd });

    // If we hit cap during addition, reset accumulator
    if (sim.resources.essence >= sim.resourceCaps.essence) {
      sim.essenceAccum = 0.0;
    }
    // Note: result.discarded tells us if excess was discarded
  }
}

// ── Storage Upgrades ────────────────────────────────────────────────

/**
 * Upgrade the storage cap for a resource type.
 * Called by the upgrade system after cost validation.
 *
 * @param {object} sim
 * @param {'stone'|'crystal'|'essence'} type
 * @param {number} level — 0-3 (0 = default)
 */
export function applyStorageUpgrade(sim, type, level) {
  const upgrades = RESOURCE.storageUpgrades[type];
  if (!upgrades || level < 0 || level >= upgrades.length) return;

  const capIncrease = RESOURCE[type].capUpgradePerLevel * level;
  sim.resourceCaps[type] = RESOURCE[type].cap + capIncrease;
}
