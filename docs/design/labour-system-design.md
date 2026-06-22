# Design Spec: Labour System v1 — Bot Task Allocation

**Design: Athena | Version: 1.0 | Date: 2026-06-22**

---

## Intent

The labour system decides what every bot does on every tick. Currently, bots use a simple priority ladder with sticky assignment — functional but static. A proper labour system makes bots feel smart: they triage during crises, coordinate to avoid wasteful clustering, and adapt to the game state dynamically. This spec defines the job board, dynamic priority ordering, stacking curves, and crisis detection that transform bots from predictable drones into a responsive workforce.

---

## Architecture

The labour system sits between the simulation engine (`engine.js`) and bot AI (`bots.js`). It does **not** move bots or execute tasks — it only *assigns* tasks. Execution remains in `bots.js` state machines.

```
engine.js stepTick()
  ├─ labour.js tickLabour(sim, dt)  ← NEW: evaluate and assign jobs
  │    ├─ buildJobBoard(sim)        ← scan world for available work
  │    ├─ scoreJobs(sim, bot, jobs) ← dynamic priority scoring
  │    └─ assignBot(sim, bot, job)  ← sticky assignment with preemption
  └─ bots.js tickBots(sim, dt)      ← execute assigned tasks
```

**Config placement:** All tuning constants go in `config.js` under a new `LABOUR` block.

---

## Mechanics

### 1. Job Board

A job is a unit of work. The job board is rebuilt each tick from world state. Each job has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique job identifier |
| `type` | enum | `REPAIR`, `BUILD`, `HARVEST_STONE`, `TILL`, `FIGHT` |
| `position` | {x, y} | Where the bot must go to work |
| `entityId` | string\|null | Target entity (wall ID, zone ID, or null) |
| `maxWorkers` | number | How many bots can work this job simultaneously |
| `currentWorkers` | number | How many bots are currently assigned |
| `urgency` | number | Base urgency (1.0 = normal, computed from game state) |
| `priority` | number | Final priority score after dynamic weighting |

**Types of jobs generated each tick:**

| Job Type | Source | Count | Max Workers |
|----------|--------|-------|-------------|
| `REPAIR` | Damaged walls (HP < max) | One per damaged wall | 3 per wall segment |
| `BUILD` | Pending construction (wall upgrade, watcher placement) | One per pending build | 1 per build |
| `HARVEST_STONE` | Stone zones with < maxHarvesters | One per available zone | `RESOURCE.stone.maxHarvestersPerZone` (3) |
| `TILL` | Garden-eligible cells (future) | TBD | TBD |
| `FIGHT` | Enemies within alarm range | One per threatened zone | 1 per enemy |

### 2. Dynamic Priority Scoring

Each job gets a priority score. The bot with the highest-priority available job gets assigned to it first. Priority is computed as:

```
priority = basePriority × urgencyMultiplier × proximityBonus
```

**Base priorities** (config: `LABOUR.basePriorities`):

| Job Type | Base Priority | Rationale |
|----------|--------------|-----------|
| `REPAIR` | 100 | Defense always first — damaged walls are a crisis |
| `BUILD` | 70 | Construction gates expansion, but not as urgent as repair |
| `FIGHT` | 60 | Alarm response — bots defend themselves |
| `HARVEST_STONE` | 40 | Economy sustains everything |
| `TILL` | 10 | Cosmetic/growth — lowest priority |

**Urgency multipliers:**

- **REPAIR urgency:** `1.0 + (1.0 - wallHp/maxHp) × repairUrgencyScale` — a wall at 10% HP has ~2.8× urgency (at `repairUrgencyScale: 2.0`). A wall at 90% HP has 1.2× urgency.
- **BUILD urgency:** Always `1.0`. Construction is pre-planned; no dynamic urgency.
- **HARVEST_STONE urgency:** `1.0 + stoneDeficitFactor`. When at cap, 0.3× (low priority). When below 20% cap, 2.0× (high priority). Config: `stoneUrgencyFloor: 0.3`, `stoneUrgencyCeiling: 2.0`, `stoneUrgencyThreshold: 0.2` (fraction of cap).
- **FIGHT urgency:** `1.0 + enemyCountFactor`. Scales with nearby enemy count. Config: `fightUrgencyPerEnemy: 0.1` (each nearby enemy adds 0.1×).

**Proximity bonus:**
```
proximityBonus = clamp(proximityMaxBonus - distance × proximityDecay, 0.0, proximityMaxBonus)
```
- A bot that's already near a job gets a bonus — prevents bots trekking across the map when a nearby bot could do the job.
- Config: `proximityMaxBonus: 0.3` (max +30% priority for standing on the job), `proximityDecay: 0.02` (decays over 15 cells to zero).

### 3. Stacking Curves — Diminishing Returns

Multiple bots on the same job should be less efficient than spreading out. This prevents degenerate "all bots on one wall" behavior.

**Formula:** For a job with `n` assigned bots and `maxWorkers` cap:
```
efficiency = 1.0 - stackingPenalty × (n - 1) / (maxWorkers - 1)
```
This is applied to the job's priority score for assignment purposes.

