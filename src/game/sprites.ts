// CC0-licensed sprite assets, loaded once and drawn with plain Canvas 2D
// `drawImage` calls --- no sprite-sheet library, since these are simple
// horizontal frame strips (hero) or single static images (enemies, tiles,
// effects). See src/assets/sprites/LICENSES.md for exactly which file came
// from which source and under what licence.
//
// Imports use the `?url` suffix rather than a plain import: Astro's ambient
// types (node_modules/astro/client.d.ts) resolve a plain `*.png` import to an
// `ImageMetadata` object, not a string, and `Image.src` needs a string.
// `?url` is Astro/Vite's documented escape hatch back to a plain URL string.
import heroIdleUrl from "../assets/sprites/hero/idle.png?url";
import heroRunUrl from "../assets/sprites/hero/run.png?url";
import heroJumpUrl from "../assets/sprites/hero/jump.png?url";
import heroHitUrl from "../assets/sprites/hero/hit.png?url";
import heroAttackUrl from "../assets/sprites/hero/attack.png?url";
import drifterUrl from "../assets/sprites/enemies/drifter.png?url";
import sentinelUrl from "../assets/sprites/enemies/sentinel.png?url";
import wardenUrl from "../assets/sprites/enemies/warden.png?url";
import wispUrl from "../assets/sprites/enemies/wisp.png?url";
import broadswordUrl from "../assets/sprites/weapons/broadsword.png?url";
import daggerUrl from "../assets/sprites/weapons/dagger.png?url";
import spearUrl from "../assets/sprites/weapons/spear.png?url";
import throwingKnivesUrl from "../assets/sprites/weapons/throwing-knives.png?url";
import shortbowUrl from "../assets/sprites/weapons/shortbow.png?url";
import crossbowUrl from "../assets/sprites/weapons/crossbow.png?url";
import groundTileUrl from "../assets/sprites/tiles/ground.png?url";
import platformTileUrl from "../assets/sprites/tiles/platform.png?url";
import exitTileUrl from "../assets/sprites/tiles/exit.png?url";
import slashFxUrl from "../assets/sprites/effects/slash.png?url";
import smokeFxUrl from "../assets/sprites/effects/smoke.png?url";
import sparkFxUrl from "../assets/sprites/effects/spark.png?url";

import { INVULN_DURATION } from "./constants";
import type { EnemyKind, PlayerState, WeaponId } from "./types";

// Astro prerenders the client:load island's module graph in Node at build
// time, where `Image`/DOM don't exist --- this module is imported (and its
// top-level sprite loading runs) during that SSR pass, not just in the
// browser. A stub with `complete: false` satisfies `isReady()` (so nothing
// tries to `drawImage` it) without needing `Image` to exist.
function loadImage(src: string): HTMLImageElement {
  if (typeof Image === "undefined") {
    return { complete: false, naturalWidth: 0 } as HTMLImageElement;
  }
  const img = new Image();
  img.src = src;
  return img;
}

// True once the browser has actually decoded pixels --- guards every
// `drawImage` call so a not-yet-loaded frame draws nothing instead of
// throwing (a zero-size source rect is a hard `drawImage` error, not a no-op).
export function isReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return !!image && image.complete && image.naturalWidth > 0;
}

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameDuration: number;
}

function sheet(
  url: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  frameDuration: number,
): SpriteSheet {
  return { image: loadImage(url), frameWidth, frameHeight, frameCount, frameDuration };
}

// Frame geometry from isabellap's "Platformer Explorer Assets" sheets: every
// animation is a fixed 24px-wide strip, 28px or 32px tall depending on pose.
export const HERO_SHEETS = {
  idle: sheet(heroIdleUrl, 24, 28, 4, 0.16),
  run: sheet(heroRunUrl, 24, 32, 4, 0.09),
  jump: sheet(heroJumpUrl, 24, 32, 5, 0.09),
  hit: sheet(heroHitUrl, 24, 28, 7, 0.05),
  attack: sheet(heroAttackUrl, 24, 28, 5, 0.045),
};

export type HeroAnimName = keyof typeof HERO_SHEETS;

export const ENEMY_SPRITES: Record<EnemyKind, HTMLImageElement> = {
  drifter: loadImage(drifterUrl),
  sentinel: loadImage(sentinelUrl),
  warden: loadImage(wardenUrl),
  wisp: loadImage(wispUrl),
};

export const WEAPON_SPRITE_URLS: Record<WeaponId, string> = {
  dagger: daggerUrl,
  broadsword: broadswordUrl,
  spear: spearUrl,
  throwingKnives: throwingKnivesUrl,
  shortbow: shortbowUrl,
  crossbow: crossbowUrl,
};

