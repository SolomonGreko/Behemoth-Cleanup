/**
 * render.js — Canvas rendering for Behemoth game entities.
 *
 * Pure rendering functions that take a CanvasRenderingContext2D and
 * sim state, called from the React canvas component (BehemothGame.jsx).
 *
 * Domain: Hephaestus (engine-side rendering math)
 * Visual styling: Aphrodite (colors, fonts, animation feel)
 */

import { BASE, LEVEL, DAY_CYCLE } from './config.js';
import { drawBackground, drawStoneZones } from './render/background.js';
import { drawDayNightOverlay, drawSelectionRing } from './render/hud.js';
import {
  hexToRgba,
  drawDeathParticles,
  drawCrystalDrops,
  drawEnemies,
  drawBossShockwaves,
  drawTurretMuzzleFlashes,
  drawTurrets,
  drawBots,
  drawWalls,
} from './render/entities.js';

// Re-export for external consumers (index.js)
export {
  drawBackground,
  drawStoneZones,
  drawDayNightOverlay,
  drawSelectionRing,
  hexToRgba,
  drawDeathParticles,
  drawCrystalDrops,
  drawEnemies,
  drawBossShockwaves,
  drawTurretMuzzleFlashes,
  drawTurrets,
  drawBots,
  drawWalls,
};
