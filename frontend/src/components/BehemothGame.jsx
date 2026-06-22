/**
 * BehemothGame.jsx — Main game component.
 *
 * Wires the ResourceHUD and WavePreviewPanel components into the game
 * via the existing game loop pattern.
 *
 * This is the top-level game UI: canvas zone + HUD overlay.
 */

import React from 'react';
import { ResourceHUD, BotLabourHUD } from './ResourceHUD.jsx';
import { getWavePreview, DAY_CYCLE } from '../sim/index.js';

// ═══════════════════════════════════════════════════════════════════════
// ENEMY TYPE STYLING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Visual tokens per enemy type — icons, colours, and display labels.
 * Separate from any inspector-panel or engine config labels to avoid
 * collision as the HUD and dev tools evolve independently.
 */
const ENEMY_TYPE_STYLE = {
  scout:     { color: '#60a5fa', icon: '\u226b', label: 'Scout' },
  tank:      { color: '#f59e0b', icon: '\u25c8', label: 'Tank' },
  artillery: { color: '#ef4444', icon: '\u25c6', label: 'Arty' },
  crawler:   { color: '#34d399', icon: '\u224b', label: 'Crawler' },
  boss:      { color: '#c084fc', icon: '\u2b21', label: 'Boss' },
};

// ═══════════════════════════════════════════════════════════════════════
// WAVE PREVIEW PANEL
// ═══════════════════════════════════════════════════════════════════════

/**
 * WavePreviewPanel — shows current/next wave enemy composition.
 *
 * Three visual states:
 *   - between waves (cooldown): "▶ Next" label + next wave composition
 *   - during wave (spawning/active): "⚡ Spawning" pulse + current composition
 *   - post-victory (game over): hidden (nextWave is null)
 *
 * @param {object} props
 * @param {object} props.sim — live sim state
 */
