/**
 * render/hud.js — Canvas HUD rendering for Behemoth.
 *
 * Heads-up display elements drawn on the game canvas:
 * health bars (status), selection rings (UI), and ambient overlays.
 *
 * Pure rendering functions — take a CanvasRenderingContext2D and sim state.
 * No default exports — named exports only.
 *
 * Extracted from render.js — pure extraction, no logic changes.
 */

import { DAY_CYCLE } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════
// HEALTH BAR (status bar — drawn above entities in world space)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw a thin health bar above an entity's world position.
 *
 * The bar is 1.6× the entity's size in width, positioned 0.4 cells
 * above the entity center. Fill transitions from green (full HP) to
 * red (low HP) with a dark background track. Alpha fades below 40%.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} screenX — canvas pixel x of entity center
 * @param {number} screenY — canvas pixel y of entity center
 * @param {number} hp — current HP
 * @param {number} maxHp — maximum HP
 * @param {number} entitySize — render size in cells (for bar width)
 * @param {number} scale — pixels per cell
 */
export function drawHealthBar(ctx, screenX, screenY, hp, maxHp, entitySize, scale) {
  if (maxHp <= 0) return;

  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const barW = entitySize * 1.6 * scale;
  const barH = Math.max(2, scale * 0.25);
  const barX = screenX - barW / 2;
  const barY = screenY - (entitySize * 0.7) * scale;

  // Color lerp: green (full) → amber (mid) → red (low)
  let barColor;
  if (ratio > 0.5) {
    // Green → Amber
    const t = (1 - ratio) * 2; // 0 at 1.0, 1 at 0.5
    barColor = `rgba(${Math.round(34 + (245 - 34) * t)}, ${Math.round(197 + (158 - 197) * t)}, ${Math.round(94 + (11 - 94) * t)}, 0.85)`;
  } else {
    // Amber → Red
    const t = (0.5 - ratio) * 2; // 0 at 0.5, 1 at 0.0
    barColor = `rgba(${Math.round(245 + (239 - 245) * t)}, ${Math.round(158 + (68 - 158) * t)}, ${Math.round(11 + (68 - 11) * t)}, 0.85)`;
  }

  ctx.save();

  // Background track (dark)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(barX, barY, barW, barH);

  // Health fill
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, barW * ratio, barH);

  // Subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// SELECTION RING (UI indicator — drawn around selected turret)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw a selection ring around the currently selected turret.
 *
 * Renders a 1–2px glow border at #6ba4c7 (60% alpha) with a subtle
 * pulse animation. Called after all turrets are drawn so the ring
 * sits on top of the selected turret.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.selectedEntityId, sim.turrets)
 * @param {number} scale — pixels per cell
 */
