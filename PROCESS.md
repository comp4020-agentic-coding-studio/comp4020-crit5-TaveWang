# Process overview

## What I built

**Ashen Hollow** is a small side-scrolling action roguelite: a masked
wanderer fights through four short, escalating encounters in a compact ruined
sanctuary, picking one of two icon-only upgrades between fights, and either
falls or clears the final encounter in three to five minutes. The whole game
turns on one move: a fast directional dash that is both the only way to
travel quickly and the only way to deal damage, so movement and offense are
the same decision. Nothing on screen explains this --- no tutorial, no
control hints, no menus --- the opening screen is just the wanderer standing
in the ruin, waiting for the first press.

## The moments that mattered

1. **Deciding what "no tutorial" actually constrains.** The brief bans any
   explanatory text, but the game still has to be learnable from nothing.
   The dash-slash was built so its own animation carries the lesson: the
   slash hitbox is drawn as a visible bright arc in front of the player
   (`src/game/render.ts`), enemies flash and stagger on hit, and the title
   screen holds the player idle in a lit clearing rather than showing any
   prompt, so the only affordance is the world itself.
   [`bf93417`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/bf93417),
   [`32fbbf9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/32fbbf9)

2. **Keeping the rules testable without a canvas.** The brief asks for
   automated tests of the dash-slash rule specifically, so combat resolution
   (`resolveSlashDamage`, `applyDamageToPlayer`, `checkPlayerRunEnd`) lives in
   `src/game/combat.ts` as plain functions over data --- no DOM, no
   `requestAnimationFrame`, no Canvas context. `spec/game.test.ts` exercises
   exactly the five behaviours the brief names: hit inside the slash area,
   no hit outside it, one hit per enemy per dash, temporary invulnerability
   after player damage, and the run ending at zero health.
   [`327371d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/327371d)
   --- `pnpm check` runs all 25 tests across 3 files green.

3. **The two viewports didn't agree, and the fix had to be structural, not
   cosmetic.** Playing the built site at both marking viewports
   (1920x1080 and 390x844 via `agent-browser`) showed the phone view was
   cramped and the ground/jump proportions didn't match desktop, because the
   camera and physics constants were tuned in raw CSS pixels. The real fix
   was moving rendering and simulation onto a fixed logical coordinate space
   (`LOGICAL_HEIGHT = 540` in `src/game/constants.ts`) that the canvas
   transform scales to fit whichever viewport it's given, with the camera's
   follow range now computed from the actual visible logical width instead
   of a hardcoded `960`.
   [`b104508`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/b104508)

   > *before*: `x: Math.max(0, Math.min(state.arenaWidth - 960, player.pos.x - 480))`
   > *after*: `x: Math.max(0, Math.min(Math.max(0, state.arenaWidth - viewportWidth), player.pos.x - viewportWidth / 2))`

4. **A live playtest surfaced a real fairness bug the unit tests couldn't
   see.** Actually playing through the first encounter and into the upgrade
   screen (rather than only reading the code) showed the run continuing to
   move during what should have been a frozen upgrade phase, which led to
   digging into `src/game/run.ts`'s phase machine and, with a temporary
   debug hook wired into `GameCanvas.tsx` to read live game state directly,
   catching the actual defect: `chooseUpgrade` never repositioned the player
   before spawning the next encounter's enemies. Because a dash can carry
   the player deep into the arena, the next encounter's fixed spawn points
   could land an enemy within a few pixels of the player the instant the
   overlay closed --- unavoidable contact damage, which the brief explicitly
   forbids. The fix re-anchors the player a safe margin left of the nearest
   new spawn on every encounter transition. Confirmed before/after directly
   against live game state (not just the screen): before the fix, selecting
   an upgrade left the player and an enemy at the same x position; after,
   the player lands 320 units clear of the nearest spawn, still at full
   health.
   [`c68a119`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/c68a119)

