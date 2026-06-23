     1|     1|/**
     2|     2| * BehemothGame.jsx — Main game component.
     3|     3| *
     4|     4| * Wires the ResourceHUD and WavePreviewPanel components into the game
     5|     5| * via the existing game loop pattern.
     6|     6| *
     7|     7| * This is the top-level game UI: canvas zone + HUD overlay.
     8|     8| */
     9|     9|
    10|    10|import React, { useRef, useEffect, useState, useCallback } from 'react';
    11|    11|import { ResourceHUD, BotLabourHUD } from './ResourceHUD.jsx';
import {
  getWavePreview, DAY_CYCLE, LEVEL, RESOURCE, toggleSound,
  drawBackground, drawBase, drawStoneZones, drawEnemies, drawDeathParticles,
  drawCrystalDrops, drawBossShockwaves, drawTurrets, drawBots,
  drawWalls, drawDayNightOverlay, drawSelectionRing, drawBaseParticles,
  applyScreenShake, drawBuildEffects, drawImpactEffects,
  findTurretAt, selectTurret, deselectTurret,
  getTurretById, buyBot, buyWatcher, buyWall, togglePause, regenerateSim,
} from '../sim/index.js';
    20|    20|
    21|    21|// ═══════════════════════════════════════════════════════════════════════
    22|    22|// ENEMY TYPE STYLING
    23|    23|// ═══════════════════════════════════════════════════════════════════════
    24|    24|
    25|    25|/**
    26|    26| * Visual tokens per enemy type — icons, colours, and display labels.
    27|    27| * Separate from any inspector-panel or engine config labels to avoid
    28|    28| * collision as the HUD and dev tools evolve independently.
    29|    29| */
    30|    30|const ENEMY_TYPE_STYLE = {
    31|    31|  scout:     { color: 'var(--accent-wave-next)', icon: '\u226b', label: 'Scout' },
    32|    32|  tank:      { color: '#f59e0b', icon: '\u25c8', label: 'Tank' },
    33|    33|  artillery: { color: '#ef4444', icon: '\u25c6', label: 'Arty' },
    34|    34|  crawler:   { color: 'var(--accent-success)', icon: '\u224b', label: 'Crawler' },
    35|    35|  boss:      { color: 'var(--accent-magic)', icon: '\u2b21', label: 'Boss' },
    36|    36|};
    37|    37|
    38|    38|// ═══════════════════════════════════════════════════════════════════════
    39|    39|// BASE LEVEL IDENTITY
    40|    40|// ═══════════════════════════════════════════════════════════════════════
    41|    41|
    42|    42|/**
    43|    43| * Per-level identity names matching Athena's green→cyan→amber→red spec.
    44|    44| * Makes each level feel earned, not spreadsheet-cold.
    45|    45| * Coordinates with LEVEL.VISUAL glowColor/labelColor from config.js.
    46|    46| */
    47|    47|const LEVEL_IDENTITY = [
    48|    48|  { title: 'OUTPOST',  desc: 'A spark in the dark' },
    49|    49|  { title: 'BASTION',  desc: 'Roots take hold' },
    50|    50|  { title: 'FORTRESS', desc: 'The Shroud recoils' },
    51|    51|  { title: 'BEHEMOTH', desc: 'Awakened' },
    52|    52|];
    53|    53|
    54|    54|// ═══════════════════════════════════════════════════════════════════════
    55|    55|// GARDEN STATS — reads grid cells + pulse ability state
    56|    56|// ═══════════════════════════════════════════════════════════════════════
    57|    57|
    58|    58|/**
    59|    59| * Phase to display-label mapping.
    60|    60| * Engine-phase → player-visible name.
    61|    61| */
    62|    62|const GARDEN_PHASES = {
    63|    63|  bare:    'Moss',
    64|    64|  sprout:  'Grass I',
    65|    65|  green:   'Grass II',
    66|    66|  flowing: 'Grass III',
    67|    67|};
    68|    68|
    69|    69|/**
    70|    70| * Gather garden stats from live sim state.
    71|    71| *
    72|    72| * Reads sim.world.grid for grass/moss cell counts and derives the
    73|    73| * dominant garden phase from the grass-to-garden ratio.  Also reads
    74|    74| * sim._abilityCooldowns for Pulse Wave status.
    75|    75| *
    76|    76| * Called inline during render — the React re-render cycle provides the
    77|    77| * RAF-frame freshness required by the AC.
    78|    78| *
    79|    79| * @param {object} sim — live sim state
    80|    80| * @returns {{ living: number, total: number, dominantPhase: string,
    81|    81| *             dominantPhaseLabel: string, pulseReady: boolean,
    82|    82| *             pulseCooldown: number, pulseActive: boolean }}
    83|    83| */
    84|    84|function getGardenStats(sim) {
    85|    85|  if (!sim?.world?.grid) {
    86|    86|    return { living: 0, total: 0, dominantPhase: 'bare',
    87|    87|             dominantPhaseLabel: 'Moss', pulseReady: false,
    88|    88|             pulseCooldown: 0, pulseActive: false };
    89|    89|  }
    90|    90|
    91|    91|  let grassCount = 0;
    92|    92|  let mossCount = 0;
    93|    93|
    94|    94|  const grid = sim.world.grid;
    95|    95|  for (let y = 0; y < grid.length; y++) {
    96|    96|    const row = grid[y];
    97|    97|    for (let x = 0; x < row.length; x++) {
    98|    98|      const cell = row[x];
    99|    99|      if (cell.grass) grassCount++;
   100|   100|      if (cell.moss) mossCount++;
   101|   101|    }
   102|   102|  }
   103|   103|
   104|   104|  const living = grassCount;
   105|   105|  const total = grassCount + mossCount;
   106|   106|  const grassRatio = total > 0 ? grassCount / total : 0;
   107|   107|
   108|   108|  // Dominant phase derived from grass saturation
   109|   109|  let dominantPhase = 'bare';
   110|   110|  if (grassRatio >= 0.75)      dominantPhase = 'flowing';
   111|   111|  else if (grassRatio >= 0.50) dominantPhase = 'green';
   112|   112|  else if (grassRatio >= 0.25) dominantPhase = 'sprout';
   113|   113|
   114|   114|  const dominantPhaseLabel = GARDEN_PHASES[dominantPhase] || 'Moss';
   115|   115|
   116|   116|  // ── Pulse Wave status from ability system ─────────────────────────
   117|   117|  const pulseCfg = RESOURCE.abilities?.pulseWave;
   118|   118|  const cooldownExpiry = sim._abilityCooldowns?.pulseWave ?? 0;
   119|   119|  const pulseCooldown = Math.max(0, cooldownExpiry - sim.tick);
   120|   120|  const pulseReady = pulseCooldown === 0 && sim.tick > 0;
   121|   121|  const pulseActive = sim.lastPulseWaveTick === sim.tick;
   122|   122|
   123|   123|  return {
   124|   124|    living,
   125|   125|    total,
   126|   126|    dominantPhase,
   127|   127|    dominantPhaseLabel,
   128|   128|    pulseReady,
   129|   129|    pulseCooldown,
   130|   130|    pulseActive,
   131|   131|  };
   132|   132|}
   133|   133|
   134|   134|// ═══════════════════════════════════════════════════════════════════════
   135|   135|// WAVE PREVIEW PANEL
   136|   136|// ═══════════════════════════════════════════════════════════════════════
   137|   137|
   138|   138|/**
   139|   139| * WavePreviewPanel — shows current/next wave enemy composition.
   140|   140| *
   141|   141| * Three visual states:
   142|   142| *   - between waves (cooldown): "▶ Next" label + next wave composition
   143|   143| *   - during wave (spawning/active): "⚡ Spawning" pulse + current composition
   144|   144| *   - post-victory (game over): hidden (nextWave is null)
   145|   145| *
   146|   146| * @param {object} props
   147|   147| * @param {object} props.sim — live sim state
   148|   148| */
   149|   149|function WavePreviewPanel({ sim }) {
   150|   150|  const preview = getWavePreview(sim);
   151|   151|
   152|   152|  // Post-victory or no preview data — nothing to show
   153|   153|  if (!preview || !preview.enemies || preview.enemies.length === 0) {
   154|   154|    return null;
   155|   155|  }
   156|   156|
   157|   157|  const { wave, enemies, active } = preview;
   158|   158|
   159|   159|  // Total enemy count for the wave
   160|   160|  const totalEnemies = enemies.reduce((sum, g) => sum + g.count, 0);
   161|   161|
   162|   162|  return (
   163|   163|    <div style={styles.panel} role="region" aria-label="Wave Preview">
   164|   164|      {/* Header row */}
   165|   165|      <div style={styles.header}>
   166|   166|        {active ? (
   167|   167|          <span style={styles.spawningLabel}>
   168|   168|            <span style={styles.pulseIcon}>{'\u26a1'}</span>
   169|   169|            {' '}Spawning
   170|   170|          </span>
   171|   171|        ) : (
   172|   172|          <span style={styles.nextLabel}>
   173|   173|            <span style={styles.nextIcon}>{'\u25b6'}</span>
   174|   174|            {' '}Next
   175|   175|          </span>
   176|   176|        )}
   177|   177|        <span style={styles.waveNum}>
   178|   178|          Wave {wave}
   179|   179|          <span style={styles.totalBadge}>{totalEnemies}</span>
   180|   180|        </span>
   181|   181|      </div>
   182|   182|
   183|   183|      {/* Enemy composition rows */}
   184|   184|      <div style={styles.composition}>
   185|   185|        {enemies.map(({ type, count }) => {
   186|   186|          const style = ENEMY_TYPE_STYLE[type] || {
   187|   187|            color: 'var(--text-dim)',
   188|   188|            icon: '?',
   189|   189|            label: type,
   190|   190|          };
   191|   191|          return (
   192|   192|            <div key={type} style={styles.enemyRow}>
   193|   193|              <span style={{ ...styles.enemyIcon, color: style.color }}>
   194|   194|                {style.icon}
   195|   195|              </span>
   196|   196|              <span style={{ ...styles.enemyCount, color: style.color }}>
   197|   197|                {count}
   198|   198|              </span>
   199|   199|              <span style={styles.enemyLabel}>{style.label}</span>
   200|   200|            </div>
   201|   201|          );
   202|   202|        })}
   203|   203|      </div>
   204|   204|    </div>
   205|   205|  );
   206|   206|}
   207|   207|
   208|   208|// ═══════════════════════════════════════════════════════════════════════
   209|   209|// BEHEMOTH GAME
   210|   210|// ═══════════════════════════════════════════════════════════════════════
   211|   211|
   212|   212|/**
   213|   213| * BehemothGame — top-level game component.
   214|   214| *
   215|   215| * Renders the full-screen game canvas (imperative draw loop) and the
   216|   216| * React HUD overlay on top.  The canvas reads from the live sim prop
   217|   217| * via a ref so the rAF loop never has a stale closure.
   218|   218| *
   219|   219| * @param {object} props
   220|   220| * @param {object} props.sim — sim state with sim.resourceHUD from resourceTick
   221|   221| */
   222|   222|export function BehemothGame({ sim }) {
   223|   223|  if (!sim) return null;
   224|   224|
   225|   225|  const canvasRef = useRef(null);
   226|   226|  const simRef = useRef(sim);
   227|   227|
   228|   228|  // Keep the ref pinned to the latest sim prop so the rAF loop
   229|   229|  // always reads the current tick / world dimensions.
   230|   230|  simRef.current = sim;
   231|   231|
   232|   232|  // ── Interaction state ───────────────────────────────────────────────
   233|   233|  const [placementMode, setPlacementMode] = useState(null); // null | 'wall'
   234|   234|  const placementModeRef = useRef(placementMode);
   235|   235|  placementModeRef.current = placementMode;
   236|   236|  const [showLegend, setShowLegend] = useState(false);
   237|   237|  const [showEditor, setShowEditor] = useState(false);
   238|   238|
   239|   239|  // ── Canvas render loop ───────────────────────────────────────────
   240|   240|  useEffect(() => {
   241|   241|    const canvas = canvasRef.current;
   242|   242|    if (!canvas) return;
   243|   243|
   244|   244|    const ctx = canvas.getContext('2d');
   245|   245|    let rafId;
   246|   246|    let running = true;
   247|   247|
   248|   248|    // ── Click handler: screen → world coords → hit-test → select/deselect
   249|   249|    // When in placement mode (wall), click places a wall instead.
   250|   250|    const handleClick = (e) => {
   251|   251|      const s = simRef.current;
   252|   252|      if (!s || !s.world) return;
   253|   253|
   254|   254|      const rect = canvas.getBoundingClientRect();
   255|   255|      const screenX = e.clientX - rect.left;
   256|   256|      const screenY = e.clientY - rect.top;
   257|   257|
   258|   258|      const scale = Math.min(canvas.width / s.world.width, canvas.height / s.world.height);
   259|   259|      const worldX = screenX / scale;
   260|   260|      const worldY = screenY / scale;
   261|   261|
   262|   262|      // ── Placement mode: place wall at click position ──────────────
   263|   263|      if (placementModeRef.current === 'wall') {
   264|   264|        const result = buyWall(s, worldX, worldY);
   265|   265|        if (result.success) {
   266|   266|          // Exit placement mode on successful placement
   267|   267|          // (use a timeout so the setState happens outside the event handler race)
   268|   268|          setTimeout(() => setPlacementMode(null), 0);
   269|   269|        }
   270|   270|        return;
   271|   271|      }
   272|   272|
   273|   273|      // ── Normal mode: select turret ────────────────────────────────
   274|   274|      const turret = findTurretAt(s, worldX, worldY);
   275|   275|      if (turret) {
   276|   276|        selectTurret(s, turret.id);
   277|   277|      } else {
   278|   278|        deselectTurret(s);
   279|   279|      }
   280|   280|    };
   281|   281|
   282|   282|    // ── Right-click handler: cancel placement mode ──────────────────
   283|   283|    const handleContextMenu = (e) => {
   284|   284|      e.preventDefault();
   285|   285|      if (placementModeRef.current) {
   286|   286|        setPlacementMode(null);
   287|   287|      }
   288|   288|    };
   289|   289|
   290|   290|    // ── Keyboard handler: Escape → deselect
   291|   291|    const handleKeyDown = (e) => {
   292|   292|      if (e.key === 'Escape') {
   293|   293|        const s = simRef.current;
   294|   294|        if (s) deselectTurret(s);
   295|   295|      }
   296|   296|    };
   297|   297|
   298|   298|    canvas.addEventListener('click', handleClick);
   299|   299|    canvas.addEventListener('contextmenu', handleContextMenu);
   300|   300|    window.addEventListener('keydown', handleKeyDown);
   301|   301|
   302|   302|    const render = () => {
   303|   303|      if (!running) return;
   304|   304|
   305|   305|      const s = simRef.current;
   306|   306|      if (!s || !s.world) {
   307|   307|        rafId = requestAnimationFrame(render);
   308|   308|        return;
   309|   309|      }
   310|   310|
   311|   311|      const { world, tick = 0 } = s;
   312|   312|      const canvasW = canvas.width;
   313|   313|      const canvasH = canvas.height;
   314|   314|      const scale = Math.min(canvasW / world.width, canvasH / world.height);
   315|   315|
   316|   316|      // Clear
   317|   317|      ctx.clearRect(0, 0, canvasW, canvasH);
   318|   318|
   319|   319|      // ── Render pipeline (back to front) ───────────────────────────
   320|   320|      drawBackground(ctx, canvasW, canvasH, s, scale);
   321|   321|      drawStoneZones(ctx, s, scale);
   322|   322|      drawBase(ctx, s, scale);
   323|   323|      drawBaseParticles(ctx, s, tick);
   324|   324|      drawWalls(ctx, s, scale);
   325|   325|      drawEnemies(ctx, s, scale);
   326|   326|      drawTurrets(ctx, s, scale);
   327|   327|      drawBots(ctx, s, scale);
   328|   328|      drawSelectionRing(ctx, s, scale);
   329|   329|      drawDeathParticles(ctx, scale, tick);
   330|   330|      drawCrystalDrops(ctx, scale, tick);
   331|   331|      drawBossShockwaves(ctx, scale, tick);
   332|   332|      drawDayNightOverlay(ctx, canvasW, canvasH, s, tick);
   333|   333|
   334|   334|      rafId = requestAnimationFrame(render);
   335|   335|    };
   336|   336|
   337|   337|    rafId = requestAnimationFrame(render);
   338|   338|
   339|   339|    return () => {
   340|   340|      running = false;
   341|   341|      if (rafId) cancelAnimationFrame(rafId);
   342|   342|      canvas.removeEventListener('click', handleClick);
   343|   343|      canvas.removeEventListener('contextmenu', handleContextMenu);
   344|   344|      window.removeEventListener('keydown', handleKeyDown);
   345|   345|    };
   346|   346|  }, []);
   347|   347|
   348|   348|  // ── Canvas resize to fill parent ─────────────────────────────────
   349|   349|  useEffect(() => {
   350|   350|    const canvas = canvasRef.current;
   351|   351|    if (!canvas) return;
   352|   352|
   353|   353|    const resize = () => {
   354|   354|      const parent = canvas.parentElement;
   355|   355|      if (!parent) return;
   356|   356|      canvas.width = parent.clientWidth;
   357|   357|      canvas.height = parent.clientHeight;
   358|   358|    };
   359|   359|
   360|   360|    resize();
   361|   361|    window.addEventListener('resize', resize);
   362|   362|    return () => window.removeEventListener('resize', resize);
   363|   363|  }, []);
   364|   364|
   365|   365|  // ResourceHUD data is built by engine.js resourceTick each sim tick
   366|   366|  const hudData = sim.resourceHUD;
   367|   367|
   368|   368|  // Bot labour summary from engine's buildHUD() / getStats()
   369|   369|  const botLabour = sim.hud?.botLabour ?? null;
   370|   370|
   371|   371|  return (
   372|   372|    <div className="behemoth-game" style={styles.gameContainer}>
   373|   373|      {/* Game canvas — fills the container, behind the HUD */}
   374|   374|      <canvas
   375|   375|        ref={canvasRef}
   376|   376|        style={styles.canvas}
   377|   377|      />
   378|   378|
   379|   379|      {/* HUD overlay — top-right corner */}
   380|   380|      <div style={styles.hudContainer}>
   381|   381|        <ResourceHUD
   382|   382|          hudData={hudData}
   383|   383|          compact={false}
   384|   384|          onClick={(resourceType) => {
   385|   385|            console.debug(`Resource clicked: ${resourceType}`);
   386|   386|          }}
   387|   387|        />
   388|   388|
   389|   389|        {/* Wave composition preview */}
   390|   390|        <WavePreviewPanel sim={sim} />
   391|   391|
   392|   392|        {/* Day phase visual transition indicator */}
   393|   393|        <PhaseIndicator hud={sim.hud} />
   394|   394|
   395|   395|        {/* Bot labour state display */}
   396|   396|        <BotLabourHUD botLabour={botLabour} />
   397|   397|
   398|   398|        {/* Wave counter */}
   399|   399|        <WaveCounter sim={sim} />
   400|   400|
   401|   401|        {/* Watchers panel — per-turret health bars + upgrade badges */}
   402|   402|        <WatchersPanel sim={sim} />
   403|   403|
   404|   404|        {/* Garden progress — tilled cells, phase, pulse status */}
   405|   405|        <GardenProgressIndicator sim={sim} />
   406|   406|
   407|   407|        {/* Base level badge — visually distinct per-level styling */}
   408|   408|        <BaseLevelBadge hud={sim.hud} />
   409|   409|
   410|   410|        {/* Base integrity — HP bar with colour-coded fill */}
   411|   411|        <IntegrityBar hud={sim.hud} />
   412|   412|
   413|   413|        {/* Sound mute/unmute toggle */}
   414|   414|        <SoundToggle sim={sim} />
   415|   415|
   416|   416|        {/* Game control buttons */}
   417|   417|        <GameControls
   418|   418|          sim={sim}
   419|   419|          placementMode={placementMode}
   420|   420|          onPlacementModeChange={setPlacementMode}
   421|   421|          showLegend={showLegend}
   422|   422|          onLegendToggle={() => setShowLegend((v) => !v)}
   423|   423|          showEditor={showEditor}
   424|   424|          onEditorToggle={() => setShowEditor((v) => !v)}
   425|   425|        />
   426|   426|      </div>
   427|   427|    </div>
   428|   428|  );
   429|   429|}
   430|   430|
   431|   431|// ═══════════════════════════════════════════════════════════════════════
   432|   432|// UTILITY: HEX COLOUR LERP
   433|   433|// ═══════════════════════════════════════════════════════════════════════
   434|   434|
   435|   435|/**
   436|   436| * Linearly interpolate between two hex colours.
   437|   437| * Used by PhaseIndicator to smooth bar colour transitions.
   438|   438| *
   439|   439| * @param {string} a — hex colour (e.g. '#87CEEB')
   440|   440| * @param {string} b — hex colour (e.g. '#191970')
   441|   441| * @param {number} t — interpolation factor (0 → a, 1 → b)
   442|   442| * @returns {string} hex colour
   443|   443| */
   444|   444|function lerpHex(a, b, t) {
   445|   445|  const ra = parseInt(a.slice(1, 3), 16);
   446|   446|  const ga = parseInt(a.slice(3, 5), 16);
   447|   447|  const ba = parseInt(a.slice(5, 7), 16);
   448|   448|  const rb = parseInt(b.slice(1, 3), 16);
   449|   449|  const gb = parseInt(b.slice(3, 5), 16);
   450|   450|  const bb = parseInt(b.slice(5, 7), 16);
   451|   451|
   452|   452|  const r = Math.round(ra + (rb - ra) * t);
   453|   453|  const g = Math.round(ga + (gb - ga) * t);
   454|   454|  const bl = Math.round(ba + (bb - ba) * t);
   455|   455|
   456|   456|  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
   457|   457|}
   458|   458|
   459|   459|// ═══════════════════════════════════════════════════════════════════════
   460|   460|// PHASE INDICATOR — Day/Night visual transition
   461|   461|// ═══════════════════════════════════════════════════════════════════════
   462|   462|
   463|   463|/**
   464|   464| * PhaseIndicator — visual day/night phase transition indicator.
   465|   465| *
   466|   466| * Replaces the old text+emoji phase display with a smooth,
   467|   467| * gradient-driven bar that tracks the game's day cycle.
   468|   468| *
   469|   469| * Three visual elements:
   470|   470| *   - Phase label: "Dawn" / "Day" / "Dusk" / "Night" in phase colour
   471|   471| *   - Gradient progress bar: fills left-to-right as ticks advance,
   472|   472| *     colour transitions using CSS transition-all
   473|   473| *   - Phase cycle dots: 4 small dots showing all phases;
   474|   474| *     the active dot glows in phase colour
   475|   475| *
   476|   476| * Uses DAY_CYCLE from config for colours and durations.
   477|   477| * Reads hud.dayPhase, hud.phaseTick, hud.phaseDuration from sim.
   478|   478| *
   479|   479| * @param {object} props
   480|   480| * @param {object} props.hud — sim.hud snapshot (from engine stepTick)
   481|   481| */
   482|   482|function PhaseIndicator({ hud }) {
   483|   483|  if (!hud) return null;
   484|   484|
   485|   485|  const { dayPhase, phaseTick = 0, phaseDuration = 1, phaseBlend = 0 } = hud;
   486|   486|  const phaseColor = DAY_CYCLE.colors[dayPhase] || '#888888';
   487|   487|  const phaseLabel = dayPhase.charAt(0).toUpperCase() + dayPhase.slice(1);
   488|   488|
   489|   489|  // Bar progress: how far through the current phase (0 → 1)
   490|   490|  const progress = phaseDuration > 0
   491|   491|    ? Math.min(1, Math.max(0, phaseTick / phaseDuration))
   492|   492|    : 0;
   493|   493|
   494|   494|  // Lerp bar color between gradient start and end
   495|   495|  const barColor = lerpHex(
   496|   496|    DAY_CYCLE.gradient.start,
   497|   497|    DAY_CYCLE.gradient.end,
   498|   498|    progress,
   499|   499|  );
   500|   500|
   501|   501|  return (
   502|   502|    <div style={styles.phasePanel} role="region" aria-label="Day Phase">
   503|   503|      {/* Phase label */}
   504|   504|      <div style={{ ...styles.phaseLabel, color: phaseColor }}>
   505|   505|        {phaseLabel}
   506|   506|      </div>
   507|   507|
   508|   508|      {/* Gradient progress bar */}
   509|   509|      <div style={styles.phaseBarTrack}>
   510|   510|        <div
   511|   511|          style={{
   512|   512|            ...styles.phaseBarFill,
   513|   513|            width: `${progress * 100}%`,
   514|   514|            background: barColor,
   515|   515|            boxShadow: `0 0 8px ${barColor}66`,
   516|   516|          }}
   517|   517|        />
   518|   518|      </div>
   519|   519|
   520|   520|      {/* Phase cycle dots */}
   521|   521|      <div style={styles.phaseDots}>
   522|   522|        {DAY_CYCLE.phaseOrder.map((phase) => (
   523|   523|          <div
   524|   524|            key={phase}
   525|   525|            title={phase.charAt(0).toUpperCase() + phase.slice(1)}
   526|   526|            style={{
   527|   527|              ...styles.phaseDot,
   528|   528|              background: phase === dayPhase
   529|   529|                ? DAY_CYCLE.colors[phase]
   530|   530|                : 'rgba(255, 255, 255, 0.15)',
   531|   531|              boxShadow: phase === dayPhase
   532|   532|                ? `0 0 6px ${DAY_CYCLE.colors[phase]}`
   533|   533|                : 'none',
   534|   534|              transform: phase === dayPhase ? 'scale(1.3)' : 'scale(1)',
   535|   535|              transition: 'background 0.7s ease, box-shadow 0.7s ease, transform 0.3s ease',
   536|   536|            }}
   537|   537|          />
   538|   538|        ))}
   539|   539|      </div>
   540|   540|    </div>
   541|   541|  );
   542|   542|}
   543|   543|
   544|   544|// ═══════════════════════════════════════════════════════════════════════
   545|   545|// WAVE COUNTER (preserved from original — no regression)
   546|   546|// ═══════════════════════════════════════════════════════════════════════
   547|   547|
   548|   548|function WaveCounter({ sim }) {
   549|   549|  return (
   550|   550|    <div style={styles.waveCounter}>
   551|   551|      <span style={styles.waveCounterLabel}>WAVE</span>
   552|   552|      <span style={styles.waveCounterValue}>{sim.wave}</span>
   553|   553|    </div>
   554|   554|  );
   555|   555|}
   556|   556|
   557|   557|// ═══════════════════════════════════════════════════════════════════════
   558|   558|// SOUND TOGGLE BUTTON
   559|   559|// ═══════════════════════════════════════════════════════════════════════
   560|   560|
   561|   561|/**
   562|   562| * SoundToggle — mute/unmute speaker icon button.
   563|   563| *
   564|   564| * Reads sim.soundEnabled for visual state and calls toggleSound()
   565|   565| * on click. Icon switches between 🔊 (on, full opacity) and
   566|   566| * 🔇 (muted, 45% opacity). Uses local state for immediate visual
   567|   567| * feedback; syncs from sim on parent re-render.
   568|   568| *
   569|   569| * @param {object} props
   570|   570| * @param {object} props.sim — live sim state (must have .soundEnabled)
   571|   571| */
   572|   572|function SoundToggle({ sim }) {
   573|   573|  const [enabled, setEnabled] = React.useState(() => sim.soundEnabled);
   574|   574|
   575|   575|  // Sync from sim when parent re-renders (e.g. after M hotkey toggle)
   576|   576|  React.useEffect(() => {
   577|   577|    setEnabled(sim.soundEnabled);
   578|   578|  }, [sim.soundEnabled]);
   579|   579|
   580|   580|  const handleClick = () => {
   581|   581|    toggleSound(sim);
   582|   582|    setEnabled(sim.soundEnabled);
   583|   583|  };
   584|   584|
   585|   585|  return (
   586|   586|    <button
   587|   587|      onClick={handleClick}
   588|   588|      style={styles.soundToggle}
   589|   589|      title={enabled ? 'Mute sound (M)' : 'Unmute sound (M)'}
   590|   590|      aria-label={enabled ? 'Mute sound' : 'Unmute sound'}
   591|   591|      role="switch"
   592|   592|      aria-checked={enabled}
   593|   593|    >
   594|   594|      <span
   595|   595|        style={{
   596|   596|          ...styles.soundIcon,
   597|   597|          opacity: enabled ? 1 : 0.45,
   598|   598|        }}
   599|   599|      >
   600|   600|        {enabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
   601|   601|      </span>
   602|   602|    </button>
   603|   603|  );
   604|   604|}
   605|   605|
   606|   606|// ═══════════════════════════════════════════════════════════════════════
   607|   607|// BASE LEVEL BADGE
   608|   608|// ═══════════════════════════════════════════════════════════════════════
   609|   609|
   610|   610|/**
   611|   611| * BaseLevelBadge — visually distinct base level indicator.
   612|   612| *
   613|   613| * Replaces the old "LV.N" text pattern with a badge that communicates
   614|   614| * level identity through color, typography, glow, and a kill progress bar.
   615|   615| * Reads baseLevel from sim.hud — updates instantly on level-up.
   616|   616| *
   617|   617| * Styling coordinates with LEVEL.VISUAL from Athena's spec:
   618|   618| *   L1 green  #22c55e → L2 cyan #06b6d4 → L3 amber #f59e0b → L4 red #ef4444
   619|   619| *
   620|   620| * Design:
   621|   621| *   - Left-edge colored accent strip (glow color, pulses at L4)
   622|   622| *   - Large level number with glow text-shadow
   623|   623| *   - Identity title in level labelColor + atmospheric subtitle
   624|   624| *   - Kill progress bar (L1–L3) or MAX status (L4)
   625|   625| *
   626|   626| * L4 (BEHEMOTH) gets a pulsing glow animation matching the renderer's
   627|   627| * ~2Hz sin wave — same frequency, shared visual language.
   628|   628| *
   629|   629| * @param {object} props
   630|   630| * @param {object} props.hud — sim.hud snapshot from engine buildHUD()
   631|   631| */
   632|   632|function BaseLevelBadge({ hud }) {
   633|   633|  if (!hud) return null;
   634|   634|
   635|   635|  const level = hud.baseLevel ?? 0;
   636|   636|  const kills = hud.kills ?? 0;
   637|   637|  const visual = LEVEL.VISUAL[level] || LEVEL.VISUAL[0];
   638|   638|  const identity = LEVEL_IDENTITY[level] || LEVEL_IDENTITY[0];
   639|   639|  const isMaxLevel = level >= LEVEL.THRESHOLDS.length - 1;
   640|   640|
   641|   641|  // Progress toward next threshold
   642|   642|  const nextThreshold = isMaxLevel
   643|   643|    ? LEVEL.THRESHOLDS[level]
   644|   644|    : LEVEL.THRESHOLDS[level + 1];
   645|   645|  const prevThreshold = LEVEL.THRESHOLDS[level];
   646|   646|  const range = nextThreshold - prevThreshold;
   647|   647|  const progress = range > 0
   648|   648|    ? Math.min(1, Math.max(0, (kills - prevThreshold) / range))
   649|   649|    : 1;
   650|   650|
   651|   651|  // Unique animation name to avoid collision with other keyframes
   652|   652|  const pulseAnim = `bl-pulse-L${level}`;
   653|   653|
   654|   654|  return (
   655|   655|    <div
   656|   656|      style={{
   657|   657|        ...styles.baseLevelContainer,
   658|   658|        borderColor: `${visual.glowColor}44`,
   659|   659|        boxShadow: isMaxLevel
   660|   660|          ? 'none'
   661|   661|          : `inset 0 0 20px ${visual.glowColor}11`,
   662|   662|      }}
   663|   663|      role="region"
   664|   664|      aria-label={`Base Level ${level + 1}: ${identity.title}`}
   665|   665|    >
   666|   666|      {/* L4 pulse keyframes — only injected when at max level */}
   667|   667|      {isMaxLevel && (
   668|   668|        <style>{`
   669|   669|          @keyframes ${pulseAnim} {
   670|   670|            0%, 100% { box-shadow: 0 0 6px ${visual.glowColor}55, inset 0 0 12px ${visual.glowColor}18; }
   671|   671|            50%      { box-shadow: 0 0 14px ${visual.glowColor}88, inset 0 0 22px ${visual.glowColor}2a; }
   672|   672|          }
   673|   673|        `}</style>
   674|   674|      )}
   675|   675|
   676|   676|      {/* Accent bar — left edge glow strip, pulses at L4 */}
   677|   677|      <div
   678|   678|        style={{
   679|   679|          ...styles.baseLevelAccent,
   680|   680|          background: visual.glowColor,
   681|   681|          boxShadow: `0 0 8px ${visual.glowColor}`,
   682|   682|          ...(isMaxLevel
   683|   683|            ? { animation: `${pulseAnim} 2s ease-in-out infinite` }
   684|   684|            : {}),
   685|   685|        }}
   686|   686|      />
   687|   687|
   688|   688|      {/* Level number + identity title */}
   689|   689|      <div style={styles.baseLevelHeader}>
   690|   690|        <span
   691|   691|          style={{
   692|   692|            ...styles.baseLevelNumber,
   693|   693|            color: visual.glowColor,
   694|   694|            textShadow: `0 0 ${8 + level * 4}px ${visual.glowColor}88`,
   695|   695|          }}
   696|   696|        >
   697|   697|          {level + 1}
   698|   698|        </span>
   699|   699|        <div style={styles.baseLevelTitleGroup}>
   700|   700|          <span style={{ ...styles.baseLevelTitle, color: visual.labelColor }}>
   701|   701|            {identity.title}
   702|   702|          </span>
   703|   703|          <span style={styles.baseLevelDesc}>{identity.desc}</span>
   704|   704|        </div>
   705|   705|      </div>
   706|   706|
   707|   707|      {/* Kill progress (L1–L3) or MAX status (L4) */}
   708|   708|      {!isMaxLevel && (
   709|   709|        <div style={styles.baseLevelProgress}>
   710|   710|          <div style={styles.baseLevelBarTrack}>
   711|   711|            <div
   712|   712|              style={{
   713|   713|                ...styles.baseLevelBarFill,
   714|   714|                width: `${progress * 100}%`,
   715|   715|                background: visual.glowColor,
   716|   716|                boxShadow: `0 0 6px ${visual.glowColor}66`,
   717|   717|              }}
   718|   718|            />
   719|   719|          </div>
   720|   720|          <span style={styles.baseLevelProgressText}>
   721|   721|            {kills}/{nextThreshold}
   722|   722|          </span>
   723|   723|        </div>
   724|   724|      )}
   725|   725|
   726|   726|      {isMaxLevel && (
   727|   727|        <div style={styles.baseLevelMaxRow}>
   728|   728|          <span style={{ ...styles.baseLevelMaxText, color: visual.glowColor }}>
   729|   729|            {'\u25c6'} MAX
   730|   730|          </span>
   731|   731|          <span style={styles.baseLevelKills}>{kills} kills</span>
   732|   732|        </div>
   733|   733|      )}
   734|   734|    </div>
   735|   735|  );
   736|   736|}
   737|   737|
   738|   738|// ═══════════════════════════════════════════════════════════════════════
   739|   739|// INTEGRITY BAR — base HP display
   740|   740|// ═══════════════════════════════════════════════════════════════════════
   741|   741|
   742|   742|/**
   743|   743| * IntegrityBar — base HP bar with colour-coded fill.
   744|   744| *
   745|   745| * Reads sim.hud.baseHp / sim.hud.baseMaxHp from the engine HUD snapshot.
   746|   746| * Colour thresholds match the spec:
   747|   747| *   >60% HP → green (#22c55e)
   748|   748| *   30-60%  → amber (#f59e0b)
   749|   749| *   <30%    → red (#ef4444)
   750|   750| *
   751|   751| * Bar styling follows the WatcherCard hpRow pattern for visual consistency
   752|   752| * (track + fill + text overlay).
   753|   753| *
   754|   754| * @param {object} props
   755|   755| * @param {object} props.hud — sim.hud snapshot from engine buildHUD()
   756|   756| */
   757|   757|function IntegrityBar({ hud }) {
   758|   758|  if (!hud) return null;
   759|   759|
   760|   760|  const hp = hud.baseHp ?? 0;
   761|   761|  const maxHp = hud.baseMaxHp ?? 0;
   762|   762|  if (maxHp <= 0) return null;
   763|   763|
   764|   764|  const ratio = Math.min(1, Math.max(0, hp / maxHp));
   765|   765|
   766|   766|  // Colour: >60% green, 30-60% amber, <30% red
   767|   767|  let color;
   768|   768|  if (ratio > 0.6) {
   769|   769|    color = '#22c55e';
   770|   770|  } else if (ratio > 0.3) {
   771|   771|    color = '#f59e0b';
   772|   772|  } else {
   773|   773|    color = '#ef4444';
   774|   774|  }
   775|   775|
   776|   776|  return (
   777|   777|    <div style={styles.integrityPanel} role="region" aria-label="Base Integrity">
   778|   778|      {/* Header */}
   779|   779|      <div style={styles.integrityHeader}>
   780|   780|        <span style={styles.integrityTitle}>{'\u25c6'} INTEGRITY</span>
   781|   781|      </div>
   782|   782|
   783|   783|      {/* HP bar row — matches WatcherCard hpRow pattern */}
   784|   784|      <div style={styles.integrityHpRow}>
   785|   785|        <div style={styles.integrityHpBarTrack}>
   786|   786|          <div
   787|   787|            style={{
   788|   788|              ...styles.integrityHpBarFill,
   789|   789|              width: `${ratio * 100}%`,
   790|   790|              background: color,
   791|   791|              boxShadow: `0 0 8px ${color}88`,
   792|   792|            }}
   793|   793|          />
   794|   794|        </div>
   795|   795|        <span style={styles.integrityHpText}>
   796|   796|          {hp}/{maxHp}
   797|   797|        </span>
   798|   798|      </div>
   799|   799|    </div>
   800|   800|  );
   801|   801|}
   802|   802|
   803|   803|// ═══════════════════════════════════════════════════════════════════════
   804|   804|// INSPECT PANEL — detailed stats for the selected turret
   805|   805|// ═══════════════════════════════════════════════════════════════════════
   806|   806|
   807|   807|/**
   808|   808| * InspectPanel — detailed overlay for the currently selected turret.
   809|   809| *
   810|   810| * Appears inside the WatchersPanel when sim.selectedEntityId is non-null.
   811|   811| * Shows turret identity, HP with exact values, combat stats, and upgrade
   812|   812| * badge states. Dismisses when selection is cleared (Escape / click ground).
   813|   813| *
   814|   814| * Visual identity: sky-blue accent (#6ba4c7) matching the selection ring.
   815|   815| * Separated from per-turret cards by a subtle divider.
   816|   816| *
   817|   817| * @param {object} props
   818|   818| * @param {object} props.sim — live sim state
   819|   819| * @param {object} props.turret — the selected turret object
   820|   820| */
   821|   821|function InspectPanel({ sim, turret }) {
   822|   822|  var hpRatio = turret.maxHp > 0 ? turret.hp / turret.maxHp : 0;
   823|   823|
   824|   824|  // HP bar colour: green (>66%) → amber (33-66%) → red (<33%)
   825|   825|  var hpColor;
   826|   826|  if (hpRatio > 0.66) {
   827|   827|    hpColor = 'rgba(34, 197, 94, 0.85)';
   828|   828|  } else if (hpRatio > 0.33) {
   829|   829|    hpColor = 'rgba(245, 158, 11, 0.85)';
   830|   830|  } else {
   831|   831|    hpColor = 'rgba(239, 68, 68, 0.85)';
   832|   832|  }
   833|   833|
   834|   834|  var isAdvanced = turret.type === 'turret';
   835|   835|  var typeLabel = isAdvanced ? 'Turret' : 'Watcher';
   836|   836|  var typeColor = isAdvanced ? '#6ba4c7' : '#4b8bb4';
   837|   837|
   838|   838|  // Cooldown percentage for the laser CD bar
   839|   839|  var cdRatio = turret.laserCdMax > 0
   840|   840|    ? 1 - (turret.laserCd / turret.laserCdMax)
   841|   841|    : 1;
   842|   842|
   843|   843|  return React.createElement('div', { style: styles.inspectPanel },
   844|   844|    // Header row
   845|   845|    React.createElement('div', { style: styles.inspectHeader },
   846|   846|      React.createElement('span', { style: styles.inspectTitle },
   847|   847|        '\u25c8 INSPECT'
   848|   848|      ),
   849|   849|      React.createElement('span', { style: Object.assign({}, styles.inspectTypeTag, { color: typeColor, borderColor: typeColor }) },
   850|   850|        typeLabel
   851|   851|      )
   852|   852|    ),
   853|   853|
   854|   854|    // Turret ID + position
   855|   855|    React.createElement('div', { style: styles.inspectIdRow },
   856|   856|      React.createElement('span', { style: Object.assign({}, styles.inspectId, { color: typeColor }) },
   857|   857|        '#' + turret.id
   858|   858|      ),
   859|   859|      React.createElement('span', { style: styles.inspectPos },
   860|   860|        '(' + turret.x.toFixed(0) + ', ' + turret.y.toFixed(0) + ')'
   861|   861|      )
   862|   862|    ),
   863|   863|
   864|   864|    // HP bar (larger, prominent)
   865|   865|    React.createElement('div', { style: styles.inspectHpRow },
   866|   866|      React.createElement('div', { style: styles.inspectHpBarTrack },
   867|   867|        React.createElement('div', {
   868|   868|          style: Object.assign({}, styles.inspectHpBarFill, {
   869|   869|            width: (hpRatio * 100) + '%',
   870|   870|            background: hpColor,
   871|   871|            boxShadow: '0 0 8px ' + hpColor,
   872|   872|          }),
   873|   873|        })
   874|   874|      ),
   875|   875|      React.createElement('span', { style: styles.inspectHpText },
   876|   876|        turret.hp + '/' + turret.maxHp
   877|   877|      )
   878|   878|    ),
   879|   879|
   880|   880|    // Combat stats row
   881|   881|    React.createElement('div', { style: styles.inspectStatsGrid },
   882|   882|      // Range
   883|   883|      React.createElement('div', { style: styles.inspectStat },
   884|   884|        React.createElement('span', { style: styles.inspectStatLabel }, 'Range'),
   885|   885|        React.createElement('span', { style: styles.inspectStatValue },
   886|   886|          turret.range.toFixed(1) + 'c'
   887|   887|        )
   888|   888|      ),
   889|   889|      // Laser damage
   890|   890|      React.createElement('div', { style: styles.inspectStat },
   891|   891|        React.createElement('span', { style: styles.inspectStatLabel }, 'Dmg'),
   892|   892|        React.createElement('span', { style: Object.assign({}, styles.inspectStatValue, { color: '#f87171' }) },
   893|   893|          turret.laserDamage
   894|   894|        )
   895|   895|      ),
   896|   896|      // Laser cooldown
   897|   897|      React.createElement('div', { style: styles.inspectStat },
   898|   898|        React.createElement('span', { style: styles.inspectStatLabel }, 'CD'),
   899|   899|        React.createElement('div', { style: styles.inspectCdTrack },
   900|   900|          React.createElement('div', {
   901|   901|            style: Object.assign({}, styles.inspectCdFill, {
   902|   902|              width: (cdRatio * 100) + '%',
   903|   903|            }),
   904|   904|          })
   905|   905|        )
   906|   906|      ),
   907|   907|    ),
   908|   908|
   909|   909|    // Upgrade badges
   910|   910|    React.createElement('div', { style: styles.inspectBadgesRow },
   911|   911|      React.createElement(UpgradeBadge, {
   912|   912|        icon: '\u2b21',
   913|   913|        label: 'Chassis',
   914|   914|        active: turret.type === 'turret',
   915|   915|        color: 'var(--accent-turret)',
   916|   916|      }),
   917|   917|      React.createElement(UpgradeBadge, {
   918|   918|        icon: '\u25ce',
   919|   919|        label: 'Optics',
   920|   920|        active: turret.mounted,
   921|   921|        color: 'var(--accent-info)',
   922|   922|      }),
   923|   923|      React.createElement(UpgradeBadge, {
   924|   924|        icon: '\u2726',
   925|   925|        label: 'Mortar',
   926|   926|        active: turret.hasMortar,
   927|   927|        color: 'var(--accent-primary)',
   928|   928|      }),
   929|   929|    ),
   930|   930|
   931|   931|    // Dismiss hint
   932|   932|    React.createElement('div', { style: styles.inspectDismiss },
   933|   933|      'ESC to dismiss'
   934|   934|    )
   935|   935|  );
   936|   936|}
   937|   937|
   938|   938|// ═══════════════════════════════════════════════════════════════════════
   939|   939|// WATCHERS PANEL — per-watcher health bars + upgrade badges
   940|   940|// ═══════════════════════════════════════════════════════════════════════
   941|   941|
   942|   942|/**
   943|   943| * WatchersPanel — displays per-turret health bars and upgrade badges.
   944|   944| *
   945|   945| * Visible when sim.turrets has at least one alive turret.
   946|   946| * Each watcher card shows:
   947|   947| *   - ID number + type label (Watcher / Turret)
   948|   948| *   - Colour-coded health bar (green > amber > red)
   949|   949| *   - Three upgrade badges (Chassis / Optics / Mortar) with active/dimmed states
   950|   950| *
   951|   951| * Upgrade badge mapping:
   952|   952| *   - Chassis (⬡): type === 'turret' (advanced chassis upgrade)
   953|   953| *   - Optics (◎): mounted (wall-mounted targeting/range bonus)
   954|   954| *   - Mortar (✦): hasMortar (AoE splash weapon)
   955|   955| *
   956|   956| * @param {object} props
   957|   957| * @param {object} props.sim — live sim state (reads sim.turrets)
   958|   958| */
   959|   959|function WatchersPanel({ sim }) {
   960|   960|  const turrets = (sim.turrets || []).filter(function (t) { return t.alive; });
   961|   961|  const selectedId = sim.selectedEntityId;
   962|   962|  const selectedTurret = selectedId != null ? getTurretById(sim, selectedId) : null;
   963|   963|
   964|   964|  // Show panel if we have turrets OR if there's a valid selection
   965|   965|  if (turrets.length === 0 && !selectedTurret) return null;
   966|   966|
   967|   967|  return (
   968|   968|    <div style={styles.watchersPanel} role="region" aria-label="Watchers">
   969|   969|      {/* INSPECT panel — detailed stats for the selected turret */}
   970|   970|      {selectedTurret && React.createElement(InspectPanel, { sim: sim, turret: selectedTurret })}
   971|   971|
   972|   972|      {/* Panel header */}
   973|   973|      <div style={styles.watchersHeader}>
   974|   974|        <span style={styles.watchersTitle}>{'\u25c6'} WATCHERS</span>
   975|   975|        <span style={styles.watchersCount}>{turrets.length}</span>
   976|   976|      </div>
   977|   977|
   978|   978|      {/* Per-watcher cards */}
   979|   979|      {turrets.map(function (turret) {
   980|   980|        return React.createElement(WatcherCard, { key: turret.id, turret: turret });
   981|   981|      })}
   982|   982|    </div>
   983|   983|  );
   984|   984|}
   985|   985|
   986|   986|/**
   987|   987| * WatcherCard — a single turret's health bar and upgrade badge row.
   988|   988| *
   989|   989| * @param {object} props
   990|   990| * @param {object} props.turret — { id, type, hp, maxHp, mounted, hasMortar }
   991|   991| */
   992|   992|function WatcherCard({ turret }) {
   993|   993|  var hpRatio = turret.maxHp > 0 ? turret.hp / turret.maxHp : 0;
   994|   994|
   995|   995|  // Health bar colour: green (>66%) → amber (33-66%) → red (<33%)
   996|   996|  var hpColor;
   997|   997|  if (hpRatio > 0.66) {
   998|   998|    hpColor = 'rgba(34, 197, 94, 0.85)';   // emerald-500
   999|   999|  } else if (hpRatio > 0.33) {
  1000|  1000|    hpColor = 'rgba(245, 158, 11, 0.85)';  // amber-500
  1001|  1001|  } else {
  1002|  1002|    hpColor = 'rgba(239, 68, 68, 0.85)';   // red-500
  1003|  1003|  }
  1004|  1004|
  1005|  1005|  var isAdvanced = turret.type === 'turret';
  1006|  1006|  var typeLabel = isAdvanced ? 'Turret' : 'Watcher';
  1007|  1007|  var typeColor = isAdvanced ? '#6ba4c7' : '#4b8bb4';
  1008|  1008|
  1009|  1009|  return (
  1010|  1010|    <div style={styles.watcherCard}>
  1011|  1011|      {/* ID + type label row */}
  1012|  1012|      <div style={styles.watcherIdRow}>
  1013|  1013|        <span style={Object.assign({}, styles.watcherId, { color: typeColor })}>
  1014|  1014|          {'#' + turret.id}
  1015|  1015|        </span>
  1016|  1016|        <span style={Object.assign({}, styles.watcherType, { color: typeColor })}>
  1017|  1017|          {typeLabel}
  1018|  1018|        </span>
  1019|  1019|      </div>
  1020|  1020|
  1021|  1021|      {/* Health bar */}
  1022|  1022|      <div style={styles.hpRow}>
  1023|  1023|        <div style={styles.hpBarTrack}>
  1024|  1024|          <div style={Object.assign({}, styles.hpBarFill, {
  1025|  1025|            width: (hpRatio * 100) + '%',
  1026|  1026|            background: hpColor,
  1027|  1027|            boxShadow: '0 0 6px ' + hpColor,
  1028|  1028|          })} />
  1029|  1029|        </div>
  1030|  1030|        <span style={styles.hpText}>
  1031|  1031|          {turret.hp + '/' + turret.maxHp}
  1032|  1032|        </span>
  1033|  1033|      </div>
  1034|  1034|
  1035|  1035|      {/* Upgrade badges */}
  1036|  1036|      <div style={styles.badgesRow}>
  1037|  1037|        {React.createElement(UpgradeBadge, {
  1038|  1038|          icon: '\u2b21',
  1039|  1039|          label: 'Chassis',
  1040|  1040|          active: turret.type === 'turret',
  1041|  1041|          color: 'var(--accent-turret)',
  1042|  1042|        })}
  1043|  1043|        {React.createElement(UpgradeBadge, {
  1044|  1044|          icon: '\u25ce',
  1045|  1045|          label: 'Optics',
  1046|  1046|          active: turret.mounted,
  1047|  1047|          color: 'var(--accent-info)',
  1048|  1048|        })}
  1049|  1049|        {React.createElement(UpgradeBadge, {
  1050|  1050|          icon: '\u2726',
  1051|  1051|          label: 'Mortar',
  1052|  1052|          active: turret.hasMortar,
  1053|  1053|          color: 'var(--accent-primary)',
  1054|  1054|        })}
  1055|  1055|      </div>
  1056|  1056|    </div>
  1057|  1057|  );
  1058|  1058|}
  1059|  1059|
  1060|  1060|/**
  1061|  1061| * UpgradeBadge — a single upgrade icon badge with active/dimmed state.
  1062|  1062| *
  1063|  1063| * @param {object} props
  1064|  1064| * @param {string} props.icon — unicode character for the badge
  1065|  1065| * @param {string} props.label — tooltip / aria label for the upgrade
  1066|  1066| * @param {boolean} props.active — whether the upgrade is purchased
  1067|  1067| * @param {string} props.color — active colour hex
  1068|  1068| */
  1069|  1069|function UpgradeBadge({ icon, label, active, color }) {
  1070|  1070|  return (
  1071|  1071|    <div
  1072|  1072|      style={Object.assign({}, styles.badge, {
  1073|  1073|        color: active ? color : '#52525b',
  1074|  1074|        opacity: active ? 1 : 0.35,
  1075|  1075|        textShadow: active ? '0 0 6px ' + color + '88' : 'none',
  1076|  1076|      })}
  1077|  1077|      title={label + ': ' + (active ? 'ACTIVE' : 'inactive')}
  1078|  1078|    >
  1079|  1079|      {icon}
  1080|  1080|    </div>
  1081|  1081|  );
  1082|  1082|}
  1083|  1083|
  1084|  1084|// ═══════════════════════════════════════════════════════════════════════
  1085|  1085|// GARDEN PROGRESS INDICATOR
  1086|  1086|// ═══════════════════════════════════════════════════════════════════════
  1087|  1087|
  1088|  1088|/**
  1089|  1089| * GardenProgressIndicator — emerald-themed garden status panel.
  1090|  1090| *
  1091|  1091| * Displays three data rows:
  1092|  1092| *   1. Cells tilled / total ratio (living grass cells vs garden area)
  1093|  1093| *   2. Dominant garden phase (Moss → Grass I → Grass II → Grass III)
  1094|  1094| *   3. Pulse Wave status (READY / cooldown Ns / ACTIVE / —)
  1095|  1095| *
  1096|  1096| * Reads sim data via getGardenStats() on every render — the React
  1097|  1097| * re-render cycle provides real-time freshness per the AC.
  1098|  1098| *
  1099|  1099| * Visual identity: emerald border + emerald tint background, matching
  1100|  1100| * the \"Emerald section\" pattern from behemoth-ui.
  1101|  1101| *
  1102|  1102| * @param {object} props
  1103|  1103| * @param {object} props.sim — live sim state
  1104|  1104| */
  1105|  1105|function GardenProgressIndicator({ sim }) {
  1106|  1106|  const gs = getGardenStats(sim);
  1107|  1107|
  1108|  1108|  // Hide panel when no garden cells exist (pre-init or destroyed state)
  1109|  1109|  if (gs.total === 0) return null;
  1110|  1110|
  1111|  1111|  // ── Progress bar: living / total ratio ─────────────────────────────
  1112|  1112|  const ratio = gs.total > 0 ? Math.min(1, gs.living / gs.total) : 0;
  1113|  1113|
  1114|  1114|  // ── Pulse status label ─────────────────────────────────────────────
  1115|  1115|  let pulseLabel, pulseColor;
  1116|  1116|  if (gs.pulseActive) {
  1117|  1117|    pulseLabel = 'ACTIVE';
  1118|  1118|    pulseColor = '#fbbf24';  // amber — urgency / effect in progress
  1119|  1119|  } else if (gs.pulseCooldown > 0) {
  1120|  1120|    const cooldownSec = Math.ceil(gs.pulseCooldown / 60);
  1121|  1121|    pulseLabel = `CD ${cooldownSec}s`;
  1122|  1122|    pulseColor = '#d97706';  // dim amber — recharging
  1123|  1123|  } else if (gs.pulseReady) {
  1124|  1124|    pulseLabel = 'READY';
  1125|  1125|    pulseColor = '#34d399';  // emerald — ready to use
  1126|  1126|  } else {
  1127|  1127|    pulseLabel = '\u2014';   // em-dash — no pulse ability
  1128|  1128|    pulseColor = '#71717a';  // zinc-500
  1129|  1129|  }
  1130|  1130|
  1131|  1131|  return (
  1132|  1132|    <div style={styles.gardenPanel} role="region" aria-label="Garden Progress">
  1133|  1133|      {/* Header */}
  1134|  1134|      <div style={styles.gardenHeader}>GARDEN</div>
  1135|  1135|
  1136|  1136|      {/* Cells ratio row */}
  1137|  1137|      <div style={styles.gardenRow}>
  1138|  1138|        <span style={styles.gardenLabel}>Cells</span>
  1139|  1139|        <span style={styles.gardenCount}>
  1140|  1140|          <span style={{ color: 'var(--accent-success)' }}>{gs.living}</span>
  1141|  1141|          <span style={{ color: 'var(--text-dim)' }}> / {gs.total}</span>
  1142|  1142|        </span>
  1143|  1143|      </div>
  1144|  1144|
  1145|  1145|      {/* Progress bar */}
  1146|  1146|      <div style={styles.gardenBarTrack}>
  1147|  1147|        <div
  1148|  1148|          style={{
  1149|  1149|            ...styles.gardenBarFill,
  1150|  1150|            width: `${ratio * 100}%`,
  1151|  1151|            boxShadow: `0 0 6px #34d39966`,
  1152|  1152|          }}
  1153|  1153|        />
  1154|  1154|      </div>
  1155|  1155|
  1156|  1156|      {/* Dominant phase */}
  1157|  1157|      <div style={styles.gardenRow}>
  1158|  1158|        <span style={styles.gardenLabel}>Phase</span>
  1159|  1159|        <span style={{ ...styles.gardenValue, color: 'var(--accent-success)' }}>
  1160|  1160|          {gs.dominantPhaseLabel}
  1161|  1161|        </span>
  1162|  1162|      </div>
  1163|  1163|
  1164|  1164|      {/* Pulse Wave status */}
  1165|  1165|      <div style={styles.gardenRow}>
  1166|  1166|        <span style={styles.gardenLabel}>Pulse</span>
  1167|  1167|        <span
  1168|  1168|          style={{
  1169|  1169|            ...styles.gardenValue,
  1170|  1170|            color: pulseColor,
  1171|  1171|            ...(gs.pulseActive
  1172|  1172|              ? { textShadow: '0 0 6px #fbbf2488', fontWeight: 'bold' }
  1173|  1173|              : {}),
  1174|  1174|          }}
  1175|  1175|        >
  1176|  1176|          {pulseLabel}
  1177|  1177|        </span>
  1178|  1178|      </div>
  1179|  1179|    </div>
  1180|  1180|  );
  1181|  1181|}
  1182|  1182|
  1183|  1183|// ═══════════════════════════════════════════════════════════════════════
  1184|  1184|// GAME CONTROLS — BUILD / PAUSE / LEGEND / REGENERATE / EDIT
  1185|  1185|// ═══════════════════════════════════════════════════════════════════════
  1186|  1186|
  1187|  1187|/**
  1188|  1188| * GameControls — interactive button panel for player actions.
  1189|  1189| *
  1190|  1190| * Sections:
  1191|  1191| *   BUILD   — Bot (Stone), Watcher (Crystal), Wall (click-to-place)
  1192|  1192| *   PAUSE   — toggle sim.paused with ▶/⏸ icon
  1193|  1193| *   LEGEND  — show/hide enemy type key
  1194|  1194| *   REGENERATE — reset the world
  1195|  1195| *   EDIT    — toggle gameplay values editor
  1196|  1196| *   Hint    — placement controls text
  1197|  1197| *
  1198|  1198| * @param {object} props
  1199|  1199| * @param {object} props.sim — live sim state
  1200|  1200| * @param {string|null} props.placementMode — current placement mode
  1201|  1201| * @param {(mode: string|null) => void} props.onPlacementModeChange
  1202|  1202| * @param {boolean} props.showLegend
  1203|  1203| * @param {() => void} props.onLegendToggle
  1204|  1204| * @param {boolean} props.showEditor
  1205|  1205| * @param {() => void} props.onEditorToggle
  1206|  1206| */
  1207|  1207|function GameControls({
  1208|  1208|  sim,
  1209|  1209|  placementMode,
  1210|  1210|  onPlacementModeChange,
  1211|  1211|  showLegend,
  1212|  1212|  onLegendToggle,
  1213|  1213|  showEditor,
  1214|  1214|  onEditorToggle,
  1215|  1215|}) {
  1216|  1216|  const stone = sim.resources?.stone ?? 0;
  1217|  1217|  const crystal = sim.resources?.crystal ?? 0;
  1218|  1218|  const paused = sim.paused ?? false;
  1219|  1219|
  1220|  1220|  const handleBuyBot = useCallback(() => {
  1221|  1221|    buyBot(sim);
  1222|  1222|  }, [sim]);
  1223|  1223|
  1224|  1224|  const handleBuyWatcher = useCallback(() => {
  1225|  1225|    buyWatcher(sim);
  1226|  1226|  }, [sim]);
  1227|  1227|
  1228|  1228|  const handleBuyWall = useCallback(() => {
  1229|  1229|    // Toggle wall placement mode
  1230|  1230|    if (placementMode === 'wall') {
  1231|  1231|      onPlacementModeChange(null);
  1232|  1232|    } else {
  1233|  1233|      onPlacementModeChange('wall');
  1234|  1234|    }
  1235|  1235|  }, [placementMode, onPlacementModeChange]);
  1236|  1236|
  1237|  1237|  const handlePause = useCallback(() => {
  1238|  1238|    togglePause(sim);
  1239|  1239|  }, [sim]);
  1240|  1240|
  1241|  1241|  const handleRegenerate = useCallback(() => {
  1242|  1242|    regenerateSim(sim);
  1243|  1243|  }, [sim]);
  1244|  1244|
  1245|  1245|  // ── Affordability checks ──────────────────────────────────────────
  1246|  1246|  const botCost = (sim.purchasableItems || []).find((i) => i.id === 'buyBot')?.cost?.stone ?? 15;
  1247|  1247|  const watcherCost = (sim.purchasableItems || []).find((i) => i.id === 'buyWatcher')?.cost?.crystal ?? 5;
  1248|  1248|  const canBuyBot = stone >= botCost && (sim.bots?.length ?? 0) < 12;
  1249|  1249|  const canBuyWatcher = crystal >= watcherCost;
  1250|  1250|
  1251|  1251|  return (
  1252|  1252|    <div style={styles.controlsPanel} role="region" aria-label="Game Controls">
  1253|  1253|      {/* ── BUILD section ──────────────────────────────────────────── */}
  1254|  1254|      <div style={styles.controlsSectionLabel}>BUILD</div>
  1255|  1255|      <div style={styles.controlsRow}>
  1256|  1256|        <button
  1257|  1257|          onClick={handleBuyBot}
  1258|  1258|          disabled={!canBuyBot}
  1259|  1259|          style={{
  1260|  1260|            ...styles.controlBtn,
  1261|  1261|            ...(canBuyBot ? {} : styles.controlBtnDisabled),
  1262|  1262|            borderColor: 'rgba(34, 197, 94, 0.30)',
  1263|  1263|          }}
  1264|  1264|          title={`Buy Bot (${botCost} Stone)`}
  1265|  1265|          aria-label={`Buy Bot — costs ${botCost} Stone`}
  1266|  1266|        >
  1267|  1267|          <span style={styles.controlBtnIcon}>{'\u2699'}</span>
  1268|  1268|          <span style={styles.controlBtnLabel}>Bot</span>
  1269|  1269|          <span style={styles.controlBtnCost}>{botCost}S</span>
  1270|  1270|        </button>
  1271|  1271|
  1272|  1272|        <button
  1273|  1273|          onClick={handleBuyWatcher}
  1274|  1274|          disabled={!canBuyWatcher}
  1275|  1275|          style={{
  1276|  1276|            ...styles.controlBtn,
  1277|  1277|            ...(canBuyWatcher ? {} : styles.controlBtnDisabled),
  1278|  1278|            borderColor: 'rgba(56, 189, 248, 0.30)',
  1279|  1279|          }}
  1280|  1280|          title={`Buy Watcher (${watcherCost} Crystal)`}
  1281|  1281|          aria-label={`Buy Watcher — costs ${watcherCost} Crystal`}
  1282|  1282|        >
  1283|  1283|          <span style={styles.controlBtnIcon}>{'\u25c6'}</span>
  1284|  1284|          <span style={styles.controlBtnLabel}>Watcher</span>
  1285|  1285|          <span style={styles.controlBtnCost}>{watcherCost}C</span>
  1286|  1286|        </button>
  1287|  1287|
  1288|  1288|        <button
  1289|  1289|          onClick={handleBuyWall}
  1290|  1290|          style={{
  1291|  1291|            ...styles.controlBtn,
  1292|  1292|            ...(placementMode === 'wall' ? styles.controlBtnActive : {}),
  1293|  1293|            borderColor: placementMode === 'wall'
  1294|  1294|              ? 'rgba(168, 85, 247, 0.70)'
  1295|  1295|              : 'rgba(168, 85, 247, 0.30)',
  1296|  1296|          }}
  1297|  1297|          title={placementMode === 'wall' ? 'Cancel wall placement' : 'Place Wall — click on map'}
  1298|  1298|          aria-label={placementMode === 'wall' ? 'Cancel wall placement' : 'Place Wall'}
  1299|  1299|        >
  1300|  1300|          <span style={styles.controlBtnIcon}>{'\u25a0'}</span>
  1301|  1301|          <span style={styles.controlBtnLabel}>Wall</span>
  1302|  1302|          <span style={styles.controlBtnCost}>free</span>
  1303|  1303|        </button>
  1304|  1304|      </div>
  1305|  1305|
  1306|  1306|      {/* ── PAUSE / LEGEND row ─────────────────────────────────────── */}
  1307|  1307|      <div style={styles.controlsRow}>
  1308|  1308|        <button
  1309|  1309|          onClick={handlePause}
  1310|  1310|          style={styles.controlBtnSmall}
  1311|  1311|          title={paused ? 'Resume' : 'Pause'}
  1312|  1312|          aria-label={paused ? 'Resume game' : 'Pause game'}
  1313|  1313|        >
  1314|  1314|          <span style={styles.controlBtnIcon}>
  1315|  1315|            {paused ? '\u25b6' : '\u23f8'}
  1316|  1316|          </span>
  1317|  1317|          <span style={styles.controlBtnLabel}>
  1318|  1318|            {paused ? 'PLAY' : 'PAUSE'}
  1319|  1319|          </span>
  1320|  1320|        </button>
  1321|  1321|
  1322|  1322|        <button
  1323|  1323|          onClick={onLegendToggle}
  1324|  1324|          style={{
  1325|  1325|            ...styles.controlBtnSmall,
  1326|  1326|            ...(showLegend ? styles.controlBtnActive : {}),
  1327|  1327|          }}
  1328|  1328|          title="Toggle enemy legend"
  1329|  1329|          aria-label="Toggle enemy type legend"
  1330|  1330|        >
  1331|  1331|          <span style={styles.controlBtnIcon}>{'\u2139'}</span>
  1332|  1332|          <span style={styles.controlBtnLabel}>LEGEND</span>
  1333|  1333|        </button>
  1334|  1334|      </div>
  1335|  1335|
  1336|  1336|      {/* ── REGENERATE / EDIT row ──────────────────────────────────── */}
  1337|  1337|      <div style={styles.controlsRow}>
  1338|  1338|        <button
  1339|  1339|          onClick={handleRegenerate}
  1340|  1340|          style={styles.controlBtnSmall}
  1341|  1341|          title="Regenerate world"
  1342|  1342|          aria-label="Regenerate the game world"
  1343|  1343|        >
  1344|  1344|          <span style={styles.controlBtnIcon}>{'\u21bb'}</span>
  1345|  1345|          <span style={styles.controlBtnLabel}>REGEN</span>
  1346|  1346|        </button>
  1347|  1347|
  1348|  1348|        <button
  1349|  1349|          onClick={onEditorToggle}
  1350|  1350|          style={{
  1351|  1351|            ...styles.controlBtnSmall,
  1352|  1352|            ...(showEditor ? styles.controlBtnActive : {}),
  1353|  1353|          }}
  1354|  1354|          title="Edit gameplay values"
  1355|  1355|          aria-label="Toggle gameplay values editor"
  1356|  1356|        >
  1357|  1357|          <span style={styles.controlBtnIcon}>{'\u2699'}</span>
  1358|  1358|          <span style={styles.controlBtnLabel}>EDIT</span>
  1359|  1359|        </button>
  1360|  1360|      </div>
  1361|  1361|
  1362|  1362|      {/* ── Controls hint ──────────────────────────────────────────── */}
  1363|  1363|      <div style={styles.controlsHint}>
  1364|  1364|        {placementMode === 'wall'
  1365|  1365|          ? '\u25a0 Click to place \u2022 Right-click to cancel'
  1366|  1366|          : 'Click to select \u2022 \u23f8 Pause to build'}
  1367|  1367|      </div>
  1368|  1368|
  1369|  1369|      {/* ── Enemy type legend (togglable) ──────────────────────────── */}
  1370|  1370|      {showLegend && (
  1371|  1371|        <div style={styles.legendOverlay}>
  1372|  1372|          {Object.entries(ENEMY_TYPE_STYLE).map(([type, style]) => (
  1373|  1373|            <div key={type} style={styles.legendRow}>
  1374|  1374|              <span style={{ ...styles.legendIcon, color: style.color }}>
  1375|  1375|                {style.icon}
  1376|  1376|              </span>
  1377|  1377|              <span style={styles.legendLabel}>{style.label}</span>
  1378|  1378|            </div>
  1379|  1379|          ))}
  1380|  1380|        </div>
  1381|  1381|      )}
  1382|  1382|    </div>
  1383|  1383|  );
  1384|  1384|}
  1385|  1385|
  1386|  1386|const styles = {
  1387|  1387|  gameContainer: {
  1388|  1388|    position: 'relative',
  1389|  1389|    width: '100%',
  1390|  1390|    height: '100%',
  1391|  1391|    overflow: 'hidden',
  1392|  1392|  },
  1393|  1393|
  1394|  1394|  canvas: {
  1395|  1395|    position: 'absolute',
  1396|  1396|    top: 0,
  1397|  1397|    left: 0,
  1398|  1398|    width: '100%',
  1399|  1399|    height: '100%',
  1400|  1400|    display: 'block',
  1401|  1401|    zIndex: 1,
  1402|  1402|  },
  1403|  1403|
  1404|  1404|  hudContainer: {
  1405|  1405|    position: 'absolute',
  1406|  1406|    top: '12px',
  1407|  1407|    right: '12px',
  1408|  1408|    zIndex: 100,
  1409|  1409|    display: 'flex',
  1410|  1410|    flexDirection: 'column',
  1411|  1411|    gap: '8px',
  1412|  1412|    pointerEvents: 'auto',
  1413|  1413|  },
  1414|  1414|
  1415|  1415|  // ── Phase Indicator ─────────────────────────────────────────────
  1416|  1416|
  1417|  1417|  phasePanel: {
  1418|  1418|    display: 'flex',
  1419|  1419|    flexDirection: 'column',
  1420|  1420|    gap: '5px',
  1421|  1421|    padding: '8px 12px',
  1422|  1422|    background: 'var(--panel-bg-alt)',
  1423|  1423|    borderRadius: '8px',
  1424|  1424|    fontFamily: 'var(--font-mono)',
  1425|  1425|    border: '1px solid var(--panel-border)',
  1426|  1426|    userSelect: 'none',
  1427|  1427|    minWidth: '130px',
  1428|  1428|  },
  1429|  1429|
  1430|  1430|  phaseLabel: {
  1431|  1431|    fontSize: '12px',
  1432|  1432|    fontWeight: 'bold',
  1433|  1433|    letterSpacing: '2px',
  1434|  1434|    textTransform: 'uppercase',
  1435|  1435|    textAlign: 'center',
  1436|  1436|    transition: 'color 0.5s ease',
  1437|  1437|  },
  1438|  1438|
  1439|  1439|  phaseBarTrack: {
  1440|  1440|    width: '100%',
  1441|  1441|    height: '4px',
  1442|  1442|    background: 'rgba(255, 255, 255, 0.08)',
  1443|  1443|    borderRadius: '2px',
  1444|  1444|    overflow: 'hidden',
  1445|  1445|  },
  1446|  1446|
  1447|  1447|  phaseBarFill: {
  1448|  1448|    height: '100%',
  1449|  1449|    borderRadius: '2px',
  1450|  1450|    transition: 'width 0.5s ease, background 0.5s ease, box-shadow 0.5s ease',
  1451|  1451|  },
  1452|  1452|
  1453|  1453|  phaseDots: {
  1454|  1454|    display: 'flex',
  1455|  1455|    justifyContent: 'center',
  1456|  1456|    gap: '8px',
  1457|  1457|    paddingTop: '2px',
  1458|  1458|  },
  1459|  1459|
  1460|  1460|  phaseDot: {
  1461|  1461|    width: '8px',
  1462|  1462|    height: '8px',
  1463|  1463|    borderRadius: '50%',
  1464|  1464|  },
  1465|  1465|
  1466|  1466|  // ── Wave Counter (preserved) ────────────────────────────────────
  1467|  1467|
  1468|  1468|  waveCounter: {
  1469|  1469|    display: 'flex',
  1470|  1470|    alignItems: 'center',
  1471|  1471|    justifyContent: 'center',
  1472|  1472|    gap: '10px',
  1473|  1473|    padding: '6px 14px',
  1474|  1474|    background: 'var(--panel-bg-alt)',
  1475|  1475|    borderRadius: '6px',
  1476|  1476|    fontFamily: 'var(--font-mono)',
  1477|  1477|    border: '1px solid var(--panel-border)',
  1478|  1478|  },
  1479|  1479|
  1480|  1480|  waveCounterLabel: {
  1481|  1481|    fontSize: '12px',
  1482|  1482|    color: 'var(--text-dim)',
  1483|  1483|    letterSpacing: '3px',
  1484|  1484|    textTransform: 'uppercase',
  1485|  1485|    fontWeight: 'bold',
  1486|  1486|  },
  1487|  1487|
  1488|  1488|  waveCounterValue: {
  1489|  1489|    fontSize: '22px',
  1490|  1490|    color: 'var(--accent-primary)',   // amber-400
  1491|  1491|    fontWeight: 'bold',
  1492|  1492|    fontVariantNumeric: 'tabular-nums',
  1493|  1493|  },
  1494|  1494|
  1495|  1495|  // ── Sound Toggle ────────────────────────────────────────────────
  1496|  1496|
  1497|  1497|  soundToggle: {
  1498|  1498|    display: 'flex',
  1499|  1499|    alignItems: 'center',
  1500|  1500|    justifyContent: 'center',
  1501|  1501|    width: '32px',
  1502|  1502|    height: '28px',
  1503|  1503|    padding: 0,
  1504|  1504|    background: 'rgba(9, 9, 11, 0.5)',
  1505|  1505|    border: '1px solid var(--panel-border)',
  1506|  1506|    borderRadius: '6px',
  1507|  1507|    cursor: 'pointer',
  1508|  1508|    transition: 'border-color 0.2s, background 0.2s',
  1509|  1509|    alignSelf: 'flex-end',
  1510|  1510|  },
  1511|  1511|
  1512|  1512|  soundIcon: {
  1513|  1513|    fontSize: '15px',
  1514|  1514|    lineHeight: 1,
  1515|  1515|    transition: 'opacity 0.15s',
  1516|  1516|  },
  1517|  1517|
  1518|  1518|  // ── Garden Progress Indicator ────────────────────────────────────
  1519|  1519|
  1520|  1520|  gardenPanel: {
  1521|  1521|    display: 'flex',
  1522|  1522|    flexDirection: 'column',
  1523|  1523|    gap: '4px',
  1524|  1524|    padding: '8px 12px',
  1525|  1525|    background: 'rgba(6, 78, 59, 0.12)',   // emerald-950/15
  1526|  1526|    borderRadius: '8px',
  1527|  1527|    fontFamily: 'var(--font-mono)',
  1528|  1528|    border: '1px solid rgba(6, 78, 59, 0.60)',  // emerald-900/60
  1529|  1529|    userSelect: 'none',
  1530|  1530|    minWidth: '160px',
  1531|  1531|  },
  1532|  1532|
  1533|  1533|  gardenHeader: {
  1534|  1534|    fontSize: '10px',
  1535|  1535|    color: 'var(--accent-success)',
  1536|  1536|    letterSpacing: '3px',
  1537|  1537|    textTransform: 'uppercase',
  1538|  1538|    fontWeight: 'bold',
  1539|  1539|    textAlign: 'center',
  1540|  1540|    paddingBottom: '2px',
  1541|  1541|    borderBottom: '1px solid rgba(52, 211, 153, 0.15)',
  1542|  1542|  },
  1543|  1543|
  1544|  1544|  gardenRow: {
  1545|  1545|    display: 'flex',
  1546|  1546|    alignItems: 'center',
  1547|  1547|    justifyContent: 'space-between',
  1548|  1548|    gap: '8px',
  1549|  1549|    padding: '1px 0',
  1550|  1550|  },
  1551|  1551|
  1552|  1552|  gardenLabel: {
  1553|  1553|    fontSize: '10px',
  1554|  1554|    color: 'var(--text-body)',     // zinc-400
  1555|  1555|    letterSpacing: '1px',
  1556|  1556|    textTransform: 'uppercase',
  1557|  1557|    flexShrink: 0,
  1558|  1558|  },
  1559|  1559|
  1560|  1560|  gardenValue: {
  1561|  1561|    fontSize: '11px',
  1562|  1562|    fontWeight: 'bold',
  1563|  1563|    fontVariantNumeric: 'tabular-nums',
  1564|  1564|    letterSpacing: '1px',
  1565|  1565|  },
  1566|  1566|
  1567|  1567|  gardenCount: {
  1568|  1568|    fontSize: '12px',
  1569|  1569|    fontWeight: 'bold',
  1570|  1570|    fontVariantNumeric: 'tabular-nums',
  1571|  1571|  },
  1572|  1572|
  1573|  1573|  gardenBarTrack: {
  1574|  1574|    width: '100%',
  1575|  1575|    height: '3px',
  1576|  1576|    background: 'rgba(255, 255, 255, 0.06)',
  1577|  1577|    borderRadius: '2px',
  1578|  1578|    overflow: 'hidden',
  1579|  1579|    margin: '1px 0',
  1580|  1580|  },
  1581|  1581|
  1582|  1582|  gardenBarFill: {
  1583|  1583|    height: '100%',
  1584|  1584|    borderRadius: '2px',
  1585|  1585|    background: 'var(--accent-success)',  // emerald-400
  1586|  1586|    transition: 'width 0.4s ease',
  1587|  1587|  },
  1588|  1588|
  1589|  1589|  // ── Base Level Badge ────────────────────────────────────────────
  1590|  1590|
  1591|  1591|  baseLevelContainer: {
  1592|  1592|    position: 'relative',
  1593|  1593|    display: 'flex',
  1594|  1594|    flexDirection: 'column',
  1595|  1595|    gap: '6px',
  1596|  1596|    padding: '10px 12px 10px 16px',
  1597|  1597|    background: 'var(--panel-bg-alt)',
  1598|  1598|    borderRadius: '8px',
  1599|  1599|    border: '1px solid var(--panel-border)',
  1600|  1600|    fontFamily: 'var(--font-mono)',
  1601|  1601|    userSelect: 'none',
  1602|  1602|    minWidth: '180px',
  1603|  1603|    overflow: 'hidden',
  1604|  1604|  },
  1605|  1605|
  1606|  1606|  baseLevelAccent: {
  1607|  1607|    position: 'absolute',
  1608|  1608|    left: 0,
  1609|  1609|    top: 0,
  1610|  1610|    bottom: 0,
  1611|  1611|    width: '3px',
  1612|  1612|    borderRadius: '8px 0 0 8px',
  1613|  1613|  },
  1614|  1614|
  1615|  1615|  baseLevelHeader: {
  1616|  1616|    display: 'flex',
  1617|  1617|    alignItems: 'center',
  1618|  1618|    gap: '10px',
  1619|  1619|  },
  1620|  1620|
  1621|  1621|  baseLevelNumber: {
  1622|  1622|    fontSize: '26px',
  1623|  1623|    fontWeight: 'bold',
  1624|  1624|    fontVariantNumeric: 'tabular-nums',
  1625|  1625|    lineHeight: 1,
  1626|  1626|    flexShrink: 0,
  1627|  1627|    minWidth: '28px',
  1628|  1628|    textAlign: 'center',
  1629|  1629|  },
  1630|  1630|
  1631|  1631|  baseLevelTitleGroup: {
  1632|  1632|    display: 'flex',
  1633|  1633|    flexDirection: 'column',
  1634|  1634|    gap: '1px',
  1635|  1635|  },
  1636|  1636|
  1637|  1637|  baseLevelTitle: {
  1638|  1638|    fontSize: '13px',
  1639|  1639|    fontWeight: 'bold',
  1640|  1640|    letterSpacing: '3px',
  1641|  1641|    textTransform: 'uppercase',
  1642|  1642|    lineHeight: 1.2,
  1643|  1643|  },
  1644|  1644|
  1645|  1645|  baseLevelDesc: {
  1646|  1646|    fontSize: '9px',
  1647|  1647|    color: 'var(--text-dim)',
  1648|  1648|    fontStyle: 'italic',
  1649|  1649|    lineHeight: 1.3,
  1650|  1650|  },
  1651|  1651|
  1652|  1652|  baseLevelProgress: {
  1653|  1653|    display: 'flex',
  1654|  1654|    alignItems: 'center',
  1655|  1655|    gap: '8px',
  1656|  1656|  },
  1657|  1657|
  1658|  1658|  baseLevelBarTrack: {
  1659|  1659|    flex: 1,
  1660|  1660|    height: '3px',
  1661|  1661|    background: 'rgba(255, 255, 255, 0.08)',
  1662|  1662|    borderRadius: '2px',
  1663|  1663|    overflow: 'hidden',
  1664|  1664|  },
  1665|  1665|
  1666|  1666|  baseLevelBarFill: {
  1667|  1667|    height: '100%',
  1668|  1668|    borderRadius: '2px',
  1669|  1669|    transition: 'width 0.4s ease, background 0.4s ease',
  1670|  1670|  },
  1671|  1671|
  1672|  1672|  baseLevelProgressText: {
  1673|  1673|    fontSize: '9px',
  1674|  1674|    color: 'var(--text-body)',
  1675|  1675|    fontVariantNumeric: 'tabular-nums',
  1676|  1676|    whiteSpace: 'nowrap',
  1677|  1677|    flexShrink: 0,
  1678|  1678|  },
  1679|  1679|
  1680|  1680|  baseLevelMaxRow: {
  1681|  1681|    display: 'flex',
  1682|  1682|    alignItems: 'center',
  1683|  1683|    justifyContent: 'space-between',
  1684|  1684|  },
  1685|  1685|
  1686|  1686|  baseLevelMaxText: {
  1687|  1687|    fontSize: '11px',
  1688|  1688|    fontWeight: 'bold',
  1689|  1689|    letterSpacing: '2px',
  1690|  1690|  },
  1691|  1691|
  1692|  1692|  baseLevelKills: {
  1693|  1693|    fontSize: '9px',
  1694|  1694|    color: 'var(--text-body)',
  1695|  1695|    fontVariantNumeric: 'tabular-nums',
  1696|  1696|  },
  1697|  1697|
  1698|  1698|  // ── Wave Preview Panel ──────────────────────────────────────────
  1699|  1699|
  1700|  1700|  panel: {
  1701|  1701|    display: 'flex',
  1702|  1702|    flexDirection: 'column',
  1703|  1703|    gap: '6px',
  1704|  1704|    padding: '8px 12px',
  1705|  1705|    background: 'var(--panel-bg-alt)',
  1706|  1706|    borderRadius: '8px',
  1707|  1707|    border: '1px solid var(--panel-border)',
  1708|  1708|    fontFamily: 'var(--font-mono)',
  1709|  1709|    fontSize: '12px',
  1710|  1710|    color: 'var(--zinc-200)',
  1711|  1711|    userSelect: 'none',
  1712|  1712|    minWidth: '160px',
  1713|  1713|  },
  1714|  1714|
  1715|  1715|  header: {
  1716|  1716|    display: 'flex',
  1717|  1717|    alignItems: 'center',
  1718|  1718|    justifyContent: 'space-between',
  1719|  1719|    paddingBottom: '4px',
  1720|  1720|    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  1721|  1721|  },
  1722|  1722|
  1723|  1723|  nextLabel: {
  1724|  1724|    fontSize: '11px',
  1725|  1725|    color: 'var(--accent-wave-next)',    // sky blue — calm anticipation
  1726|  1726|    letterSpacing: '1px',
  1727|  1727|    textTransform: 'uppercase',
  1728|  1728|    fontWeight: 'bold',
  1729|  1729|  },
  1730|  1730|
  1731|  1731|  nextIcon: {
  1732|  1732|    fontSize: '10px',
  1733|  1733|  },
  1734|  1734|
  1735|  1735|  spawningLabel: {
  1736|  1736|    fontSize: '11px',
  1737|  1737|    color: 'var(--accent-primary)',    // amber — urgency
  1738|  1738|    letterSpacing: '1px',
  1739|  1739|    textTransform: 'uppercase',
  1740|  1740|    fontWeight: 'bold',
  1741|  1741|  },
  1742|  1742|
  1743|  1743|  pulseIcon: {
  1744|  1744|    display: 'inline-block',
  1745|  1745|    animation: 'none',   // Pulsing handled by keyframe below
  1746|  1746|    fontSize: '10px',
  1747|  1747|  },
  1748|  1748|
  1749|  1749|  waveNum: {
  1750|  1750|    fontSize: '12px',
  1751|  1751|    color: 'var(--accent-primary)',
  1752|  1752|    fontWeight: 'bold',
  1753|  1753|    fontVariantNumeric: 'tabular-nums',
  1754|  1754|  },
  1755|  1755|
  1756|  1756|  totalBadge: {
  1757|  1757|    display: 'inline-block',
  1758|  1758|    marginLeft: '6px',
  1759|  1759|    padding: '1px 6px',
  1760|  1760|    fontSize: '10px',
  1761|  1761|    color: 'var(--zinc-200)',
  1762|  1762|    background: 'rgba(255, 255, 255, 0.08)',
  1763|  1763|    borderRadius: '3px',
  1764|  1764|    fontWeight: 'normal',
  1765|  1765|  },
  1766|  1766|
  1767|  1767|  composition: {
  1768|  1768|    display: 'flex',
  1769|  1769|    flexDirection: 'column',
  1770|  1770|    gap: '3px',
  1771|  1771|  },
  1772|  1772|
  1773|  1773|  enemyRow: {
  1774|  1774|    display: 'flex',
  1775|  1775|    alignItems: 'center',
  1776|  1776|    gap: '6px',
  1777|  1777|    padding: '2px 0',
  1778|  1778|  },
  1779|  1779|
  1780|  1780|  enemyIcon: {
  1781|  1781|    width: '18px',
  1782|  1782|    fontSize: '14px',
  1783|  1783|    textAlign: 'center',
  1784|  1784|    flexShrink: 0,
  1785|  1785|  },
  1786|  1786|
  1787|  1787|  enemyCount: {
  1788|  1788|    width: '24px',
  1789|  1789|    fontSize: '14px',
  1790|  1790|    fontWeight: 'bold',
  1791|  1791|    fontVariantNumeric: 'tabular-nums',
  1792|  1792|    textAlign: 'right',
  1793|  1793|    flexShrink: 0,
  1794|  1794|  },
  1795|  1795|
  1796|  1796|  enemyLabel: {
  1797|  1797|    fontSize: '11px',
  1798|  1798|    color: 'var(--text-dim)',
  1799|  1799|    flexShrink: 0,
  1800|  1800|  },
  1801|  1801|
  1802|  1802|  // ── Watchers Panel ───────────────────────────────────────────────
  1803|  1803|
  1804|  1804|  watchersPanel: {
  1805|  1805|    display: 'flex',
  1806|  1806|    flexDirection: 'column',
  1807|  1807|    gap: '5px',
  1808|  1808|    padding: '8px 10px',
  1809|  1809|    background: 'var(--panel-bg-alt)',
  1810|  1810|    borderRadius: '8px',
  1811|  1811|    border: '1px solid var(--panel-border)',
  1812|  1812|    fontFamily: 'var(--font-mono)',
  1813|  1813|    userSelect: 'none',
  1814|  1814|    minWidth: '190px',
  1815|  1815|  },
  1816|  1816|
  1817|  1817|  watchersHeader: {
  1818|  1818|    display: 'flex',
  1819|  1819|    alignItems: 'center',
  1820|  1820|    justifyContent: 'space-between',
  1821|  1821|    paddingBottom: '4px',
  1822|  1822|    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  1823|  1823|  },
  1824|  1824|
  1825|  1825|  watchersTitle: {
  1826|  1826|    fontSize: '11px',
  1827|  1827|    color: 'var(--accent-turret)',
  1828|  1828|    letterSpacing: '2px',
  1829|  1829|    textTransform: 'uppercase',
  1830|  1830|    fontWeight: 'bold',
  1831|  1831|  },
  1832|  1832|
  1833|  1833|  watchersCount: {
  1834|  1834|    fontSize: '13px',
  1835|  1835|    color: 'var(--accent-wave-count)',
  1836|  1836|    fontWeight: 'bold',
  1837|  1837|    fontVariantNumeric: 'tabular-nums',
  1838|  1838|    background: 'rgba(107, 164, 199, 0.12)',
  1839|  1839|    borderRadius: '4px',
  1840|  1840|    padding: '1px 7px',
  1841|  1841|    minWidth: '22px',
  1842|  1842|    textAlign: 'center',
  1843|  1843|  },
  1844|  1844|
  1845|  1845|  watcherCard: {
  1846|  1846|    display: 'flex',
  1847|  1847|    flexDirection: 'column',
  1848|  1848|    gap: '4px',
  1849|  1849|    padding: '6px 8px',
  1850|  1850|    background: 'rgba(255, 255, 255, 0.03)',
  1851|  1851|    borderRadius: '5px',
  1852|  1852|    border: '1px solid rgba(255, 255, 255, 0.04)',
  1853|  1853|  },
  1854|  1854|
  1855|  1855|  watcherIdRow: {
  1856|  1856|    display: 'flex',
  1857|  1857|    alignItems: 'baseline',
  1858|  1858|    gap: '8px',
  1859|  1859|  },
  1860|  1860|
  1861|  1861|  watcherId: {
  1862|  1862|    fontSize: '14px',
  1863|  1863|    fontWeight: 'bold',
  1864|  1864|    fontVariantNumeric: 'tabular-nums',
  1865|  1865|    letterSpacing: '1px',
  1866|  1866|  },
  1867|  1867|
  1868|  1868|  watcherType: {
  1869|  1869|    fontSize: '10px',
  1870|  1870|    textTransform: 'uppercase',
  1871|  1871|    letterSpacing: '1.5px',
  1872|  1872|    opacity: 0.75,
  1873|  1873|  },
  1874|  1874|
  1875|  1875|  hpRow: {
  1876|  1876|    display: 'flex',
  1877|  1877|    alignItems: 'center',
  1878|  1878|    gap: '8px',
  1879|  1879|  },
  1880|  1880|
  1881|  1881|  hpBarTrack: {
  1882|  1882|    flex: 1,
  1883|  1883|    height: '4px',
  1884|  1884|    background: 'rgba(255, 255, 255, 0.08)',
  1885|  1885|    borderRadius: '2px',
  1886|  1886|    overflow: 'hidden',
  1887|  1887|  },
  1888|  1888|
  1889|  1889|  hpBarFill: {
  1890|  1890|    height: '100%',
  1891|  1891|    borderRadius: '2px',
  1892|  1892|    transition: 'width 0.3s ease, background 0.3s ease',
  1893|  1893|  },
  1894|  1894|
  1895|  1895|  hpText: {
  1896|  1896|    fontSize: '10px',
  1897|  1897|    color: 'var(--text-body)',
  1898|  1898|    fontVariantNumeric: 'tabular-nums',
  1899|  1899|    flexShrink: 0,
  1900|  1900|    minWidth: '48px',
  1901|  1901|    textAlign: 'right',
  1902|  1902|  },
  1903|  1903|
  1904|  1904|  badgesRow: {
  1905|  1905|    display: 'flex',
  1906|  1906|    gap: '6px',
  1907|  1907|    justifyContent: 'center',
  1908|  1908|    paddingTop: '2px',
  1909|  1909|  },
  1910|  1910|
  1911|  1911|  badge: {
  1912|  1912|    width: '24px',
  1913|  1913|    height: '24px',
  1914|  1914|    display: 'flex',
  1915|  1915|    alignItems: 'center',
  1916|  1916|    justifyContent: 'center',
  1917|  1917|    fontSize: '14px',
  1918|  1918|    background: 'rgba(255, 255, 255, 0.04)',
  1919|  1919|    borderRadius: '4px',
  1920|  1920|    transition: 'color 0.3s ease, opacity 0.3s ease, text-shadow 0.3s ease',
  1921|  1921|    cursor: 'default',
  1922|  1922|  },
  1923|  1923|
  1924|  1924|  // ── Inspect Panel (selected turret detail) ──────────────────────────
  1925|  1925|
  1926|  1926|  inspectPanel: {
  1927|  1927|    display: 'flex',
  1928|  1928|    flexDirection: 'column',
  1929|  1929|    gap: '5px',
  1930|  1930|    padding: '8px 10px',
  1931|  1931|    marginBottom: '6px',
  1932|  1932|    background: 'rgba(107, 164, 199, 0.06)',
  1933|  1933|    borderRadius: '6px',
  1934|  1934|    border: '1px solid rgba(107, 164, 199, 0.25)',
  1935|  1935|    fontFamily: 'var(--font-mono)',
  1936|  1936|    userSelect: 'none',
  1937|  1937|  },
  1938|  1938|
  1939|  1939|  inspectHeader: {
  1940|  1940|    display: 'flex',
  1941|  1941|    alignItems: 'center',
  1942|  1942|    justifyContent: 'space-between',
  1943|  1943|    paddingBottom: '4px',
  1944|  1944|    borderBottom: '1px solid rgba(107, 164, 199, 0.12)',
  1945|  1945|  },
  1946|  1946|
  1947|  1947|  inspectTitle: {
  1948|  1948|    fontSize: '11px',
  1949|  1949|    color: 'var(--accent-turret)',
  1950|  1950|    letterSpacing: '2px',
  1951|  1951|    textTransform: 'uppercase',
  1952|  1952|    fontWeight: 'bold',
  1953|  1953|  },
  1954|  1954|
  1955|  1955|  inspectTypeTag: {
  1956|  1956|    fontSize: '9px',
  1957|  1957|    letterSpacing: '1.5px',
  1958|  1958|    textTransform: 'uppercase',
  1959|  1959|    fontWeight: 'bold',
  1960|  1960|    padding: '1px 6px',
  1961|  1961|    borderRadius: '3px',
  1962|  1962|    border: '1px solid',
  1963|  1963|  },
  1964|  1964|
  1965|  1965|  inspectIdRow: {
  1966|  1966|    display: 'flex',
  1967|  1967|    alignItems: 'baseline',
  1968|  1968|    gap: '8px',
  1969|  1969|  },
  1970|  1970|
  1971|  1971|  inspectId: {
  1972|  1972|    fontSize: '14px',
  1973|  1973|    fontWeight: 'bold',
  1974|  1974|    fontVariantNumeric: 'tabular-nums',
  1975|  1975|    letterSpacing: '1px',
  1976|  1976|  },
  1977|  1977|
  1978|  1978|  inspectPos: {
  1979|  1979|    fontSize: '9px',
  1980|  1980|    color: 'var(--text-dim)',
  1981|  1981|    fontVariantNumeric: 'tabular-nums',
  1982|  1982|  },
  1983|  1983|
  1984|  1984|  inspectHpRow: {
  1985|  1985|    display: 'flex',
  1986|  1986|    alignItems: 'center',
  1987|  1987|    gap: '8px',
  1988|  1988|  },
  1989|  1989|
  1990|  1990|  inspectHpBarTrack: {
  1991|  1991|    flex: 1,
  1992|  1992|    height: '5px',
  1993|  1993|    background: 'rgba(255, 255, 255, 0.08)',
  1994|  1994|    borderRadius: '3px',
  1995|  1995|    overflow: 'hidden',
  1996|  1996|  },
  1997|  1997|
  1998|  1998|  inspectHpBarFill: {
  1999|  1999|    height: '100%',
  2000|  2000|    borderRadius: '3px',
  2001|