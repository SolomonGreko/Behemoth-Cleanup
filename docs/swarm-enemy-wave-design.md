## Design: Swarm Enemy Wave Mechanic

### Intent
Introduce a new wave archetype that overwhelms the player through sheer quantity
rather than individual enemy power. Swarm waves create tactical variety — they
punish pure single-target turret builds and reward AoE investment (mortars,
splash damage). They also deliver a distinct power fantasy: the satisfaction of
wiping out dozens of weak enemies in a single mortar blast, contrasted with the
tension of "there are too many, will they hold?" This mechanic adds a third
rhythm to the existing normal/boss wave cadence without disrupting it.

---

### Rules

#### Swarm enemy type: Crawler

- **Identity.** Crawler is a new enemy type. Tiny, fast, fragile. A single
  crawler is trivial; twenty are a crisis.
- **Movement.** Crawlers follow the same A* path as other enemies but add a
  small per-tick positional jitter (±0.3 cells) to create natural swarm spread.
  They do not deliberately fan out — the jitter is cosmetic clustering, not
  tactical dispersal.
- **Pathfinding.** Crawlers use the shared spatial grid. They do not bypass
  walls or take alternative routes. If a path is blocked by a wall, they siege
  like all other enemies.
- **Damage model.** Crawlers deal low damage on reaching the base — they're a
  volume threat, not a burst threat. Their danger comes from count: 10 crawlers
  deal as much damage as 3 scouts, but 30 crawlers is a crisis a single-target
  turret can't handle.
- **Death reward.** Crawlers grant a small amount of a bonus resource (steel or
  a "swarm bounty" counter) on kill. This creates a positive incentive: swarm
  waves are dangerous but lucrative if handled well.
- **Rendering.** Crawlers are rendered as small dots or simple sprites. They
  render in the post-fog section of the render pipeline (like all independently
  moving entities). Performance: at 50+ simultaneous crawlers, the rendering
  path must use instanced or batched drawing to avoid 50 draw calls.

#### Swarm wave classification

- **Trigger.** A wave is a "swarm wave" when `waveNumber % 3 === 0 && waveNumber % 5 !== 0`.
  This places swarm waves at 3, 6, 9, 12, 18, 21, 24, 27, ... — every 3 waves,
  skipping those that also fall on a boss wave (multiples of 5).
- **Swarm + boss coincidence.** When `waveNumber % 15 === 0` (waves 15, 30,
  45...), the boss wave takes priority BUT the wave gains a swarm add
  component: 30–50% of the normal swarm-wave crawler count spawns alongside the
  boss. This makes late-game boss waves substantially harder.
- **No normal enemies in pure swarm waves.** Waves 3, 6, 9, 12, 18, 21... spawn
  ONLY crawlers. No scouts, tanks, or artillery. Pure swarm identity.
- **Swarm-creep in normal waves (optional stretch).** Starting at wave 20, every
  normal (non-swarm, non-boss) wave includes a small crawler escort: ~10% of
  the spawn count is crawlers. This introduces the swarm mechanic gradually and
  keeps late-game normal waves from feeling identical to early-game ones.

#### Spawning rules

- **Count formula.** `crawlerCount = floor(baseSpawnCount * 3.0 * (1 + 0.15 * floor(waveNumber / 3)))`
  - `baseSpawnCount` is the normal wave enemy count for that wave number.
  - The `3.0` multiplier means a swarm wave has 3x the enemies (by count).
  - The `0.15` factor means crawler count grows faster than normal enemy count
    as waves progress — late-game swarm waves are massive.
  - Cap: maximum 80 crawlers on screen at once, enforced at spawn time.
- **Spawn interval.** Swarm waves spawn enemies at 0.4x the normal interval.
  Normal waves spawn one enemy per `WAVE.spawnIntervalTicks`; swarm waves spawn
  one crawler per `WAVE.spawnIntervalTicks * 0.4`. This means crawlers pour out
  2.5x faster, creating the "flood" sensation.
- **Spawn location.** Crawlers use the same spawn point(s) as normal enemies.
  No special spawn rules.
- **Phase.** Swarm waves follow the same Night-phase-only rule as all waves.

#### Mixed-wave composition (for boss-wave coincidence)

