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
