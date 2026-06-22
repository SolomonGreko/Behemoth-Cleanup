/**
 * ResourceHUD.jsx — Resource display component.
 *
 * Renders three resource counters (Bastion Shale, Sorrowglass Shards, Ward-Light)
 * in a horizontal panel for the Behemoth game HUD.
 *
 * Display rules:
 *   - Icons: 48×48 PNG pixel-art, rendered with image-rendering: pixelated.
 *   - Counters: monospace font.
 *   - Rate indicator: smaller font, grayed, only shown when rate > 0.
 *   - atCap state: counter text turns amber/gold; "FULL" label replaces rate.
 *   - Tooltip on hover (dev-HUD): shows lore name, count, flavor text, breakdown.
 *
 * Data flows from sim.resourceHUD via the useGameLoop pattern.
 * This component is a pure render — no state mutation.
 */

import React from 'react';

import stoneIcon from './icons/stone.png';
import crystalIcon from './icons/crystal.png';
import essenceIcon from './icons/essence.png';

// ── Resource Metadata ───────────────────────────────────────────────

/** Lore display names (Calliope). */
const RESOURCE_DISPLAY_NAMES = {
  stone: 'Bastion Shale',
  crystal: 'Sorrowglass Shards',
  essence: 'Ward-Light',
};

/** Short-form flavor text for tooltips (Calliope). */
const RESOURCE_FLAVOR_TEXT = {
  stone:
    'Quarried from the fallen bastions of the east. Each fragment was once part of a wall, a forge, a gate that held the Shroud at bay for a thousand years.',
  crystal:
    'The last defiance of a soul the Shroud could not fully unmake. Cold to the touch, sharp as a widow\'s keening.',
  essence:
    'The old resonance, made visible. It pools where the wardstone\'s song is strongest — a slow, breathing vapour that tastes of ozone and half-remembered music.',
};

/** Color tokens from Aphrodite's visual spec. */
const RESOURCE_COLORS = {
  stone: '#b8a88a',
  crystal: '#70a0e0',
  essence: '#e8c870',
};

/** Icon map keyed by resource type. */
const RESOURCE_ICONS = {
  stone: stoneIcon,
  crystal: crystalIcon,
  essence: essenceIcon,
};

// ── Resource Icon Component ─────────────────────────────────────────

/**
 * Renders a resource icon as a pixel-art PNG <img>.
 * 48×48 native, displayed at 28×28 in the HUD hit area.
 */
function ResourceIcon({ type, size = 28 }) {
  const src = RESOURCE_ICONS[type];
  return (
    <img
      src={src}
      alt={RESOURCE_DISPLAY_NAMES[type]}
      width={size}
      height={size}
      style={{
        imageRendering: 'pixelated',
        display: 'block',
      }}
    />
  );
}

// ── HUD Component ───────────────────────────────────────────────────

/**
 * ResourceHUD — top-level resource display panel.
 *
 * Props:
 *   @param {object} hudData — from sim.resourceHUD (buildResourceHUD output)
 *   @param {boolean} [compact=false] — compact mode for minimal UI
 *   @param {function} [onClick] — callback when a resource counter is clicked
 */
export function ResourceHUD({ hudData, compact = false, onClick }) {
  if (!hudData || !hudData.resources) {
    return null;
  }

  const { resources, anyAtCap } = hudData;

  return (
    <div
      className={`resource-hud ${compact ? 'resource-hud--compact' : ''}`}
      style={styles.container}
      role="region"
      aria-label="Resources"
    >
      {anyAtCap && (
        <div style={styles.capWarning} aria-live="polite">
          ⚠ Storage Full
        </div>
      )}

      <div style={styles.counters}>
        <ResourceCounter
          type="stone"
          data={resources.stone}
          icon={<ResourceIcon type="stone" />}
          compact={compact}
          onClick={() => onClick?.('stone')}
        />
        <ResourceCounter
          type="crystal"
          data={resources.crystal}
          icon={<ResourceIcon type="crystal" />}
          compact={compact}
          onClick={() => onClick?.('crystal')}
        />
        <ResourceCounter
          type="essence"
          data={resources.essence}
          icon={<ResourceIcon type="essence" />}
          compact={compact}
          onClick={() => onClick?.('essence')}
        />
      </div>
    </div>
  );
}

/**
 * ResourceCounter — individual resource display.
 *
 * Shows: [icon] current/cap (+rate/s, source)
 * When atCap: counter text amber, "FULL" label replaces rate.
 *
 * @param {object} props
 * @param {string} props.type — 'stone' | 'crystal' | 'essence'
 * @param {object} props.data — { current, cap, rate, rateSource, atCap }
 * @param {ReactNode} props.icon — icon component
 * @param {boolean} props.compact
 * @param {function} props.onClick
 */
