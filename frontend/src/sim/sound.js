/**
 * sound.js — Sound playback consumer for Behemoth.
 *
 * Drains the sim.sounds[] event queue each tick and plays audio
 * conditionally based on sim.soundEnabled. Aphrodite's render
 * layer imports this and calls drainSounds() in the game loop.
 *
 * @module sound
 */

/** Registered sound file paths, keyed by sound event name. */
const soundRegistry = Object.create(null);

/**
 * Register a sound file for a named event.
 * Aphrodite's component layer calls this during init to wire up audio files.
 *
 * @param {string} name — sound event name (e.g. 'build', 'mortar')
 * @param {string} url  — path or data URL to the audio file
 */
export function registerSound(name, url) {
  soundRegistry[name] = url;
}

/**
 * Play a single named sound if audio is available.
 * Falls back silently if the sound isn't registered or the Audio API is unavailable.
 *
 * @param {string} name — sound event name to play
 */
export function playSound(name) {
  const url = soundRegistry[name];
  if (!url) return;

  try {
    const audio = new Audio(url);
    audio.volume = 1.0;
    audio.play().catch(() => {
      // Autoplay blocked or audio unavailable — silent no-op
    });
  } catch {
    // Audio constructor unavailable (e.g. Node.js test env) — silent no-op
  }
}

/**
 * Drain the sim's sound event queue, playing each queued sound
 * only if sound is enabled. Call once per tick from the game loop.
 *
 * @param {object} sim — sim state (must have .sounds[] and .soundEnabled)
 */
export function drainSounds(sim) {
  if (!sim.sounds || sim.sounds.length === 0) return;

  const enabled = sim.soundEnabled !== false;

  for (const name of sim.sounds) {
    if (enabled) {
      playSound(name);
    }
  }

  // Clear the queue regardless of mute state to prevent unbounded growth
  sim.sounds.length = 0;
}
