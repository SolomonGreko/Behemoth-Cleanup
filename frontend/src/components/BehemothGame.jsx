/**
 * BehemothGame.jsx — Main game component.
 *
 * Wires the ResourceHUD and WavePreviewPanel components into the game
 * via the existing game loop pattern.
 *
 * This is the top-level game UI: canvas zone + HUD overlay.
 */

import React, { useRef, useEffect } from 'react';
import { ResourceHUD, BotLabourHUD } from './ResourceHUD.jsx';
import {
  getWavePreview, DAY_CYCLE, LEVEL, RESOURCE, toggleSound,
  drawBackground, drawBase, drawStoneZones, drawEnemies, drawDeathParticles,
  drawCrystalDrops, drawBossShockwaves, drawTurrets, drawBots,
  drawWalls, drawDayNightOverlay, drawSelectionRing,
  findTurretAt, selectTurret, deselectTurret,
  getTurretById,
} from '../sim/index.js';

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
// BASE LEVEL IDENTITY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Per-level identity names matching Athena's green→cyan→amber→red spec.
 * Makes each level feel earned, not spreadsheet-cold.
 * Coordinates with LEVEL.VISUAL glowColor/labelColor from config.js.
 */
const LEVEL_IDENTITY = [
  { title: 'OUTPOST',  desc: 'A spark in the dark' },
  { title: 'BASTION',  desc: 'Roots take hold' },
  { title: 'FORTRESS', desc: 'The Shroud recoils' },
  { title: 'BEHEMOTH', desc: 'Awakened' },
];

// ═══════════════════════════════════════════════════════════════════════
// GARDEN STATS — reads grid cells + pulse ability state
// ═══════════════════════════════════════════════════════════════════════

/**
 * Phase to display-label mapping.
 * Engine-phase → player-visible name.
 */
const GARDEN_PHASES = {
  bare:    'Moss',
  sprout:  'Grass I',
  green:   'Grass II',
  flowing: 'Grass III',
};

/**
 * Gather garden stats from live sim state.
 *
 * Reads sim.world.grid for grass/moss cell counts and derives the
 * dominant garden phase from the grass-to-garden ratio.  Also reads
 * sim._abilityCooldowns for Pulse Wave status.
 *
 * Called inline during render — the React re-render cycle provides the
 * RAF-frame freshness required by the AC.
 *
 * @param {object} sim — live sim state
 * @returns {{ living: number, total: number, dominantPhase: string,
 *             dominantPhaseLabel: string, pulseReady: boolean,
 *             pulseCooldown: number, pulseActive: boolean }}
 */
function getGardenStats(sim) {
  if (!sim?.world?.grid) {
    return { living: 0, total: 0, dominantPhase: 'bare',
             dominantPhaseLabel: 'Moss', pulseReady: false,
             pulseCooldown: 0, pulseActive: false };
  }

  let grassCount = 0;
  let mossCount = 0;

  const grid = sim.world.grid;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell.grass) grassCount++;
      if (cell.moss) mossCount++;
    }
  }

  const living = grassCount;
  const total = grassCount + mossCount;
  const grassRatio = total > 0 ? grassCount / total : 0;

  // Dominant phase derived from grass saturation
  let dominantPhase = 'bare';
  if (grassRatio >= 0.75)      dominantPhase = 'flowing';
  else if (grassRatio >= 0.50) dominantPhase = 'green';
  else if (grassRatio >= 0.25) dominantPhase = 'sprout';

  const dominantPhaseLabel = GARDEN_PHASES[dominantPhase] || 'Moss';

  // ── Pulse Wave status from ability system ─────────────────────────
  const pulseCfg = RESOURCE.abilities?.pulseWave;
  const cooldownExpiry = sim._abilityCooldowns?.pulseWave ?? 0;
  const pulseCooldown = Math.max(0, cooldownExpiry - sim.tick);
  const pulseReady = pulseCooldown === 0 && sim.tick > 0;
  const pulseActive = sim.lastPulseWaveTick === sim.tick;

  return {
    living,
    total,
    dominantPhase,
    dominantPhaseLabel,
    pulseReady,
    pulseCooldown,
    pulseActive,
  };
}

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
 * Renders the full-screen game canvas (imperative draw loop) and the
 * React HUD overlay on top.  The canvas reads from the live sim prop
 * via a ref so the rAF loop never has a stale closure.
 *
 * @param {object} props
 * @param {object} props.sim — sim state with sim.resourceHUD from resourceTick
 */
