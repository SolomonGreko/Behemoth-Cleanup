/**
 * render/background.js — Background rendering for Behemoth game.
 *
 * Pure rendering functions for the atmospheric background layer:
 * sky gradient, per-cell terrain rendering (grass, moss, dirt, ground, water),
 * tactical grid overlay, radial vignette, ambient dust motes,
 * and stone harvest zone terrain.
 *
 * All functions take a CanvasRenderingContext2D and sim state.
 * No default exports — named exports only.
 *
 * Extracted from render.js — pure extraction, no logic changes.
 */

import { DAY_CYCLE } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════
// TERRAIN PALETTE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Terrain type visual definitions.
 *
 * base: [R, G, B] — base colour per channel (0-255)
 * var:  max per-channel random variation (±var/2)
 *
 * Grass uses rich greens with noticeable variation for a living-field feel.
 * Moss is darker, more muted — the transition zone between grass and dirt.
 * Dirt is warm brown-grey — exposed earth, stone harvest areas.
 * Ground is neutral brown — default terrain, the "untended earth".
 * Water is deep blue — pools and streams with animated shimmer.
 */
const TERRAIN = {
  GRASS:  { base: [38, 70, 32],  var: 14, label: 'grass' },
  MOSS:   { base: [30, 52, 28],  var: 8,  label: 'moss' },
  DIRT:   { base: [62, 48, 34],  var: 10, label: 'dirt' },
  GROUND: { base: [48, 38, 28],  var: 8,  label: 'ground' },
  WATER:  { base: [22, 55, 100], var: 5,  label: 'water' },
};

// Cached terrain ImageData (rebuilt only when world grid changes)
let _terrainCache = null;
let _cachedGridRef = null;
let _cachedScale = 0;

/**
 * Deterministic seed from cell coordinates.
 * Stable across frames — no tick dependency.
 */
function cellSeed(x, y) {
  return (x * 374761393 + y * 668265263) & 0x7fffffff;
}

/**
 * Get terrain type string for a cell.
 */
function getTerrainType(cell) {
  if (!cell) return 'GROUND';
  if (cell.type === 'water') return 'WATER';
  if (cell.harvestable === 'stone') return 'DIRT';
  if (cell.grass) return 'GRASS';
  if (cell.moss) return 'MOSS';
  return 'GROUND';
}

/**
 * Get a per-cell terrain RGB colour string with deterministic variation.
 *
 * @param {number} x — cell x coordinate
 * @param {number} y — cell y coordinate
 * @param {string} type — terrain type key
 * @returns {string} 'rgb(r, g, b)' colour
 */
function terrainRGB(x, y, type) {
  const t = TERRAIN[type];
  if (!t) return 'rgb(48,38,28)';

  const seed = cellSeed(x, y);
  const chop = (n, s) => {
    const half = Math.floor(t.var / 2);
    return Math.max(0, Math.min(255, n + ((s * 7 + n * 3) % (t.var + 1)) - half));
  };

  const r = chop(t.base[0], seed);
  const g = chop(t.base[1], seed + 1);
  const b = chop(t.base[2], seed + 2);

  return `rgb(${r},${g},${b})`;
}

// ═══════════════════════════════════════════════════════════════════════
// BACKGROUND DRAWING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw atmospheric background: sky gradient, per-cell terrain, tactical grid,
 * radial vignette, ambient dust motes.
 *
 * Establishes the "beautiful desolation" aesthetic — a living world seen
 * from above, with rich terrain variation and responsive day/night lighting.
 *
 * Called once per frame before all entity drawing (pre-fog).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW — canvas pixel width
 * @param {number} canvasH — canvas pixel height
 * @param {object} sim — sim state (reads sim.world, sim.baseCenter, sim.tick, sim.hud)
 * @param {number} scale — pixels per cell
 */