function ResourceCounter({ type, data, icon, compact, onClick }) {
  const { current, cap, rate, rateSource, atCap } = data;
  const displayName = RESOURCE_DISPLAY_NAMES[type];

  // Determine display classes
  const counterStyle = {
    ...styles.counter,
    ...(atCap ? styles.counterAtCap : {}),
  };

  return (
    <div
      className={`resource-counter resource-counter--${type}`}
      style={counterStyle}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      role="button"
      tabIndex={0}
      aria-label={`${displayName}: ${current} of ${cap}${atCap ? ', full' : ''}`}
      title={buildTooltip(type, data)}
    >
      <div style={styles.iconArea}>
        {icon}
      </div>

      <div style={styles.textArea}>
        <div style={styles.amount}>
          <span style={{ ...styles.currentValue, color: RESOURCE_COLORS[type] }}>
            {current}
          </span>
          <span style={styles.separator}>/</span>
          <span style={styles.capValue}>{cap}</span>
        </div>

        {!compact && (
          <div style={styles.rateArea}>
            {atCap ? (
              <span style={styles.fullLabel}>FULL</span>
            ) : rate > 0 ? (
              <span style={styles.rateLabel}>
                +{rate.toFixed(1)}/s
              </span>
            ) : null}
          </div>
        )}

        {!compact && rateSource && !atCap && (
          <div style={styles.rateSource}>{rateSource}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Build a tooltip string for dev-HUD hover display.
 * Includes lore name, count, flavor text, and breakdown.
 */
function buildTooltip(type, data) {
  const { current, cap, rateSource, atCap } = data;
  const displayName = RESOURCE_DISPLAY_NAMES[type];
  const flavor = RESOURCE_FLAVOR_TEXT[type];

  const lines = [
    `${displayName}: ${current}/${cap}`,
  ];

  if (flavor) {
    lines.push('');
    lines.push(flavor);
  }

  if (atCap) {
    lines.push('');
    lines.push('Storage full — accumulate to expand cap');
  } else if (rateSource && rateSource !== '\u2014') {
    lines.push('');
    lines.push(rateSource);
  }

  return lines.join('\n');
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: '8px',
    fontFamily: "'Courier New', monospace",
    fontSize: '14px',
    color: '#E0E0E0',
    userSelect: 'none',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },

  capWarning: {
    fontSize: '11px',
    color: '#FFB300',
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },

  counters: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
  },

  counter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },

  counterAtCap: {
    color: '#FFB300', // amber/gold
  },

  iconArea: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  textArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: '80px',
  },

  amount: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
    fontSize: '16px',
    fontWeight: 'bold',
  },

  currentValue: {
    fontVariantNumeric: 'tabular-nums',
  },

  separator: {
    color: '#666666',
    fontSize: '12px',
  },

  capValue: {
    color: '#888888',
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums',
  },

  rateArea: {
    minHeight: '14px',
  },

  fullLabel: {
    fontSize: '11px',
    color: '#FFB300',
    fontWeight: 'bold',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },

  rateLabel: {
    fontSize: '11px',
    color: '#81C784', // green tint for positive rate
  },

  rateSource: {
    fontSize: '10px',
    color: '#777777',
    fontStyle: 'italic',
  },
};

export default ResourceHUD;

// ═══════════════════════════════════════════════════════════════════════
// BOT LABOUR HUD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compact bot labour state display.
 * Renders a single row of state indicators — only states with >0 bots.
 *
 * States:
 *   HRV (amber)  — harvesting stone
 *   RTR (sky)    — returning with stone
 *   RPR (rose)   — repairing walls
 *   BLD (emerald)— building
 *   TIL (lime)   — tilling
 *   IDL (zinc)   — idle
 *
 * @param {object} props
 * @param {object} props.botLabour — { harvesting, returning, repairing, building, tilling, idle }
 */
export function BotLabourHUD({ botLabour }) {
  if (!botLabour) return null;

  const states = [
    { key: 'harvesting', label: 'HRV', color: '#fbbf24', full: 'Harvesting' },
    { key: 'returning',  label: 'RTR', color: '#38bdf8', full: 'Returning' },
    { key: 'repairing',  label: 'RPR', color: '#fb7185', full: 'Repairing' },
    { key: 'building',   label: 'BLD', color: '#34d399', full: 'Building' },
    { key: 'tilling',    label: 'TIL', color: '#a3e635', full: 'Tilling' },
    { key: 'idle',       label: 'IDL', color: '#71717a', full: 'Idle' },
  ];

  const active = states.filter((s) => botLabour[s.key] > 0);

  // Nothing to show — hide the section entirely
  if (active.length === 0) {
    return null;
  }

  const total = states.reduce((sum, s) => sum + botLabour[s.key], 0);

  return (
    <div className="bot-labour-hud" style={labourStyles.container} role="region" aria-label="Bot activity">
      <div style={labourStyles.header}>
        <span style={labourStyles.headerLabel}>BOTS</span>
        <span style={labourStyles.totalCount}>{total}</span>
      </div>
      <div style={labourStyles.row}>
        {active.map((s) => (
          <span
            key={s.key}
            className={`labour-state labour-state--${s.key}`}
            style={labourStyles.chip}
            title={`${s.full}: ${botLabour[s.key]} bot${botLabour[s.key] !== 1 ? 's' : ''}`}
          >
            <span style={{ ...labourStyles.label, color: s.color }}>{s.label}</span>
            <span style={labourStyles.count}>{botLabour[s.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Labour Styles ───────────────────────────────────────────────────

const labourStyles = {
  container: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '6px 12px',
    background: 'rgba(0, 0, 0, 0.65)',
    borderRadius: '8px',
    fontFamily: \"'Courier New', monospace\",
    fontSize: '10px',
    color: '#e4e4e7',
    userSelect: 'none',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerLabel: {
    fontSize: '8px',
    color: '#71717a',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },

  totalCount: {
    fontSize: '10px',
    color: '#a1a1aa',
    fontVariantNumeric: 'tabular-nums',
  },

  row: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },

  chip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '2px',
  },

  label: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },

  count: {
    fontSize: '9px',
    color: '#d4d4d8',
    fontVariantNumeric: 'tabular-nums',
  },
};
