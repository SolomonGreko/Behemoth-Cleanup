# Design Spec: Wall System

**Design: Athena | Version: 1.0 | Date: 2026-06-22**

---

## Intent

Walls are the player's primary terrain-shaping tool. They create chokepoints, buy time for turrets to fire, and absorb damage that would otherwise hit the base. A well-placed wall network is the difference between a controlled defense and a frantic scramble. Walls give the player agency over the battlefield geometry — they don't just react to enemy paths; they reshape them.

---

## Mechanics

- **Placement.** Walls are placed on grid cells between `placementMinDistance` and `placementMaxDistance` from the base center. Placement is a player action — click a cell, pay the cost, and a bot is dispatched to build.
- **Blocking.** Enemies cannot walk through wall cells. When a wall blocks their path, they enter a `sieging` state — attacking the wall segment until it is destroyed or the enemy dies. This is the existing enemy siege behavior extended to wall entities.
- **Upgrade tiers.** Four levels (L1–L4). Higher levels have more HP, larger collision radii, and longer build times. Upgrading an existing wall replaces it in-place; a bot must complete the build cycle before the upgrade takes effect.
- **Repair.** Bots in REPAIR state restore wall HP at `repairRate` per tick when within `repairRange` of a damaged wall segment. Repair priority: lowest-HP wall segment first.
- **Destruction.** When a wall segment's HP reaches 0, it is removed from the grid. Enemies that were sieging it resume movement. There is no rubble/debris — the cell reverts to its underlying terrain type.
- **Turret mounting.** Turrets placed on a wall segment receive `TURRET.mountBonus` (currently +30% HP, +15% range). The wall must be at least L2 to support a mounted turret.
- **Cap.** Maximum 20 wall segments per game (configurable via `maxSegments`). Prevents wall-spam trivializing late-game waves.

---

## Parameters

All in the `WALL` config block in `config.js`:

### Per-Level Stats

| Level | HP | Build Ticks | Radius | Label | Rationale |
|-------|-----|------------|--------|-------|-----------|
| L1 | 30 | 180 (3s) | 0.8 | Barricade | First wall the player builds. Survives ~1-2 scout attacks. Cheap (implied by being the starting option before upgrades). Cost is 0 — the player starts with wall-building unlocked. |
| L2 | 60 | 300 (5s) | 0.9 | Reinforced | Double L1 HP. Survives a tank's attention for ~12 ticks (60 HP / 5 damage). Cost: 30 Stone. Affordable by wave 2-3. |
| L3 | 120 | 480 (8s) | 1.0 | Root-Bound | Quadruple L1 HP. Survives sustained artillery fire (~15 hits at 8 damage). Cost: 80 Stone + 5 Crystal. Gates on Crystal income — forces combat engagement. |
| L4 | 200 | 720 (12s) | 1.1 | Deep-Root | Near-base-level durability. One L4 wall can absorb an entire boss wave if supported by turrets. Cost: 150 Stone + 15 Crystal. Late-game investment. |

### Why these HP values?

- **L1 (30 HP):** A wave-1 scout does 2 damage on contact — but walls prevent contact until destroyed. The primary threat is siege damage (enemies attacking the wall). With L1 HP at 30, a single L1 wall absorbs ~4 scouts sieging for ~4 ticks each before breaking. Enough to delay, not enough to ignore.
- **L2 (60 HP):** By wave 5 (first boss), the player should have 2-3 L2 walls creating a chokepoint. 60 HP survives the boss for ~3 ticks of direct siege — enough for turrets to deal significant damage before the wall falls.
- **L3 (120 HP):** Crystal-gated. Appears around wave 8-10. At this point, artillery enemies deal 8 damage. A L3 wall survives 15 artillery hits — enough to anchor a defense line through a full night cycle.
- **L4 (200 HP):** Appears wave 15+. Survives the boss+swarm coincidence wave if supported. At 200 HP, it takes the boss (20 damage) 10 ticks to break — by which time a well-placed mortar has cleared the crawler swarm.

### Global Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `repairRate` | 0.5 HP/tick | A bot repairs 30 HP per second (0.5 × 60 ticks/sec). One bot can sustain an L1 wall under light siege; three bots can sustain an L3 wall. Repair is slow enough that the player still feels wall damage pressure, fast enough that repair is worth assigning bots. |
| `repairRange` | 1.5 cells | Same as bot deposit range. Consistency with existing bot movement patterns. |
| `placementMinDistance` | 3 cells | Walls can't be placed adjacent to the base. This creates a tactical ring: inner ring = turrets, outer ring = walls. Prevents degenerate "wall directly on base" strategy. |
| `placementMaxDistance` | 15 cells | Walls can't be placed at the map edge. Forces the player to engage enemies before they reach the wall line. Matches the stone zone max distance for thematic consistency. |
| `maxSegments` | 20 | A full ring around the base at radius 5 takes ~16 segments. 20 allows a ring plus 4 internal reinforcements. Prevents wall-spam trivializing wave 20+. |

---

## Interactions

