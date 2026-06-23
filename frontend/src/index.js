/**
 * index.js — React entry point for Behemoth.
 *
 * Creates the simulation engine and drives the game loop via
 * requestAnimationFrame. Passes the live sim object to the
 * BehemothGame component tree.
 *
 * The sim object is mutable (engine.js stepTick mutates it in place).
 * React re-renders are driven by a frame counter stored in state;
 * the sim ref is always current so the component tree reads live data.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
