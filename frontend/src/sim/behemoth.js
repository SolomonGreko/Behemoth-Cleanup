/**
 * behemoth.js — Essence ability integration.
 *
 * Wires Essence-based abilities into the sim:
 *   - Pulse Wave: 30 Essence, AoE damage to all enemies within 6 cells
 *   - Final Defense Hasten: 50 Essence, reduces FD charge time by 50%
 *   - Emergency Shield: 20 Essence, 5-second base invulnerability
 *
 * All abilities validate cost via trySpend before executing.
 */

import { RESOURCE } from './config.js';
import { trySpend } from './resource.js';

// ── Ability Definitions ─────────────────────────────────────────────

/**
 * Ability action identifiers.
 */
export const ESSENCE_ABILITIES = {
  PULSE_WAVE: 'pulseWave',
  FINAL_DEFENSE_HASTEN: 'finalDefenseHasten',
  EMERGENCY_SHIELD: 'emergencyShield',
};

/**
 * Cooldown tracker for time-gated abilities.
 * Keyed by ability name, stores the tick when cooldown expires.
 * Scoped to sim._abilityCooldowns to prevent cross-instance corruption.
 */

/**
 * Use an Essence ability.
 * Validates cost, deducts Essence, applies the ability effect.
 *
 * @param {object} sim
 * @param {string} ability — one of ESSENCE_ABILITIES
 * @returns {{ success: boolean, reason?: string }}
 */
export function useEssenceAbility(sim, ability) {
  const config = RESOURCE.abilities[ability];
  if (!config) {
    return { success: false, reason: `Unknown ability: ${ability}` };
  }

  // Check cooldown
  const cooldowns = sim._abilityCooldowns;
  const cooldownExpiry = cooldowns[ability] ?? 0;
  if (sim.tick < cooldownExpiry) {
    const remainingTicks = cooldownExpiry - sim.tick;
    const remainingSec = Math.ceil(remainingTicks / 60);
    return {
      success: false,
      reason: `${ability} on cooldown (${remainingSec}s remaining)`,
    };
  }

  // Check and deduct cost
  const cost = { essence: config.essence };
  const spendResult = trySpend(sim, cost);

  if (!spendResult.success) {
    return spendResult;
  }

  // Apply ability effect
  applyAbilityEffect(sim, ability);

  // Set cooldown
  if (config.cooldownTicks > 0) {
    cooldowns[ability] = sim.tick + config.cooldownTicks;
  }

  return { success: true };
}

/**
 * Apply the effect of an Essence ability.
 * Called after cost is deducted.
 *
 * @param {object} sim
 * @param {string} ability
 */
function applyAbilityEffect(sim, ability) {
  switch (ability) {
    case ESSENCE_ABILITIES.PULSE_WAVE:
      applyPulseWave(sim);
      break;
    case ESSENCE_ABILITIES.FINAL_DEFENSE_HASTEN:
      applyFDHasten(sim);
      break;
    case ESSENCE_ABILITIES.EMERGENCY_SHIELD:
      applyEmergencyShield(sim);
      break;
  }
}

// ── Pulse Wave ──────────────────────────────────────────────────────

/**
 * Pulse Wave: Instant AoE damage (5 HP) to all enemies within
 * 6 cells of the base center. Clears nearby threats.
 * Kills scouts (1-hit), damages crawlers (3 HP → 2 hits needed),
 * damages but doesn't kill tanks and artillery.
 */
function applyPulseWave(sim) {
  const centerX = sim.baseCenter?.x ?? 0;
  const centerY = sim.baseCenter?.y ?? 0;
  const range = 6; // cells
  const damage = 5; // HP

  if (!sim.enemies) return;

  for (const enemy of sim.enemies) {
    if (enemy.hp <= 0) continue;

    const dx = enemy.x - centerX;
    const dy = enemy.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= range) {
      enemy.hp -= damage;
      if (enemy.hp <= 0) {
        enemy.hp = 0;
        // Enemy death processing (including Crystal drops) handled by
        // the main enemy death handler
      }
    }
  }

  // Track last pulse wave tick for UI feedback
  sim.lastPulseWaveTick = sim.tick;
}

