# Design Spec: Enemy Behaviors v1

**Design: Athena | Version: 1.0 | Date: 2026-06-22**

---

## Intent

Enemy type-specific behaviors transform the current uniform "move toward base" AI into tactical variety. Each enemy type should feel distinct not just in stats but in *how it fights* — scouts probe and flank, tanks absorb and breach, crawlers swarm and overwhelm, bosses command attention. These behaviors create the strategic puzzle: the player must build defenses that answer *how* enemies approach, not just *what* they are.

Artillery enemy behavior is already implemented (siege-at-range, fire-and-self-destruct state machine). This spec covers the remaining four types: scout, tank, crawler, and boss.

---

## Architecture

All enemy behavior lives in `enemies.js` and is called from `engine.js`'s `stepTick()` as `tickEnemyAI(sim, enemy, dt)`. Each enemy type gets its own tick function dispatched from a type switch. State is stored on the enemy entity object (`enemy.aiState`, `enemy.aiTimer`, etc.).

**State machine pattern** (used throughout):
```js
switch (enemy.aiState) {
  case 'advancing':  /* move toward target */ break;
  case 'sieging':    /* attack wall/base */   break;
  case 'special':    /* type-specific */      break;
  default:           /* fallback */           break;
}
```

**Config placement:** All tuning constants go in `config.js` under type-specific blocks. `ENEMY` holds base stats (HP, speed, damage, size). Behavior-specific parameters go in new blocks: `ENEMY_SCOUT`, `ENEMY_TANK`, `ENEMY_CRAWLER`, `ENEMY_BOSS`.

---

## 1. Scout Behavior

### Identity
Scouts are the common, fast, moderate-HP enemy. They are the bread-and-butter enemy that appears in every wave. Their behavior should be straightforward but not brainless — they probe defenses and exploit gaps.

### Mechanics

- **State: `advancing`** — Scout moves toward the base using the existing greedy 8-neighbor pathfinding. Default behavior, no changes from current.
- **State: `sieging`** — When blocked by a wall, scout attacks the wall. After the wall is destroyed, resume advancing.
- **Wall-gap detection** — Every 30 ticks, scouts check if an adjacent cell (within 2 cells laterally) provides a path to the base that is *shorter* than their current path by ≥20%. If yes, they redirect toward that gap. This creates natural flanking behavior: scouts find wall gaps without needing full A* recomputation.
  - **Rationale:** True A* per-scout-per-tick is too expensive. Periodic heuristic checks are cheap and produce emergent flanking that rewards the player for sealing wall lines completely.
  - **Parameter:** `scoutGapCheckInterval: 30` ticks — frequent enough to react, infrequent enough to be cheap.
  - **Parameter:** `scoutGapThreshold: 0.20` — 20% path length improvement required to redirect. Prevents scouts from oscillating between two nearly-equal paths.

### Parameters (config.js → `ENEMY_SCOUT`)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `gapCheckInterval` | 30 ticks (0.5s) | Every half-second: cheap enough for 20+ scouts, frequent enough to find gaps before a wave passes |
| `gapThreshold` | 0.20 | 20% path improvement threshold. Prevents jitter between nearly-equal paths. Empirically, 20% filters out diagonal-noise while catching real wall gaps |
| `preferWeakestWall` | true | When multiple walls block the path, scouts target the one with lowest current HP. Creates smart target prioritization without complex AI |

### Interactions
- **With walls:** Scouts are the primary wall-testers. If a wall line has a gap, scouts find it. This makes complete wall rings valuable.
- **With fog:** Gap detection only considers cells the scout can currently see (respects fog). Scouts can't "sense" gaps through fog — they must physically approach.
- **With turrets:** No special interaction. Scouts die to turrets like any enemy.

### Edge Cases
- **All paths blocked by walls** → Scout sieges the weakest wall in its path. Normal siege behavior.
- **No walls, clear path to base** → Scout runs directly to base. No gap detection triggered.
- **Gap is a trap (turret-covered chokepoint)** → Scout takes the gap and dies. This is correct — the player is rewarded for creating kill zones.

---

## 2. Tank Behavior

### Identity
Tanks are slow, tough, hard-hitting enemies that appear from wave 2+. They are the line-breakers — they absorb turret fire and punch through walls. Their behavior should make them feel like an advancing wall of metal: inevitable, terrifying, but slow enough to plan against.

### Mechanics

