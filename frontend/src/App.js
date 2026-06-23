/**
 * App.js — Behemoth game loop runner.
 *
 * Creates the sim engine on mount and runs stepTick each animation frame.
 * Passes the live sim object to BehemothGame for rendering.
 *
 * Architecture:
 *   - sim is stored in a useRef (always current, no stale closure)
 *   - A frame counter in useState drives React re-renders (~60 fps)
 *   - The rAF loop calls stepTick → increments frame counter → React re-renders
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createSim, stepTick } from './sim/index.js';
import { BehemothGame } from './components/BehemothGame.jsx';

export default function App() {
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const [frame, setFrame] = useState(0);

  // Create sim once on mount
  useEffect(() => {
    // Guard against double-mount (StrictMode, hot-reload, etc.)
    if (runningRef.current) return;
    runningRef.current = true;

    const sim = createSim({ worldWidth: 50, worldHeight: 50 });
    simRef.current = sim;
    // Temporary debug: expose sim for integration testing
    if (typeof window !== 'undefined') window.__sim = sim;

    let running = true;

    const loop = () => {
      if (!running) return;
      stepTick(simRef.current);
      setFrame((f) => f + 1);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Key handler for the SoundToggle 'M' shortcut
  const handleKeyDown = useCallback((e) => {
    const sim = simRef.current;
    if (!sim) return;

    if (e.key === 'm' || e.key === 'M') {
      // Don't toggle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      sim.soundEnabled = !sim.soundEnabled;
      setFrame((f) => f + 1);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const sim = simRef.current;

  // Show loading until sim is ready (first ~16ms)
  if (!sim) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingText} className="bh-glow-amber">
          Loading Behemoth…
        </span>
      </div>
    );
  }

  return <BehemothGame sim={sim} key={`frame-${frame}`} />;
}

const styles = {
  loading: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-deep)',
  },
  loadingText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '18px',
    color: 'var(--accent-primary)',
    opacity: 0.8,
  },
};