export function drawSelectionRing(ctx, sim, scale) {
  const { selectedEntityId, turrets = [] } = sim;
  if (selectedEntityId == null) return;

  const turret = turrets.find((t) => t.id === selectedEntityId && t.alive);
  if (!turret) return;

  const isAdvanced = turret.type === 'turret';
  const r = (isAdvanced ? 0.65 : 0.5) * (turret.mounted ? 1.15 : 1.0) * scale;
  const sx = turret.x * scale;
  const sy = turret.y * scale;
  const ringR = r * 1.3;

  ctx.save();

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(107, 164, 199, 0.6)';  // #6ba4c7 at 60%
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.stroke();

  // Inner crisp ring (1px)
  ctx.beginPath();
  ctx.arc(sx, sy, ringR * 0.88, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(107, 164, 199, 0.85)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// DAY/NIGHT AMBIENT OVERLAY (Aphrodite — atmospheric final pass)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Day/night phase ambient overlay tints per phase.
 *
 * Each phase has a tint color, alpha ceiling, and composite operation.
 * The overlay is the final render pass — it sits above all entities
 * and transforms the emotional register of the entire scene.
 *
 * Composite operation choices:
 *   - 'multiply' for night: darkens everything, deepens shadows
 *   - 'overlay' for dusk: rich orange-blue tension, contrast boost
 *   - 'source-atop' with alpha for dawn: warm wash
 *   - plain alpha fill for day: barely-there, doesn't flatten contrast
 */
const PHASE_AMBIENT = {
  dawn:  { color: '#F4A460', alpha: 0.10, composite: 'source-atop', desc: 'warm amber wash — the wardstone stirs' },
  day:   { color: '#FFF8E7', alpha: 0.03, composite: 'source-over', desc: 'barely-there warmth — safe, bright' },
  dusk:  { color: '#FF6B35', alpha: 0.14, composite: 'overlay',     desc: 'deepening orange-blue — the Shroud gathers' },
  night: { color: '#0a0a20', alpha: 0.22, composite: 'multiply',    desc: 'deep midnight — darkness absolute' },
};

/**
 * Draw the day/night ambient overlay as the final render pass.
 *
 * Applies a full-canvas phase-tinted overlay with smooth transitions
 * between phases (using hud.phaseBlend). The overlay sits above all
 * entity drawing — background, base, enemies, turrets, bots, walls,
 * particles, shockwaves — and below any HUD/UI chrome (which renders
 * in the React DOM layer, not on the canvas).
 *
 * Night uses 'multiply' composite mode which preserves entity glow
 * effects (shadowBlur, lighter-mode flashes) while darkening the
 * background. This creates a natural "glow pops at night" effect
 * without any entity-specific logic.
 *
 * A subtle vignette darkening is applied at night to draw the eye
 * toward the center (the base) and create a claustrophobic feel.
 *
 * Called once per frame, after all entity draw calls, before the
 * canvas is presented to the DOM.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW — canvas pixel width
 * @param {number} canvasH — canvas pixel height
 * @param {object} sim — sim state (reads sim.hud)
 * @param {number} tick — current sim tick (for subtle pulsing)
 */
export function drawDayNightOverlay(ctx, canvasW, canvasH, sim, tick) {
  const { hud } = sim;
  if (!hud?.dayPhase) return;

  const fromKey = hud.dayPhase;
  const from = PHASE_AMBIENT[fromKey] || PHASE_AMBIENT.day;

  // Blend toward next phase
  const phaseIdx = DAY_CYCLE.phaseOrder.indexOf(fromKey);
  const nextKey = DAY_CYCLE.phaseOrder[(phaseIdx + 1) % 4];
  const to = PHASE_AMBIENT[nextKey] || PHASE_AMBIENT.day;
  const blend = hud.phaseBlend ?? 0;

  // Lerp color channels
  const fc = hexToRgb(from.color);
  const tc = hexToRgb(to.color);
  const rc = Math.round(fc.r + (tc.r - fc.r) * blend);
  const gc = Math.round(fc.g + (tc.g - fc.g) * blend);
  const bc = Math.round(fc.b + (tc.b - fc.b) * blend);

  // Lerp alpha
  const alpha = from.alpha + (to.alpha - from.alpha) * blend;

  // Composite mode: use the dominant mode (from), transition at blend > 0.5
  const composite = blend < 0.5 ? from.composite : to.composite;

  if (alpha < 0.005) return; // invisible — skip

  ctx.save();

  // ── Main phase tint fill ────────────────────────────────────────
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = `rgba(${rc}, ${gc}, ${bc}, ${alpha})`;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ── Night vignette: radial darkening toward edges ────────────────
  // Only active during night and night-leaning transitions.
  // Uses screen-space center-of-mass (baseCenter) if available,
  // else falls back to canvas center.
  const nightWeight = fromKey === 'night' ? (1 - blend)
    : nextKey === 'night' ? blend
    : 0;

  if (nightWeight > 0.05) {
    // Base center for vignette origin
    const bcx = (sim.baseCenter?.x ?? sim.world.width / 2) * (canvasW / (sim.world.width || 50));
    const bcy = (sim.baseCenter?.y ?? sim.world.height / 2) * (canvasH / (sim.world.height || 50));
    const maxDim = Math.max(canvasW, canvasH);

    ctx.globalCompositeOperation = 'multiply';

    const vignette = ctx.createRadialGradient(
      bcx, bcy, maxDim * 0.1,
      canvasW / 2, canvasH / 2, maxDim * 0.75
    );
    const vAlpha = nightWeight * 0.35; // max 35% edge darkening at full night
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.4, `rgba(0, 0, 10, ${vAlpha * 0.3})`);
    vignette.addColorStop(0.75, `rgba(0, 0, 10, ${vAlpha * 0.8})`);
    vignette.addColorStop(1, `rgba(0, 0, 10, ${vAlpha})`);

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  ctx.restore();
}

/**
 * Parse a hex color string into { r, g, b } integer components.
 *
 * @param {string} hex — '#rrggbb'
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