- **State: `advancing`** — Tank moves toward the base at its slow speed (0.01 cells/tick). No pathfinding tricks — tanks go straight.
- **State: `sieging`** — When blocked by a wall, tank attacks the wall. Tanks deal 5 damage/tick to walls — an L1 wall (30 HP) breaks in 6 ticks (~0.1s). Tanks are wall-breakers by design.
- **Threat redirection ("taunt"):** While a tank is `sieging` a wall, all other enemies within 3 cells of that tank ALSO target the same wall segment. This creates a "breach point" — tanks concentrate fire, turning a single wall into a crisis.
  - **Parameter:** `tankTauntRadius: 3.0` cells. Covers adjacent wall segments and nearby enemies.
  - **Rationale:** Without threat redirection, tanks are just high-HP scouts. With taunt, they become tactical anchors — the player must prioritize killing tanks near walls or risk a concentrated breach.
- **No speed-up:** Tanks do NOT accelerate when path is clear. Their threat comes from durability and coordinated siege, not speed.

### Parameters (config.js → `ENEMY_TANK`)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `tauntRadius` | 3.0 cells | Covers enemies on adjacent wall segments. Large enough to coordinate a breach, small enough that tanks must reach the wall line to be effective |
| `tauntPriorityBoost` | true | Tank-sieged walls get +1 priority in bot REPAIR targeting. Bots prioritize walls under tank siege |

### Interactions
- **With bot repair:** Tank-sieged walls break fast (5 damage/tick vs 0.5 repair/tick/bot). The player needs 10 bots repairing to match one tank — impossible early-game. The answer is to KILL the tank, not out-repair it.
- **With turret targeting:** Tanks are large (size 1.2), slow, and threatening — turrets naturally target them (nearest-enemy-first). This is correct: the player should kill tanks before they reach walls.
- **With swarm waves:** Tanks + crawlers = tanks breach a wall while crawlers pour through the gap. Synergistic threat.

### Edge Cases
- **Tank sieging wall, wall destroyed** → Tank continues advancing. Other enemies that were taunted resume their normal AI.
- **Multiple tanks on same wall** → Taunt radii overlap. The wall breaks very fast. Intentional — multiple tanks is a crisis.
- **Tank at base** → Deals 5 damage/tick to base. Base (120 HP) breaks in 24 ticks (~0.4s). A tank at the base is a near-certain game over unless FD is available.

---

## 3. Crawler Behavior

### Identity
Crawlers are swarm enemies — tiny, fast, fragile, numerous. Their behavior is defined by the SWARM config (spawning rules, jitter, bounty). This section defines their individual AI: how a single crawler moves, fights, and interacts with walls at scale.

### Mechanics

- **State: `advancing`** — Crawler moves toward the base at 0.024 cells/tick (faster than scouts). Uses the same greedy pathfinding.
- **Per-tick jitter:** Each tick, add a random offset of ±`SWARM.jitter` cells (0.3) to the crawler's position along the axis perpendicular to its movement direction. This creates organic swarm spread.
  - **Important:** Jitter is cosmetic — it does NOT affect pathfinding. The crawler's actual navigation target is unchanged. Jitter only affects rendered position.
  - **Visual note (for Aphrodite):** Crawlers render at their jittered position. The jitter is smooth — use a persistent per-crawler `jitterPhase` seed so each crawler has its own sinusoidal wobble rather than random-teleport each tick.
- **State: `sieging`** — When blocked by a wall, crawler attacks the wall. Crawlers deal 0.6 damage/tick. Individually negligible; collectively devastating.
- **Wall stacking:** Crawlers have a small collision radius (0.4 cells). Up to ~6 crawlers can siege a single wall segment simultaneously (they arrange in a half-ring on the approach side). Combined DPS: 6 × 0.6 = 3.6 damage/tick — enough to break an L1 wall in ~8 ticks.
  - **Parameter:** `crawlerMaxStackPerWall: 6` — enforced by spatial grid. When a wall segment already has 6 crawlers sieging it, additional crawlers path around to the nearest adjacent wall segment rather than stacking further.
  - **Rationale:** Without a stack cap, all 80 crawlers could pile on one wall segment and deal 48 damage/tick — breaking an L4 wall in 4 ticks. The cap prevents degenerate stacking and forces crawlers to spread along the wall line, creating the "crawling over the walls" visual and rewarding multi-segment wall coverage.

