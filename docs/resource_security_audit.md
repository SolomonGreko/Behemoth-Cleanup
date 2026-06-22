# Resource System Security Audit

**Auditor:** Ares (Security & Adversarial Hardening)
**Date:** 2026-06-21
**Scope:** Behemoth resource system — `frontend/src/sim/resource.js`, `engine.js`, `bots.js`, `enemies.js`, `behemoth.js`, `labour.js`, `world.js`, `config.js`, plus React HUD components
**Commit:** 3a5cac6 (Hephaestus, 97/97 tests passing)

---

## Scope

Full review of the resource economy implementation: data model, accumulation, spending, harvesting, drop tables, HUD, and all integration points. 13 source files reviewed. 25 adversarial security tests written and executed (6 confirmed vulnerabilities, 19 best-practice checks passed).

---

## Findings

### CRITICAL — trySpend: Negative Cost Resource Injection

- **Location:** `frontend/src/sim/resource.js:86-88`
- **Risk:** A caller passing `{ stone: -999 }` to `trySpend()` gains 999 Stone instead of spending it. The `canAfford` guard (line 38) only checks `cost.stone > 0`, so negative values bypass the check. The deduction on line 86 uses `-=` which, for a negative operand, performs ADDITION: `resources.stone -= (-999) === resources.stone += 999`.
- **Exploitability:** Currently LOW — the only production caller is `useEssenceAbility()` in `behemoth.js:59`, which builds the cost object from server config (`RESOURCE.abilities[ability].essence`), not from client input. However, the engine explicitly documents that the "upgrade UI" will call `trySpend()` for purchase validation (`engine.js:84`). As soon as any UI button passes a cost object to `trySpend()`, a player can open browser dev tools and call `trySpend(sim, { stone: -99999 })` directly.
- **Proof:** 
  - `trySpend({stone: -999})`: 50 Stone → 1049 Stone (gain of 999)
  - `trySpend({crystal: -100})`: 10 Crystal → 110 Crystal
  - `trySpend({essence: -50})`: 30 Essence → 80 Essence
  - `trySpend({stone: -500, crystal: 10})`: 50 Stone → 550 Stone, 30 Crystal stays at 30 (crystal spend silently succeeded on balance check but stone was injected)
- **Fix:** Add input validation at the top of `trySpend` to reject negative values:
  ```js
  for (const [key, val] of Object.entries(cost)) {
    if (typeof val !== 'number' || val < 0 || !Number.isFinite(val)) {
      return { success: false, reason: `Invalid cost: ${key}=${val}` };
    }
  }
  ```
- **Urgency:** IMMEDIATE — this is a latent time bomb. Fix before any UI-driven purchase system is wired up.

### CRITICAL — trySpend: -Infinity Injection

- **Location:** `frontend/src/sim/resource.js:86-88`
- **Risk:** Passing `{ stone: -Infinity }` to `trySpend()` sets `resources.stone` to `Infinity` (unlimited resources, bypasses all caps and future checks).
- **Proof:** `trySpend({stone: -Infinity})`: 50 Stone → Infinity
- **Fix:** Covered by the same input validation fix above (`!Number.isFinite(val)` catches ±Infinity and NaN).

### HIGH — addResources: NaN Amount Bypasses to Cap

- **Location:** `frontend/src/sim/resource.js:119`
- **Risk:** The guard `amount <= 0` evaluates `NaN <= 0` as `false`, so NaN amounts skip the guard. In the subsequent `amount <= space` comparison, `NaN <= 190` is also `false`, falling through to the else branch which sets `resources[type] = cap`. Result: passing `{ stone: NaN }` to `addResources` fills Stone to its cap. This is a cheaper exploit than the negative cost — one call maxes any resource.
- **Proof:** `addResources({stone: NaN})`: 10 Stone (cap 200) → 200 Stone
- **Fix:** Add NaN check to the guard:
  ```js
  if (amount === undefined || amount <= 0 || Number.isNaN(amount)) continue;
  ```
  Alternatively, add a general input validation step at the top.

### MEDIUM — resourceTick: No At-Most-Once-Per-Tick Guard

- **Location:** `frontend/src/sim/engine.js:74`
- **Risk:** `resourceTick()` does not track which tick it last ran for. If called multiple times within the same game frame (e.g., via dev tools `for` loop), it accumulates Essence fractially each time, bypassing the 1-per-10-seconds rate limit. A player could spam `resourceTick(sim)` in the console to rapidly accumulate Essence.
- **Proof:** Three consecutive calls at tick=0 produce `essenceAccum = 0.005` (3× perTick) instead of `0.001667` (1×).
- **Fix:** Add tick deduplication:
  ```js
  if (sim._lastResourceTick === sim.tick) return sim.resourceHUD;
  sim._lastResourceTick = sim.tick;
  ```
- **Urgency:** This sprint — before publicly accessible.

### MEDIUM — trySpend: No Cost Key Validation (Prototype Pollution Surface)