// ── Final Defense Hasten ────────────────────────────────────────────

/**
 * Final Defense Hasten: Reduces FD charge time by 50%.
 * From 5 seconds (300 ticks) to 2.5 seconds (150 ticks).
 * Only available when FD is in its charge-up phase.
 * One use per FD cycle.
 *
 * @param {object} sim
 */
function applyFDHasten(sim) {
  // Only works during FD charge-up phase
  if (!sim.finalDefense || sim.finalDefense.phase !== 'charging') {
    // Refund? No — spec says "If the base is not in FD mode,
    // Essence cannot trigger FD from nothing." Cost was already deducted.
    // This is a no-op if used at wrong time — player knowledge check.
    return;
  }

  // Halve the charge time
  sim.finalDefense.chargeTime = Math.ceil(sim.finalDefense.chargeTime / 2);
  sim.lastFDHastenTick = sim.tick;
}

// ── Emergency Shield ────────────────────────────────────────────────

/**
 * Emergency Shield: 5-second invulnerability shield on base.
 * Absorbs all damage to base HP during duration.
 * Does NOT prevent wall segments from being destroyed — only base HP is protected.
 *
 * @param {object} sim
 */
function applyEmergencyShield(sim) {
  const durationTicks = 5 * 60; // 5 seconds at 60fps

  sim.emergencyShield = {
    active: true,
    expiresAt: sim.tick + durationTicks,
  };

  sim.lastShieldTick = sim.tick;
}

/**
 * Check if the emergency shield is currently active.
 * Called by the damage system before applying damage to base HP.
 *
 * @param {object} sim
 * @returns {boolean}
 */
export function isShieldActive(sim) {
  if (!sim.emergencyShield?.active) return false;
  if (sim.tick >= sim.emergencyShield.expiresAt) {
    sim.emergencyShield.active = false;
    return false;
  }
  return true;
}

/**
 * Tick the shield — called every sim tick to handle expiration.
 *
 * @param {object} sim
 */
export function tickShield(sim) {
  if (sim.emergencyShield?.active && sim.tick >= sim.emergencyShield.expiresAt) {
    sim.emergencyShield.active = false;
  }
}

/**
 * Check if an ability is available (off cooldown and affordable).
 * Used by UI to enable/disable ability buttons.
 *
 * @param {object} sim
 * @param {string} ability
 * @returns {{ available: boolean, reason?: string }}
 */
export function checkAbilityAvailable(sim, ability) {
  const config = RESOURCE.abilities[ability];
  if (!config) {
    return { available: false, reason: 'Unknown ability' };
  }

  // Check cooldown
  const cooldownExpiry = sim._abilityCooldowns[ability] ?? 0;
  if (sim.tick < cooldownExpiry) {
    const remainingSec = Math.ceil((cooldownExpiry - sim.tick) / 60);
    return { available: false, reason: `Cooldown: ${remainingSec}s` };
  }

  // Check affordability
  if (sim.resources.essence < config.essence) {
    return {
      available: false,
      reason: `Need ${config.essence} Essence (have ${sim.resources.essence})`,
    };
  }

  // For FD Hasten, also check FD is in charge phase
  if (ability === ESSENCE_ABILITIES.FINAL_DEFENSE_HASTEN) {
    if (!sim.finalDefense || sim.finalDefense.phase !== 'charging') {
      return { available: false, reason: 'FD not charging' };
    }
  }

  return { available: true };
}

/**
 * Get remaining cooldown ticks for an ability.
 *
 * @param {object} sim
 * @param {string} ability
 * @returns {number} ticks remaining (0 if available)
 */
export function getAbilityCooldown(sim, ability) {
  const expiry = sim._abilityCooldowns[ability] ?? 0;
  if (sim.tick >= expiry) return 0;
  return expiry - sim.tick;
}
