// Level geometry: each encounter now plays out on its own multi-tier layout
// instead of one shared flat room. Ground segments (with gaps between them),
// static platforms, moving platforms and hazards are all plain data, so a
// level's shape --- and whether every spawn actually sits on real ground ---
// can be checked in `spec/level.test.ts` without touching the canvas.
import type { EnemyKind, Vec2 } from "./types";

export interface GroundSegment {
  x: number;
  width: number;
  y: number;
}

export interface StaticPlatform {
  x: number;
  width: number;
  y: number;
}

export interface MovingPlatform {
  id: string;
  width: number;
  baseX: number;
  amplitudeX: number;
  baseY: number;
  amplitudeY: number;
  period: number;
  phase: number;
}

export interface Hazard {
  x: number;
  width: number;
  height: number;
  y: number;
}

export interface LevelSpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  patrolMinX: number;
  patrolMaxX: number;
}

export interface LevelDef {
  name: string;
  arenaWidth: number;
  killPlaneY: number;
  groundSegments: GroundSegment[];
  platforms: StaticPlatform[];
  movingPlatforms: MovingPlatform[];
  hazards: Hazard[];
  spawns: LevelSpawn[];
}

const GROUND_Y = 420;
const KILL_PLANE_Y = 560;

export const LEVELS: LevelDef[] = [
  {
    name: "Threshold",
    arenaWidth: 1400,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [
      { x: 0, width: 760, y: GROUND_Y },
      { x: 900, width: 500, y: GROUND_Y },
    ],
    platforms: [{ x: 260, width: 160, y: 330 }],
    movingPlatforms: [],
    hazards: [],
    spawns: [{ kind: "drifter", x: 560, y: GROUND_Y, patrolMinX: 460, patrolMaxX: 680 }],
  },
  {
    name: "Two Tiers",
    arenaWidth: 1800,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [
      { x: 0, width: 600, y: GROUND_Y },
      { x: 740, width: 1060, y: GROUND_Y },
    ],
    platforms: [
      { x: 800, width: 220, y: 330 },
      { x: 860, width: 200, y: 210 },
    ],
    movingPlatforms: [],
    hazards: [],
    spawns: [
      { kind: "drifter", x: 1300, y: GROUND_Y, patrolMinX: 1180, patrolMaxX: 1420 },
      { kind: "drifter", x: 940, y: 210, patrolMinX: 880, patrolMaxX: 1020 },
    ],
  },
  {
    name: "Sentinel's Approach",
    arenaWidth: 2200,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [
      { x: 0, width: 700, y: GROUND_Y },
      { x: 940, width: 1260, y: GROUND_Y },
    ],
    platforms: [{ x: 1050, width: 180, y: 330 }],
    movingPlatforms: [
      {
        id: "mp1",
        width: 100,
        baseX: 800,
        amplitudeX: 110,
        baseY: GROUND_Y,
        amplitudeY: 0,
        period: 3.4,
        phase: 0,
      },
    ],
    hazards: [{ x: 1550, width: 60, height: 24, y: GROUND_Y }],
    spawns: [
      { kind: "sentinel", x: 1300, y: GROUND_Y, patrolMinX: 1150, patrolMaxX: 1500 },
      { kind: "drifter", x: 1800, y: GROUND_Y, patrolMinX: 1700, patrolMaxX: 1950 },
    ],
  },
  {
    name: "The Warden's Hall",
    arenaWidth: 2600,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [{ x: 0, width: 2600, y: GROUND_Y }],
    platforms: [
      { x: 1700, width: 220, y: 330 },
      { x: 2100, width: 220, y: 330 },
    ],
    movingPlatforms: [
      {
        id: "mp2",
        width: 110,
        baseX: 1900,
        amplitudeX: 0,
        amplitudeY: 60,
        baseY: 300,
        period: 3.4,
        phase: 0,
      },
    ],
    hazards: [],
    spawns: [{ kind: "warden", x: 1900, y: GROUND_Y, patrolMinX: 1900, patrolMaxX: 1900 }],
  },
];

export function movingPlatformPositionAt(mp: MovingPlatform, time: number): Vec2 {
  const angle = (time / mp.period) * Math.PI * 2 + mp.phase;
  return {
    x: mp.baseX + Math.sin(angle) * mp.amplitudeX,
    y: mp.baseY + Math.sin(angle) * mp.amplitudeY,
  };
}

export interface ResolvedMovingPlatform {
  id: string;
  x: number;
  width: number;
  y: number;
}

export interface ResolvedSurfaces {
  ground: GroundSegment[];
  platforms: StaticPlatform[];
  movingPlatforms: ResolvedMovingPlatform[];
}

export function resolveSurfaces(level: LevelDef, time: number): ResolvedSurfaces {
  return {
    ground: level.groundSegments,
    platforms: level.platforms,
    movingPlatforms: level.movingPlatforms.map((mp) => {
      const p = movingPlatformPositionAt(mp, time);
      return { id: mp.id, x: p.x, width: mp.width, y: p.y };
    }),
  };
}

export interface GroundContact {
  y: number;
  platformId: string | null;
}

// One-way landing: a surface only catches the player when it was on the far
// side of `prevY` and is on or past the near side of `nextY`. This has to be
// an *inclusive* interval (not a strict `vel.y > 0` check) because dashing
// pins `pos.y` to a fixed value every frame --- `prevY === nextY` while
// dashing in place on a platform --- and a strict test would drop the player
// through on every frame like that.
export function findLanding(
  surfaces: ResolvedSurfaces,
  playerX: number,
  playerHalfWidth: number,
  prevY: number,
  nextY: number,
): GroundContact | null {
  const inRange = (segX: number, segW: number): boolean =>
    playerX + playerHalfWidth > segX && playerX - playerHalfWidth < segX + segW;

  const candidates: GroundContact[] = [];
  const consider = (segX: number, segW: number, segY: number, platformId: string | null): void => {
    if (inRange(segX, segW) && prevY <= segY && nextY >= segY) {
      candidates.push({ y: segY, platformId });
    }
  };

  for (const g of surfaces.ground) consider(g.x, g.width, g.y, null);
  for (const p of surfaces.platforms) consider(p.x, p.width, p.y, null);
  for (const mp of surfaces.movingPlatforms) consider(mp.x, mp.width, mp.y, mp.id);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.y - b.y);
  return candidates[0];
}

// Any candidate x that isn't over real ground is pulled to the nearest real
// ground edge --- used when re-anchoring the player at an encounter
// transition, since a naive x can otherwise land over a gap.
export function snapToGround(level: LevelDef, x: number): number {
  for (const g of level.groundSegments) {
    if (x >= g.x && x <= g.x + g.width) return x;
  }
  let best = level.groundSegments[0].x + 40;
  let bestDist = Infinity;
  for (const g of level.groundSegments) {
    for (const candidate of [g.x + 40, g.x + g.width - 40]) {
      const d = Math.abs(candidate - x);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
  }
  return best;
}
