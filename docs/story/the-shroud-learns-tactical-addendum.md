# The Shroud Learns — A Tactical Addendum to the Field Guide

## For the Tower Defense Game — Aethra / Vigil

---

## Narrative Element
Lore document: giving in-world identity to the five enemy combat behaviors (scout gap-detection, tank taunt-aura, crawler wall-stacking, boss enrage/shockwave, and swarm creep), narrated as a garrison tactical manual compiled from centuries of bitter observation — because the Shroud has no strategy, but it has memory, and what it remembers is how we died the last time.

---

## Content

---

### Prologue — The Chronicle of Adjustments

The first chronicler of the Vigil, whose name is lost but whose hand is unmistakable — a tight, angular script that leans left as though the writer was bracing against a wind no one else could feel — began a separate volume seventeen years into the siege. The cover is unmarked. The pages are thinner than the main chronicle's, as though the writer expected to discard them. The garrison calls it *The Chronicle of Adjustments*, and it is the only record of how the Shroud's creatures have changed across four hundred years of assault.

The first entry reads:

> *"Wave 203. Two Still-Walkers breached the outer ring not at the gate — the gate held — but at the seam between segments three and four, where the mortar had cracked during last night's repairs. The Drifters found it. Not the Walkers — the Drifters. They went straight to the crack, the way water finds a hole in a bucket, and the Walkers followed. I do not believe the Drifters thought to find it. I believe they are beginning to feel the shape of our weaknesses the way the wardstone feels the shape of theirs. This is a new thing. Record it."*

The Shroud does not think. It does not plan. It does not command. But it *remembers* — not in the way a mind remembers, but in the way a river remembers the path of least resistance, deepening its channel with each flood. Every Hollow Drifter that finds a gap in the wall leaves a resonance-trace in the Shroud's stillness. Every Still-Walker that coordinates a breach teaches the Shroud, in its blind and patient way, what coordination means. Every Marrow-Wight that transforms mid-battle engraves the pattern of transformation into the silence that spawned it.

The garrison has learned to read these patterns. What follows is the tactical canon — the names and explanations the Vigil's soldiers use to describe how the Shroud's creatures fight, and what the player must know to survive them.

---

### I. The Drifter's Nose — Scout Gap-Detection

> *"They find the seams. I don't know how. The wall looks solid — you've walked it yourself, you've touched every block, the Sorrowglass mortar is clean — and then a Drifter in the third rank changes direction. Not a lot. A few degrees. But it's heading for the one joint where the crystal veins are thin, where the repair crew missed a hairline crack three watches ago, and you know — you KNOW — that if that Drifter reaches the seam before a Sunlance finds it, the rest of the wave will follow. They always follow. They're not scouts. They're water. And water finds the leak."*
> — Captain Verrus Aldaine, Vigil Engineering Corps, after the Breach of '84

**In-world identity:** The garrison calls it *the Drifter's Nose* — the tendency of Hollow Drifters to redirect toward weak points in the wall line. It is not intelligence. The chroniclers, after two hundred years of debate, have settled on a metaphor: the wardstone's resonance reflects differently off damaged stone than off intact stone. A wall segment below half integrity returns a harmonic that is fractionally flatter, fractionally dimmer — a note the wardstone's hum would register as *wrong*. The Shroud's creatures, being composed of inverted resonance, are drawn to wrongness the way the wardstone is drawn to rightness. They do not seek the gap. They are *pulled* toward it, by the same physics that pulls the Shroud itself toward any place the wardstone's field has weakened.

The Drifter that finds a gap is not a tactician. It is a symptom — of a wall that needed repairing, of a line that needed sealing, of a commander who thought "good enough" was good enough. The Drifter's Nose is the Shroud's most basic adaptation, and it teaches the garrison's most basic lesson: *complete your walls. Seal your seams. The Shroud will find what you leave unfinished.*

