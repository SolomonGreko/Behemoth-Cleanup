# Design Spec: Swarm Creep — Late-Game Crawler Escorts

**Design: Athena | Version: 1.0 | Date: 2026-06-22**
**Config: SWARM.creep block (already placed in config.js)**
**Downstream: Hephaestus (engine.js wiring)**

---

## Intent

Late-game normal waves (wave 20+) currently feel identical to early-game normal waves — same scout/tank/artillery mix, same pacing. The only variety comes from swarm waves (every 3) and boss waves (every 5). For players doing extended runs beyond wave 20, the game needs a gradual introduction of the swarm mechanic into normal waves so that the threat landscape evolves. Swarm creep adds a small crawler escort to normal waves starting at wave 20, creating a gentle escalation that keeps late-game normal waves from feeling stale.

---

## Mechanics

- **Trigger.** When `SWARM.creep.enabled` is true and `waveNum >= SWARM.creep.startWave`, normal (non-swarm, non-boss) waves include a crawler escort.
- **Creep count.** `crawlerCount = Math.min(Math.floor(baseCount * SWARM.creep.fraction), SWARM.creep.capPerWave)`.
  - `baseCount` is the normal wave's total enemy count (`WAVE.baseSpawnCount + (waveNum - 1) * WAVE.spawnCountGrowth`, capped at 40).
  - Example: wave 22, baseCount = 5 + 21 = 26. `crawlerCount = min(floor(26 * 0.10), 5) = 2`.
  - Example: wave 60, baseCount = min(5 + 59, 40) = 40. `crawlerCount = min(floor(40 * 0.10), 5) = 4`.
- **Composition adjustment.** The creep crawlers are subtracted from the scout allocation (the most common enemy type) to keep total wave size constant. The normal wave composition is computed first, then creep crawlers replace an equal number of scouts.
- **Spawn order.** Creep crawlers spawn interspersed with normal enemies at the normal spawn interval (not the faster swarm spawn rate). They use the same spawn points.
- **No effect on swarm/boss waves.** The creep mechanic only applies to normal waves. Swarm waves and boss waves are unaffected — they already have crawlers or are boss-only.

---

## Parameters (already in config.js → SWARM.creep)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `enabled` | true | Master toggle. Set to false to disable creep entirely (e.g., for testing or if the mechanic proves unpopular). |
| `startWave` | 20 | The standard game spans 20 waves. Creep begins at wave 20 to avoid affecting the core experience while enriching extended play. At wave 20, baseCount = 24, so ~2 crawlers appear — barely noticeable, a soft introduction. |
| `fraction` | 0.10 (10%) | At wave 20: 2 crawlers. At wave 30: 3 crawlers. At wave 60: 4 crawlers (capped). The fraction is intentionally small — creep is a flavor mechanic, not a difficulty spike. The real crawler threat still comes from dedicated swarm waves (every 3 waves, 3× count). |
| `capPerWave` | 5 | Prevents excessive crawler counts at very high wave numbers. Without a cap, wave 100 (baseCount=40) would spawn 4 crawlers anyway — the cap is a safety rail for future count scaling changes. |

---

## Implementation (for Hephaestus)

### File: `frontend/src/sim/engine.js`

Modify `getWaveComposition()` — after the normal wave composition block (after line 479), add a creep injection step:

```js
// After: return groups; (line 479)
// Add: Swarm creep injection for late-game normal waves

// --- SWARM CREEP injection (before return) ---
if (
  !bossWave && !swarmWave && !bossAndSwarm &&
  SWARM.creep && SWARM.creep.enabled &&
  waveNum >= SWARM.creep.startWave
) {
  const creepCount = Math.min(
    Math.floor(actualCount * SWARM.creep.fraction),
    SWARM.creep.capPerWave
  );
  if (creepCount > 0) {
    // Subtract from scouts (the dominant enemy type) to keep total count stable
    const scoutGroup = groups.find(g => g.type === 'scout');
    if (scoutGroup) {
      const removed = Math.min(scoutGroup.count, creepCount);
      scoutGroup.count -= removed;
      if (scoutGroup.count <= 0) {
        // Remove empty scout group
        groups.splice(groups.indexOf(scoutGroup), 1);
      }
    }
    groups.push({ type: 'crawler', count: creepCount });
  }
}
// --- END SWARM CREEP ---
```

