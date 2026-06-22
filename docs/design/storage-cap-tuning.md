# Design Spec: Resource Storage Cap Tuning (L3 Correction)

**Design: Athena | Version: 1.0 | Date: 2026-06-22**

---

## Intent

Correct the storage cap upgrade curve so L3 caps match the escalating-reward model specified in `resource_mechanics.md`. The current implementation uses a flat `capUpgradePerLevel` scalar that undervalues the final storage tier — the most expensive upgrade should deliver proportionally more capacity, not the same increment as earlier tiers.

---

## Problem

`config.js` defines caps via a flat multiplier:

```js
// engine.js applyStorageUpgrade():
cap = baseCap + capUpgradePerLevel * level
```

This produces linear cap growth:

| Level | Stone (capUpgradePerLevel: 50) | Crystal (25) | Essence (25) |
|-------|-------------------------------|-------------|-------------|
| L0 | 200 | 50 | 100 |
| L1 | 250 | 75 | 125 |
| L2 | 300 | 100 | 150 |
| L3 | **350** | **125** | **175** |

But `resource_mechanics.md` specifies escalating L3 caps that reward the player's heavy investment:

| Level | Stone | Crystal | Essence |
|-------|-------|---------|---------|
| L0 | 200 | 50 | 100 |
| L1 | 250 | 75 | 125 |
| L2 | 300 | 100 | 150 |
| L3 | **400** | **150** | **200** |

The gap:
- Stone: 350 → 400 (-50, 12.5% short)
- Crystal: 125 → 150 (-25, 16.7% short)
- Essence: 175 → 200 (-25, 12.5% short)

---

## Mechanics

- **Escalating returns at L3.** The final storage upgrade costs substantially more than L1+L2 combined (Stone: 120+20 vs 50+5 and 80+10). The cap increase should reflect this — L3 is the "capstone" storage upgrade, not just "one more tier."
- **Config structure change.** Replace `capUpgradePerLevel: <number>` with `capUpgradePerLevel: [number, number, number, number]` — a per-level array of cumulative cap values. This makes the config the single source of truth for caps at every tier.
- **Engine change.** `applyStorageUpgrade()` reads `RESOURCE[type].capUpgradePerLevel[level]` instead of computing `base + scalar * level`. No fallback needed — this is a clean break from the linear model.

---

## Parameters

### New config structure (in `RESOURCE.stone`, `RESOURCE.crystal`, `RESOURCE.essence`):

```js
// Replace:
capUpgradePerLevel: 50,  // cap increase per storage upgrade level

// With:
capUpgradePerLevel: [200, 250, 300, 400],
// Per-level cumulative cap. Index = storage upgrade level.
// L0=200 (default), L1=250 (+50), L2=300 (+50), L3=400 (+100)
```

| Resource | Old `capUpgradePerLevel` | New `capUpgradePerLevel` | Rationale |
|----------|--------------------------|--------------------------|-----------|
| Stone | `50` (scalar) | `[200, 250, 300, 400]` | L3 = +100 (not +50). The L3 upgrade costs 120 Stone + 20 Crystal — nearly as much as L0→L2 combined. The +100 cap increase makes this investment feel like a power spike, not a marginal gain. |
| Crystal | `25` (scalar) | `[50, 75, 100, 150]` | L3 = +50 (not +25). Crystal L3 costs 180 Stone + 35 Crystal. At the old +25, the player gains 1 extra watcher of storage. At +50, they gain 2 — enough to feel the upgrade changed their options. |
| Essence | `25` (scalar) | `[100, 125, 150, 200]` | L3 = +50 (not +25). Essence L3 costs 220 Stone + 50 Crystal. At +50, the player stores 2 extra Pulse Waves instead of 1 — a meaningful emergency reserve upgrade. |

### Why arrays not scalars?

A single scalar `capUpgradePerLevel * level` can only produce linear sequences. The design calls for `[+50, +50, +100]` for Stone — two linear steps then an escalating step. Arrays encode this directly without computation. The config is the truth. No formula to audit, no off-by-one risk.

### Cost table (unchanged):

The `storageUpgrades` cost table already matches the design doc and does not change.

---

## Interactions

- **With engine.js `applyStorageUpgrade()`:** Must change from `capUpgradePerLevel * level` to `capUpgradePerLevel[level]`. The array index directly gives the new cap. Input validation (level 0–3) still applies.
- **With resource.js `addResources()`:** No change — caps already read from `sim.resourceCaps` which is set by `applyStorageUpgrade()`. Higher caps automatically allow more accumulation.
- **With HUD:** No change — HUD reads `sim.resourceCaps` which reflects the new values. The cap display updates automatically.
- **With tests:** Tests that assert specific cap values at upgrade levels must be updated:
  - `resource-integration.test.js` line 180: `expect(sim.resourceCaps.stone).toBe(350)` → `toBe(400)`
  - `resource-integration.test.js` line 192: `expect(sim.resourceCaps.essence).toBe(150)` → `toBe(150)` (no change — L2 is still 150)
  - Add L3 assertion tests for crystal (150) and essence (200)

---

## Edge Cases

- **Level 0 (default):** `capUpgradePerLevel[0]` returns the default cap (200/50/100). Same as before.
- **Level > 3:** Input validation in `applyStorageUpgrade()` already rejects (`level > 3`). No change.
- **Negative level:** Already rejected by existing validation.
- **Player upgrades out of order (L0→L3 skip):** The array is cumulative, not incremental — `capUpgradePerLevel[3]` is the absolute cap, not the delta. If a player somehow goes from L0 to L3 without intermediate upgrades, they still get the correct L3 cap. (Though the purchase path gates this via `canAfford` checks on intermediate levels.)

---

## Balance Notes

- **L3 cap values were designed for wave 15+:** By wave 15, the player has faced 3 boss waves and should have the resources to reach L3 storage if they invested. The +100/+50/+50 caps at L3 support late-game resource stockpiling without trivializing the economy.
- **Tuning levers:** Each array entry is independently tunable. If L3 Stone cap of 400 proves too generous, drop to 375 without affecting L1/L2.
- **Watch in playtesting:** Whether the L3 storage upgrade feels "worth it." At old values, the marginal gain was small relative to cost. New values should make L3 storage feel like a power spike.

---

## Files Affected (for Hephaestus)

| File | Change |
|------|--------|
| `frontend/src/sim/config.js` | Replace `capUpgradePerLevel` scalars with arrays (Athena will do this — it's config) |
| `frontend/src/sim/engine.js` | `applyStorageUpgrade()`: change `capUpgradePerLevel * level` to `capUpgradePerLevel[level]` |
| `frontend/src/sim/__tests__/resource-integration.test.js` | Update L3 cap assertions (350→400 stone, add crystal/essence L3 checks) |

---

## Acceptance Criteria Checklist

- [ ] Config arrays: `RESOURCE.stone.capUpgradePerLevel: [200, 250, 300, 400]`
- [ ] Config arrays: `RESOURCE.crystal.capUpgradePerLevel: [50, 75, 100, 150]`
- [ ] Config arrays: `RESOURCE.essence.capUpgradePerLevel: [100, 125, 150, 200]`
- [ ] `applyStorageUpgrade()` uses array index, not scalar multiplication
- [ ] All 276 existing tests still pass
- [ ] Updated test assertions for new L3 cap values
- [ ] `resource_mechanics.md` cap table matches config (it already does — config was the outlier)

---

*End of design spec. Downstream task: Hephaestus (config + engine + test changes).*