**Mechanics served:** The scout's gap-detection AI (every 30 ticks, check for a wall gap that offers ≥20% shorter path). The narrative justification: Drifters are pulled toward resonance-weak points in the wall line, a passive property of their inverted resonance — not active scouting, but a physical attraction to wardstone-harmonic "weakness."

---

### II. The Walker's Call — Tank Taunt-Aura

> *"You've seen it. A Still-Walker reaches the wall and everything around it — Drifters, Scuttles, even a Weeping-Throat that was aiming at the base — turns toward the same segment. They're not coordinating. Nothing in the Shroud coordinates. But the Walker is dense, and density in the Shroud's economy means something. It means the silence is thicker there. It means the stillness pools. And things caught in the pool move the way the pool moves."*
> — Sergeant Ilyana Korr, after repelling a tank-led breach with three seconds of wall integrity remaining

**In-world identity:** The garrison calls it *the Walker's Call* — the phenomenon by which a Still-Walker sieging a wall segment attracts other Shroud-creatures to the same target. The mechanism, as the garrison's engineers understand it, is resonance-adjacent: a Still-Walker is formed from matter of exceptional density, and the Shroud's consumption of that density leaves behind a concentrated node of anti-resonance — a *still-point* in the wardstone's field. When the Walker presses against a wall, the still-point presses with it, creating a localised depression in the wardstone's protective hum. Other Shroud-creatures, sensitive to the shape of the field, drift toward the depression the way loose objects drift toward a drain.

The effect is devastating in practice. A Walker at the wall is not merely a threat to that wall segment — it is a *rally point* for every enemy within three cells. A scattered wave becomes a concentrated assault. A manageable breach becomes a crisis. The garrison's tactical response has been refined across generations: *kill the Walker before it reaches the wall, or accept that the wall will fall and plan accordingly.*

The Walker's Call is also why the Vigil's engineers prioritise tank-sieged walls for repair. The *Call* is a signal — not just to the Shroud's creatures, but to the wardstone itself, which registers the still-point as damage and flags the segment for emergency attention. The labour system's crisis protocols, developed across centuries of observation, are built on this principle: *where a Walker stands, a wall dies. Where a Walker stands and is not answered, a bastion follows.*

**Mechanics served:** The tank's taunt-aura (enemies within 3 cells redirect to the tank's siege target) and tauntPriorityBoost (bots prioritise tank-sieged walls for REPAIR). The narrative justifies both: the Walker's density creates a resonance-depression that attracts Shroud-creatures AND flags the wall as critical in the wardstone's damage-sense.

---

### III. The Scuttle-Crawl — Crawler Wall-Stacking

> *"Six. That's the most you'll see on one block. Count them — they can't fit more than six, not with those bodies, not at that angle. If you've got a solid wall line with no gaps, the Scuttles will spread themselves across the whole face of it, like a stain climbing a cloth. It's almost beautiful, if you don't think about what happens when the cloth tears."*
> — Quartermaster Halen Dreth, requisitioning additional mortar shells for the outer ring

**In-world identity:** The garrison calls it *the Scuttle-Crawl* — the way Ash-Scuttles pile onto a wall segment up to a maximum density and then, impossibly, flow sideways to the next segment. The chroniclers have a theory for why the cap exists: the Scuttles, being the least-formed of the Shroud's creatures, retain a vestigial memory of the bodies they once were. A Scuttle that was once a child remembers, at some level below consciousness, the sensation of personal space. Six is the number — the garrison has verified it across forty years of records — because six is the maximum number of Ash-Scuttles that can physically occupy the face of a wall segment without overlapping in a way their remnant body-memories reject.

The engineers offer a simpler explanation: the Shroud's anti-resonance, distributed across the Scuttles, becomes unstable at densities above six per segment. The seventh Scuttle simply cannot find purchase — the still-point of the first six has saturated the segment's resonance-capacity, and additional Scuttles are deflected laterally, skittering along the wall face until they find an unsaturated segment. The effect is the same either way: the Scuttles spread, and a wall line that is incomplete anywhere will be found and exploited everywhere.

