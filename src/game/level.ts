// Level geometry: each encounter now plays out on its own multi-tier, often
// branching layout instead of one shared flat room. Ground segments (with
// gaps between them), static platforms, moving platforms, hazards and
// decorative walls are all plain data, so a level's shape --- and whether
// every spawn and entry point actually sits on real ground --- can be checked
// in `spec/level.test.ts` without touching the canvas.
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

export interface WallRect {
  x: number;
  width: number;
  y: number;
  height: number;
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
  worldTop: number;
  worldBottom: number;
  entryX: number;
  entryY: number;
  killPlaneY: number;
  groundSegments: GroundSegment[];
  platforms: StaticPlatform[];
  movingPlatforms: MovingPlatform[];
  hazards: Hazard[];
  walls: WallRect[];
  spawns: LevelSpawn[];
}

const GROUND_Y = 420;
const KILL_PLANE_Y = 560;

export const LEVELS: LevelDef[] = [
  {
    name: "Threshold",
    arenaWidth: 1400,
    worldTop: 0,
    worldBottom: 540,
    entryX: 140,
    entryY: GROUND_Y,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [
      { x: 0, width: 760, y: GROUND_Y },
      { x: 900, width: 500, y: GROUND_Y },
    ],
    platforms: [{ x: 260, width: 160, y: 330 }],
    movingPlatforms: [],
    hazards: [],
    walls: [],
    spawns: [
      { kind: "drifter", x: 560, y: GROUND_Y, patrolMinX: 460, patrolMaxX: 680 },
      { kind: "drifter", x: 1150, y: GROUND_Y, patrolMinX: 1000, patrolMaxX: 1300 },
    ],
  },
  {
    // "Two Tiers" -> descending fork + dead-end: past the entry gap, a
    // floating junction ledge (J0) offers an optional dead-end alcove above,
    // or a zigzag staircase / elevator fork descending into a bottom
    // corridor where the level ends.
    name: "Two Tiers",
    arenaWidth: 1300,
    worldTop: 170,
    worldBottom: 1120,
    entryX: 100,
    entryY: GROUND_Y,
    killPlaneY: 1070,
    groundSegments: [
      { x: 0, width: 600, y: GROUND_Y }, // entry
      { x: 700, width: 500, y: 920 }, // bottom corridor
    ],
    platforms: [
      { x: 740, width: 200, y: GROUND_Y }, // J0 -- junction ledge past the gap
      { x: 1000, width: 180, y: 330 }, // dead-end alcove (enemy-free)
      { x: 660, width: 180, y: 520 }, // L1
      { x: 850, width: 180, y: 620 }, // L2
      { x: 660, width: 180, y: 720 }, // L3
      { x: 850, width: 180, y: 820 }, // L4
    ],
    movingPlatforms: [
      {
        id: "mp_shaft1",
        width: 140,
        baseX: 1060,
        amplitudeX: 0,
        baseY: 680,
        amplitudeY: 220,
        period: 4.2,
        phase: 0,
      },
    ],
    hazards: [{ x: 900, width: 40, height: 16, y: 620 }], // spike on the L2 rung, forces a timed hop
    walls: [
      { x: 560, width: 50, y: 380, height: 600 }, // left frame
      { x: 1230, width: 50, y: 380, height: 600 }, // right frame
      { x: 1200, width: 50, y: 200, height: 220 }, // dead-end cap
    ],
    spawns: [
      { kind: "drifter", x: 840, y: GROUND_Y, patrolMinX: 760, patrolMaxX: 920 }, // on J0, pre-fork
      { kind: "drifter", x: 900, y: 920, patrolMinX: 780, patrolMaxX: 980 }, // on corridor, post-reconnect
      { kind: "drifter", x: 1080, y: 330, patrolMinX: 1030, patrolMaxX: 1150 }, // guarding the dead-end alcove
    ],
  },
  {
    // "Sentinel's Approach" -> unchanged gated gap + mp1 shuttle, then a
    // climb fork (zigzag staircase vs vertical elevator) reconnecting on a
    // high corridor, with a dead-end spur off its far end.
    name: "Sentinel's Approach",
    arenaWidth: 2150,
    worldTop: -640,
    worldBottom: 600,
    entryX: 100,
    entryY: GROUND_Y,
    killPlaneY: 570,
    groundSegments: [
      { x: 0, width: 700, y: GROUND_Y }, // pre-gap, unchanged
      { x: 940, width: 1060, y: GROUND_Y }, // G1, safety net under the whole climb
      { x: 1250, width: 650, y: -460 }, // high corridor
    ],
    platforms: [
      { x: 1050, width: 180, y: 330 }, // unchanged pre-climb bonus platform
      { x: 1310, width: 180, y: 310 }, // A1
      { x: 1530, width: 180, y: 200 }, // A2
      { x: 1310, width: 180, y: 90 }, // A3
      { x: 1530, width: 180, y: -20 }, // A4
      { x: 1310, width: 180, y: -130 }, // A5
      { x: 1530, width: 180, y: -240 }, // A6
      { x: 1310, width: 180, y: -350 }, // A7
      { x: 2000, width: 120, y: -460 }, // dead-end spur off the corridor
    ],
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
      {
        id: "mp_tower1",
        width: 140,
        baseX: 1900,
        amplitudeX: 0,
        baseY: -20,
        amplitudeY: 440,
        period: 4.6,
        phase: 0,
      },
    ],
    hazards: [
      { x: 1240, width: 60, height: 24, y: GROUND_Y },
      { x: 2040, width: 30, height: 14, y: -460 }, // spike on the dead-end spur
    ],
    walls: [
      { x: 1260, width: 30, y: -500, height: 980 }, // left frame, staircase side
      { x: 1730, width: 30, y: -500, height: 980 }, // divider between staircase and elevator
      { x: 2140, width: 30, y: -500, height: 980 }, // right frame
      { x: 1200, width: 750, y: -660, height: 40 }, // top cap
    ],
    spawns: [
      { kind: "sentinel", x: 1450, y: -460, patrolMinX: 1320, patrolMaxX: 1650 },
      { kind: "drifter", x: 1700, y: -460, patrolMinX: 1600, patrolMaxX: 1800 },
      { kind: "drifter", x: 1140, y: 330, patrolMinX: 1070, patrolMaxX: 1210 }, // guarding the pre-climb bonus platform
      { kind: "drifter", x: 1900, y: GROUND_Y, patrolMinX: 1830, patrolMaxX: 1970 }, // guarding the elevator's boarding point
    ],
  },
  {
    // "The Warden's Hall" (boss) -> unchanged flat boss floor, its two
    // symmetric platforms, and mp2, gain only a short entrance shaft the
    // player descends through on arrival. Deliberately the one level that
    // stays one-way -- a boss arena is not the place for exploration.
    name: "The Warden's Hall",
    arenaWidth: 2600,
    worldTop: -420,
    worldBottom: 620,
    entryX: 1900,
    entryY: -260,
    killPlaneY: KILL_PLANE_Y,
    groundSegments: [{ x: 0, width: 2600, y: GROUND_Y }],
    platforms: [
      { x: 1700, width: 220, y: 330 },
      { x: 2100, width: 220, y: 330 },
      { x: 1810, width: 180, y: -260 }, // R1 -- arrival ledge
      { x: 1620, width: 160, y: -60 }, // R2
      { x: 1870, width: 160, y: 140 }, // R3
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
    walls: [
      { x: 1560, width: 40, y: -300, height: 760 },
      { x: 2060, width: 40, y: -300, height: 760 },
    ],
    spawns: [
      { kind: "warden", x: 1900, y: GROUND_Y, patrolMinX: 1900, patrolMaxX: 1900 },
      { kind: "sentinel", x: 1950, y: 140, patrolMinX: 1890, patrolMaxX: 2010 }, // second front, up on R3
    ],
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
