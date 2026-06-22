# Design Spec: Crawler HP Scaling Exception

**Design: Athena | Version: 1.0 | Date: 2026-06-22**
**Config: `SCALING.CRAWLER_HP_SCALE` (already placed in config.js)**
**Downstream: Hephaestus (engine.js wiring, tests)**

---

## Intent

Crawlers are defined by the swarm design spec as "individually weak, collectively strong" — they must remain one-shot kills regardless of wave number. Currently, `SCALING.HP_SCALE` applies uniformly to all enemy types, meaning crawler HP grows at 6% per wave: by wave 17, a crawler has 6+ HP (requiring 2+ watcher shots); by wave 60, it has 13.6 HP (3+ shots). This erodes the crawler identity: they become smaller, faster tanks rather than fragile swarm units. The difficulty of crawlers should scale through count — not bullet-sponginess. This spec introduces a per-type HP scaling override so crawlers can diverge from the general scaling curve.

---

## Mechanics

- **HP scaling override.** When creating a crawler enemy, the engine checks `SCALING.CRAWLER_HP_SCALE`. If the parameter is defined (not `undefined` or `null`), it replaces `SCALING.HP_SCALE` for that enemy. If undefined, crawlers use `HP_SCALE` (backward compatible — no behavior change for projects that don't adopt the parameter).
- **Default value.** `CRAWLER_HP_SCALE: 0` — crawlers receive zero HP growth. At wave 100, a crawler still has 3 HP, still dies in one shot. Difficulty comes from volume (swarm waves reach 80 crawlers), not from individual toughness.
- **HP_CAP still applies.** The general `SCALING.HP_CAP` ceiling (10× base HP) still applies to crawlers as a safety rail. With `CRAWLER_HP_SCALE: 0`, scaled HP = 3, cap = 30 — the cap is never binding, which is correct.
- **Only HP is overridden.** Crawler speed and damage use general `SPEED_SCALE` and `DAMAGE_SCALE`. Mild speed/damage creep is acceptable for crawlers — it's the HP that must stay frozen.

---

## Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `SCALING.CRAWLER_HP_SCALE` | 0 | Crawlers stay at base 3 HP forever. Every turret type one-shots them at any wave. The challenge is volume management — mortar coverage, wall layering, FD timing — not DPS checks on individual units. |
| Fallback (undefined) | Use `HP_SCALE` | Backward compatible. Projects not adopting this parameter see no change. |

**HP comparison with and without override:**

| Wave | General HP Scaling (0.06) | With CRAWLER_HP_SCALE: 0 | Watcher Shots to Kill |
|------|--------------------------|--------------------------|----------------------|
| 1 | 3.00 | 3.00 | 1 |
| 3 | 3.36 | 3.00 | 1 |
| 10 | 4.62 | 3.00 | 1 |
| 17 | 5.88 → **2-shot** | 3.00 | 1 |
| 30 | 8.22 → **2-shot** | 3.00 | 1 |
| 60 | 13.62 → **3-shot** | 3.00 | 1 |
| 100 | 20.82 → **4-shot** | 3.00 | 1 |

The override prevents crawlers from degrading into bullet-sponge tanks over extended play.

---

## Implementation (for Hephaestus)

### File: `frontend/src/sim/engine.js`

Modify `createEnemy()` — replace the single `SCALING.HP_SCALE` usage with a type-aware lookup:

```js
// Line 628-631 — REPLACE:
const scaledHp = Math.min(
  config.hp * (1 + SCALING.HP_SCALE * scaleFactor),
  config.hp * SCALING.HP_CAP
);

// WITH:
const hpScale = (type === 'crawler' && SCALING.CRAWLER_HP_SCALE !== undefined)
  ? SCALING.CRAWLER_HP_SCALE
  : SCALING.HP_SCALE;
const scaledHp = Math.min(
  config.hp * (1 + hpScale * scaleFactor),
  config.hp * SCALING.HP_CAP
);
```

No other changes needed — speed and damage continue using `SCALING.SPEED_SCALE` and `SCALING.DAMAGE_SCALE` for all types including crawlers.

### Tests (add to `engine.test.js`)

1. **Crawler HP frozen at wave 1** — crawler HP = 3 (base)
2. **Crawler HP frozen at wave 100** — crawler HP = 3 (override active)
3. **Crawler HP with override undefined** — falls back to general HP_SCALE (backward compat)
4. **Non-crawler enemies unaffected** — scout at wave 10 uses HP_SCALE 0.06
5. **Crawler speed still scales** — uses SPEED_SCALE, not frozen
6. **Crawler damage still scales** — uses DAMAGE_SCALE, not frozen
7. **HP_CAP still applies** — if CRAWLER_HP_SCALE were set to 0.50, cap at 10× base

---

## Interactions

- **With SWARM.cap (80 simultaneous crawlers):** Unchanged. The override doesn't affect count — swarm waves still flood 80 crawlers. The difference is each crawler is equally fragile at wave 60 as at wave 3, so mortar AoE and turret coverage remain effective counters.
- **With SCALING.HP_CAP:** Still applies as a safety ceiling. With `CRAWLER_HP_SCALE: 0`, the cap is never binding (3 < 30). If a future config changes `CRAWLER_HP_SCALE` to a positive value, the cap prevents absurdly high crawler HP.
- **With swarm creep:** Creep crawlers (wave 20+, ~2-5 per normal wave) use the same override. They stay fragile escorts, not surprise tanks.
- **With boss+swarm coincidence (wave 15, 30, 45…):** Crawlers in these waves use the override. The boss remains the HP check; crawlers remain the volume check.
- **With economy:** `SWARM.crawlerBounty` (1 Stone per kill) is unchanged. Since crawlers are always one-shot, the kill rate depends on turret count and coverage — not on HP checks. Economic reward is proportional to the player's AoE investment.

---

## Edge Cases

- **`CRAWLER_HP_SCALE` is undefined (backward compat):** The engine falls back to `HP_SCALE`. Existing behavior preserved for projects that haven't adopted the parameter. This is the `!== undefined` guard in the implementation.
- **`CRAWLER_HP_SCALE` is explicitly set to `null`:** Treated as undefined (falls back to `HP_SCALE`). A null value means "I know this parameter exists but I want the default behavior."
- **`CRAWLER_HP_SCALE` is negative:** The formula `1 + (-0.02) * scaleFactor` would produce < 1.0 for scaleFactor > 0, reducing crawler HP below base. This is a valid tuning choice (making late-game crawlers even weaker) but should be noted as unusual. The `Math.min` with HP_CAP doesn't guard against this (HP_CAP is a maximum). Consider a floor of `config.hp * 0.25` if negative scaling is a concern — not in scope for this spec.
- **Multiple enemy types need overrides in the future:** This spec establishes the pattern. Future overrides (e.g., `TANK_HP_SCALE`) would follow the same `type === 'tank' && SCALING.TANK_HP_SCALE !== undefined` pattern, or a general `PER_TYPE_HP_SCALE` lookup table. The single-type pattern is chosen for simplicity until a second override is needed.

---

## Balance Notes

- **Tuning lever:** `CRAWLER_HP_SCALE` can be set to any value. `0` keeps crawlers perfectly frozen. `0.01` would produce very gradual HP growth (wave 100 crawler = 3 * (1 + 0.01 * 99) = 5.97 — still one-shot). Designers can tune the exact pace of crawler toughening.
- **Watch in playtesting:** If crawlers are too trivial at high wave numbers with 0 scaling, increase `CRAWLER_HP_SCALE` slightly (0.005–0.01) to introduce a very gradual need for turret upgrades. But the primary difficulty lever should remain count (via `SWARM.countMultiplier` and `SWARM.countGrowth`).
- **Relationship to general HP_SCALE:** If `HP_SCALE` is reduced globally (e.g., from 0.06 to 0.04), the crawler exception becomes less necessary — but separating the two parameters gives designers independent control. Keep both.
- **Why not a per-type override table?** A general `SCALING.TYPE_HP_SCALE: { crawler: 0, scout: 0.06, tank: 0.06 }` would be more flexible but adds complexity. The single override pattern is chosen because only crawlers need the exception today. If a second exception is needed, refactor to a lookup table.

---

*End of design spec. Downstream: Hephaestus (engine.js wiring, 7 tests). No visual changes needed. Config already placed.*