### Parameters (config.js → `ENEMY_CRAWLER`)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `maxStackPerWall` | 6 | Prevents degenerate all-on-one-wall stacking. At 6 crawlers = 3.6 DPS, an L2 wall (60 HP) survives ~17 ticks — enough for turrets to respond |
| `jitterSmoothness` | 0.05 | Lerp factor for jitter position updates. Prevents teleporting; produces a smooth sinusoidal wobble |

### Interactions
- **With mortar turrets:** Crawlers are the mortar's ideal target — low HP, high density. One mortar blast (50 damage, 2.0 splash radius) can kill 10+ crawlers at once.
- **With wall segments:** Crawlers spread along walls due to the stack cap. This rewards layered wall construction and punishes single-segment chokepoints.
- **With fog:** High crawler count means more fog-penetration events. Swarm waves create a "radar ping" effect — the player sees the swarm approaching in pulses.
- **With performance:** `SWARM.cap: 80` prevents >80 simultaneous crawlers. Rendering uses instanced drawing.

### Edge Cases
- **Crawler stack cap hit, no adjacent wall** → Crawler enters `waiting` state — holds position behind the stack, advances when a slot opens. Does NOT pathfind around (too expensive at scale).
- **Wall destroyed while crawlers stacked** → All crawlers resume advancing. The "dam breaks" visual.
- **Crawler reaches base** → Deals 0.6 damage. 10 crawlers = 6 damage — manageable. 30 crawlers = 18 damage/tick — base-killer. This scaling curve means small leaks are survivable; big leaks are not.

---

## 4. Boss Behavior

### Identity
Bosses appear every 5 waves. They are massive (size 2.0), high-HP (80 base, scaling), high-damage (20 base). A boss is a raid encounter within the tower defense — it should feel like a boss fight, not just a big scout.

### Mechanics

- **State: `advancing`** — Boss moves toward the base at 0.008 cells/tick (slowest enemy, same as artillery). The boss is a slow, inexorable threat. The player has time to prepare but cannot stop it with a single turret.
- **State: `sieging`** — Boss attacks walls at 20 damage/tick. An L4 wall (200 HP) breaks in 10 ticks. A boss at a wall is a crisis.
- **Phase shift at 50% HP:** When the boss drops below 50% HP, it enters `enraged` state:
  - Speed increases by 50% (0.008 → 0.012 cells/tick).
  - Damage increases by 25% (20 → 25).
  - Visual change (Aphrodite): glow intensifies, particle effects.
  - This is a one-time transition — no further phases.
  - **Rationale:** A single phase shift creates a dramatic moment at half-HP without the complexity of multi-phase scripting. The player sees the boss "power up" and must decide: burn it down fast or brace for the enraged assault.
- **AoE pulse on siege start:** When the boss first enters `sieging` state (first time it reaches a wall or base), it emits a one-time shockwave:
  - **Damage:** 10 HP to all walls within 3 cells.
  - **Effect:** Damages (but does not destroy) nearby wall segments. Creates an immediate breach threat.
  - **Rationale:** The boss arrival should be a *moment*. The shockwave says "I have arrived" and punishes the player for letting the boss reach the wall line. Combined with the taunt mechanic (tanks), this creates a coordinated breach.
  - **Parameter:** `bossShockwaveDamage: 10`, `bossShockwaveRadius: 3.0`.

### Parameters (config.js → `ENEMY_BOSS`)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `enrageHpThreshold` | 0.50 | 50% HP. Late enough that the player has committed to the fight; early enough that the enrage matters |
| `enrageSpeedMul` | 1.50 | 50% speed boost. Noticeable but not uncounterable — turrets can still track |
| `enrageDamageMul` | 1.25 | 25% damage boost. Walls break faster, urgency increases |
| `shockwaveDamage` | 10 | Damages L1 walls to 20 HP, L2 to 50 HP. Significant but not destructive — one hit from anything finishes weakened walls |
| `shockwaveRadius` | 3.0 | Covers adjacent wall segments. The boss arrival damages the wall line, not just one segment |

### Interactions
- **With Final Defense:** FD beams vaporize bosses like any enemy. A well-timed FD can skip the enrage phase entirely — the player is rewarded for holding FD until the boss appears.
- **With turrets:** Boss is large and slow — turrets hit reliably. The challenge is the boss's HP pool, not evasion.
- **With walls:** The boss is the ultimate wall-test. An L4 wall under boss siege breaks in 10 ticks. The player must kill the boss before it reaches walls, or accept that walls WILL break.
- **With swarm+ boss coincidence (wave 15, 30...):** Boss shockwave damages walls; crawlers pour through the gaps. This is the hardest wave configuration by design.