**Config:**
- `stackingPenalty: 0.15` — Each additional bot on the same job reduces its attractiveness by 15%. At n=1: 1.0×. At n=2: 0.85×. At n=3: 0.70×.
- This makes the allocator prefer spreading bots across multiple repair jobs rather than stacking all on one.

### 4. Steel Crisis Detection

When the player's Stone balance is low and expenses are high, the labour system detects a "steel crisis" and shifts priority toward harvesting.

**Crisis triggers** (config: `LABOUR.crisis`):
- `crisisStoneThreshold: 15` — Stone below this triggers crisis mode
- `crisisPendingCost: 0` — Sum of pending construction costs that can't be afforded. If > 0, crisis mode also triggers.

**Crisis behavior:**
- HARVEST_STONE base priority jumps from 40 → 70 (equal to BUILD)
- REPAIR urgency is capped at 1.5× (prevent repair from starving economy entirely — you need stone to build walls to repair)
- Bots in BUILD state that can't afford their construction are auto-reassigned to HARVEST_STONE
- Crisis ends when Stone > `crisisStoneThreshold × 2` (30) and all pending costs are affordable

**Rationale:** Without crisis detection, the player can enter a death spiral — spend all Stone on a wall, wall breaks, need Stone to repair, but all bots are repairing the broken wall. Crisis detection breaks the loop by forcing harvesting.

### 5. Assignment Algorithm

Each tick, the labour allocator runs:

```
function tickLabour(sim, dt):
  jobs = buildJobBoard(sim)
  unassignedBots = getUnassignedBots(sim)

  // 1. Check for preemption: any bot whose current job is lower priority
  //    than an available job that another bot couldn't fill
  for bot in allBots:
    if hasHigherPriorityWork(sim, bot, jobs):
      releaseBot(bot)

  // 2. Score all (bot, job) pairs
  // 3. Greedy assign: highest-scoring pair first
  // 4. Sticky: assigned bots keep their job unless preempted

  // 5. Idle assignment: any bot with no job gets the highest-priority
  //    job that isn't at maxWorkers, or falls back to HARVEST_STONE
```

**Preemption rules:**
- A bot is preempted from its current job if a job of HIGHER priority exists AND that job has fewer than `maxWorkers` bots assigned.
- TILL → HARVEST: always preempt (crisis-independent)
- HARVEST → BUILD: preempt if build urgency > harvest urgency
- BUILD → REPAIR: preempt if repair urgency > 1.5 (significant damage)
- REPAIR → REPAIR: re-assign to a more-damaged wall if the current wall is above 80% HP and another is below 30%.

---

## Parameters (config.js → `LABOUR`)

```js
export const LABOUR = {
  // Base priorities (higher = more important)
  basePriorities: {
    REPAIR: 100,
    BUILD: 70,
    FIGHT: 60,
    HARVEST_STONE: 40,
    TILL: 10,
  },

  // Urgency scaling
  repairUrgencyScale: 2.0,        // multiplier for HP-deficit urgency
  stoneUrgencyFloor: 0.3,         // minimum harvest priority multiplier (at cap)
  stoneUrgencyCeiling: 2.0,       // maximum harvest priority multiplier (near zero)
  stoneUrgencyThreshold: 0.2,     // fraction of stone cap where urgency peaks
  fightUrgencyPerEnemy: 0.1,      // urgency boost per nearby enemy

  // Proximity bonus
  proximityMaxBonus: 0.3,         // max priority boost for standing on the job
  proximityDecay: 0.02,           // bonus lost per cell of distance (15-cell range)

  // Stacking
  stackingPenalty: 0.15,          // priority reduction per additional bot on same job
  maxWorkersPerRepair: 3,         // max bots repairing one wall
  maxWorkersPerBuild: 1,          // max bots building one structure
  maxWorkersPerHarvest: 3,        // reuse RESOURCE.stone.maxHarvestersPerZone

  // Crisis detection
  crisis: {
    stoneThreshold: 15,           // Stone below this = crisis mode
    stoneRecoveryThreshold: 30,   // Stone above this = recovery complete
    crisisHarvestPriority: 70,    // HARVEST priority during crisis
    crisisRepairCap: 1.5,         // max repair urgency multiplier during crisis
  },

  // Tick interval
  reassignInterval: 60,           // ticks between full labour re-evaluation (1s)
  // Per-tick, only incremental: check preemption, assign idle bots.
  // Full re-score runs every reassignInterval ticks to reduce CPU.
};
```

---

## Interactions

- **With bots.js:** Bot state machines already exist (`HARVEST_STONE`, `REPAIR`, `BUILD`, `TILL`, `IDLE`). Labour.js assigns jobs; bots.js executes them. No change to bot AI — the labour system just tells each bot *what* to do.
- **With walls.js:** Wall damage triggers REPAIR jobs. Wall placement triggers BUILD jobs. The labour allocator reads wall HP to compute repair urgency.
- **With config.js RESOURCE block:** `maxHarvestersPerZone` (3) is reused for HARVEST_STONE maxWorkers. `cap`, `starting`, and harvest rates drive stone urgency computation.
- **With engine.js stepTick():** `tickLabour(sim, dt)` runs before bot movement, so bots have their target assigned before they move. Placed after resource accumulation and before NPC logic.
- **With the frozen gate:** Labour re-evaluation does NOT run during FD cinematic freeze (bots are frozen anyway).
- **With economy (resource.js):** Reads `sim.resources.stone` and `sim.resourceCaps.stone` for crisis detection. Does NOT mutate resources — assignments only.

