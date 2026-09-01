# Sprite sources

All art in this directory is CC0 (public domain) — no attribution required,
but recorded here for honesty and so the choice can be checked. Sourced during
the "sprite/tileset pass" escalation; see `PROCESS.md` for the commit.

## Hero — `hero/`

**"Platformer Explorer Assets"** by isabellap
<https://isabellap.itch.io/platformer-explorer> — CC0, tagged "No AI"
(hand-drawn). Two colour variants ship in the download; the darker/plain one
was used to fit this game's palette.

- `idle.png`, `run.png`, `jump.png`, `hit.png`, `attack.png` ← the sheet's
  `Idle.png` / `Run.png` / `Jump.png` / `Hit.png` / `Attack.png`.
- The `Archer.png` (bow) animation was downloaded but not used.
- The character's own design — a shadowed face under a wide brim, only the
  eyes visible — already reads as a masked wanderer, so no separate hood
  overlay was added on top of it.

## Enemies and tiles — `enemies/`, `tiles/`

**"Dungeon Pack"** by freegamesprites
<https://freegamesprites.itch.io/dungeon-pack> — CC0 ("Public domain —
commercial use fine, no credit needed"). The page discloses this pack's
graphics are AI-assisted, noted here for the same reason the source itself
states it.

- `enemies/drifter.png` ← `dungeon-rat.png`
- `enemies/sentinel.png` ← `armored-skeleton-captain.png`
- `enemies/warden.png` ← `chain-warden.png`
- `tiles/ground.png` ← `dungeon-stone-floor-32.png`
- `tiles/platform.png` ← `dungeon-cracked-floor-32.png`
- `tiles/exit.png` ← `dungeon-arch-passage.png`

`dungeon-stone-wall.png` was also downloaded for the decorative wall rects,
but turned out to be a single non-tileable brick-pile graphic rather than a
seamless tile like the floor/platform textures --- repeating it as a Canvas
pattern along the tall, narrow wall rects produced a visibly seamed stack of
disjoint chunks instead of a wall. Dropped; walls stay a flat colour fill.

`enemies/wisp.png` ← `evil-eye-floating-enemy-sprite.png`, for the new
ranged-attack enemy (a floating eye that hangs back and fires bolts, in place
of a procedural shape --- confirmed with the student that the ranged enemy
should use real art in the existing style).

## Weapon pickups — `weapons/`

**"Free 16x16 Weapon RPG Icons"** by Shade
<https://merchant-shade.itch.io/free-16x16-weapon-rpg-icons> — CC0 ("Feel
free to use this for your game (commercially or not) ... No need to give me
credit"). Ships as four material-tier sheets (bronze/iron/steel/gold); the
gold-tier icons were used to match this game's existing warm accent colour
(`playerCore`/`health` in `render.ts`'s palette).

- `weapons/broadsword.png` ← the sword icon, gold tier
- `weapons/dagger.png` ← the alt dagger icon, gold tier
- `weapons/spear.png` ← the spear icon, gold tier (row 0, column 16 of the
  sheet)

The three ranged weapons come from **"Idylwild's Arsenal"** by Idylwild
<https://opengameart.org/content/idylwilds-arsenal> — CC0, hand-pixelled at
32×32 with no generative AI. The individual transparent icons were used
without modification:

- `weapons/throwing-knives.png` ← `throwing_knife1.png`
- `weapons/shortbow.png` ← `bow1.png`
- `weapons/crossbow.png` ← `crossbow2.png`

Together these six files cover every entry in `WEAPON_POOL`; the procedural
triangle/diamond is now only a first-frame loading fallback, never a missing-
asset substitute.

## Hit/impact effects — `effects/`

**Particle Pack** by Kenney <https://kenney.nl/assets/particle-pack> — CC0
(the pack's own licence table says so explicitly). These ship uncoloured and
are tinted in code (`drawTintedSprite` in `src/game/sprites.ts`) to match this
game's palette rather than used at their native grey/white.

- `effects/slash.png` ← `slash_02.png` (dash-slash hit effect)
- `effects/smoke.png` ← `smoke_05.png` (enemy-death dissolve)
- `effects/spark.png` ← `spark_03.png` (generic particle sprite)