### Import

Ensure `SWARM` is imported in engine.js (it already is — line 20).

### Tests

Add to `engine.test.js`:
- Creep does NOT fire for wave 19 (below startWave)
- Creep fires for wave 20 (at startWave)
- Creep count = floor(baseCount * 0.10), capped at 5
- Creep crawlers replace scouts (total count unchanged)
- Creep does NOT fire for swarm waves (wave 21 — isSwarmWave)
- Creep does NOT fire for boss waves (wave 20 is also boss wave — skip)
- Creep fires for normal wave 22 (not swarm, not boss)
- SWARM.creep.enabled = false suppresses creep
- capPerWave = 5 respected at wave 100

---

## Interactions

- **With SWARM.cap (80 simultaneous crawlers):** Creep crawlers count toward the cap like any other crawlers. At wave 20 with 2 creep crawlers, the cap is irrelevant. Only at very high waves with overlapping swarm + creep could the cap matter — the cap handles it gracefully (spawning pauses).
- **With SCALING:** Creep crawlers use the same ENEMY.crawler stats and are subject to SCALING multipliers. At wave 20, crawler HP = 3 × 2.14 = 6.42 — still one-shot by watchers (20 damage).
- **With SCALING.HP_CAP (10×):** Even at wave 60, crawler HP = 3 × 4.54 = 13.6 — two shots needed. The swarm spec says crawlers should stay fragile; SCALING eventually makes them two-shot kills. This is a separate concern (see Balance Notes).
- **With wave composition ratios:** Creep crawlers replace scouts only. Tank and artillery ratios are preserved. This keeps the tactical challenge of late-game normal waves (tank/arty mix) intact while adding a mild swarm element.
- **With economy:** Creep crawlers grant the standard `SWARM.crawlerBounty` (1 Stone per kill). At 2-5 creep crawlers per wave, this adds 2-5 bonus Stone per late-game normal wave — a minor economic perk that rewards clearing waves cleanly.

---

## Edge Cases

- **Wave 20 is both startWave AND a boss wave** → Boss takes priority. No creep. The creep mechanic only fires for normal waves.
- **Wave 21 is both a swarm wave AND above startWave** → Swarm takes priority. No creep (already handled by `!swarmWave` guard).
- **Wave 22 is a normal wave above startWave** → Creep fires. ~2 crawlers added, ~2 scouts removed.
- **Scout count is less than creep count** → All scouts are replaced, remaining creep crawlers are added on top (total wave size grows slightly). At fraction 0.10 this shouldn't happen for realistic wave numbers, but the guard is: `subtract min(scoutCount, creepCount)`.
- **SWARM.creep config block is missing (backward compat)** → The `SWARM.creep && SWARM.creep.enabled` guard handles this. No creep fires. Existing behavior preserved.

---

## Balance Notes

- **Tuning levers:** `fraction` controls creep intensity. `startWave` controls when it begins. `capPerWave` is a safety ceiling.
- **Watch in playtesting:** Does 2-3 extra crawlers in wave 22 feel noticeable? The intent is subtle — the player should think "huh, were there always crawlers in normal waves?" rather than "the game just got harder." If creep is too visible, reduce `fraction` to 0.05.
- **Crawler HP scaling concern:** The swarm spec states crawlers should stay one-shot kills. Currently SCALING applies to all enemies, so at wave 60+ crawlers need 2 shots. This is a design tension flagged for future balancing. Separating crawler HP scaling from general SCALING would require a config parameter like `SCALING.CRAWLER_HP_SCALE: 0` — not in scope for this spec.
- **Start wave placement:** If the standard game is extended beyond 20 waves (e.g., a future 30-wave campaign), consider lowering `startWave` to 15 to introduce creep earlier. The 20-wave value is calibrated to the current game length.

---

*End of design spec. Downstream: Hephaestus (engine.js wiring, tests). No visual changes needed — creep crawlers render identically to swarm crawlers.*