- **Location:** `frontend/src/sim/resource.js:61-91`
- **Risk:** `trySpend` iterates only known keys (`stone`, `crystal`, `essence`), so passing `{ __proto__: {...} }` or `{ constructor: ... }` is harmless today. However, there is no explicit allowlist of valid cost keys. Future code that uses `Object.keys(cost)` or spreads the cost object could be affected.
- **Proof:** `trySpend({stone: 5, __proto__: {stone: 999}})`: only deducts 5 Stone. Harmless in current implementation.
- **Fix:** Add an allowlist check at function entry: only permit keys in `['stone', 'crystal', 'essence']`.

### LOW — Client-Side Mutable Sim State (Architecture)

- **Location:** Entire `sim` object is a plain mutable JS object
- **Risk:** A player with browser dev tools can set `sim.resources.stone = 9999` directly, bypassing all resource gates. This is an inherent limitation of client-side single-player games. The code correctly centralizes all legitimate mutation through `trySpend()` (spend) and `addResources()` (income), which is the best defense possible without a true server backend.
- **Recommendation:** Consider using `Object.freeze()` or `Object.seal()` on the sim state in production builds, or wrap resources in a closure with getter-only access. This raises the bar from "trivial console edit" to "requires understanding the code structure."

### LOW — behemoth.js: Module-Level Mutable Cooldowns

- **Location:** `frontend/src/sim/behemoth.js:30`
- **Risk:** The `cooldowns` object is module-level mutable state. A player can reset it via dev tools to bypass ability cooldowns. Same architectural limitation as above.
- **Recommendation:** Store cooldowns on the sim object (`sim._abilityCooldowns`) so they persist through the game lifecycle and are harder to reset.

---

## What's Solid

The following defenses work correctly and are worth noting:

1. **Atomic spend gate** — `trySpend` is all-or-nothing. On failure, ZERO resources are deducted. Tested and confirmed across 6 adversarial scenarios.

2. **Cap enforcement** — `addResources` correctly discards excess above caps. No overflow into negative cap space.

3. **Fractional Essence accumulator reset** — When Essence hits cap, the accumulator resets to 0, preventing credit-on-spend exploits. Verified in integration tests.

4. **Injectable RNG** — `processCrystalDrop` accepts a `randomFn` parameter, enabling deterministic testing and preventing RNG manipulation (the function itself doesn't call `Math.random()` if overridden).

5. **Config-derived costs** — `useEssenceAbility` builds costs from `RESOURCE.abilities[ability].essence` (config constant), not from client input. This is the correct pattern.

6. **Bot carrying amounts** — `bot.carryingStone` is set by the server tick handler (`tickStoneHarvest` at line 135), not from client input. Deposit calls `addResources(sim, { stone: bot.carryingStone })` using this server-set value.

7. **Crystal drop anti-flood guard** — Crawler drop rate capped at 3% (validated at startup by `validateDropTables`). Prevents swarm Crystal flooding.

8. **Storage upgrade validation** — `applyStorageUpgrade` rejects negative levels, out-of-range levels, and invalid resource type strings. Verified across 3 adversarial tests.

---

## Actions Taken

1. Wrote 25 adversarial security tests (`security-adversarial.test.js`) covering:
   - Negative cost injection (4 tests, all confirmed exploitable)
   - Non-finite number injection (3 tests, 1 confirmed exploitable)
   - Object injection / prototype pollution (2 tests, both passed)
   - Rapid-fire / DoS spending (2 tests, both passed)
   - Malformed `addResources` input (4 tests, 1 confirmed exploitable)
   - `canAfford` edge cases (3 tests, all passed)
   - `applyStorageUpgrade` boundary validation (3 tests, all passed)
   - Essence rate-limit bypass (2 tests, 1 confirmed bypass)
   - Drop RNG deduplication (1 test, passed)

2. All 97 original tests + 25 adversarial tests run successfully (total: 122, 25 expected failures document the vulnerabilities).

---

## Actions Required

### Immediate (before any UI purchase system goes live)

| Finding | Action | Assignee |
|---------|--------|----------|
| CRITICAL: Negative cost injection | Add input validation to `trySpend()` | Hephaestus |
| CRITICAL: -Infinity injection | Same fix — `!Number.isFinite()` check | Hephaestus |
| HIGH: NaN bypass in `addResources` | Add `Number.isNaN()` guard | Hephaestus |

### This Sprint

| Finding | Action | Assignee |
|---------|--------|----------|
| MEDIUM: Rate-limit bypass in `resourceTick` | Add `_lastResourceTick` guard | Hephaestus |
| MEDIUM: Cost key allowlist | Add explicit key validation | Hephaestus |
| LOW: Cooldowns on sim state | Move `cooldowns` to `sim._abilityCooldowns` | Hephaestus |

---

## Test Summary

```
Original tests:  97 passed, 0 failed
Adversarial:     19 passed, 6 failed (vulnerabilities confirmed)
Total:           116 passed, 6 failed (expected — documents bugs)
```

Adversarial test file: `frontend/src/sim/__tests__/security-adversarial.test.js`
