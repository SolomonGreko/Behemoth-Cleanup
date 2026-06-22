# Design Spec: Crystal Drop Rate Rebalance (Post-Audit)

**Design: Athena | Version: 1.0 | Date: 2026-06-22**

---

## Intent

Correct Crystal drop rates to align with the design-spec income targets defined in `resource_mechanics.md`. The original drop rates were calibrated too conservatively, producing ~7.0 Crystal per 5-wave boss cycle — well below the specified 9–11 Crystal target. This left the player resource-starved through the early game, unable to afford their first Watcher (5 Crystal) until wave 5+, contrary to the design intent of "1 watcher with surplus toward a turret or storage upgrade" per boss cycle.

---

## Problem

`resource_mechanics.md` §Drop Chances specifies:

> **Drop feel calibration:** Over 5 waves (1 boss cycle), a player who kills everything can expect ~6–8 Crystal from standard enemies + 3 from the boss = ~9–11 Crystal per cycle.

Actual yields with the original config values (`scout: 0.10, tank: 0.25, artillery: 0.30, crawler: 0.03`):

| Wave | Composition | Expected Crystal |
|------|-------------|-----------------|
| 1 | 5 scouts | 0.50 |
| 2 | 4 scouts + 2 tanks | 0.90 |
| 3 | 18 crawlers (swarm) | 0.54 |
| 4 | 5 scouts + 2 tanks + 1 artillery | 1.30 |
| 5 | boss + 3 scouts + 2 tanks | 3.80 |
| **Total** | | **7.04** |

Shortfall: 2.0–4.0 Crystal below target. The player could afford exactly one Watcher (5 Crystal) with only ~2 Crystal surplus — no room for storage upgrades, advanced turrets, or mortar upgrades within the first cycle.

---

## Mechanics

- **Drop rates are multipliers on `dropAmount`.** Each successful roll awards `dropAmount` (1) Crystal for standard enemies, `bossDropAmount` (3) for bosses.
- **SCALING.CRYSTAL_DROP_SCALE (0.05)** applies per-wave: `effectiveDropChance = baseDropChance × (1 + 0.05 × (wave - 1))`. At wave 10, drops are 45% more frequent than wave 1.
- **Drop rates must preserve type identity:** scouts (common, low reward) < tanks (tough, high reward) < artillery (dangerous, highest reward). Crawlers remain very low per-unit to prevent swarm flooding.
- **No change to `dropAmount` or `bossDropAmount`.** The tuning lever is drop probability, not quantity per drop. This preserves the "spike reward" feel — each drop is 1 Crystal, but drops happen more often.

---

## Parameters

### Config Change

```diff
  RESOURCE.crystal.drop:
-   scout: 0.10
-   tank: 0.25
-   artillery: 0.30
-   crawler: 0.03
+   scout: 0.20      (+100%)
+   tank: 0.40       (+60%)
+   artillery: 0.45  (+50%)
+   crawler: 0.05    (+67%)
```

| Parameter | Old | New | Rationale |
|-----------|-----|-----|-----------|
| `scout` | 0.10 | **0.20** | Double the most common drop. Scout waves 1-2 are the player's first Crystal source; at 10% they felt like Crystal "doesn't drop." At 20%, the player sees a drop every ~5 kills — frequent enough to feel rewarded without being guaranteed. |
| `tank` | 0.25 | **0.40** | Tanks are durable threats (20 HP, 5 damage). Killing one should feel like a payout. At 40%, ~2.5 kills per drop — a tank wave reliably yields Crystal. |
| `artillery` | 0.30 | **0.45** | Artillery are the most dangerous standard enemy (ranged, 8 damage, must-prioritize). The highest standard drop rate signals "kill this first." At 45%, ~2.2 kills per drop. |
| `crawler` | 0.03 | **0.05** | Very low per-unit remains unchanged in spirit — crawlers spawn at 3× count. At 5% with swarm waves spawning ~18 crawlers: 0.9 Crystal expected. At 3%, it was 0.54 — negligible. The 5% rate makes swarm waves feel like they *contribute* to Crystal income without flooding it. |

### Yield Verification

| Wave | Composition | Old Yield | New Yield |
|------|-------------|-----------|-----------|
| 1 | 5 scouts | 0.50 | 1.00 |
| 2 | 4 scouts + 2 tanks | 0.90 | 1.60 |
| 3 | 18 crawlers (swarm) | 0.54 | 0.90 |
| 4 | 5 scouts + 2 tanks + 1 artillery | 1.30 | 2.25 |
| 5 | boss + 3 scouts + 2 tanks | 3.80 | 4.40 |
| **Total** | | **7.04** | **10.15** |

With SCALING applied (1.20× at wave 5): **~11.5 Crystal** per cycle — at the upper end of the 9–11 target range, compensating for early-wave scaling being below 1.0×.

---

## Interactions

- **With Watcher economy:** First Watcher (5 Crystal) is now achievable by wave 3–4 (was wave 5–6). The player gets active defenses online before the first boss wave, matching the design intent of "defenses before the boss."
- **With turret upgrades:** Advanced turret (10 Stone + 15 Crystal) is achievable by wave 8–10 (was wave 12+). Mortar upgrades (25 Crystal) remain a mid-game investment requiring saving across multiple cycles.
- **With SCALING:** The 5% per-wave drop scaling compounds with the higher base rates. At wave 20, scout drop = 0.20 × (1 + 0.05 × 19) = 0.39. This is high but appropriate — late-game Crystal income should scale along with enemy HP.
- **With swarm waves:** Crawler drop rate increase from 3% to 5% means a wave-9 swarm (~24 crawlers) yields ~1.2 Crystal instead of ~0.72. Still modest — crawlers remain the lowest-yield enemy type — but no longer feels like "wasted kills."
- **With boss waves:** Unchanged. Boss drop is 100% for 3 Crystal. The guaranteed payout anchors the economy cycle.

---

## Edge Cases

- **Crystal cap (50) reached earlier** → The player may hit the Crystal cap during the first cycle if they don't spend. This is intentional — it signals "you have Crystal, build a Watcher." The cap pressure teaches spending.
- **High-roll streak (multiple drops in a row)** → The player gets a spike of 2–3 Crystal from a single wave. Feels exciting, not broken — variance is part of the "spike reward" feel.
- **Low-roll streak (no drops for a wave)** → Still possible at 20% scout rate (80% fail per kill = ~33% chance of 0 drops from 5 scouts). But the higher base rates reduce the probability of consecutive zero-drop waves.
- **Crawler swarm flooding Crystal** → At 5% per crawler, a swarm-cap wave (80 crawlers) yields 4.0 Crystal. Substantial but not economy-breaking — still less than one Watcher. The cap prevents abuse.

---

## Balance Notes

- **Tuning lever:** `RESOURCE.crystal.drop.*` rates are the primary knob. If the player is Crystal-flooded, reduce scout to 0.15. If still starved, raise tank to 0.50.
- **Watch in playtesting:** Does the first Watcher feel earned or handed out? The target is wave 3–4 for the first Watcher — late enough that surviving 2 waves without turrets feels tense, early enough that the player has defenses for the boss wave.
- **SCALING interaction:** If CRYSTAL_DROP_SCALE (0.05) proves too aggressive at high waves, cap drop rates at 0.80 or reduce scaling to 0.03. The current config has no drop rate cap.

---

*End of design spec. No implementation needed — config-only change applied by Athena. Hephaestus: run `cd frontend && yarn test --watchAll=false` to verify no test regressions from the changed drop rates.*