### Edge Cases
- **Boss enrages and then is healed** → No. Enemies don't heal. Enrage is irreversible.
- **Boss enrages while already at base** → No additional effect. Enrage only changes stats, which are already applied.
- **Multiple bosses (future wave 25+ double-boss)** → Each boss has its own enrage trigger and shockwave. Two shockwaves on the same wall line = walls in critical condition.
- **Boss shockwave kills a wall** → The wall is destroyed. Boss immediately resumes advancing (no wall to siege). The shockwave can create its own path.

---

## Config Additions (config.js)

### New blocks to add after `ARTILLERY`:

```js
/**
 * ENEMY_SCOUT — scout behavior tuning.
 */
export const ENEMY_SCOUT = {
  gapCheckInterval: 30,      // ticks between wall-gap checks
  gapThreshold: 0.20,        // 20% path improvement to redirect
  preferWeakestWall: true,   // target lowest-HP wall when sieging
};

/**
 * ENEMY_TANK — tank behavior tuning.
 */
export const ENEMY_TANK = {
  tauntRadius: 3.0,          // cells — other enemies join tank's siege target
  tauntPriorityBoost: true,  // tank-sieged walls get +1 repair priority
};

/**
 * ENEMY_CRAWLER — crawler behavior tuning.
 */
export const ENEMY_CRAWLER = {
  maxStackPerWall: 6,        // max crawlers sieging one wall segment
  jitterSmoothness: 0.05,    // lerp factor for smooth jitter
};

/**
 * ENEMY_BOSS — boss behavior tuning.
 */
export const ENEMY_BOSS = {
  enrageHpThreshold: 0.50,   // fraction of max HP to trigger enrage
  enrageSpeedMul: 1.50,      // speed multiplier when enraged
  enrageDamageMul: 1.25,     // damage multiplier when enraged
  shockwaveDamage: 10,       // damage to walls within shockwaveRadius
  shockwaveRadius: 3.0,      // cells — shockwave AoE on first siege
};
```

---

## Files Affected (for Hephaestus)

| File | Change |
|------|--------|
| `frontend/src/sim/config.js` | Add `ENEMY_SCOUT`, `ENEMY_TANK`, `ENEMY_CRAWLER`, `ENEMY_BOSS` blocks |
| `frontend/src/sim/enemies.js` | Add `tickScoutAI()`, `tickTankAI()`, `tickCrawlerAI()`, `tickBossAI()`. Wire into `tickEnemyAI()` type dispatch. Add `bossShockwave()` function. Add crawler wall-stack tracking in spatial grid |
| `frontend/src/sim/engine.js` | Call `tickEnemyAI()` in `stepTick()` after movement, before combat resolution. Wire enrage stat modification |
| `frontend/src/sim/__tests__/enemy-behaviors.test.js` | NEW — tests: scout gap detection, tank taunt radius, crawler stack cap, boss enrage trigger, boss shockwave damage pattern |

---

## Balance Notes

- **Scout gap detection** is a heuristic, not perfect pathfinding. It will miss some gaps and find others late. This is intentional — the player should feel smart for sealing gaps, not punished by omniscient AI.
- **Tank taunt** could make tank+arty waves extremely dangerous (tank taunts enemies to a wall, artillery pounds it from range). This is the intended synergy — wave 8+ tank+arty compositions are meant to be hard.
- **Crawler stack cap of 6** may need adjustment if players find crawlers too easy to wall off. Lower cap = crawlers spread more = more wall coverage needed. Higher cap = more concentrated damage = walls break faster to crawler swarms. Tune after playtesting.
- **Boss enrage at 50%** is a single-phase shift. If bosses feel too simple, add a second phase at 25% (speed boost, AoE aura). If too hard, raise threshold to 35% or reduce enrage multipliers.
- **Boss shockwave** damage (10) was chosen so L1 walls survive with 20 HP, L2 walls survive with 50 HP. This preserves the walls (doesn't one-shot them) but leaves them vulnerable to follow-up attacks. Tune if walls feel too fragile/durable.

---

*End of design spec. Downstream tasks: Hephaestus (AI implementation, config blocks), Aphrodite (boss enrage visual, crawler jitter rendering, shockwave VFX), Apollo (integration tests).*
