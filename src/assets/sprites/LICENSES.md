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

## Hit/impact effects — `effects/`

**Particle Pack** by Kenney <https://kenney.nl/assets/particle-pack> — CC0
(the pack's own licence table says so explicitly). These ship uncoloured and
are tinted in code (`drawTintedSprite` in `src/game/sprites.ts`) to match this
game's palette rather than used at their native grey/white.

- `effects/slash.png` ← `slash_02.png` (dash-slash hit effect)
- `effects/smoke.png` ← `smoke_05.png` (enemy-death dissolve)
- `effects/spark.png` ← `spark_03.png` (generic particle sprite)