5. **Two deliberate departures from the brief's small-scope framing, both
   asked for directly rather than assumed.** The original level was a
   single flat room, which read as too plain once played end-to-end. The
   first pass added gaps, tiers, moving platforms, and hazards built on the
   game's own jump-physics numbers (max plain-jump height ≈131px, checked
   against each gap/rise), verified with a frame-accurate browser trace of
   Level 0's 140px gap clearing and Level 2's 240px gap correctly failing.
   [`32ead79`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/32ead79)

   The second pass went further: rather than a linear vertically-winding
   path, each level (except the tutorial and the boss floor, deliberately
   left alone) became a real branching, backtrackable layout --- a fork, a
   dead-end detour, and a route that reconnects, with a genuine vertical
   camera follow (`camera.y`, `src/game/run.ts`) replacing the old hardcoded
   `y: 0`. This needed real engine changes, not just new level data:
   `findLanding` already generalized to any `y`, but enemy aggro/attack
   range was x-only (`Math.abs`) and had to become 2D (`Math.hypot`,
   `src/game/enemies.ts`) so an enemy one platform up couldn't falsely
   telegraph at a player it can't reach, and the old ground-relative
   `safeEncounterStartX`/`snapToGround` spawn logic (which assumed every
   entry point sat on flat ground) was replaced with an explicit
   `entryX`/`entryY` per level so a level can now open onto a mid-air
   platform (Level 3's entrance shaft starts at `y: -260`).
   [`fdbbc9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/fdbbc9b)

   Both moves are explicitly stylistically inspired by Dead Cells-style
   verticality (shown as a reference during the crit conversation), not a
   copy of any specific level layout, sprite, or asset --- every number
   above (platform positions, gap widths, wall rects) is original and
   derived from this game's own physics constants, and every visual is
   still Canvas 2D primitives with nothing external to licence. Flagging
   both here rather than presenting the bigger scope as if it were the
   original plan.

   A third departure followed the same pattern: once the levels were
   branching and backtrackable, seeing the whole layout on screen from the
   first frame made that structure pointless, so exploration itself became
   part of the design --- a fog-of-war minimap in the bottom-right corner
   that reveals a level's terrain only as the wanderer actually walks
   through it. `src/game/fog.ts` keeps a coarse per-level grid, marked
   "seen" in a radius around the player each frame
   (mutated in place, the same convention `combat.ts` already uses for
   `hitEnemiesThisDash`, rather than copying a whole grid every tick), and
   reset to fully unrevealed on every new level. `render.ts`'s new
   `drawMinimap` draws revealed terrain, revealed open air, and unrevealed
   fog as three distinct tones inside a fixed HUD panel, plus a player dot
   and a dashed outline of the current camera viewport. This is spatial
   feedback, not instructional text, so it stays inside the no-tutorial
   constraint; it adds no image assets, only Canvas 2D primitives.
   [`d6718ba`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/d6718ba)

   A fourth ask followed, this time density rather than a new system: bigger,
   harder levels with more enemies. Unlike the three moves above, this adds
   no new mechanic --- it's tuning within what already exists.
   `spawnEncounter` in `src/game/run.ts` instantiates a level's whole
   `spawns` array at once, so "more enemies" is purely more entries in
   `LevelDef.spawns` (`src/game/level.ts`); two new hazards are placed the
   same way, sitting on top of an existing platform using the hazard-damage
   rect's own convention (`hazard.y` is the surface, extending upward by
   `hazard.height`, read directly from `src/game/run.ts`'s hazard-damage
   block before placing either one). Enemy count goes from 6 to 11 across the
   run and hazards from 1 to 3, but `enemies.ts`'s `TEMPLATES` stats are
   untouched --- density is a safer difficulty lever than rebalancing numbers
   already covered by `spec/level.test.ts`'s patrol-clamp and aggro tests,
   and it left every existing fixture in that file (the exact gap/platform
   coordinates `findLanding`'s tests depend on) valid with no changes, since
   nothing but spawns and hazards was added. The one deliberate design check
   was Level 3's new second-front sentinel on platform R3: because
   `updateEnemy` never changes an enemy's `y` outside its own platform, it
   can only threaten a player who climbs to R3, not force a simultaneous hit
   with the warden below.
   [`ebcb193`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/ebcb193)

6. **A fifth departure: killing every enemy no longer ends a level by
   itself.** Requested directly, changing the actual win condition rather
   than tuning data: every enemy dead now only unlocks an exit somewhere in
   the level, which the player still has to walk or dash to before the
   encounter clears. This reused `"cleared"`, a value already declared on
   `RunPhase` in `src/game/types.ts` but never actually set or read anywhere
   --- exactly the "enemies down, not yet at the exit" state this needed, so
   no new phase or branch had to be added to the phase machine in
   `src/game/run.ts`; `"cleared"` simply falls through into the same
   simulation body `"encounter"` already used. Each level's exit is an
   anchor point (`exitX`/`exitY` on `LevelDef`, `src/game/level.ts`) the same
   way `entryX`/`entryY` already worked, turned into a hitbox on demand by a
   new `exitRect()` reusing the existing `rectsOverlap` check from
   `combat.ts`. The exit always renders (`drawExit`, `src/game/render.ts`)
   as a dim archway while any enemy survives and a pulsing, glowing one once
   cleared, reusing the dash-cooldown ring's existing "ready" teal rather
   than inventing a new colour --- the state change is the only "you can
   leave now" signal, consistent with the no-tutorial-text constraint.
   [`73dc001`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-TaveWang/commit/73dc001)

## What I verified before shipping

- `pnpm check` (typecheck, build, lint, spec + unit tests): green, 25/25
  tests passing across 3 files.
- `pnpm build` produces a working `dist/`; served locally with
  `astro preview` and driven with `agent-browser` rather than just read.
- Played a full encounter loop end-to-end in the browser: title screen to
  first action, dash-slash landing exactly one hit per enemy per dash,
  enemy death, the upgrade overlay (two icon cards, no text), an upgrade
  applying its stat change, and the next encounter starting safely.
- Checked both marking viewports (1920x1080 and 390x844): movement, jump,
  dash, and the HUD all render and respond correctly at both; the phone
  viewport necessarily shows less horizontal lookahead before an
  approaching enemy comes into view (narrower canvas, same logical height),
  but every enemy attack is still fully telegraphed within view before it
  can land at either viewport, so the fairness guarantee holds at both.
- After the branching-map rework, walked every fork, dead-end, and climb in
  all three reworked levels (junction ledges, zigzag rungs, both vertical
  elevators, the Level 3 entrance shaft) at both marking viewports, using a
  temporary debug hook in `GameCanvas.tsx` (added and then fully removed,
  same as the earlier spawn-safety investigation) to confirm the player
  settles correctly on every platform rather than falling through. Every
  waypoint held; the vertical camera clamp tracks without jitter at both
  viewports; the Level 3 shaft correctly opens at `y: -260` rather than
  dropping straight onto the boss floor.
- After adding the fog-of-war minimap, played it live with `agent-browser`
  at both marking viewports: the panel sits bottom-right without
  overlapping the health pips or dash-cooldown ring at either size, fog
  clears in a widening strip as the player walks (confirmed the revealed
  area growing across three successive screenshots), the gold player dot
  and dashed camera outline track correctly, and the panel stays legible
  rather than illegibly tiny on the 390x844 phone viewport. Also confirmed
  a full run restart (defeat, walking into a level-0 pit) returns to the
  title screen with the minimap hidden, and a fresh run starts with the
  map fully fogged again.
- After adding the extra spawns and hazards, `pnpm check` stayed green with
  no test changes needed (54/54, up from 25 as the suite has grown across
  every pass above) --- the existing generic `describe("level structure")`
  block already validates every spawn/patrol range against real ground, so
  green there is real evidence the new data is well-formed, not just that it
  parses. Live in the browser at 1920x1080: scripted a dash across Level 0's
  entry gap and confirmed the new second drifter renders on the far ground
  segment exactly where placed, then walked straight into its aggro range
  without reacting and confirmed its attack telegraphs and lands exactly
  like the original enemies' (the run ended in defeat, which is the correct
  outcome for ignoring a telegraph, not a bug). Also confirmed a fresh run
  at the 390x844 phone viewport renders the HUD and minimap correctly with
  the added level data. I did not live-playtest every new spawn and hazard
  on Levels 1-3 individually in this pass; I'm relying on the structural
  tests above plus the hazard-rect math read directly from `run.ts` (each
  new hazard placed on top of a named platform with clearance on both sides,
  the same way the one pre-existing hazard already sits on Level 2) --- the
  same reduced-live-coverage tradeoff already named honestly below for the
  later encounters.

## Known limitations / left for the marked run

- I played through the first encounter and upgrade screen thoroughly, and
  spot-checked the later encounters' spawn definitions and enemy stats
  (`src/game/enemies.ts`, `src/game/run.ts`) by inspection rather than
  playing every encounter to the boss and the victory screen in this
  session. The automated tests and the fixed encounter-transition bug
  above give me confidence in the shared mechanics, but I'd still recommend
  a full run-through before the crit.
- No accessibility or performance instrumentation beyond what `CLAUDE.md`
  already flags as out of scope for this template.
- All visuals and sounds are original, programmatically drawn (Canvas 2D
  primitives) or synthesised (Web Audio) --- there are no external assets
  and nothing to licence.