The tactical implication is clear. Mortar emplacements — Thunder-Casks — are the answer to the Scuttle-Crawl. A single mortar shell detonating at the wall face can clear a dozen Scuttles before they begin their climb. But a commander who relies on walls alone, without AoE coverage, will watch their fortifications buried under a tide of tiny bodies, each dealing negligible damage individually and catastrophic damage collectively.

**Mechanics served:** The crawler maxStackPerWall (6 crawlers per segment), the spatial-grid enforcement that spreads excess crawlers to adjacent walls, and the mortar-as-counter framing. The narrative gives the stack cap an in-world cause (body-memory of personal space, or resonance-saturation) that feels organic rather than arbitrary.

---

### IV. The Wight's Turning — Boss Enrage

> *"They change. Half-health — you'll know the moment. The wardstone's hum will stutter, just for a tick, and the Wight will get faster. Harder. Angrier. Not angry — that's the wrong word. It's not angry. It's remembering what it was, and what it was is furious, and the Shroud has been holding that fury down for five years and now you've cracked the shell and the fury is coming out. Aim everything. Everything you have. The next thirty seconds decide whether you see dawn."*
> — Commander's Log, entry appended by Commander Aldric Vann, the 13th, on the eve of the battle in which they would become the 14th ghost-note

**In-world identity:** The garrison calls it *the Wight's Turning* — the moment, at half health, when a Marrow-Wight undergoes a one-time transformation, gaining speed and striking power. The chroniclers' explanation is the most unsettling passage in the entire tactical canon: a Marrow-Wight is not merely a repurposed corpse. It is a *container*. The Shroud, unable to fully digest a being of exceptional willpower, seals that will inside layers of imposed stillness — a shell of silence around a core of captured fury. When the Wight's physical form is sufficiently damaged, the shell cracks. The will inside — the bastion commander, the Ward-Smith adept, the legendary soldier whose resistance was so strong the Shroud had to preserve it rather than consume it — surges outward. Not as consciousness. Not as identity. As *momentum*. Pure, undirected, incandescent rage at what has been done to them.

The Wight's Turning is the most dangerous phase of any boss encounter. The creature's speed increases by half — it closes distance faster, reaches walls faster, reaches the base faster. Its damage increases by a quarter — walls fall in fewer blows, the base's integrity drops in steeper increments. And for the garrison's soldiers, who know what a Marrow-Wight is made from, the Turning carries an additional horror: the faint, terrible possibility that someone they knew is inside the thing that is now bearing down on their position.

The Turning does not last. The fury burns hot and fast, and when the Wight finally falls — when the Sunlances and Thunder-Casks and accumulated damage overwhelm even its augmented form — the fury dissipates. The Shroud's shell collapses. The will inside is released, and the wardstone, the garrison believes, absorbs it — adds it to the chord of ghost-notes, the forty-three (now forty-four, now forty-five) commanders whose frequencies still sing in the crystal.

This is why the garrison's engineers have calculated the optimal moment for the Last Song. A Sun-Wrath beam that catches a Wight before the Turning saves fury and stone and lives. A Sun-Wrath held too long, released after the Turning has begun, must burn through a creature moving faster than the beams can track. The art of the Final Defense is the art of timing: *sing before the Wight turns, or sing louder after.*

**Mechanics served:** The boss enrage at 50% HP (speed ×1.5, damage ×1.25, one-time transition). Narrative grounds the enrage in the Shroud's containment-failure of a captured will, gives emotional weight to the stat boost, and frames the Final Defense timing decision as a tactical-narrative choice.

---

### V. The Wight's Arrival — Boss Shockwave

