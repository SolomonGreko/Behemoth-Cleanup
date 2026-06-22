/**
 * render.test.js — Regression tests for render.js functions.
 *
 * Minimal tests that verify render functions don't throw on valid input.
 * Full visual regression testing requires a headless browser (Puppeteer/Playwright)
 * and lives in the integration test suite.
 */


import { drawDayNightOverlay } from '../render.js';

/**
 * Minimal CanvasRenderingContext2D mock — only the methods
 * drawDayNightOverlay actually calls.
 */
function mockCtx() {
  return {
    save: () => {},
    restore: () => {},
    fillRect: () => {},
    fillStyle: '',
    globalCompositeOperation: '',
    createRadialGradient: () => ({
      addColorStop: () => {},
    }),
    beginPath: () => {},
    arc: () => {},
    stroke: () => {},
    strokeStyle: '',
    lineWidth: 0,
  };
}

describe('render — drawDayNightOverlay', () => {
  it('does not throw when baseCenter is missing (fallback to sim.world.width/height)', () => {
    const ctx = mockCtx();
    const sim = {
      hud: { dayPhase: 'night', phaseBlend: 1 },
      world: { width: 50, height: 50 },
      // baseCenter intentionally omitted — triggers the fallback path
    };

    // Must not throw — the fallback should use sim.world.width/height,
    // not the nonexistent sim.worldWidth/sim.worldHeight
    expect(() => {
      drawDayNightOverlay(ctx, 800, 600, sim, 1000);
    }).not.toThrow();
  });

  it('does not throw with full sim state during night phase', () => {
    const ctx = mockCtx();
    const sim = {
      hud: { dayPhase: 'night', phaseBlend: 0.5 },
      world: { width: 50, height: 50 },
      baseCenter: { x: 25, y: 25 },
    };

    expect(() => {
      drawDayNightOverlay(ctx, 800, 600, sim, 1000);
    }).not.toThrow();
  });

  it('returns early when hud.dayPhase is missing', () => {
    const ctx = mockCtx();
    const sim = {
      hud: {},
      world: { width: 50, height: 50 },
    };

    // Should not throw — returns early
    expect(() => {
      drawDayNightOverlay(ctx, 800, 600, sim, 1000);
    }).not.toThrow();
  });
});