---

## Edge Cases

- **All bots idle, no jobs available** → All bots assigned to HARVEST_STONE (fallback). If stone zones are all at maxWorkers, bots go IDLE at base.
- **Wall at 1 HP with 3 bots already repairing** → maxWorkers cap prevents a 4th bot from assigning. The wall breaks or the 3 bots save it — no rubber-banding.
- **Stone crisis during a boss wave** → HARVEST priority jumps to 70 but REPAIR (100 × 1.5 cap = 150) still outranks it. Bots repair walls first, then harvest. The cap prevents harvest-starvation but doesn't force bots to abandon dying walls.
- **All stone zones at max harvesters, player has 0 Stone, walls breaking** → Crisis mode triggers but no zones are free. Bots queue as "waiting" near the most-occupied zone. This is a failure state — the player over-invested in bots without expanding zone access.
- **Bot assigned to a build job, but the build was cancelled** → Job removed from board. Bot gets reassigned next tick (preemption check catches invalidated jobs).
- **Multiple bots become idle on same tick** → Greedy assignment in priority order: highest priority idle bot gets the highest priority job, then the next, etc.
- **Proximity bonus ties** → Tiebreaker: higher base priority wins. If still tied, first bot in the bots array wins (deterministic).

---

## Balance Notes

- **Tuning levers:** `basePriorities` set the core balance. `repairUrgencyScale` controls how aggressively bots react to wall damage. `stackingPenalty` controls swarm-vs-spread behavior.
- **Watch in playtesting:** Whether bots feel "smart" — do they triage during a breach? Do they spread across damaged walls or clump? The proximity bonus + stacking penalty should create natural spread.
- **Crisis detection may feel intrusive** if it triggers too often. `crisisStoneThreshold: 15` means crisis triggers when the player can afford one bot or nothing else. This is intentionally tight — crisis should only activate in genuine resource emergencies.
- **reassignInterval: 60 (1s)** is a performance trade-off. Full re-scoring every tick at 12 bots is fine, but future bot cap increases (20+ bots) would benefit from this batching. The 1s interval means bots may take up to 1 second to respond to a new crisis — acceptable for a tower defense sim.
- **Stacking penalty interaction with repair:** 3 bots on one wall = 0.70× job attractiveness. The allocator will prefer spreading 3 bots across 3 damaged walls (1.0× each) over stacking them. But if only one wall is damaged, all 3 will still go to it — the penalty reduces priority but doesn't block assignment.

---

## Files Affected (for Hephaestus)

| File | Change |
|------|--------|
| `frontend/src/sim/config.js` | Add `LABOUR` config block (Athena will place the parameters) |
| `frontend/src/sim/labour.js` | Rewrite: `tickLabour()`, `buildJobBoard()`, `scoreJobs()`, `assignBot()`, `detectCrisis()`, `getUrgency()`, `getProximityBonus()`, `getStackingPenalty()` |
| `frontend/src/sim/engine.js` | Add `tickLabour(sim, dt)` call in `stepTick()` between resource accumulation and bot movement |
| `frontend/src/sim/bots.js` | Extend `hasHigherPriorityWork()` to use dynamic scoring instead of static ladder. Accept job object as parameter. |
| `frontend/src/sim/__tests__/labour.test.js` | NEW — tests: priority scoring math, stacking curves, crisis detection triggers/recovery, preemption rules, maxWorker caps, proximity bonus decay, edge cases |

---

## Acceptance Criteria Checklist

- [ ] `LABOUR` config block in config.js with all parameters
- [ ] `buildJobBoard(sim)` returns REPAIR jobs for damaged walls, BUILD jobs for pending construction, HARVEST_STONE jobs for available zones
- [ ] `scoreJobs(sim, bot, jobs)` computes dynamic priority: base × urgency × proximity × stacking
- [ ] `tickLabour(sim, dt)` runs every tick, assigns idle bots greedily, checks preemption
- [ ] Full re-score runs every `reassignInterval` ticks (60 = 1s)
- [ ] Crisis detection: when Stone < 15, HARVEST priority → 70, REPAIR urgency capped at 1.5×
- [ ] Crisis recovery: when Stone > 30, normal priorities resume
- [ ] maxWorkers caps enforced (3 per repair, 1 per build, 3 per harvest)
- [ ] Stacking penalty reduces job priority for each additional bot beyond the first
- [ ] Proximity bonus adds up to +30% priority based on bot distance from job
- [ ] `hasHigherPriorityWork()` in bots.js uses dynamic scoring, not static ladder
- [ ] All existing tests still pass (276 + any new labour tests)

---

*End of design spec. Downstream tasks: Hephaestus (labour.js rewrite, engine.js wiring, bots.js integration, tests).*