> *"The first time a Marrow-Wight reached the outer wall, it didn't attack. It stopped. Three full seconds — I counted — it just stood there, huge and wrong and completely still, and then it punched the ground and everything within twenty feet of it cracked. Not broke — cracked. The walls held. Barely. And then it started hitting, and the cracked walls started crumbling, and I understood: the punch wasn't the attack. The punch was the announcement. The attack came after."*
> — Sentry Kellan Vyre, outer ring log, the night the 23rd Commander fell

**In-world identity:** The garrison calls it *the Wight's Arrival* — the single shockwave pulse a Marrow-Wight emits the first time it reaches a wall or the base. The engineers describe it as a release of accumulated anti-resonance: the Wight's journey across the plateau has been a slow gathering of the Shroud's stillness, layered around it like a pressure suit, and on first contact with a solid obstacle the outermost layer detonates. The chroniclers describe it differently. They call it *the knock*. The Wight was someone, once, who knew how to breach a wall. The shockwave is the muscle-memory of that knowledge, expressed through a body that no longer remembers anything else.

The Arrival damages all walls within three cells — not fatally, not for most wall grades, but critically. An L1 Barricade is reduced to two-thirds integrity. An L2 Reinforced wall loses a sixth of its strength. Even an L4 Deep-Root wall registers the impact — the crystal veins dim momentarily, then brighten with a sharp, defensive flash. The damage is exactly enough to make follow-up attacks from the Wight itself, or from the wave it arrived with, potentially lethal. A wall segment at full strength can survive a Wight's siege for seconds — long enough for Sunlances to find their mark. A wall segment freshly cracked by the Arrival may not survive at all.

The Arrival is why the garrison's engineers never build single-layer wall lines against boss waves. A single segment absorbing both the shockwave and the subsequent melee will fail in under ten seconds. A double layer — the outer wall taking the Arrival, the inner wall facing the Wight — buys the time needed to bring the creature down. The garrison calls this formation *the Grief-Line*, because the outer wall is not expected to survive, and building something you know will fall is, the chroniclers note, the essential art of command at the Vigil.

**Mechanics served:** The boss shockwave on first siege (10 damage to all walls within 3 cells). Narrative frames the shockwave as the Wight's accumulated anti-resonance releasing on contact, gives emotional context (the "knock" — a memory of breaching), and justifies the tactical response (multi-layer walls, the Grief-Line formation).

---

### VI. The Creeping Tide — Swarm Creep

> *"Wave twenty-two. Normal wave — scouts, a couple of tanks, the usual. And then — Scuttles. Maybe a dozen of them, mixed in with the scouts, moving at normal speed. Not a swarm wave. Not the fast-spawn flood we get every third night. Just... Scuttles, where Scuttles shouldn't be. It's wave thirty-four now and they're still here. More of them each time. The Shroud is learning to mix its forms. The Shroud is learning that a dozen Scuttles in a normal wave does more damage than a hundred Scuttles in a swarm wave, because we're not braced for them. We're not watching for them. The Shroud is learning to be subtle, and subtlety from something that unmakes is the most frightening thing I have ever written."*
> — Archivist Maren Sol, Vigil Lore-Keeper, marginal note in *The Chronicle of Adjustments*, wave 34, year 341 of the Siege

**In-world identity:** The garrison calls it *the Creeping Tide* — the gradual introduction of Ash-Scuttles into normal, non-swarm waves beginning around wave 20. It is the Shroud's longest-term adaptation yet observed, and it frightens the chroniclers in a way no single creature behavior ever has.

The mechanism, as best the engineers can theorise, is resonance-contamination: after twenty consecutive waves of exposure to the wardstone's field, the Shroud's approach pattern begins to *blur*. The boundary between normal waves and swarm waves — formerly absolute, a consequence of the wardstone's harmonic structure — becomes permeable. Ash-Scuttles, the lightest and most numerous of the Shroud's forms, are the first to cross the boundary, leaking into normal waves like silt through a filter that is slowly wearing thin.