// Every weapon has real CC0 art. Keeping this as a total Record means a newly
// added weapon cannot silently fall back to a generic shape without causing a
// type error here.
export const WEAPON_SPRITES: Record<WeaponId, HTMLImageElement> = Object.fromEntries(
  Object.entries(WEAPON_SPRITE_URLS).map(([id, url]) => [id, loadImage(url)]),
) as Record<WeaponId, HTMLImageElement>;

export const TILE_SPRITES = {
  ground: loadImage(groundTileUrl),
  platform: loadImage(platformTileUrl),
  exit: loadImage(exitTileUrl),
};

export const FX_SPRITES = {
  slash: loadImage(slashFxUrl),
  smoke: loadImage(smokeFxUrl),
  spark: loadImage(sparkFxUrl),
};

// `loop: false` clamps to the last frame instead of wrapping, for
// animations that play once over a known window (a hit, a dash-slash) rather
// than cycling forever (idle, run, jump).
export function frameIndexAt(def: SpriteSheet, elapsed: number, loop: boolean): number {
  const raw = Math.floor(Math.max(0, elapsed) / def.frameDuration);
  return loop ? raw % def.frameCount : Math.min(raw, def.frameCount - 1);
}

export interface HeroFrame {
  sheet: SpriteSheet;
  index: number;
}

// Which hero animation to show and which frame of it, derived entirely from
// existing PlayerState fields --- there's no separate "animation timer" to
// keep in sync, so a just-landed hit or an active dash always lines up with
// the frame that started it.
export function pickHeroFrame(player: PlayerState, time: number): HeroFrame {
  if (player.invulnTimer > INVULN_DURATION - 0.35) {
    const elapsed = INVULN_DURATION - player.invulnTimer;
    return { sheet: HERO_SHEETS.hit, index: frameIndexAt(HERO_SHEETS.hit, elapsed, false) };
  }
  if (player.dash.active) {
    const elapsed = player.stats.dashDuration - player.dash.timer;
    return { sheet: HERO_SHEETS.attack, index: frameIndexAt(HERO_SHEETS.attack, elapsed, false) };
  }
  if (!player.onGround) {
    return { sheet: HERO_SHEETS.jump, index: frameIndexAt(HERO_SHEETS.jump, time, true) };
  }
  if (Math.abs(player.vel.x) > 10) {
    return { sheet: HERO_SHEETS.run, index: frameIndexAt(HERO_SHEETS.run, time, true) };
  }
  return { sheet: HERO_SHEETS.idle, index: frameIndexAt(HERO_SHEETS.idle, time, true) };
}

// Canvas has no flip flag on drawImage, so a leftward-facing frame is drawn
// by translating to the destination's right edge and scaling x by -1.
export function drawSheetFrame(
  ctx: CanvasRenderingContext2D,
  frame: HeroFrame,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  flip: boolean,
): void {
  const { sheet: def, index } = frame;
  if (!isReady(def.image)) return;
  const sx = index * def.frameWidth;
  ctx.save();
  if (flip) {
    ctx.translate(destX + destW, destY);
    ctx.scale(-1, 1);
    ctx.drawImage(def.image, sx, 0, def.frameWidth, def.frameHeight, 0, 0, destW, destH);
  } else {
    ctx.drawImage(def.image, sx, 0, def.frameWidth, def.frameHeight, destX, destY, destW, destH);
  }
  ctx.restore();
}

export function drawStaticSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  flip: boolean,
): void {
  if (!isReady(image)) return;
  ctx.save();
  if (flip) {
    ctx.translate(destX + destW, destY);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, destW, destH);
  } else {
    ctx.drawImage(image, destX, destY, destW, destH);
  }
  ctx.restore();
}

// Recolours a greyscale/white effect sprite (Kenney's particle pack ships
// them uncoloured, meant to be tinted) to a solid palette colour, keeping the
// sprite's own alpha shape --- draw the image, then flood the same rect with
// `source-atop` so the fill only lands where the sprite already had pixels.
export function drawTintedSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  color: string,
  alpha: number,
): void {
  if (!isReady(image)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, destX, destY, destW, destH);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(destX, destY, destW, destH);
  ctx.restore();
}

// A repeating tile pattern, cached per image so the same CanvasPattern object
// is reused across frames instead of rebuilt every draw call.
const patternCache = new WeakMap<HTMLImageElement, CanvasPattern | null>();

export function tilePattern(ctx: CanvasRenderingContext2D, image: HTMLImageElement): CanvasPattern | null {
  if (!isReady(image)) return null;
  const cached = patternCache.get(image);
  if (cached !== undefined) return cached;
  const pattern = ctx.createPattern(image, "repeat");
  patternCache.set(image, pattern);
  return pattern ?? null;
}
