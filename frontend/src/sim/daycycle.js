/**
 * daycycle.js — Day/Night phase cycle for Behemoth.
 *
 * Drives the phase-based day/night cycle: night → dawn → day → dusk → night.
 * Each phase has a configurable duration (ticks). The renderer uses
 * `sim.dayTransition` for smooth visual interpolation between phases.
 *
 * Called once per tick at the top of stepTick(), before wave logic
 * (wave spawning is gated on night phase via WAVE.nightOnly).
 *
 * @module daycycle
 */

import { DAY_CYCLE } from './config.js';

/**
 * Advance the day/night phase cycle by one tick.
 *
 * State mutated on `sim`:
 *   - sim.dayTimer — incremented each tick; reset to 0 on phase transition
 *   - sim.dayPhase — current phase string (night/dawn/day/dusk)
 *   - sim.dayTransition — 0→1 value for renderer visual interpolation,
 *     where 0 = just entered/exiting phase, 1 = fully settled in mid-phase.
 *     Uses `DAY_CYCLE.transitionTicks` to define the blend period length.
 *
 * Reads from config:
 *   - DAY_CYCLE.phaseOrder — array of phase names in cycle order
 *   - DAY_CYCLE.phaseDurations — map of phase name → duration in ticks
 *   - DAY_CYCLE.transitionTicks — number of ticks at phase start/end
 *     where dayTransition is in the 0→1 blend range
 *
 * @param {object} sim — sim state
 */
export function tickDayCycle(sim) {
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