export function BehemothGame({ sim }) {
  if (!sim) return null;

  const canvasRef = useRef(null);
  const simRef = useRef(sim);

  // Keep the ref pinned to the latest sim prop so the rAF loop
  // always reads the current tick / world dimensions.
  simRef.current = sim;

  // ── Canvas render loop ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let rafId;
    let running = true;

    // ── Click handler: screen → world coords → hit-test → select/deselect
    const handleClick = (e) => {
      const s = simRef.current;
      if (!s || !s.world) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const scale = Math.min(canvas.width / s.world.width, canvas.height / s.world.height);
      const worldX = screenX / scale;
      const worldY = screenY / scale;

      const turret = findTurretAt(s, worldX, worldY);
      if (turret) {
        selectTurret(s, turret.id);
      } else {
        deselectTurret(s);
      }
    };

    // ── Keyboard handler: Escape → deselect
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        const s = simRef.current;
        if (s) deselectTurret(s);
      }
    };

    canvas.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    const render = () => {
      if (!running) return;

      const s = simRef.current;
      if (!s || !s.world) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const { world, tick = 0 } = s;
      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const scale = Math.min(canvasW / world.width, canvasH / world.height);

      // Clear
      ctx.clearRect(0, 0, canvasW, canvasH);

      // ── Render pipeline (back to front) ───────────────────────────
      drawBackground(ctx, canvasW, canvasH, s, scale);
      drawStoneZones(ctx, s, scale);
      drawBase(ctx, s, scale);
      drawWalls(ctx, s, scale);
      drawEnemies(ctx, s, scale);
      drawTurrets(ctx, s, scale);
      drawBots(ctx, s, scale);
      drawSelectionRing(ctx, s, scale);
      drawDeathParticles(ctx, scale, tick);
      drawCrystalDrops(ctx, scale, tick);
      drawBossShockwaves(ctx, scale, tick);
      drawDayNightOverlay(ctx, canvasW, canvasH, s, tick);

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // ── Canvas resize to fill parent ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ResourceHUD data is built by engine.js resourceTick each sim tick
  const hudData = sim.resourceHUD;

  // Bot labour summary from engine's buildHUD() / getStats()
  const botLabour = sim.hud?.botLabour ?? null;

  return (
    <div className="behemoth-game" style={styles.gameContainer}>
      {/* Game canvas — fills the container, behind the HUD */}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

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

        {/* Watchers panel — per-turret health bars + upgrade badges */}
        <WatchersPanel sim={sim} />

        {/* Garden progress — tilled cells, phase, pulse status */}
        <GardenProgressIndicator sim={sim} />

        {/* Base level badge — visually distinct per-level styling */}
        <BaseLevelBadge hud={sim.hud} />

        {/* Sound mute/unmute toggle */}
        <SoundToggle sim={sim} />
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
// SOUND TOGGLE BUTTON
// ═══════════════════════════════════════════════════════════════════════

/**
 * SoundToggle — mute/unmute speaker icon button.
 *
 * Reads sim.soundEnabled for visual state and calls toggleSound()
 * on click. Icon switches between 🔊 (on, full opacity) and
 * 🔇 (muted, 45% opacity). Uses local state for immediate visual
 * feedback; syncs from sim on parent re-render.
 *
 * @param {object} props
 * @param {object} props.sim — live sim state (must have .soundEnabled)
 */
function SoundToggle({ sim }) {
  const [enabled, setEnabled] = React.useState(() => sim.soundEnabled);

  // Sync from sim when parent re-renders (e.g. after M hotkey toggle)
  React.useEffect(() => {
    setEnabled(sim.soundEnabled);
  }, [sim.soundEnabled]);

  const handleClick = () => {
    toggleSound(sim);
    setEnabled(sim.soundEnabled);
  };

  return (
    <button
      onClick={handleClick}
      style={styles.soundToggle}
      title={enabled ? 'Mute sound (M)' : 'Unmute sound (M)'}
      aria-label={enabled ? 'Mute sound' : 'Unmute sound'}
      role="switch"
      aria-checked={enabled}
    >
      <span
        style={{
          ...styles.soundIcon,
          opacity: enabled ? 1 : 0.45,
        }}
      >
        {enabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BASE LEVEL BADGE
// ═══════════════════════════════════════════════════════════════════════

/**
 * BaseLevelBadge — visually distinct base level indicator.
 *
 * Replaces the old "LV.N" text pattern with a badge that communicates
 * level identity through color, typography, glow, and a kill progress bar.
 * Reads baseLevel from sim.hud — updates instantly on level-up.
 *
 * Styling coordinates with LEVEL.VISUAL from Athena's spec:
 *   L1 green  #22c55e → L2 cyan #06b6d4 → L3 amber #f59e0b → L4 red #ef4444
 *
 * Design:
 *   - Left-edge colored accent strip (glow color, pulses at L4)
 *   - Large level number with glow text-shadow
 *   - Identity title in level labelColor + atmospheric subtitle
 *   - Kill progress bar (L1–L3) or MAX status (L4)
 *
 * L4 (BEHEMOTH) gets a pulsing glow animation matching the renderer's
 * ~2Hz sin wave — same frequency, shared visual language.
 *
 * @param {object} props
 * @param {object} props.hud — sim.hud snapshot from engine buildHUD()
 */
function BaseLevelBadge({ hud }) {
  if (!hud) return null;

  const level = hud.baseLevel ?? 0;
  const kills = hud.kills ?? 0;
  const visual = LEVEL.VISUAL[level] || LEVEL.VISUAL[0];
  const identity = LEVEL_IDENTITY[level] || LEVEL_IDENTITY[0];
  const isMaxLevel = level >= LEVEL.THRESHOLDS.length - 1;

  // Progress toward next threshold
  const nextThreshold = isMaxLevel
    ? LEVEL.THRESHOLDS[level]
    : LEVEL.THRESHOLDS[level + 1];
  const prevThreshold = LEVEL.THRESHOLDS[level];
  const range = nextThreshold - prevThreshold;
  const progress = range > 0
    ? Math.min(1, Math.max(0, (kills - prevThreshold) / range))
    : 1;

  // Unique animation name to avoid collision with other keyframes
  const pulseAnim = `bl-pulse-L${level}`;

  return (
    <div
      style={{
        ...styles.baseLevelContainer,
        borderColor: `${visual.glowColor}44`,
        boxShadow: isMaxLevel
          ? 'none'
          : `inset 0 0 20px ${visual.glowColor}11`,
      }}
      role="region"
      aria-label={`Base Level ${level + 1}: ${identity.title}`}
    >
      {/* L4 pulse keyframes — only injected when at max level */}
      {isMaxLevel && (
        <style>{`
          @keyframes ${pulseAnim} {
            0%, 100% { box-shadow: 0 0 6px ${visual.glowColor}55, inset 0 0 12px ${visual.glowColor}18; }
            50%      { box-shadow: 0 0 14px ${visual.glowColor}88, inset 0 0 22px ${visual.glowColor}2a; }
          }
        `}</style>
      )}

      {/* Accent bar — left edge glow strip, pulses at L4 */}
      <div
        style={{
          ...styles.baseLevelAccent,
          background: visual.glowColor,
          boxShadow: `0 0 8px ${visual.glowColor}`,
          ...(isMaxLevel
            ? { animation: `${pulseAnim} 2s ease-in-out infinite` }
            : {}),
        }}
      />

      {/* Level number + identity title */}
      <div style={styles.baseLevelHeader}>
        <span
          style={{
            ...styles.baseLevelNumber,
            color: visual.glowColor,
            textShadow: `0 0 ${8 + level * 4}px ${visual.glowColor}88`,
          }}
        >
          {level + 1}
        </span>
        <div style={styles.baseLevelTitleGroup}>
          <span style={{ ...styles.baseLevelTitle, color: visual.labelColor }}>
            {identity.title}
          </span>
          <span style={styles.baseLevelDesc}>{identity.desc}</span>
        </div>
      </div>

      {/* Kill progress (L1–L3) or MAX status (L4) */}
      {!isMaxLevel && (
        <div style={styles.baseLevelProgress}>
          <div style={styles.baseLevelBarTrack}>
            <div
              style={{
                ...styles.baseLevelBarFill,
                width: `${progress * 100}%`,
                background: visual.glowColor,
                boxShadow: `0 0 6px ${visual.glowColor}66`,
              }}
            />
          </div>
          <span style={styles.baseLevelProgressText}>
            {kills}/{nextThreshold}
          </span>
        </div>
      )}

      {isMaxLevel && (
        <div style={styles.baseLevelMaxRow}>
          <span style={{ ...styles.baseLevelMaxText, color: visual.glowColor }}>
            {'\u25c6'} MAX
          </span>
          <span style={styles.baseLevelKills}>{kills} kills</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INSPECT PANEL — detailed stats for the selected turret
// ═══════════════════════════════════════════════════════════════════════

/**
 * InspectPanel — detailed overlay for the currently selected turret.
 *
 * Appears inside the WatchersPanel when sim.selectedEntityId is non-null.
 * Shows turret identity, HP with exact values, combat stats, and upgrade
 * badge states. Dismisses when selection is cleared (Escape / click ground).
 *
 * Visual identity: sky-blue accent (#6ba4c7) matching the selection ring.
 * Separated from per-turret cards by a subtle divider.
 *
 * @param {object} props
 * @param {object} props.sim — live sim state
 * @param {object} props.turret — the selected turret object
 */
function InspectPanel({ sim, turret }) {
  var hpRatio = turret.maxHp > 0 ? turret.hp / turret.maxHp : 0;

  // HP bar colour: green (>66%) → amber (33-66%) → red (<33%)
  var hpColor;
  if (hpRatio > 0.66) {
    hpColor = 'rgba(34, 197, 94, 0.85)';
  } else if (hpRatio > 0.33) {
    hpColor = 'rgba(245, 158, 11, 0.85)';
  } else {
    hpColor = 'rgba(239, 68, 68, 0.85)';
  }

  var isAdvanced = turret.type === 'turret';
  var typeLabel = isAdvanced ? 'Turret' : 'Watcher';
  var typeColor = isAdvanced ? '#6ba4c7' : '#4b8bb4';

  // Cooldown percentage for the laser CD bar
  var cdRatio = turret.laserCdMax > 0
    ? 1 - (turret.laserCd / turret.laserCdMax)
    : 1;

  return React.createElement('div', { style: styles.inspectPanel },
    // Header row
    React.createElement('div', { style: styles.inspectHeader },
      React.createElement('span', { style: styles.inspectTitle },
        '\u25c8 INSPECT'
      ),
      React.createElement('span', { style: Object.assign({}, styles.inspectTypeTag, { color: typeColor, borderColor: typeColor }) },
        typeLabel
      )
    ),

    // Turret ID + position
    React.createElement('div', { style: styles.inspectIdRow },
      React.createElement('span', { style: Object.assign({}, styles.inspectId, { color: typeColor }) },
        '#' + turret.id
      ),
      React.createElement('span', { style: styles.inspectPos },
        '(' + turret.x.toFixed(0) + ', ' + turret.y.toFixed(0) + ')'
      )
    ),

    // HP bar (larger, prominent)
    React.createElement('div', { style: styles.inspectHpRow },
      React.createElement('div', { style: styles.inspectHpBarTrack },
        React.createElement('div', {
          style: Object.assign({}, styles.inspectHpBarFill, {
            width: (hpRatio * 100) + '%',
            background: hpColor,
            boxShadow: '0 0 8px ' + hpColor,
          }),
        })
      ),
      React.createElement('span', { style: styles.inspectHpText },
        turret.hp + '/' + turret.maxHp
      )
    ),

    // Combat stats row
    React.createElement('div', { style: styles.inspectStatsGrid },
      // Range
      React.createElement('div', { style: styles.inspectStat },
        React.createElement('span', { style: styles.inspectStatLabel }, 'Range'),
        React.createElement('span', { style: styles.inspectStatValue },
          turret.range.toFixed(1) + 'c'
        )
      ),
      // Laser damage
      React.createElement('div', { style: styles.inspectStat },
        React.createElement('span', { style: styles.inspectStatLabel }, 'Dmg'),
        React.createElement('span', { style: Object.assign({}, styles.inspectStatValue, { color: '#f87171' }) },
          turret.laserDamage
        )
      ),
      // Laser cooldown
      React.createElement('div', { style: styles.inspectStat },
        React.createElement('span', { style: styles.inspectStatLabel }, 'CD'),
        React.createElement('div', { style: styles.inspectCdTrack },
          React.createElement('div', {
            style: Object.assign({}, styles.inspectCdFill, {
              width: (cdRatio * 100) + '%',
            }),
          })
        )
      ),
    ),

    // Upgrade badges
    React.createElement('div', { style: styles.inspectBadgesRow },
      React.createElement(UpgradeBadge, {
        icon: '\u2b21',
        label: 'Chassis',
        active: turret.type === 'turret',
        color: '#6ba4c7',
      }),
      React.createElement(UpgradeBadge, {
        icon: '\u25ce',
        label: 'Optics',
        active: turret.mounted,
        color: '#38bdf8',
      }),
      React.createElement(UpgradeBadge, {
        icon: '\u2726',
        label: 'Mortar',
        active: turret.hasMortar,
        color: '#fbbf24',
      }),
    ),

    // Dismiss hint
    React.createElement('div', { style: styles.inspectDismiss },
      'ESC to dismiss'
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WATCHERS PANEL — per-watcher health bars + upgrade badges
// ═══════════════════════════════════════════════════════════════════════

/**
 * WatchersPanel — displays per-turret health bars and upgrade badges.
 *
 * Visible when sim.turrets has at least one alive turret.
 * Each watcher card shows:
 *   - ID number + type label (Watcher / Turret)
 *   - Colour-coded health bar (green > amber > red)
 *   - Three upgrade badges (Chassis / Optics / Mortar) with active/dimmed states
 *
 * Upgrade badge mapping:
 *   - Chassis (⬡): type === 'turret' (advanced chassis upgrade)
 *   - Optics (◎): mounted (wall-mounted targeting/range bonus)
 *   - Mortar (✦): hasMortar (AoE splash weapon)
 *
 * @param {object} props
 * @param {object} props.sim — live sim state (reads sim.turrets)
 */
function WatchersPanel({ sim }) {
  const turrets = (sim.turrets || []).filter(function (t) { return t.alive; });
  const selectedId = sim.selectedEntityId;
  const selectedTurret = selectedId != null ? getTurretById(sim, selectedId) : null;

  // Show panel if we have turrets OR if there's a valid selection
  if (turrets.length === 0 && !selectedTurret) return null;

  return (
    <div style={styles.watchersPanel} role="region" aria-label="Watchers">
      {/* INSPECT panel — detailed stats for the selected turret */}
      {selectedTurret && React.createElement(InspectPanel, { sim: sim, turret: selectedTurret })}

      {/* Panel header */}
      <div style={styles.watchersHeader}>
        <span style={styles.watchersTitle}>{'\u25c6'} WATCHERS</span>
        <span style={styles.watchersCount}>{turrets.length}</span>
      </div>

      {/* Per-watcher cards */}
      {turrets.map(function (turret) {
        return React.createElement(WatcherCard, { key: turret.id, turret: turret });
      })}
    </div>
  );
}

/**
 * WatcherCard — a single turret's health bar and upgrade badge row.
 *
 * @param {object} props
 * @param {object} props.turret — { id, type, hp, maxHp, mounted, hasMortar }
 */
function WatcherCard({ turret }) {
  var hpRatio = turret.maxHp > 0 ? turret.hp / turret.maxHp : 0;

  // Health bar colour: green (>66%) → amber (33-66%) → red (<33%)
  var hpColor;
  if (hpRatio > 0.66) {
    hpColor = 'rgba(34, 197, 94, 0.85)';   // emerald-500
  } else if (hpRatio > 0.33) {
    hpColor = 'rgba(245, 158, 11, 0.85)';  // amber-500
  } else {
    hpColor = 'rgba(239, 68, 68, 0.85)';   // red-500
  }

  var isAdvanced = turret.type === 'turret';
  var typeLabel = isAdvanced ? 'Turret' : 'Watcher';
  var typeColor = isAdvanced ? '#6ba4c7' : '#4b8bb4';

  return (
    <div style={styles.watcherCard}>
      {/* ID + type label row */}
      <div style={styles.watcherIdRow}>
        <span style={Object.assign({}, styles.watcherId, { color: typeColor })}>
          {'#' + turret.id}
        </span>
        <span style={Object.assign({}, styles.watcherType, { color: typeColor })}>
          {typeLabel}
        </span>
      </div>

      {/* Health bar */}
      <div style={styles.hpRow}>
        <div style={styles.hpBarTrack}>
          <div style={Object.assign({}, styles.hpBarFill, {
            width: (hpRatio * 100) + '%',
            background: hpColor,
            boxShadow: '0 0 6px ' + hpColor,
          })} />
        </div>
        <span style={styles.hpText}>
          {turret.hp + '/' + turret.maxHp}
        </span>
      </div>

      {/* Upgrade badges */}
      <div style={styles.badgesRow}>
        {React.createElement(UpgradeBadge, {
          icon: '\u2b21',
          label: 'Chassis',
          active: turret.type === 'turret',
          color: '#6ba4c7',
        })}
        {React.createElement(UpgradeBadge, {
          icon: '\u25ce',
          label: 'Optics',
          active: turret.mounted,
          color: '#38bdf8',
        })}
        {React.createElement(UpgradeBadge, {
          icon: '\u2726',
          label: 'Mortar',
          active: turret.hasMortar,
          color: '#fbbf24',
        })}
      </div>
    </div>
  );
}

/**
 * UpgradeBadge — a single upgrade icon badge with active/dimmed state.
 *
 * @param {object} props
 * @param {string} props.icon — unicode character for the badge
 * @param {string} props.label — tooltip / aria label for the upgrade
 * @param {boolean} props.active — whether the upgrade is purchased
 * @param {string} props.color — active colour hex
 */
function UpgradeBadge({ icon, label, active, color }) {
  return (
    <div
      style={Object.assign({}, styles.badge, {
        color: active ? color : '#52525b',
        opacity: active ? 1 : 0.35,
        textShadow: active ? '0 0 6px ' + color + '88' : 'none',
      })}
      title={label + ': ' + (active ? 'ACTIVE' : 'inactive')}
    >
      {icon}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GARDEN PROGRESS INDICATOR
// ═══════════════════════════════════════════════════════════════════════

/**
 * GardenProgressIndicator — emerald-themed garden status panel.
 *
 * Displays three data rows:
 *   1. Cells tilled / total ratio (living grass cells vs garden area)
 *   2. Dominant garden phase (Moss → Grass I → Grass II → Grass III)
 *   3. Pulse Wave status (READY / cooldown Ns / ACTIVE / —)
 *
 * Reads sim data via getGardenStats() on every render — the React
 * re-render cycle provides real-time freshness per the AC.
 *
 * Visual identity: emerald border + emerald tint background, matching
 * the \"Emerald section\" pattern from behemoth-ui.
 *
 * @param {object} props
 * @param {object} props.sim — live sim state
 */
function GardenProgressIndicator({ sim }) {
  const gs = getGardenStats(sim);

  // Hide panel when no garden cells exist (pre-init or destroyed state)
  if (gs.total === 0) return null;

  // ── Progress bar: living / total ratio ─────────────────────────────
  const ratio = gs.total > 0 ? Math.min(1, gs.living / gs.total) : 0;

  // ── Pulse status label ─────────────────────────────────────────────
  let pulseLabel, pulseColor;
  if (gs.pulseActive) {
    pulseLabel = 'ACTIVE';
    pulseColor = '#fbbf24';  // amber — urgency / effect in progress
  } else if (gs.pulseCooldown > 0) {
    const cooldownSec = Math.ceil(gs.pulseCooldown / 60);
    pulseLabel = `CD ${cooldownSec}s`;
    pulseColor = '#d97706';  // dim amber — recharging
  } else if (gs.pulseReady) {
    pulseLabel = 'READY';
    pulseColor = '#34d399';  // emerald — ready to use
  } else {
    pulseLabel = '\u2014';   // em-dash — no pulse ability
    pulseColor = '#71717a';  // zinc-500
  }

  return (
    <div style={styles.gardenPanel} role="region" aria-label="Garden Progress">
      {/* Header */}
      <div style={styles.gardenHeader}>GARDEN</div>

      {/* Cells ratio row */}
      <div style={styles.gardenRow}>
        <span style={styles.gardenLabel}>Cells</span>
        <span style={styles.gardenCount}>
          <span style={{ color: '#34d399' }}>{gs.living}</span>
          <span style={{ color: '#71717a' }}> / {gs.total}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div style={styles.gardenBarTrack}>
        <div
          style={{
            ...styles.gardenBarFill,
            width: `${ratio * 100}%`,
            boxShadow: `0 0 6px #34d39966`,
          }}
        />
      </div>

      {/* Dominant phase */}
      <div style={styles.gardenRow}>
        <span style={styles.gardenLabel}>Phase</span>
        <span style={{ ...styles.gardenValue, color: '#34d399' }}>
          {gs.dominantPhaseLabel}
        </span>
      </div>

      {/* Pulse Wave status */}
      <div style={styles.gardenRow}>
        <span style={styles.gardenLabel}>Pulse</span>
        <span
          style={{
            ...styles.gardenValue,
            color: pulseColor,
            ...(gs.pulseActive
              ? { textShadow: '0 0 6px #fbbf2488', fontWeight: 'bold' }
              : {}),
          }}
        >
          {pulseLabel}
        </span>
      </div>
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

  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: 1,
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

  // ── Sound Toggle ────────────────────────────────────────────────

  soundToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '28px',
    padding: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    alignSelf: 'flex-end',
  },

  soundIcon: {
    fontSize: '15px',
    lineHeight: 1,
    transition: 'opacity 0.15s',
  },

  // ── Garden Progress Indicator ────────────────────────────────────

  gardenPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 12px',
    background: 'rgba(6, 78, 59, 0.12)',   // emerald-950/15
    borderRadius: '8px',
    fontFamily: "'Courier New', monospace",
    border: '1px solid rgba(6, 78, 59, 0.60)',  // emerald-900/60
    userSelect: 'none',
    minWidth: '160px',
  },

  gardenHeader: {
    fontSize: '10px',
    color: '#34d399',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    textAlign: 'center',
    paddingBottom: '2px',
    borderBottom: '1px solid rgba(52, 211, 153, 0.15)',
  },

  gardenRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '1px 0',
  },

  gardenLabel: {
    fontSize: '10px',
    color: '#a1a1aa',     // zinc-400
    letterSpacing: '1px',
    textTransform: 'uppercase',
    flexShrink: 0,
  },

  gardenValue: {
    fontSize: '11px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1px',
  },

  gardenCount: {
    fontSize: '12px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
  },

  gardenBarTrack: {
    width: '100%',
    height: '3px',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
    margin: '1px 0',
  },

  gardenBarFill: {
    height: '100%',
    borderRadius: '2px',
    background: '#34d399',  // emerald-400
    transition: 'width 0.4s ease',
  },

  // ── Base Level Badge ────────────────────────────────────────────

  baseLevelContainer: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px 10px 16px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontFamily: "'Courier New', monospace",
    userSelect: 'none',
    minWidth: '180px',
    overflow: 'hidden',
  },

  baseLevelAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    borderRadius: '8px 0 0 8px',
  },

  baseLevelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  baseLevelNumber: {
    fontSize: '26px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    flexShrink: 0,
    minWidth: '28px',
    textAlign: 'center',
  },

  baseLevelTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },

  baseLevelTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },

  baseLevelDesc: {
    fontSize: '9px',
    color: '#888888',
    fontStyle: 'italic',
    lineHeight: 1.3,
  },

  baseLevelProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  baseLevelBarTrack: {
    flex: 1,
    height: '3px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },

  baseLevelBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.4s ease, background 0.4s ease',
  },

  baseLevelProgressText: {
    fontSize: '9px',
    color: '#a1a1aa',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  baseLevelMaxRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  baseLevelMaxText: {
    fontSize: '11px',
    fontWeight: 'bold',
    letterSpacing: '2px',
  },

  baseLevelKills: {
    fontSize: '9px',
    color: '#a1a1aa',
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

  // ── Watchers Panel ───────────────────────────────────────────────

  watchersPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '8px 10px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontFamily: "'Courier New', monospace",
    userSelect: 'none',
    minWidth: '190px',
  },

  watchersHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '4px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },

  watchersTitle: {
    fontSize: '11px',
    color: '#6ba4c7',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },

  watchersCount: {
    fontSize: '13px',
    color: '#93c5e8',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    background: 'rgba(107, 164, 199, 0.12)',
    borderRadius: '4px',
    padding: '1px 7px',
    minWidth: '22px',
    textAlign: 'center',
  },

  watcherCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '6px 8px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '5px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },

  watcherIdRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },

  watcherId: {
    fontSize: '14px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1px',
  },

  watcherType: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    opacity: 0.75,
  },

  hpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  hpBarTrack: {
    flex: 1,
    height: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },

  hpBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease, background 0.3s ease',
  },

  hpText: {
    fontSize: '10px',
    color: '#a1a1aa',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    minWidth: '48px',
    textAlign: 'right',
  },

  badgesRow: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    paddingTop: '2px',
  },

  badge: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '4px',
    transition: 'color 0.3s ease, opacity 0.3s ease, text-shadow 0.3s ease',
    cursor: 'default',
  },

  // ── Inspect Panel (selected turret detail) ──────────────────────────

  inspectPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '8px 10px',
    marginBottom: '6px',
    background: 'rgba(107, 164, 199, 0.06)',
    borderRadius: '6px',
    border: '1px solid rgba(107, 164, 199, 0.25)',
    fontFamily: "'Courier New', monospace",
    userSelect: 'none',
  },

  inspectHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '4px',
    borderBottom: '1px solid rgba(107, 164, 199, 0.12)',
  },

  inspectTitle: {
    fontSize: '11px',
    color: '#6ba4c7',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },

  inspectTypeTag: {
    fontSize: '9px',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    padding: '1px 6px',
    borderRadius: '3px',
    border: '1px solid',
  },

  inspectIdRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },

  inspectId: {
    fontSize: '14px',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1px',
  },

  inspectPos: {
    fontSize: '9px',
    color: '#71717a',
    fontVariantNumeric: 'tabular-nums',
  },

  inspectHpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  inspectHpBarTrack: {
    flex: 1,
    height: '5px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    overflow: 'hidden',
  },

  inspectHpBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease, background 0.3s ease',
  },

  inspectHpText: {
    fontSize: '11px',
    color: '#a1a1aa',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    minWidth: '52px',
    textAlign: 'right',
    fontWeight: 'bold',
  },

  inspectStatsGrid: {
    display: 'flex',
    gap: '8px',
    paddingTop: '2px',
  },

  inspectStat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 4px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '4px',
  },

  inspectStatLabel: {
    fontSize: '8px',
    color: '#71717a',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },

  inspectStatValue: {
    fontSize: '12px',
    color: '#e4e4e7',
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
  },

  inspectCdTrack: {
    width: '100%',
    height: '3px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '1px',
  },

  inspectCdFill: {
    height: '100%',
    borderRadius: '2px',
    background: '#38bdf8',
    transition: 'width 0.3s ease',
  },

  inspectBadgesRow: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    paddingTop: '2px',
  },

  inspectDismiss: {
    fontSize: '8px',
    color: '#52525b',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingTop: '2px',
  },
};

export default BehemothGame;
