// Per-level exploration state for the minimap: a coarse grid over the
// level's world bounds, marked "seen" as the player passes near a cell.
// Kept as plain data + functions, same shape as level.ts, so it can be
// exercised without a canvas.
import type { LevelDef } from "./level";

export const FOG_CELL = 48;
export const REVEAL_RADIUS = 130;

export interface FogState {
  cols: number;
  rows: number;
  worldTop: number;
  revealed: Uint8Array;
}

export function createFogState(level: LevelDef): FogState {
  const cols = Math.ceil(level.arenaWidth / FOG_CELL);
  const rows = Math.ceil((level.worldBottom - level.worldTop) / FOG_CELL);
  return { cols, rows, worldTop: level.worldTop, revealed: new Uint8Array(cols * rows) };
}

// Mutates `fog.revealed` in place --- the same convention already used for
// `hitEnemiesThisDash` in combat.ts, rather than copying a whole grid every
// frame just to keep this one field looking immutable.
export function revealAround(fog: FogState, x: number, y: number): void {
  const cellRadius = Math.ceil(REVEAL_RADIUS / FOG_CELL);
  const centerGx = Math.floor(x / FOG_CELL);
  const centerGy = Math.floor((y - fog.worldTop) / FOG_CELL);

  for (let gy = centerGy - cellRadius; gy <= centerGy + cellRadius; gy++) {
    if (gy < 0 || gy >= fog.rows) continue;
    for (let gx = centerGx - cellRadius; gx <= centerGx + cellRadius; gx++) {
      if (gx < 0 || gx >= fog.cols) continue;
      const cellCx = gx * FOG_CELL + FOG_CELL / 2;
      const cellCy = fog.worldTop + gy * FOG_CELL + FOG_CELL / 2;
      if (Math.hypot(cellCx - x, cellCy - y) <= REVEAL_RADIUS) {
        fog.revealed[gy * fog.cols + gx] = 1;
      }
    }
  }
}

export function isRevealed(fog: FogState, gx: number, gy: number): boolean {
  if (gx < 0 || gx >= fog.cols || gy < 0 || gy >= fog.rows) return false;
  return fog.revealed[gy * fog.cols + gx] === 1;
}

const terrainCache = new WeakMap<LevelDef, Uint8Array>();

// Which cells overlap real ground/platform surface, for the minimap's "seen
// terrain vs. seen open air" distinction. Moving platforms are excluded ---
// their position isn't fixed, so a static minimap mark would mislead.
// Memoized per level since it never changes after the level is defined.
export function terrainGridFor(level: LevelDef): Uint8Array {
  const cached = terrainCache.get(level);
  if (cached) return cached;

  const cols = Math.ceil(level.arenaWidth / FOG_CELL);
  const rows = Math.ceil((level.worldBottom - level.worldTop) / FOG_CELL);
  const grid = new Uint8Array(cols * rows);

  const markSpan = (x: number, width: number, y: number) => {
    const gy = Math.floor((y - level.worldTop) / FOG_CELL);
    if (gy < 0 || gy >= rows) return;
    const gxStart = Math.max(0, Math.floor(x / FOG_CELL));
    const gxEnd = Math.min(cols - 1, Math.floor((x + width) / FOG_CELL));
    for (let gx = gxStart; gx <= gxEnd; gx++) grid[gy * cols + gx] = 1;
  };

  for (const g of level.groundSegments) markSpan(g.x, g.width, g.y);
  for (const p of level.platforms) markSpan(p.x, p.width, p.y);

  terrainCache.set(level, grid);
  return grid;
}
