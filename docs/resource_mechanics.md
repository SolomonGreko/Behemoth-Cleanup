# Resource Mechanics — Behemoth Resource System

**Design: Athena | Version: 1.0 | Date: 2026-06-21**

---

## Intent

Resources are the backbone of Behemoth's economy loop. They connect the three core activities — base expansion (Stone), combat (Crystal), and patience/survival (Essence) — into a single strategic tension. The player always has something to do, but never everything at once. Stone is the steady pressure to expand; Crystal rewards risk with spike power; Essence is the safety net that builds while you survive. Together they prevent stagnation: sitting still depletes nothing, but risks being outpaced.

---

## Resource Types

### Overview

| Resource | Rarity | Source | Primary Use | Feel |
|----------|--------|--------|-------------|------|
| **Stone** | Common | Bot harvesting from terrain zones | Wall upgrades, base structures, bot production | Steady, reliable, slow-drip |
| **Crystal** | Rare | Enemy death drops | Watchers, advanced turrets, storage upgrades | Spike reward, combat-gated |
| **Essence** | Time-based | Passive accumulation over time | Pulse wave, Final Defense hasten, emergency shield | Insurance, patience reward |

### 1. Stone — The Builder's Currency

**Lore identity (placeholder — Calliope owns final naming):** Mined from the earth, shaped by the base. Stone is the literal foundation of everything the player builds. It comes from terrain — the land itself yields it.

**Gameplay role:** Stone gates expansion. Without it, the base stays small and fragile. It is always available but never fast — the player must invest bots and time to accumulate it.

**Visual direction (for Aphrodite):** Rough, earthy tones (gray/brown). Icon should suggest a quarried block or piled stones — solid, grounded, weighty.

### 2. Crystal — The Spoils of War

**Lore identity (placeholder):** Shards of crystallized enemy energy, released on death. The enemies themselves are the source — each kill is a gamble that pays out in power.

**Gameplay role:** Crystal is the combat reward. It gates advanced defenses — watchers, turrets, mortar upgrades. A player who avoids combat will have no Crystal and thus no advanced defenses, creating an escalating threat. Crystal creates exciting spikes: clearing a wave yields a burst of potential purchases.

**Visual direction (for Aphrodite):** Sharp, faceted, bright blue/purple tones. Icon should suggest a crystalline shard — angular, luminous, precious.

### 3. Essence — The Patience Dividend

**Lore identity (placeholder):** Ambient energy absorbed by the base over time. The longer the base survives, the more Essence it accumulates — a reward for endurance.

**Gameplay role:** Essence is the player's insurance policy. It accumulates regardless of what the player does, building toward powerful emergency abilities. When things go wrong — a swarm breach, a boss wave — Essence is spent to recover. It cannot be rushed, only waited for.

**Visual direction (for Aphrodite):** Glowing orb, ethereal, soft white/gold glow. Icon should suggest contained light or a luminous pearl — delicate, precious, time-formed.

---

## Gathering Mechanics

### Stone Harvesting

Stone is harvested by bots from designated terrain zones. The mechanic extends the existing bot harvesting infrastructure (steel-from-cars pattern) with a new target type.

**Rules:**
- Stone zones are terrain cells tagged as `harvestable: 'stone'` during world generation.
- Bots assigned to harvest Stone move to the nearest unclaimed Stone zone within vision range, harvest for a fixed number of ticks, then return to base to deposit.
- Harvest task is claim-based (sticky assignment): a bot claims a zone on assignment, and that zone is removed from the candidate pool until the bot deposits or the zone is invalidated.
- Deposit occurs when the bot reaches the base center. The Stone amount is added to the player's resource pool.

**Sticky assignment note:** The claim-based sticky assignment pattern from the labour allocator refactor applies here. A bot claims a zone on first assignment; `assignJob` is only re-called if (a) the zone is invalidated (destroyed, out of bounds), or (b) higher-priority work opens up (`hasHigherPriorityWork` check). Without sticky assignment, bots oscillate between zones.

**Parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Harvest duration | 120 ticks per unit | 2 seconds at 60fps — feels deliberate, not instant |
| Stone per harvest | 1 per cycle | Simple unit; large purchases require multiple harvest cycles |
| Harvest range | 2.0 cells | Bot must be near the zone to harvest |
| Deposit range | 1.5 cells | Distance from base center to trigger deposit |
| Max concurrent harvesters per zone | 3 | Prevents bot clumping; forces zone expansion |

**Zone generation:**
- Zones are placed during world generation (`genWorld()`).
- Distribution: clusters of 5–15 zones within 8–20 cells of the base center.
- Zone count scales with map size: ~3 zones per 100 cells of reachable terrain.
- Zones are visually distinct (Aphrodite: rocky terrain patches, different from car wrecks).

### Crystal Drops

Crystal drops on enemy death. Each enemy type has a drop probability. On a successful roll, Crystal is added to the player's resource pool.

**Rules:**
- On enemy death (HP ≤ 0, before entity removal), roll against the enemy type's drop chance.
- Successful roll: add `dropAmount` Crystal to pool.
- Failed roll: nothing.
- Boss enemies: guaranteed drop with bonus amount.
- Drop is immediate — Crystal is credited on the same tick the enemy dies.

**Parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Crystal per drop (standard) | 1 | Simple unit; scarcity comes from drop chance, not amount |
| Crystal per boss drop | 3 | Boss reward feels substantial |
| Crystal per drop (scout) | 1 | Base unit |
| Crystal per drop (tank) | 1 | Base unit |
| Crystal per drop (artillery) | 1 | Base unit |
| Crystal per drop (crawler) | 1 | Base unit |

**Drop Chances:**

| Enemy Type | Drop Chance | Rationale |
|------------|-------------|-----------|
| Scout | 10% (0.10) | Common, fast, low HP — low per-unit reward. Wave 1 spawns ~6 scouts → ~0.6 Crystal expected |
| Crawler | 3% (0.03) | Swarm enemy, 3× normal count — very low per-unit to prevent Crystal flooding from swarms. Wave 3 spawns ~18 crawlers → ~0.54 Crystal expected |
| Tank | 25% (0.25) | Tough, slow, high HP — higher reward for a harder kill. Wave 2 spawns ~3 tanks → ~0.75 Crystal expected |
| Artillery | 30% (0.30) | Ranged, dangerous, must be prioritized — high reward for taking the risk |
| Boss (every 5th wave) | 100% (1.00) | Guaranteed reward. The boss IS the Crystal payout for that wave cycle |

**Drop feel calibration:** Over 5 waves (1 boss cycle), a player who kills everything can expect ~6–8 Crystal from standard enemies + 3 from the boss = ~9–11 Crystal per cycle. This is enough for 1 watcher (cost: 5 Crystal) with surplus toward a turret or storage upgrade. The player feels rewarded for fighting but not flooded.

### Essence Accumulation

Essence accumulates passively over time, independent of player action. It is the only resource that requires no investment — only survival.

**Rules:**
- Every sim tick, accumulate `essencePerTick` toward the next whole Essence unit.
- When accumulated amount crosses a whole-number threshold, increment the Essence pool.
- Accumulation pauses during the Frozen state (Final Defense cinematic, cutscenes).
- Accumulation continues during Night, Day, and all combat phases.
- If at cap, accumulation stops — excess is discarded.

**Parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Essence per 10 seconds | 1 | Explicit spec requirement. 1 every 600 ticks at 60fps |
| Essence per tick | 1/600 ≈ 0.001667 | Fractional accumulation, credited on whole-number crossing |
| Starting Essence | 0 | Player earns it through survival, not gifted |

**Feel calibration:** At 1 per 10 seconds, the player earns 6 Essence per minute, 60 per 10 minutes. Pulse Wave costs 30 Essence — 5 minutes of survival. Final Defense hasten costs 50 Essence — ~8 minutes. This makes Essence abilities feel earned: you survived long enough to deserve this.

---

## Spending Rules

### Overview