export function drawBackground(ctx, canvasW, canvasH, sim, scale) {
  const { baseCenter, tick = 0, hud, world } = sim;
  const cx = (baseCenter?.x ?? 0) * scale;
  const cy = (baseCenter?.y ?? 0) * scale;

  // ── Night factor for phase-responsive visuals ────────────────────
  // 0.0 = broad daylight, 1.0 = deepest night
  let nightFactor = 0.5;
  if (hud?.dayPhase) {
    const phaseWeights = { dawn: 0.3, day: 0.0, dusk: 0.7, night: 1.0 };
    const baseWeight = phaseWeights[hud.dayPhase] ?? 0.5;
    const blend = hud.phaseBlend ?? 0;
    const phaseIdx = DAY_CYCLE.phaseOrder.indexOf(hud.dayPhase);
    const nextPhase = DAY_CYCLE.phaseOrder[(phaseIdx + 1) % 4];
    const nextWeight = phaseWeights[nextPhase] ?? 0.5;
    nightFactor = baseWeight + (nextWeight - baseWeight) * blend;
  }

  // ── Layer 1: Sky gradient ────────────────────────────────────────
  // Warm sky blue at top fading to terrain earth-tone below.
  // Night deepens the sky toward indigo and darkens the transition.
  ctx.save();

  const skyHeight = Math.floor(canvasH * 0.28); // top 28% is sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, skyHeight);

  // Day sky: #87CEEB → earth tone. Night: #191970 → near-black earth.
  const skyTopR = Math.round(135 - nightFactor * 110);  // 135 → 25
  const skyTopG = Math.round(206 - nightFactor * 181);  // 206 → 25
  const skyTopB = Math.round(235 - nightFactor * 123);  // 235 → 112

  const earthR = Math.round(12 - nightFactor * 4);   // 12 → 8
  const earthG = Math.round(18 - nightFactor * 6);    // 18 → 12
  const earthB = Math.round(14 - nightFactor * 6);    // 14 → 8

  skyGrad.addColorStop(0, `rgb(${skyTopR},${skyTopG},${skyTopB})`);
  skyGrad.addColorStop(0.65, `rgb(${Math.round((skyTopR + earthR) / 2)},${Math.round((skyTopG + earthG) / 2)},${Math.round((skyTopB + earthB) / 2)})`);
  skyGrad.addColorStop(1, `rgb(${earthR},${earthG},${earthB})`);

  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvasW, skyHeight);
  ctx.restore();

  // ── Layer 2: Per-cell terrain rendering ──────────────────────────
  // Uses run-length encoding to batch consecutive same-type cells
  // within each row, then draws individual cell rects for colour variation.
  // 16,384 cells × ~8×8px each ≈ trivial cost for modern Canvas.
  if (world?.grid) {
    ctx.save();
    const cellSize = scale;
    const rows = world.grid.length;
    const cols = world.grid[0]?.length ?? 0;

    for (let y = 0; y < rows; y++) {
      const row = world.grid[y];
      if (!row) continue;

      let runStart = 0;
      let runType = null;

      for (let x = 0; x <= cols; x++) {
        const type = x < cols ? getTerrainType(row[x]) : null;

        if (type !== runType || x === cols) {
          // ── Flush current run ─────────────────────────────────
          if (runType && runStart < x) {
            const isWater = runType === 'WATER';

            for (let rx = runStart; rx < x; rx++) {
              const px = rx * cellSize;
              const py = y * cellSize;

              if (isWater) {
                // ── Water: animated shimmer ────────────────────
                const phase = tick * 0.04 + (rx + y) * 0.37;
                const shimmer = Math.sin(phase) * 7;
                const shimmer2 = Math.cos(phase * 1.3 + 1.2) * 5;
                const r = 22 + shimmer * 0.3;
                const g = Math.max(20, 55 + shimmer * 0.6 + shimmer2 * 0.4);
                const b = Math.min(180, 100 + shimmer + shimmer2 * 0.5);

                ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
                ctx.fillRect(px, py, cellSize, cellSize);

                // Subtle ripple highlight
                const ripplePhase = tick * 0.06 + rx * 0.5 + y * 0.3;
                const rippleAlpha = Math.max(0, Math.sin(ripplePhase) * 0.12);
                if (rippleAlpha > 0.01) {
                  ctx.fillStyle = `rgba(160,210,255,${rippleAlpha.toFixed(3)})`;
                  ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
                }
              } else {
                // ── Standard terrain with colour variation ─────
                ctx.fillStyle = terrainRGB(rx, y, runType);
                ctx.fillRect(px, py, cellSize, cellSize);

                // Subtle texture speckle for grass/dirt
                if ((runType === 'GRASS' || runType === 'MOSS' || runType === 'GROUND') &&
                    (cellSeed(rx, y) % 5 === 0)) {
                  const speckX = px + (cellSeed(rx + 100, y) % cellSize);
                  const speckY = py + (cellSeed(rx, y + 200) % cellSize);
                  const speckAlpha = 0.04 + (cellSeed(rx, y + 300) % 5) / 100;
                  ctx.fillStyle = runType === 'GRASS'
                    ? `rgba(80,140,60,${speckAlpha})`
                    : `rgba(70,55,40,${speckAlpha})`;
                  ctx.fillRect(speckX, speckY, 2, 2);
                }
              }
            }
          }

          runStart = x;
          runType = type;
        }
      }
    }

    ctx.restore();
  } else {
    // ── Fallback: flat terrain fill when no world grid ─────────
    ctx.save();
    ctx.fillStyle = '#0e140e';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  // ── Layer 3: Subtle tactical grid ────────────────────────────────
  // Thin monospace-green lines at cell intervals — like a comms overlay.
  // Major grid lines (every 8 cells) are slightly more visible.
  // Grid alpha pulses gently with the day/night cycle.
  const gridAlphaMinor = 0.015 + nightFactor * 0.04;  // 0.015 day → 0.055 night
  const gridAlphaMajor = 0.025 + nightFactor * 0.06;  // 0.025 day → 0.085 night
  const gridAlphaMinorStr = gridAlphaMinor.toFixed(4);
  const gridAlphaMajorStr = gridAlphaMajor.toFixed(4);
  const cellSize = scale;
  const majorInterval = 8; // every 8 cells

  ctx.save();

  // Minor grid lines (every cell)
  ctx.strokeStyle = `rgba(34,197,94,${gridAlphaMinorStr})`;
  ctx.lineWidth = 0.5;

  for (let x = cellSize; x < canvasW; x += cellSize) {
    if (x % (majorInterval * cellSize) === 0) continue; // skip majors
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }

  for (let y = cellSize; y < canvasH; y += cellSize) {
    if (y % (majorInterval * cellSize) === 0) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }

  // Major grid lines (every 8 cells) — slightly thicker, more visible
  ctx.strokeStyle = `rgba(34,197,94,${gridAlphaMajorStr})`;
  ctx.lineWidth = 0.7;

  for (let x = majorInterval * cellSize; x < canvasW; x += majorInterval * cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }

  for (let y = majorInterval * cellSize; y < canvasH; y += majorInterval * cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
  ctx.restore();

  // ── Layer 4: Radial vignette ────────────────────────────────────
  // Darkens toward canvas edges, softens toward the base center.
  // Night deepens the vignette — edges become nearly black.
  const vignetteIntensity = 0.55 + nightFactor * 0.35;  // 0.55 day → 0.90 night
  const maxDim = Math.max(canvasW, canvasH);

  ctx.save();
  const vignette = ctx.createRadialGradient(
    cx, cy, maxDim * 0.15,   // inner: bright zone around base
    cx, cy, maxDim * 0.75     // outer: dark edge
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.35, `rgba(0, 0, 0, ${vignetteIntensity * 0.15})`);
  vignette.addColorStop(0.7, `rgba(0, 0, 0, ${vignetteIntensity * 0.6})`);
  vignette.addColorStop(1, `rgba(0, 0, 0, ${vignetteIntensity})`);

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();

  // ── Layer 5: Ambient dust motes ─────────────────────────────────
  // Tiny, slow-drifting particles in the darker zones — adds depth.
  // Seeded deterministically from tick so they don't jitter per-frame.
  const moteCount = Math.floor((canvasW * canvasH) / 8000);  // ~1 per 8000 px²
  const moteAlpha = 0.08 + nightFactor * 0.14;  // 0.08 day → 0.22 night

  ctx.save();
  for (let i = 0; i < moteCount; i++) {
    // Deterministic pseudo-random from tick + i
    const seed = (tick * 137 + i * 251) % 10007;
    const mx = ((seed * 173) % 10007) / 10007 * canvasW;
    const my = ((seed * 419) % 10007) / 10007 * canvasH;
    const mr = 0.6 + ((seed * 73) % 100) / 100 * 1.2;  // 0.6–1.8px radius
    const ma = moteAlpha * (0.4 + ((seed * 59) % 100) / 100 * 0.6);  // varied alpha

    ctx.fillStyle = `rgba(180, 200, 180, ${ma})`;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// STONE HARVEST ZONE RENDERING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Draw stone harvest zones as rocky terrain patches on the game canvas.
 *
 * Iterates the world grid and renders rocky terrain on cells tagged
 * `harvestable: 'stone'`. Each stone cell gets a cluster of 2-4 irregular
 * angular rock shapes in earthy gray/brown tones — quarried stone, not
 * scrap metal. Visually distinct from car wreck debris.
 *
 * Rendering is deterministic (seeded from cell coordinates only) so rocks
 * appear static and grounded frame-to-frame. Stone zones render at terrain
 * level — below the base, walls, and all entities.
 *
 * Called once per frame after drawBackground, before drawBase.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sim — sim state (reads sim.world.grid, sim.world.width/height)
 * @param {number} scale — pixels per cell
 */
export function drawStoneZones(ctx, sim, scale) {
  const { world } = sim;
  if (!world?.grid) return;

  const cellSize = scale;

  for (let y = 0; y < world.height; y++) {
    const row = world.grid[y];
    if (!row) continue;

    for (let x = 0; x < world.width; x++) {
      const cell = row[x];
      if (!cell || cell.harvestable !== 'stone') continue;

      const px = x * cellSize;
      const py = y * cellSize;

      // Deterministic seed from cell coordinates (NOT tick —
      // stone positions are permanently static)
      const seed = (x * 374761393 + y * 668265263) & 0x7fffffff;

      // ── Base: dark earthy fill (anchors the rocks to the ground) ─
      ctx.save();
      ctx.fillStyle = 'rgba(29, 20, 14, 0.65)'; // dark brown earth
      ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

      // ── Rock cluster: 2–4 angular stones per zone cell ──────────
      const rockCount = 2 + (seed % 3); // 2, 3, or 4 rocks

      for (let i = 0; i < rockCount; i++) {
        const subSeed = seed + i * 7919;

        // Position within cell (avoid edges — keep 0.08–0.85 range)
        const rx = px + cellSize * (0.08 + ((subSeed * 173) & 0xff) / 255 * 0.77);
        const ry = py + cellSize * (0.08 + ((subSeed * 419) & 0xff) / 255 * 0.77);

        // Size: 0.3–0.6 of cell width, 0.25–0.5 of cell height
        const rw = cellSize * (0.28 + ((subSeed * 73) & 0x7f) / 127 * 0.32);
        const rh = cellSize * (0.22 + ((subSeed * 251) & 0x7f) / 127 * 0.28);

        // Slight rotation for natural irregularity (±0.15 rad)
        const angle = ((subSeed * 137) & 0xff) / 255 * 0.3 - 0.15;

        // Stone color: warm grey-brown with natural variance
        // Base: #78716c (warm stone) with ±20 variation per channel
        const shade = 0.35 + ((subSeed * 59) & 0x3f) / 63 * 0.3;
        const sr = Math.round(110 + shade * 40);
        const sg = Math.round(100 + shade * 35);
        const sb = Math.round(90 + shade * 30);

        ctx.save();
        ctx.translate(rx + rw / 2, ry + rh / 2);
        ctx.rotate(angle);

        // ── Shadow: slightly larger dark offset for depth ─────────
        ctx.beginPath();
        drawRockPolygon(ctx, -rw / 2 + 1, -rh / 2 + 1, rw, rh, subSeed + 1);
        ctx.fillStyle = 'rgba(15, 12, 8, 0.4)';
        ctx.fill();

        // ── Body: angular rock polygon ────────────────────────────
        ctx.beginPath();
        drawRockPolygon(ctx, -rw / 2, -rh / 2, rw, rh, subSeed);
        ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.85)`;
        ctx.fill();

        // ── Edge: darker outline for definition ───────────────────
        ctx.strokeStyle = `rgba(${Math.round(sr * 0.45)}, ${Math.round(sg * 0.45)}, ${Math.round(sb * 0.45)}, 0.55)`;
        ctx.lineWidth = Math.max(0.5, scale * 0.18);
        ctx.stroke();

        // ── Highlight: lighter streak on upper facet ──────────────
        const hr = Math.min(255, sr + 50);
        const hg = Math.min(255, sg + 45);
        const hb = Math.min(255, sb + 40);
        ctx.beginPath();
        ctx.moveTo(-rw * 0.25, -rh * 0.35);
        ctx.lineTo(rw * 0.15, -rh * 0.38);
        ctx.lineTo(rw * 0.35, -rh * 0.1);
        ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, 0.3)`;
        ctx.lineWidth = Math.max(0.3, scale * 0.12);
        ctx.stroke();

        ctx.restore();
      }

      // ── Dust motes: 1–2 tiny speckles for texture ───────────────
      const moteAlpha = 0.15 + ((seed * 97) & 0x3f) / 63 * 0.1;
      const moteCount = 1 + (seed & 1);
      for (let m = 0; m < moteCount; m++) {
        const mx = px + cellSize * (0.15 + ((seed + m * 313) & 0x7f) / 127 * 0.7);
        const my = py + cellSize * (0.15 + ((seed + m * 557) & 0x7f) / 127 * 0.7);
        const mr = scale * (0.3 + ((seed + m * 617) & 0x3) / 3 * 0.5);

        ctx.fillStyle = `rgba(160, 150, 135, ${moteAlpha})`;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }
}

/**
 * Draw an irregular polygonal rock shape with slight vertex jitter.
 *
 * Uses 6 vertices for an angular, quarried-stone silhouette —
 * chunky edges with subtle random offset, not smooth organic curves.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — top-left origin x
 * @param {number} y — top-left origin y
 * @param {number} w — bounding width
 * @param {number} h — bounding height
 * @param {number} seed — deterministic seed for vertex perturbation
 */
function drawRockPolygon(ctx, x, y, w, h, seed) {
  // Vertex positions as fractions of [x, x+w], [y, y+h]
  // + small jitter from seed for natural irregularity
  const jitter = (n, s) => ((s * n) & 0xf) / 15 * w * 0.12;

  ctx.moveTo(
    x + w * 0.05 + jitter(3, seed),
    y + h * 0.12 + jitter(7, seed)
  );
  ctx.lineTo(
    x + w * 0.82 + jitter(11, seed),
    y + h * 0.04 + jitter(13, seed)
  );
  ctx.lineTo(
    x + w * 0.94 + jitter(17, seed),
    y + h * 0.48 + jitter(19, seed)
  );
  ctx.lineTo(
    x + w * 0.78 + jitter(23, seed),
    y + h * 0.88 + jitter(29, seed)
  );
  ctx.lineTo(
    x + w * 0.28 + jitter(31, seed),
    y + h * 0.93 + jitter(37, seed)
  );
  ctx.lineTo(
    x + w * 0.03 + jitter(41, seed),
    y + h * 0.55 + jitter(43, seed)
  );
  ctx.closePath();
}