When a swarm and boss wave coincide (waves 15, 30, 45...):
1. The boss enemy spawns first (at the wave's start).
2. Crawler spawn count = `floor(normalSwarmCount * 0.4)`. Reduced to keep the
   total difficulty manageable.
3. Crawlers spawn at the faster swarm interval (2.5x normal rate).
4. The wave ends when all enemies (boss + crawlers) are dead or all have
   reached the base — same win/loss conditions as any wave.

---

### Parameters

#### SWARM config block (config.js)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `crawlerHp` | 3 | Scout has ~12–15 HP (estimated from skill references). Crawler should be killable in 1–2 shots from a basic turret, making them individually trivial but collectively demanding AoE. |
| `crawlerSpeed` | 1.2× scout speed | Crawlers are faster than scouts. They reach the base quicker, compensating for their fragility. The speed advantage forces repositioning or early detection. |
| `crawlerDamage` | 0.3× scout damage | A single crawler does negligible damage. Ten crawlers (3× scout DPS) is noticeable. Thirty crawlers (9× scout DPS) is a base-killer. This scaling curve means small leaks are survivable; big leaks are not. |
| `crawlerSize` | 0.4 cells | Visual footprint: small enough that 20+ crawlers don't fill the entire screen. Small enough to feel like "pests." |
| `crawlerJitter` | 0.3 cells | Per-tick random offset magnitude. Produces natural clustering without tactical dispersal. |
| `swarmBounty` | 1 steel per kill | Positive incentive. A wave-9 swarm of ~30 crawlers awards 30 bonus steel — enough for one mortar upgrade. Rewards preparation. |

#### WAVE config additions (config.js)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `swarmInterval` | 3 | Swarm wave every 3 waves. Faster cadence than boss waves (every 5). Ensures the player encounters swarm waves frequently enough to adapt their build, but not so often that normal waves feel like interruptions. |
| `swarmCountMultiplier` | 3.0 | Base count multiplier. At 3×, a swarm wave feels like "a lot" without being unwinnable. Combined with faster spawns, the player faces ~7.5× the enemy throughput of a normal wave. |
| `swarmCountGrowth` | 0.15 | Per-wave-tier growth factor. Scales slowly enough that wave-3 swarms (~15 crawlers) don't crush a new player, but wave-21 swarms (~60 crawlers) demand serious AoE investment. |
| `swarmSpawnIntervalFactor` | 0.4 | Fraction of normal spawn interval. At 0.4, crawlers spawn 2.5× faster. This is the primary "feel" differentiator — the flood pacing vs. the steady drip of normal waves. |
| `swarmBossAddFraction` | 0.4 | When swarm + boss coincide, spawn this fraction of the normal swarm count. Keeps boss waves challenging but not cruel. A wave-15 boss + 20 crawlers is tough but fair with mortar investment. |
| `swarmCap` | 80 | Hard cap on simultaneous crawlers. Prevents performance degradation and visual noise saturation. If the cap is hit, spawning pauses until crawlers die. |

#### ENEMY config additions (config.js)

A new entry in the existing `ENEMY` const:

```
crawler: { hp: SWARM.crawlerHp, speed: SWARM.crawlerSpeed, damage: SWARM.crawlerDamage, size: SWARM.crawlerSize, type: 'crawler' }
```

---

### Interactions

- **With Mortar / AoE turrets:** Crawlers are the mortar's ideal target. Their
  high count and low HP mean a single mortar blast can kill 10+ crawlers at
  once. This creates a powerful "mortar dopamine hit" — the player feels smart
  for investing in AoE. Mortar targeting logic (nearest-enemy-first) works
  fine for crawlers without changes.

- **With single-target turrets:** Standard turrets (guns) can one-shot crawlers
  but can only fire one at a time. Against 30 crawlers, even 5 turrets kill at
  most 5 per volley — they get overwhelmed. This incentivizes diversifying
  turret types rather than mono-building guns.

- **With Final Defense:** The 5 sequential beams (72° sectors) are excellent
  against swarms — each beam sweeps a sector and vaporizes all crawlers in it.
  Swarm waves make Final Defense feel like a satisfying panic button. FD
  activation during a swarm wave should be a deliberate choice (losing
  production during FD silence).

- **With walls:** Crawlers siege walls like all enemies. A dense swarm on a
  single wall segment will break it quickly — encouraging layered wall
  construction or aggressive turret coverage at chokepoints.

- **With fog of war:** Crawlers inside fog are invisible like all enemies.
  However, their high count means more fog-penetration events (more enemies
  entering vision zones). This naturally creates a "radar ping" effect during
  swarm waves — the player sees the swarm approaching in pulses.

- **With economy (steel bounty):** The bonus steel from crawler kills creates
  an economic rhythm: survive a swarm wave → reinvest bounty into AoE → handle
  the next swarm wave better. This is a positive feedback loop that rewards
  skill (not just survival).

- **With SCALING:** Crawler stats can be scaled by `SCALING` if desired (e.g.,
  `SCALING.crawlerSpeed: { perWave: 0.005 }` for very gradual speed creep).
  By default, crawler HP does NOT scale — they stay fragile. Crawler count
  scales naturally via the swarmCountGrowth formula. This keeps the "individually
  weak, collectively strong" identity intact.

---

### Edge Cases

- **Swarm wave with no mortars built** → The player can still win with enough
  single-target turrets, but it's much harder — they'll need more turrets and
  accept some base damage. This is intentional: the first swarm wave (wave 3)
  is small enough (~15 crawlers) to serve as a wake-up call, not a death
  sentence. The player learns "I need AoE" without losing the run.

- **All crawlers killed before reaching base** → Wave ends normally. Player
  earns full bounty. No special state.

- **Crawler count hits swarmCap (80)** → Spawning pauses. Crawlers continue
  moving and dying. When count drops below cap, spawning resumes. The wave
  doesn't "time out" — all crawlers must spawn eventually (total count is still
  computed, just gated on cap).