function WavePreviewPanel({ sim }) {
  const preview = getWavePreview(sim);

  // Post-victory or no preview data — nothing to show
  if (!preview || !preview.enemies || preview.enemies.length === 0) {
    return null;
  }

  const { wave, enemies, active } = preview;

  // Total enemy count for the wave
  const totalEnemies = enemies.reduce((sum, g) => sum + g.count, 0);

  return (
    <div style={styles.panel} role="region" aria-label="Wave Preview">
      {/* Header row */}
      <div style={styles.header}>
        {active ? (
          <span style={styles.spawningLabel}>
            <span style={styles.pulseIcon}>{'\u26a1'}</span>
            {' '}Spawning
          </span>
        ) : (
          <span style={styles.nextLabel}>
            <span style={styles.nextIcon}>{'\u25b6'}</span>
            {' '}Next
          </span>
        )}
        <span style={styles.waveNum}>
          Wave {wave}
          <span style={styles.totalBadge}>{totalEnemies}</span>
        </span>
      </div>

      {/* Enemy composition rows */}
      <div style={styles.composition}>
        {enemies.map(({ type, count }) => {
          const style = ENEMY_TYPE_STYLE[type] || {
            color: '#888888',
            icon: '?',
            label: type,
          };
          return (
            <div key={type} style={styles.enemyRow}>
              <span style={{ ...styles.enemyIcon, color: style.color }}>
                {style.icon}
              </span>
              <span style={{ ...styles.enemyCount, color: style.color }}>
                {count}
              </span>
              <span style={styles.enemyLabel}>{style.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BEHEMOTH GAME
// ═══════════════════════════════════════════════════════════════════════

/**
 * BehemothGame — top-level game component.
 *
 * @param {object} props
 * @param {object} props.sim — sim state with sim.resourceHUD from resourceTick
 */
export function BehemothGame({ sim }) {
  if (!sim) return null;

  // ResourceHUD data is built by engine.js resourceTick each sim tick
  const hudData = sim.resourceHUD;

  // Bot labour summary from engine's buildHUD() / getStats()
  const botLabour = sim.hud?.botLabour ?? null;

  return (
    <div className="behemoth-game" style={styles.gameContainer}>
      {/* Game canvas / renderer goes here */}

      {/* HUD overlay — top-right corner */}
      <div style={styles.hudContainer}>
        <ResourceHUD
          hudData={hudData}
          compact={false}
          onClick={(resourceType) => {
            console.debug(`Resource clicked: ${resourceType}`);
          }}
        />

        {/* Wave composition preview */}
        <WavePreviewPanel sim={sim} />

        {/* Day phase visual transition indicator */}
        <PhaseIndicator hud={sim.hud} />

        {/* Bot labour state display */}
        <BotLabourHUD botLabour={botLabour} />

        {/* Wave counter */}
        <WaveCounter sim={sim} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY: HEX COLOUR LERP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Linearly interpolate between two hex colours.
 * Used by PhaseIndicator to smooth bar colour transitions.
 *
 * @param {string} a — hex colour (e.g. '#87CEEB')
 * @param {string} b — hex colour (e.g. '#191970')
 * @param {number} t — interpolation factor (0 → a, 1 → b)
 * @returns {string} hex colour
 */
function lerpHex(a, b, t) {
  const ra = parseInt(a.slice(1, 3), 16);
  const ga = parseInt(a.slice(3, 5), 16);
  const ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16);
  const gb = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);

  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE INDICATOR — Day/Night visual transition
// ═══════════════════════════════════════════════════════════════════════

/**
 * PhaseIndicator — visual day/night phase transition indicator.
 *
 * Replaces the old text+emoji phase display with a smooth,
 * gradient-driven bar that tracks the game's day cycle.
 *
 * Three visual elements:
 *   - Phase label: "Dawn" / "Day" / "Dusk" / "Night" in phase colour
 *   - Gradient progress bar: fills left-to-right as ticks advance,
 *     colour transitions using CSS transition-all
 *   - Phase cycle dots: 4 small dots showing all phases;
 *     the active dot glows in phase colour
 *
 * Uses DAY_CYCLE from config for colours and durations.
 * Reads hud.dayPhase, hud.phaseTick, hud.phaseDuration from sim.
 *
 * @param {object} props
 * @param {object} props.hud — sim.hud snapshot (from engine stepTick)
 */
function PhaseIndicator({ hud }) {
  if (!hud) return null;

  const { dayPhase, phaseTick = 0, phaseDuration = 1, phaseBlend = 0 } = hud;
  const phaseColor = DAY_CYCLE.colors[dayPhase] || '#888888';
  const phaseLabel = dayPhase.charAt(0).toUpperCase() + dayPhase.slice(1);

  // Bar progress: how far through the current phase (0 → 1)
  const progress = phaseDuration > 0
    ? Math.min(1, Math.max(0, phaseTick / phaseDuration))
    : 0;

  // Lerp bar color between gradient start and end
  const barColor = lerpHex(
    DAY_CYCLE.gradient.start,
    DAY_CYCLE.gradient.end,
    progress,
  );

  return (
    <div style={styles.phasePanel} role="region" aria-label="Day Phase">
      {/* Phase label */}
      <div style={{ ...styles.phaseLabel, color: phaseColor }}>
        {phaseLabel}
      </div>

      {/* Gradient progress bar */}
      <div style={styles.phaseBarTrack}>
        <div
          style={{
            ...styles.phaseBarFill,
            width: `${progress * 100}%`,
            background: barColor,
            boxShadow: `0 0 8px ${barColor}66`,
          }}
        />
      </div>

      {/* Phase cycle dots */}
      <div style={styles.phaseDots}>
        {DAY_CYCLE.phaseOrder.map((phase) => (
          <div
            key={phase}
            title={phase.charAt(0).toUpperCase() + phase.slice(1)}
            style={{
              ...styles.phaseDot,
              background: phase === dayPhase
                ? DAY_CYCLE.colors[phase]
                : 'rgba(255, 255, 255, 0.15)',
              boxShadow: phase === dayPhase
                ? `0 0 6px ${DAY_CYCLE.colors[phase]}`
                : 'none',
              transform: phase === dayPhase ? 'scale(1.3)' : 'scale(1)',
              transition: 'background 0.7s ease, box-shadow 0.7s ease, transform 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WAVE COUNTER (preserved from original — no regression)
// ═══════════════════════════════════════════════════════════════════════

function WaveCounter({ sim }) {
  return (
    <div style={styles.waveCounter}>
      <span style={styles.waveCounterLabel}>WAVE</span>
      <span style={styles.waveCounterValue}>{sim.wave}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════

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

  // ── Phase Indicator ─────────────────────────────────────────────

  phasePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '8px',
    fontFamily: "'Courier New', monospace",
    border: '1px solid rgba(255, 255, 255, 0.1)',
    userSelect: 'none',
    minWidth: '130px',
  },

  phaseLabel: {
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    textAlign: 'center',
    transition: 'color 0.5s ease',
  },

  phaseBarTrack: {
    width: '100%',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },

  phaseBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.5s ease, background 0.5s ease, box-shadow 0.5s ease',
  },

  phaseDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    paddingTop: '2px',
  },

  phaseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },

  // ── Wave Counter (preserved) ────────────────────────────────────

  waveCounter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '6px 14px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '6px',
    fontFamily: "'Courier New', monospace",
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },

  waveCounterLabel: {
    fontSize: '12px',
    color: '#888888',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },

  waveCounterValue: {
    fontSize: '22px',
    color: '#FBBF24',   // amber-400
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
  },

  // ── Wave Preview Panel ──────────────────────────────────────────

  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    color: '#E0E0E0',
    userSelect: 'none',
    minWidth: '160px',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '4px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },

  nextLabel: {
    fontSize: '11px',
    color: '#60a5fa',    // sky blue — calm anticipation
    letterSpacing: '1px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },

  nextIcon: {
    fontSize: '10px',
  },

  spawningLabel: {
    fontSize: '11px',
    color: '#fbbf24',    // amber — urgency
    letterSpacing: '1px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },

  pulseIcon: {
    display: 'inline-block',
    animation: 'none',   // Pulsing handled by keyframe below
    fontSize: '10px',
  },

  waveNum: {
    fontSize: '12px',
    color: '#FBBF24',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
  },

  totalBadge: {
    display: 'inline-block',
    marginLeft: '6px',
    padding: '1px 6px',
    fontSize: '10px',
    color: '#E0E0E0',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    fontWeight: 'normal',
  },

  composition: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },

  enemyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
  },

  enemyIcon: {
    width: '18px',
    fontSize: '14px',
    textAlign: 'center',
    flexShrink: 0,
  },

  enemyCount: {
    width: '24px',
    fontSize: '14px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    flexShrink: 0,
  },

  enemyLabel: {
    fontSize: '11px',
    color: '#888888',
    flexShrink: 0,
  },
};

export default BehemothGame;
