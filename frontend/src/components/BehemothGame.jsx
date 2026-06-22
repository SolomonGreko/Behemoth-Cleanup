/**
 * BehemothGame.jsx — Main game component.
 *
 * Wires the ResourceHUD component into the game loop
 * via the existing useGameLoop pattern.
 *
 * This is an integration stub showing how resource data flows:
 *   sim.resourceHUD (updated each tick by engine.js resourceTick)
 *     → ResourceHUD component (pure render)
 */

import React from 'react';
import { ResourceHUD } from './ResourceHUD.jsx';

/**
 * BehemothGame — top-level game component.
 *
 * Expected usage:
 *   const sim = useSim(); // from the existing sim hook
 *   return <BehemothGame sim={sim} />;
 *
 * @param {object} props
 * @param {object} props.sim — sim state with sim.resourceHUD from resourceTick
 */
export function BehemothGame({ sim }) {
  if (!sim) return null;

  // ResourceHUD data is built by engine.js resourceTick each sim tick
  // and exposed as sim.resourceHUD
  const hudData = sim.resourceHUD;

  return (
    <div className="behemoth-game" style={styles.gameContainer}>
      {/* Game canvas / renderer goes here */}

      {/* Resource HUD — top-right corner */}
      <div style={styles.hudContainer}>
        <ResourceHUD
          hudData={hudData}
          compact={false}
          onClick={(resourceType) => {
            // Future: open resource details panel
            console.debug(`Resource clicked: ${resourceType}`);
          }}
        />
      </div>

      {/* Other HUD elements: wave counter, base HP, bot count, etc. */}
    </div>
  );
}

/**
 * Lightweight hook-compatible version for use with useGameLoop.
 *
 * Example:
 *   const resourceData = useResourceData(sim);
 *   return <ResourceHUD hudData={resourceData} />;
 *
 * @param {object} sim
 * @returns {object|null} resourceHUD data
 */
export function useResourceData(sim) {
  // In a real React implementation, this would use useSyncExternalStore
  // or a game loop subscription to reactively update.
  // For now, returns the snapshot from the last resourceTick.
  return sim?.resourceHUD ?? null;
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = {
  gameContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },

  hudContainer: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'auto',
  },
};

export default BehemothGame;