| Resource | Spends On | Not Spends On |
|----------|-----------|---------------|
| Stone | Wall upgrades, base structures, bot production, storage upgrades | Watchers, turrets, abilities |
| Crystal | Watchers, advanced turrets, mortar upgrades, storage upgrades | Walls, bots, basic structures |
| Essence | Pulse Wave, Final Defense hasten, Emergency Shield | Physical structures (cannot build with it) |

**Cross-resource costs are allowed** — some purchases require multiple resource types (e.g., advanced turret: 10 Stone + 15 Crystal). This creates interdependence: hoarding one resource isn't enough.

### Stone Spending — Costs

| Purchase | Stone Cost | Cooldown/Condition |
|----------|------------|---------------------|
| Wall L1 → L2 | 30 | Requires bot to build |
| Wall L2 → L3 (roots) | 80 | Requires L2 wall present, Crystal 5 |
| Wall L3 → L4 (roots) | 150 | Requires L3 wall present, Crystal 15 |
| New Bot | 15 | Respects bot cap |
| Storage Upgrade (Stone) | 50 Stone + 5 Crystal | Increases Stone cap |
| Base structure (e.g., relay tower) | 60 | One per base |

**Wall upgrade interaction with existing mechanics:** Wall HP is currently a flat `WALL.hp = 10` in config. Upgrading a wall segment replaces it with a higher-HP variant. The upgrade cost is deducted on upgrade initiation; the bot must then travel to the wall segment and perform the build action (existing TILL/PATCH state machine pattern). The upgrade takes effect when the bot completes its build cycle.

### Crystal Spending — Costs

| Purchase | Crystal Cost | Condition |
|----------|-------------|-----------|
| Basic Watcher | 5 | Requires bot to build |
| Advanced Turret | 15 + Stone 10 | Requires existing watcher to upgrade |
| Mortar Upgrade | 25 | Requires watcher present |
| Storage Upgrade (Crystal) | 10 Crystal + 80 Stone | Increases Crystal cap |
| Storage Upgrade (Essence) | 20 Crystal + 100 Stone | Increases Essence cap |

### Essence Spending — Abilities

| Ability | Essence Cost | Effect | Cooldown |
|---------|-------------|--------|----------|
| Pulse Wave | 30 | Instant AoE damage (5 HP) to all enemies within 6 cells of base center. Clears nearby threats. | 60 seconds |
| Final Defense Hasten | 50 | Reduces FD charge time by 50% (from 5s to 2.5s). One use per FD cycle. | Per FD cycle |
| Emergency Shield | 20 | 5-second invulnerability shield on base. Absorbs all damage during duration. | 120 seconds |

**Pulse Wave interaction:** Pulse Wave damage (5 HP) kills scouts (1-hit), crawlers (2 hits needed — crawlers have 3 HP from the Swarm design), but only damages tanks (~10 HP) and artillery. It's a swarm-clear tool, not a boss-killer.

**Final Defense Hasten interaction:** The existing FD system charges when the base reaches critical HP. If the player spends Essence, the charge-up phase is halved. This does NOT replace the automatic FD — it enhances it. If the base is not in FD mode, Essence cannot trigger FD from nothing.

**Emergency Shield interaction:** Shield absorbs all damage to base HP for 5 seconds. This includes wall breach damage, projectile hits, and direct attacks. It does NOT prevent wall segments from being destroyed — only base HP is protected. The shield is a panic button, not a sustain tool.

---

## Storage Caps and Upgrades

### Default Caps

| Resource | Default Cap | Rationale |
|----------|-------------|-----------|
| Stone | 200 | ~13 wall upgrades or ~13 bot purchases. Enough for sustained building without infinite hoarding |
| Crystal | 50 | ~10 watchers or ~3 advanced turrets. Forces spending decisions — you can't save for everything |
| Essence | 100 | ~3 Pulse Waves or ~2 FD hastens. Enough for emergency reserves |

### Cap Upgrade Path

Storage caps can be upgraded. Each resource type has its own upgrade ladder. Upgrades are purchased from the base.