- **With turrets (mountBonus):** A turret on an L3 wall gets +30% HP (78 effective HP) and +15% range (5.175 cells). This makes wall-mounted turrets the optimal defensive configuration — rewarding players who plan placement rather than scattering turrets.
- **With enemy siege AI:** Enemies encountering a wall switch to `sieging` state. They attack the wall at their damage rate. Multiple enemies can siege the same wall segment simultaneously — a wall under concentrated siege breaks fast. This incentivizes spreading walls and using turrets to thin enemies before they reach the wall line.
- **With bot REPAIR state:** Repair priority is lowest-HP-first. During a battle, bots rush to the most damaged wall. This creates an emergent "triage" behavior — the player sees bots clustering around the wall that's about to break.
- **With Final Defense:** FD beams destroy enemies but do NOT damage walls. Walls are friendly structures. However, enemies killed by FD while sieging a wall stop dealing damage — the wall survives the FD sequence.
- **With wave composition:** Swarm waves (crawlers) siege walls very effectively due to high count. A single L2 wall under 20+ crawler siege breaks in ~3 ticks. This reinforces the design intent: swarm waves punish thin wall lines and reward AoE investment (mortars clearing crawlers before they reach walls).
- **With economy (Stone):** Wall upgrades consume Stone — the same resource used for bots. This creates a strategic tension: more walls = fewer bots = less Stone income. The player must balance static defense (walls) with economic growth (bots).

---

## Edge Cases

- **Wall placed on a stone zone** → Wall placement destroys the stone zone. The zone is removed from the harvest pool. Any bot currently assigned to harvest it is reassigned. Intentional trade-off: walls cost future income.
- **Wall placed blocking the only path** → Enemies siege the wall. If all paths are blocked, the closest wall is sieged. This is valid strategy (full enclosure) and is balanced by the `maxSegments` cap and siege mechanics.
- **Wall upgraded while under siege** → The existing wall is removed and replaced with the upgraded version at full HP. The upgrade "heals" the wall. This creates a tactical option: upgrading a nearly-dead wall is a faster heal than repairing it. Intentional: rewards saving upgrade resources for emergencies.
- **Wall at map edge** → Rejected. `placementMaxDistance: 15` prevents edge placement. Enemies must have room to approach.
- **Bot building wall is killed** → The wall upgrade/building is abandoned. Resources already spent are NOT refunded (per resource_mechanics.md: cost is deducted at purchase). The cell reverts to its previous state. Harsh but fair — protect your builder bots.
- **Multiple bots repairing same wall** → All bots contribute `repairRate` HP/tick each. Repair stacks additively. Three bots = 1.5 HP/tick. No cap on concurrent repairers — if the player over-commits bots to repair, they're not harvesting.
- **Wall at maxSegments** → Placement is rejected. UI shows "Wall cap reached (20/20)." Player must demolish an existing wall to place a new one.

---

## Balance Notes

- **Tuning levers:** `hp` per level controls durability. `buildTicks` controls how long the bot is vulnerable. `repairRate` controls how sustainable walls are during combat.
- **Watch in playtesting:** Wall-spam strategies (placing 20 L1 walls instead of upgrading). L1 walls at 30 HP with 20 segments = 600 total HP of barriers. This might trivialize early waves. Mitigation: consider raising `buyWall` cost or lowering L1 HP to 20 if this emerges.
- **Turret mounting dominance:** If every turret ends up on an L3+ wall, the game becomes about wall placement rather than turret diversity. Mitigation: consider limiting mounted turrets per wall segment to 1, or adding a mounting cost.
- **Bot repair vs bot harvesting tension:** If repair is too efficient, the optimal strategy is "build 10 bots, 5 harvest, 5 repair" and walls never break. Current `repairRate` of 0.5/tick means 5 bots repair 2.5 HP/tick — a boss sieging at 20 damage/tick still breaks walls fast. This feels correct but needs playtesting at high bot counts.
- **Crystal gate (L3+):** The jump from Stone-only (L1-L2) to Crystal-required (L3+) gates late-game wall power behind combat engagement. A pacifist player who avoids fighting can't build L3+ walls — their base is fragile by design. This is the intended strategic pressure.

---

## Files Affected (for Hephaestus)

| File | Change |
|------|--------|
| `frontend/src/sim/config.js` | ✅ DONE — WALL config block added (Athena, 2026-06-22). |
| `frontend/src/sim/walls.js` | NEW — wall entity module: createWall, upgradeWall, damageWall, destroyWall, repairWall, canPlaceWall. |
| `frontend/src/sim/engine.js` | Add `tickWalls()` call in stepTick. Add wall placement/upgrade purchase paths. Enemy siege AI must target walls (extend enemies.js). |
| `frontend/src/sim/bots.js` | Extend REPAIR state to target damaged walls. Add BUILD_WALL state (move to cell, build for buildTicks, complete). |
| `frontend/src/sim/enemies.js` | Add `sieging` state — enemy stops at wall, attacks it each tick. On wall destruction, resume movement. |
| `frontend/src/sim/turrets.js` | Turret placement on wall cells applies mountBonus. Reject placement on L1 walls. |
| `frontend/src/sim/__tests__/walls.test.js` | NEW — tests: placement bounds, upgrade path, repair math, siege interaction, mount bonus, cap enforcement, edge cases. |

---

## Acceptance Criteria Checklist

- [ ] WALL config block in config.js (✅ DONE)
- [ ] Wall entity module with create/upgrade/damage/destroy/repair
- [ ] Wall placement bound to [placementMinDistance, placementMaxDistance]
- [ ] Enemy siege state — attack walls that block path
- [ ] Bot BUILD_WALL state — travel to cell, build, complete
- [ ] Bot REPAIR targeting damaged walls (lowest-HP-first)
- [ ] Turret mount bonus applied when placed on L2+ wall
- [ ] maxSegments cap enforced at placement time
- [ ] Stone zone destruction when wall placed on zone
- [ ] All 203 existing tests still pass
- [ ] New wall-specific tests (placement, siege, repair, upgrade, mount, cap)

---

*End of design spec. Downstream tasks: Hephaestus (walls.js, siege AI, bot states, turret mounting), Aphrodite (wall rendering), Apollo (integration validation).*