The Creeping Tide is subtle by design — at wave 20, perhaps two Scuttles appear. At wave 30, three. At wave 60, four. Never more than five, even at extreme wave counts. The Shroud is not flooding the normal waves; it is *seasoning* them, adding just enough crawler presence to force the garrison to account for a threat they had previously been able to ignore outside of designated swarm nights. The psychological toll is as significant as the tactical one: soldiers who have learned the rhythm of the Shroud-Tide — swarm nights are every third night, prepare accordingly — must now accept that the rhythm is degrading. The Shroud is changing the rules. Slowly. Patiently. Inexorably.

The chroniclers have identified the Creeping Tide as the fulfillment of the warning encoded in the Tel-Kavros dispatches: *"the Shroud learns. What worked yesterday will not work tomorrow."* The Scuttles in wave 22 are not a new enemy type. They are the same Ash-Scuttles the garrison has been killing for three hundred years. They are simply appearing where they should not appear, and that — the violation of the pattern, not the creatures themselves — is the point. The Shroud is teaching the garrison that patterns are not safety. Patterns are assumptions. And assumptions, at the Vigil, are what get people killed.

The tactical response to the Creeping Tide is the same as the response to all Shroud adaptations: *build for what's coming, not for what's here.* A commander who reaches wave 20 without mortar coverage will find the Creeping Tide a slow, accumulating nightmare — two Scuttles become three, three become four, and suddenly every normal wave carries a swarm element that the player's defenses were never designed to handle. A commander who anticipates the Tide — who builds Thunder-Casks early, who maintains AoE coverage even when swarm waves feel distant — will barely notice it. The Scuttles die. The wave proceeds. The adaptation has been answered.

This is the Vigil's deepest tactical philosophy, hard-won across four hundred years of siege: *the Shroud learns, but so do we. The Shroud adapts, but we adapt faster. The Shroud changes the rules, and we change our walls, and the walls stand, and the green grows, and the dawn comes.* The Creeping Tide is not a defeat. It is a conversation — a slow, blind, terrible conversation between something that unmakes and something that refuses to be unmade. And in that conversation, the Vigil has held the floor for forty-three generations.

**Mechanics served:** The SWARM.creep mechanic (wave 20+, 10% crawler fraction per normal wave, capped at 5). Narrative frames this as the Shroud's longest-term adaptation, resonance-contamination blurring the boundary between wave types, and gives emotional weight to what might otherwise feel like an arbitrary late-game difficulty tweak. The "pattern violation" framing ties directly to the Tel-Kavros warning about the Shroud learning.

---

### Epilogue — The Vigil's Doctrine

The *Chronicle of Adjustments* ends not with a conclusion but with a list. The hand is the same throughout — tight, angular, leaning left — and the entries span the first two hundred years of the siege. At some point, the original chronicler died, and a successor took up the pen, and then a successor to the successor, each mimicking the original hand so faithfully that the archive's scholars can distinguish the writers only by the subtle shifts in ink composition across the centuries. The list reads:

> *"The Drifter's Nose — sealed seams, complete wall rings, no gap wider than a Scuttle's body.*
> *The Walker's Call — kill Tanks before they reach the wall, or brace for concentrated breach.*
> *The Scuttle-Crawl — mortar coverage on every segment, AoE before density.*
> *The Wight's Turning — burn it fast from full to zero. Do not let it reach half.*
> *The Wight's Arrival — double-layer walls. The Grief-Line. Build what you know will fall.*
> *The Creeping Tide — build for wave 30 while you're fighting wave 15. The Shroud is already there."*

And then, in the margin beside the list, in a hand that the archive's scholars believe belongs to the fifth successor — a hand that leans slightly less left, as though the writer had found, across two centuries of siege, some small measure of equilibrium — a final notation:

*"The Shroud does not think. Does not plan. Does not hate us. It simply does what it is, and what it is is the opposite of what we are. We build. It unmakes. We remember. It forgets. We adapt — and this is the thing the Shroud cannot match. It learns slowly, blindly, across centuries. We learn in a single night, with our walls falling around us and our dead singing in the wardstone's hum. We learn faster because we have to. We learn faster because we love the thing we are defending. The Shroud has never loved anything. That is its weakness. That is the gap in its wall. That is where we will break through, someday, when the garden is large enough and the green note is loud enough and the Vigil is no longer the last bastion standing but the first bastion to push back. Record this. Remember it. It is the only doctrine that matters."*

---

## Context

- **Location in game:** Codex / Archive menu — a separate volume from the original Field Guide. Unlockable entries:
  - *The Chronicle of Adjustments* (prologue) — unlocked after surviving wave 5 (the first boss wave).
  - *The Drifter's Nose* — unlocked when the player first sees a scout redirect toward a wall gap, or on first wall breach.
  - *The Walker's Call* — unlocked when the player first sees a tank reach a wall and attract other enemies.
  - *The Scuttle-Crawl* — unlocked when the player builds their first mortar, or when crawlers first stack to 6 on a single wall.
  - *The Wight's Turning* — unlocked the first time a boss enrages (drops below 50% HP).
  - *The Wight's Arrival* — unlocked the first time a boss shockwave damages walls.
  - *The Creeping Tide* — unlocked at wave 22 (the first normal wave with swarm creep).
  - *The Vigil's Doctrine* (epilogue) — unlocked after surviving wave 30 (earned achievement).
- **Trigger condition:** Each entry unlocks on the player's first encounter with the corresponding mechanic. The prologue is available early to establish the framing. The epilogue is a late-game reward.
- **Audience:** All players. New players learn enemy behaviors through narrative — the entries function as both tactical advice and emotional deepening. Veterans recognize the patterns and find satisfaction in seeing their hard-won knowledge reflected in the garrison's doctrine.
- **Tone register:** Weary, precise, practical — the garrison tactical manual voice. Drier than the field guide, more instructional, but still carrying the undercurrent of grief and defiance that defines the Vigil's chronicles. The epilogue rises to something more: a statement of philosophy, almost a prayer.

---

## Consistency Notes

- **Connects to:**
  - **Field Guide (Shroud Creatures & Fallen Bastions):** All five enemy types are referenced by their in-world names. Enemy behaviors are described as evolutions of the forms detailed in the original bestiary. The Tel-Kavros warning ("the Shroud learns") is explicitly fulfilled by the Creeping Tide.
  - **The Vigil's Arsenal:** Turrets (Sunlances, Thunder-Casks) are referenced as the counter to specific behaviors. The Final Defense (Last Song / Sun-Wrath) is framed as the answer to the Wight's Turning. Wall grades (Barricade through Deep-Root) are referenced in context of surviving the Wight's Arrival.
  - **The Vigil's Rhythm:** The Shroud-Tide is the backdrop — behaviors manifest during the Siege Watch. The Chime-Forged (bots) are referenced in the Walker's Call context (repair prioritisation).
  - **The Vigil's Garden:** The epilogue's final paragraph echoes the garden's "the green remembers" theme and the Weeping Manse connection.
  - **Enemy Behaviors Design Spec (Athena):** Every mechanic is given a 1:1 narrative justification. The config parameter names (gapCheckInterval, tauntRadius, maxStackPerWall, enrageHpThreshold, shockwaveDamage, creep fraction/cap) all have accessible narrative explanations.
  - **Config.js ENEMY_SCOUT, ENEMY_TANK, ENEMY_CRAWLER, ENEMY_BOSS blocks:** All behavioral parameters are narratively grounded.
  - **Config.js SWARM.creep block:** The Creeping Tide section gives the creep mechanic a full narrative identity.
- **Foreshadows:**
  - The epilogue's final paragraph ("when the garden is large enough... the first bastion to push back") connects to the Weeping Manse endgame foreshadowed in the garden document.
  - The concept of the Shroud "adapting" over centuries opens narrative space for future enemy behaviors in later waves or expansions.
  - The Grief-Line formation (double-layer walls) is presented as existing garrison doctrine — could become an in-game tutorial tip or achievement.