- **Swarm wave 3 with zero turret upgrades** → ~15 crawlers vs. 2–4 starting
  turrets. A single turret kills a crawler in 1 shot. At 1 shot per tick per
  turret, 4 turrets kill 4 crawlers/tick. Crawlers spawn at ~2.5/tick
  (15 crawlers over ~6 ticks). Result: the player takes a few hits but survives.
  This is the intended "warning shot" — the player loses some base HP but
  learns the lesson.

- **Swarm + boss coincidence with no mortar** → Wave 15: boss + ~20 crawlers.
  Guns must split attention between boss (high HP) and crawlers (many targets).
  Without AoE, this is extremely difficult — intentionally so. By wave 15, the
  player has had 5 swarm waves (3, 6, 9, 12, and now 15's adds) to learn that
  AoE matters. This is the "did you learn?" check.

- **Crawler path blocked by a single-cell wall gap** → Crawlers stack up and
  siege the wall. Because they're small, many can siege a single wall segment
  simultaneously. A wall under crawler siege breaks very fast — reinforce
  narrow chokepoints.

- **Renderer performance at swarmCap (80 crawlers)** → Instanced rendering or
  batched draw calls required. 80 individual `drawImage` calls per frame is
  unacceptable. The implementation must use a single draw call (or a small
  number of batches) for all crawlers. This is an implementation constraint,
  not a design decision — flag for Hephaestus.

- **Crawler + fog interaction for targeting** → `isVisible` check (from
  vision.js) applies normally. Crawlers in fog are invisible and cannot be
  targeted. This means fog-lifting upgrades (if they exist) gain value during
  swarm waves.

- **Swarm wave at very high wave numbers (60+)** → The count formula produces
  `baseSpawnCount * 3.0 * (1 + 0.15 * 20) = baseSpawnCount * 12.0`. At wave 60,
  if baseSpawnCount is ~8, that's 96 crawlers — capped at 80. The wave will take
  longer to clear (spawning is gated by cap) but doesn't break. This is the
  asymptotic difficulty — the cap becomes the new bottleneck rather than the
  formula.

---

### Balance Justification

**Why 3× count and 2.5× spawn rate?**
A normal wave produces `N` enemies at 1× spawn rate → the player faces `N`
enemies over time `T`. A swarm wave produces `3N` enemies at 2.5× spawn rate →
the player faces `3N` enemies over time `0.4T`, yielding a throughput of
`3N / 0.4T = 7.5N/T` — 7.5× the enemy throughput. This is a dramatic spike that
feels qualitatively different from a normal wave. The math ensures swarm waves
are never "just a normal wave with more guys" — they're a fundamentally
different pacing challenge.

**Why 3 HP (one-shot kill)?**
The core frustration in tower defense is when your turrets feel ineffectual —
firing at an enemy repeatedly and watching it walk through. Crawlers die in one
hit so every shot matters. This makes the player feel powerful even when
outnumbered. The tension comes from the count, not from bullet-sponginess.

**Why bonus steel on kill?**
Without a reward, swarm waves are pure attrition — they cost the player
resources (damage taken) without giving anything back. The bounty converts
swarm waves from punishment to opportunity: a skilled player nets positive
resources. This is the "risk/reward" pillar of the mechanic.

**Why swarm waves at multiples of 3?**
The 3-3-5-3-3-5... cadence creates a satisfying rhythm without pattern
predictability fatigue. The player always knows a swarm is coming but not
exactly when (they lose count). Boss waves every 5 waves provide the anchor
points; swarm waves fill the gaps.

**Why no HP scaling for crawlers?**
If crawler HP scaled, late-game crawlers would become bullet sponges — eroding
their identity as "individually weak, collectively strong." They'd become
smaller tanks. Instead, difficulty scales through count — more crawlers, not
tougher ones. The cap (80) is the asymptotic difficulty ceiling.