| Upgrade Level | Stone Cap | Upgrade Cost |
|---------------|-----------|--------------|
| 0 (default) | 200 | — |
| 1 | 250 | 50 Stone + 5 Crystal |
| 2 | 300 | 80 Stone + 10 Crystal |
| 3 | 400 | 120 Stone + 20 Crystal |

| Upgrade Level | Crystal Cap | Upgrade Cost |
|---------------|-------------|--------------|
| 0 (default) | 50 | — |
| 1 | 75 | 80 Stone + 10 Crystal |
| 2 | 100 | 120 Stone + 20 Crystal |
| 3 | 150 | 180 Stone + 35 Crystal |

| Upgrade Level | Essence Cap | Upgrade Cost |
|---------------|-------------|--------------|
| 0 (default) | 100 | — |
| 1 | 125 | 100 Stone + 20 Crystal |
| 2 | 150 | 150 Stone + 35 Crystal |
| 3 | 200 | 220 Stone + 50 Crystal |

**Design note:** Cap upgrades cost the resource being upgraded PLUS the other two types. This creates strategic tension: do you spend Stone on walls (immediate defense) or on storage (future capacity)? Crystal upgrades require Crystal — you must fight to expand your fighting budget.

**Cap behavior:**
- At cap, further accumulation is discarded (not banked, not converted).
- The HUD shows "FULL" or a visual indicator when a resource is at cap.
- Essence accumulation display shows a stopped gauge when capped.

---

## HUD Data Model

### Data Fields

The HUD reads from a reactive data structure updated each sim tick:

```typescript
interface ResourceHUDData {
  // Per-resource current state
  resources: {
    stone: {
      current: number;       // Current owned amount (0 to cap)
      cap: number;           // Current storage cap
      rate: number;          // Net change per second (positive/zero for gathering, negative for none)
      rateSource: string;    // Human-readable rate source: "3 bots harvesting" or "—"
      atCap: boolean;        // True when current >= cap
    };
    crystal: {
      current: number;
      cap: number;
      rate: number;          // Estimated from recent drop history (rolling window average)
      rateSource: string;    // "From combat drops" or "—"
      atCap: boolean;
    };
    essence: {
      current: number;
      cap: number;
      rate: number;          // Always 0.1/s when accumulating, 0 when capped
      rateSource: string;    // "+0.1/s" or "Capped" or "Paused (cutscene)"
      atCap: boolean;
    };
  };

  // Global flags
  anyAtCap: boolean;         // True if any resource is at cap — triggers "FULL" warning
  canAffordAnything: boolean; // True if at least one purchasable item is affordable
}
```

### Display Layout (for Aphrodite)

The HUD shows three resource counters arranged horizontally in a top-right or bottom-right panel:

```
[Stone icon]  145/200  (+0.5/s, 3 bots)
[Crystal icon]  12/50   (from combat)
[Essence icon]  47/100  (+0.1/s)
```

When at cap:
```
[Stone icon]  200/200  FULL
```