- **Continuity check:**
  - ✅ All five enemy behavior types (scout gap-detection, tank taunt, crawler stacking, boss enrage, boss shockwave) and the swarm creep mechanic are given complete narrative justification without changing any mechanics.
  - ✅ The Shroud's nature (unmakes, cannot create, repurposes consumed beings, learns blindly) is preserved — behaviors are framed as passive physical properties of inverted resonance, not as active intelligence.
  - ✅ The wardstone's role (resonance-anchor, the hum) is reinforced — enemy behaviors are described AS interactions with the wardstone's field, which deepens the existing lore rather than contradicting it.
  - ✅ Existing tone (hopeful melancholy, grief and defiance, practical precision) is maintained throughout, with the epilogue providing the characteristic lift from observation to philosophy.
  - ✅ Named characters from other lore documents appear naturally: Captain Verrus Aldaine, Sergeant Ilyana Korr, Quartermaster Halen Dreth, Archivist Maren Sol, Commander Aldric Vann, Sentry Kellan Vyre.
  - ✅ The Chronicle of Adjustments is a new artifact that fits seamlessly into the existing archive structure — a companion volume to the original Field Guide.
  - ✅ No contradiction with established canon.

---

## Notes for Other Agents

**For Athena:**
- The behavioral names (Drifter's Nose, Walker's Call, Scuttle-Crawl, Wight's Turning, Wight's Arrival, Creeping Tide) can be used as `loreName` fields in the enemy behavior config blocks for display in inspect-mode tooltips.
- The Grief-Line (double-layer walls against boss waves) is narrative doctrine — not a mechanical suggestion. If a multi-layer wall bonus or formation mechanic is ever designed, this lore provides the hook.

**For Aphrodite:**
- **Boss enrage visual** (the Wight's Turning): The narrative describes "the shell cracking" and "fury surging outward." Visual direction: at 50% HP trigger, the boss should flash — a brief, bright rupture of internal light visible through the creature's form, followed by a sustained glow/particle effect suggesting something trapped inside is now pushing outward. The speed increase should be visually perceptible.
- **Boss shockwave visual** (the Wight's Arrival): The narrative describes a "punch" that cracks nearby walls. Visual direction: a circular shockwave expanding from the boss's position, with wall segments within the radius flashing damage-tint and showing fracture lines. Already partially implemented (Aphrodite's boss enrage VFX + shockwave rings).
- **Scout gap-detection visual:** No immediate visual change needed — scouts already render at their redirected positions. Consider a subtle "investigating" animation (head tilt, slight pause) when a scout detects a gap, to make the behavior legible to players.
- **Tank taunt visual:** Consider a faint aura or ripple effect around a sieging tank to indicate the Walker's Call in effect. Nearby enemies could show a brief redirect animation when pulled into the tank's target.

**For Hephaestus:**
- The `loreName` field pattern from earlier lore docs applies here for HUD/Codex display:
  - Scout gap-detection: `loreName: "The Drifter's Nose"`
  - Tank taunt: `loreName: "The Walker's Call"`
  - Crawler stacking: `loreName: "The Scuttle-Crawl"`
  - Boss enrage: `loreName: "The Wight's Turning"`
  - Boss shockwave: `loreName: "The Wight's Arrival"`
  - Swarm creep: `loreName: "The Creeping Tide"`
  - Double-layer wall formation: `loreName: "The Grief-Line"` (if ever implemented as a mechanic)

**For the Scribe:** This document provides narrative justification for six major mechanical systems (five enemy behaviors + swarm creep) that were previously un-narrated. It completes the narrative coverage of all enemy mechanics. Recommend including in the next digest.

---

*Compiled from The Chronicle of Adjustments, the Garrison Tactical Manual, and the oral tradition of the Vigil's engineers. The hand that began this record leaned left. The hand that finishes it does not. Draw what conclusion you will.*