**Display rules:**
- Icons: 24×24 pixels, with a 28×28 hit area for tooltip expansion.
- Counters: monospace font (matches Aphrodite's HUD typography spec — single monospace stack, 10-size type scale).
- Rate indicator: smaller font, grayed out, only shown when rate > 0.
- `atCap` state: counter text turns amber/gold; "FULL" label replaces rate.
- Tooltip on hover (optional, dev-HUD feature): shows breakdown (Stone: "3 bots × 1/2s each", Crystal: "Last drop: Tank, 12s ago", Essence: "1 per 10s, 47s to next").

**Update frequency:** HUD data is recomputed each sim tick and pushed to React state via the existing `useGameLoop` pattern. The HUD component is a pure render of `resourceHUDData`.

---

## Edge Cases

### Cap Behavior

| Scenario | Resolution |
|----------|------------|
| Harvest would exceed cap | Harvest completes, but excess Stone above cap is discarded. Bot still returns to base (deposit is a no-op for the excess, but the bot gets credit for the harvest cycle). HUD briefly flashes amber. |
| Crystal drop would exceed cap | Drop is discarded. Crystal shard animation plays but fades without crediting (visual feedback). "Crystal lost — storage full" toast in dev HUD. |
| Essence tick would exceed cap | Accumulation pauses. No fractional carryover — when cap is reached, the fraction resets to avoid credit-on-spend exploits. |
| Resource is at cap, player spends some | Accumulation resumes immediately on the next tick after current < cap. No hysteresis. |

### Negative Balance Prevention

| Scenario | Resolution |
|----------|------------|
| Purchase cost exceeds current balance | Purchase is rejected. `canAfford()` returns false. Button is grayed out in UI. No partial spend — it's all-or-nothing. |
| Purchase is queued but resource is spent before build starts | Cost is deducted at purchase time (when player clicks), not at build-completion time. The resource is consumed immediately. If the build fails (bot dies en route, zone destroyed), the resource is NOT refunded — this is intentional risk. |
| Concurrent purchases (two clicks in rapid succession) | Each purchase validates `canAfford()` atomically against current balance. The second purchase sees the first's deduction. Purchases are processed sequentially within a single tick. No race conditions. |

### Concurrent Spending

| Scenario | Resolution |
|----------|------------|
| Multiple bots attempt to spend resources simultaneously | Resources are a single shared pool. Each spend mutates the pool. Bots call `trySpend(sim, cost)` which atomically checks and deducts. Two bots spending the same resource in the same tick: first succeeds, second may fail if insufficient. |
| Player clicks "Buy Bot" and "Upgrade Wall" same tick | Both purchases validate against the same starting balance. If the combined cost exceeds balance, the second purchase (by purchase order within the tick) fails. Purchase order: abilities first, then structures, then units. |
| Essence ability used while Essence is accumulating | Essence pool is decremented immediately. A tick boundary separates accumulation from spending. If Essence was at 29.8 and Pulse Wave costs 30, the ability is unavailable until the next full Essence crossing. |

### Tick Ordering

The resource system processes in this order within each sim tick:

1. **Accumulate** — Essence fractional tick, Crystal drop processing (from enemies that died this tick)
2. **Validate** — All pending purchases check `canAfford()`
3. **Spend** — Deduct costs for validated purchases
4. **Cap Check** — Enforce caps on all resources
5. **HUD Update** — Push new resource state to HUD data

This ordering prevents exploits: accumulation happens before spending validation, so an Essence tick that pushes you over 30 makes Pulse Wave available that same tick.

### Regeneration / Reset

| Scenario | Resolution |
|----------|------------|
| Game reset (new game / regenerate) | All resources reset to starting values: Stone = 20, Crystal = 0, Essence = 0. Caps reset to default. Storage upgrades are lost. |
| Day/Night transition | No effect on resources. Accumulation, harvesting, and drops continue in both phases. |
| Final Defense sequence | Essence accumulation PAUSES during FD (cinematic freeze). Stone harvesting in-progress continues but bots freeze mid-animation. Crystal drops from enemies killed by FD beams are credited (they died, however dramatically). |

### Multiplayer / Future-proofing

| Scenario | Resolution |
|----------|------------|
| Multiple players (future) | Each player has an independent resource pool. Harvest zones are player-specific (claimed on first harvest). Crystal drops go to the player whose bot/turret scored the killing blow. Essence accumulates per-player. HUD shows only the local player's resources. |

---

## Interactions

### With Bot System (NPC Bots)
- Bots gain a HARVEST_STONE state in their state machine, parallel to the existing HARVEST state.
- The labour allocator (`labour.js`) adds `'harvestStone'` to its priority ladder.
- Harvest Stone priority: below REPAIR (defense first) but above TILL (economic expansion).
- Sticky assignment for claim-based harvest zones prevents zone oscillation.
- Bot harvest rate: 1 Stone per 120 ticks (2 seconds at 60fps).

### With Enemy System (Combat Waves)
- Enemy death triggers drop roll before entity removal.
- Drop roll uses `Math.random() < RESOURCE.crystal.drop[enemyType]`.
- Boss enemies (every 5th wave) have guaranteed drop of 3 Crystal.
- Crawler swarms (3× count, every 3rd wave starting wave 3) have 3% drop chance — low per-unit but high volume.

### With Wall/Defense System
- Wall upgrades consume Stone (and Crystal at higher tiers).
- Upgrade cost is deducted at purchase time, before the bot begins building.
- If the wall segment is destroyed before upgrade completion, resources are not refunded.
- The existing `WALL.hp` config is extended with per-level HP values.

### With Final Defense Protocol
- Essence can hasten the FD charge phase (50 Essence → 2.5s instead of 5s).
- FD hasten is only available when FD is in its charge-up phase.
- Essence accumulation pauses during the FD sequence (cinematic freeze).
- Crystal drops from FD-killed enemies are credited normally.

### With Garden System
- Stone zones are placed during world generation alongside garden cells.
- Stone zones do NOT block grass/moss spread — garden can grow over harvest zones (stones remain harvestable underneath).
- Harvesting bots walking over grass leave temporary trails (visual polish).

### With HUD/UI System
- Resource data is exposed as `sim.state.resources` (following the `sim.state` accessor pattern from the API-object pitfall).
- HUD component reads `sim.state.resources` reactively via the `useGameLoop` pattern.
- Cost validation: upgrade buttons check `canAfford(sim.state, cost)` and gray out when unaffordable.

---

## Config Block (`config.js`)

Following the `behemoth-sim-architecture` conventions — ALL_CAPS, noun-based, pure data, no logic:

```js
/**
 * RESOURCE — resource economy tuning.
 *
 * Three resource types flow through the game loop:
 *   Stone  — harvested by bots from terrain zones (steady, reliable).
 *   Crystal — dropped by enemies on death (spike reward, combat-gated).
 *   Essence — passive accumulation over time (patience reward).
 *
 * Spending rules:
 *   Stone  → walls, base structures, bots, storage upgrades.
 *   Crystal → watchers, advanced turrets, mortar upgrades, storage upgrades.
 *   Essence → pulse wave, FD hasten, emergency shield.
 *
 * Units: counts are whole numbers. Rates are per tick unless noted otherwise
 * (tick = sim.tick increment, ~60 ticks/second at 60fps game loop).
 *
 * Default starting values reproduce the day-one player experience:
 *   20 Stone (one wall upgrade or one bot), 0 Crystal, 0 Essence.
 */
export const RESOURCE = {
  // ── Stone ──────────────────────────────────────────────────────────
  stone: {
    starting: 20,
    cap: 200,                     // default storage cap
    capUpgradePerLevel: 50,       // cap increase per storage upgrade level
    harvestTicks: 120,            // ticks per harvest cycle (2s at 60fps)
    harvestAmount: 1,             // Stone per completed harvest cycle
    harvestRange: 2.0,            // cells — bot must be this close to zone
    depositRange: 1.5,            // cells — distance from base center to deposit
    maxHarvestersPerZone: 3,      // prevents bot clumping
    zonesPer100Cells: 3,          // zone density in world generation
    minZoneDistance: 8,           // cells from base center — zones start here
    maxZoneDistance: 20,          // cells from base center — zones end here
    zoneClusterSize: { min: 5, max: 15 }, // zones per cluster
  },

  // ── Crystal ────────────────────────────────────────────────────────
  crystal: {
    starting: 0,
    cap: 50,                      // default storage cap
    capUpgradePerLevel: 25,
    dropAmount: 1,                // Crystal per successful standard drop
    bossDropAmount: 3,            // Crystal per boss kill
    drop: {
      scout: 0.10,                // 10% — common, low per-unit reward
      tank: 0.25,                 // 25% — tough enemy, higher reward
      artillery: 0.30,            // 30% — dangerous, highest standard reward
      crawler: 0.03,              // 3%  — swarm enemy, very low per-unit to prevent flooding
      boss: 1.0,                  // 100% — guaranteed
    },
  },

  // ── Essence ────────────────────────────────────────────────────────
  essence: {
    starting: 0,
    cap: 100,                     // default storage cap
    capUpgradePerLevel: 25,
    perTick: 1 / 600,             // fractional — 1 per 600 ticks (10s at 60fps)
    // Accumulation pauses during cinematic freeze (FD sequence, cutscenes).
  },

  // ── Ability Costs (in Essence) ────────────────────────────────────
  abilities: {
    pulseWave: { essence: 30, cooldownTicks: 3600 },        // 60s cooldown
    finalDefenseHasten: { essence: 50, cooldownTicks: 0 },  // per-FD-cycle (not time-gated)
    emergencyShield: { essence: 20, cooldownTicks: 7200 },  // 120s cooldown
  },

  // ── Storage Upgrade Costs ──────────────────────────────────────────
  // Each entry: [stoneCost, crystalCost] per upgrade level (0 = default)
  storageUpgrades: {
    stone: [
      { stone: 0, crystal: 0 },     // L0 — default
      { stone: 50, crystal: 5 },    // L1
      { stone: 80, crystal: 10 },   // L2
      { stone: 120, crystal: 20 },  // L3
    ],
    crystal: [
      { stone: 0, crystal: 0 },
      { stone: 80, crystal: 10 },
      { stone: 120, crystal: 20 },
      { stone: 180, crystal: 35 },
    ],
    essence: [
      { stone: 0, crystal: 0 },
      { stone: 100, crystal: 20 },
      { stone: 150, crystal: 35 },
      { stone: 220, crystal: 50 },
    ],
  },
};
```

### Cost Config Additions to `COST` and `ECON`

The existing `COST` block (per-action cooldowns in ticks) gains:

```js
// ADD to COST:
export const COST = {
  // ... existing ...
  buyBot: { stone: 15 },           // Stone cost to produce a bot
  buyWatcher: { crystal: 5 },      // Crystal cost to produce a watcher
  advancedTurret: { stone: 10, crystal: 15 }, // upgrade watcher → turret
  mortarUpgrade: { crystal: 25 },  // Mortar upgrade cost
  wallUpgradeL2: { stone: 30 },
  wallUpgradeL3: { stone: 80, crystal: 5 },   // Roots L3
  wallUpgradeL4: { stone: 150, crystal: 15 }, // Roots L4
  baseStructure: { stone: 60 },    // e.g., relay tower
};
```

The existing `ECON` block gains:
```js
// ADD to ECON:
export const ECON = {
  // ... existing ...
  startingStone: 20,
  startingCrystal: 0,
  startingEssence: 0,
};
```

---

## Policy Module (`resource.js`)

Following the policy/mechanics split: a dedicated `sim/resource.js` policy file. This file contains the **decisions** (can I afford this? what can I afford?), not the **verbs** (add resource, spend resource) — those live in mechanics (engine.js, bots.js, enemies.js).

### API

```js
/**
 * Check if the player can afford a cost object.
 * Cost is { stone?: number, crystal?: number, essence?: number }.
 * Returns true only if all present fields are ≤ current balance.
 */
export function canAfford(sim, cost) { ... }

/**
 * Attempt to spend resources. Deducts only if canAfford passes.
 * Returns { success: boolean, reason?: string }.
 * On failure, no resources are deducted.
 * This is the single atomic spend gate — all purchases go through it.
 */
export function trySpend(sim, cost) { ... }

/**
 * Add resources to the pool. Enforces caps (excess discarded).
 * Used by harvest deposits, crystal drops, and essence accumulation.
 * Returns { added: { stone, crystal, essence }, discarded: { stone, crystal, essence } }.
 */
export function addResources(sim, amounts) { ... }

/**
 * Build a HUD data snapshot from current sim resource state.
 * Called once per tick after all resource mutations.
 */
export function buildResourceHUD(sim) { ... }

/**
 * Get the current net accumulation rates for HUD display.
 * Returns { stonePerSec, crystalPerSec, essencePerSec }.
 */
export function getResourceRates(sim) { ... }

/**
 * Check if any resource is at cap.
 * Returns { stone: boolean, crystal: boolean, essence: boolean }.
 */
export function checkCaps(sim) { ... }

/**
 * Get the list of purchasable items the player can currently afford.
 * Returns array of { id: string, label: string, cost: {...} }.
 * Used to drive UI button enable/disable state.
 */
export function getAffordablePurchases(sim) { ... }
```

### Implementation Notes (for Hephaestus)

1. **Atomicity:** `trySpend` must be the single point of resource deduction. No code outside `resource.js` mutates `sim.resources` directly. This is the invariant that prevents negative balances.

2. **Fractional Essence:** Essence is stored with a fractional accumulator (`sim.essenceAccum = 0.0`). Each tick: `sim.essenceAccum += RESOURCE.essence.perTick`. When `Math.floor(sim.essenceAccum) > sim.resources.essence`, add the difference and update. When at cap, reset accumulator to 0 to prevent credit-on-spend exploits.

3. **Drop Processing:** Enemy death calls `addResources(sim, { crystal: amount })` which internally calls `checkCaps` and discards overflow. The drop animation plays regardless; the resource.js return value tells the renderer whether to show the "+1 Crystal" or "Storage Full" variant.

4. **HUD Update:** `buildResourceHUD(sim)` is called once per tick after all mutations. It reads `sim.resources`, `sim.resourceCaps`, and calls `getResourceRates` to compute the rate display. The HUD component in React is a pure render function.

5. **Storage Upgrades:** Upgrades modify `sim.resourceCaps[type]`. Caps are stored in sim state (not derived from config at render time) so they persist across ticks and can be increased by upgrades.

---

## Files Affected (for Hephaestus)

| File | Change |
|------|--------|
| `frontend/src/sim/config.js` | Add `RESOURCE` block. Extend `COST` and `ECON`. |
| `frontend/src/sim/resource.js` | NEW — resource policy module (canAfford, trySpend, addResources, buildResourceHUD, getResourceRates, checkCaps, getAffordablePurchases). |
| `frontend/src/sim/engine.js` | Add resource tick: essence accumulation, cap enforcement. Wire resource spending into purchase paths (buyBot, buyWatcher, upgradeWall, useAbility). Expose resource state in sim API. |
| `frontend/src/sim/bots.js` | Add HARVEST_STONE state. Bot harvests from stone zones (2s cycle, 1 stone per cycle). Deposit at base. |
| `frontend/src/sim/labour.js` | Add `'harvestStone'` to priority ladder (below REPAIR, above TILL). |
| `frontend/src/sim/enemies.js` | On death: roll Crystal drop, call `addResources(sim, { crystal })`. |
| `frontend/src/sim/world.js` | genWorld: place Stone harvest zones (clusters of 5–15, 8–20 cells from base). |
| `frontend/src/sim/behemoth.js` | Wire Essence abilities: Pulse Wave (AoE damage on ability use), Final Defense Hasten (reduce charge time), Emergency Shield (5s invulnerability). |
| `frontend/src/components/BehemothGame.jsx` | Add ResourceHUD component. Wire to `sim.state` resource data. |
| `frontend/src/components/ResourceHUD.jsx` | NEW — HUD display component (3 counters with icons, rates, cap indicators). |
| `frontend/src/sim/__tests__/resource.test.js` | NEW — tests: addition, subtraction, capping, concurrent ops, drop distribution, edge cases. |

---

## Acceptance Criteria Checklist

- [x] Define 3 resource types: Stone (terrain-harvested), Crystal (enemy-dropped), Essence (passive accumulation)
- [x] Specify gathering mechanics per resource type with exact parameters
- [x] Specify spending rules per resource type with cost tables
- [x] Define storage caps per resource type with upgrade paths
- [x] Define HUD data model (fields, display layout, update frequency)
- [x] Document edge cases: cap behavior, negative balance prevention, concurrent spending, tick ordering, reset
- [x] Document interactions with all affected systems (bots, enemies, walls, FD, garden, HUD)
- [x] Provide config.js block in the project's convention format
- [x] Define policy module API for Hephaestus to implement
- [x] List all files affected by the implementation

---

*End of design spec. Downstream tasks: Hephaestus (implementation), Aphrodite (visuals), Apollo (integration validation).*
