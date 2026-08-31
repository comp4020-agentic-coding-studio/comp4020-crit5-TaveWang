import { describe, expect, it } from "vitest";
import {
  LEVELS,
  findLanding,
  movingPlatformPositionAt,
  resolveSurfaces,
  snapToGround,
  type MovingPlatform,
} from "../src/game/level";
import { spawnEnemy, updateEnemy } from "../src/game/enemies";
import { createInitialPlayer, createInitialRun, update } from "../src/game/run";
import type { PlayerState, RunState } from "../src/game/types";

const NO_INPUT = { left: false, right: false, jumpPressed: false, dashPressed: false };

// Level geometry is plain data, and the collision/landing helpers are pure
// functions over it --- exercised here the same way the dash-slash rule is,
// without a canvas.

describe("movingPlatformPositionAt", () => {
  it("is deterministic for the same time", () => {
    const mp: MovingPlatform = {
      id: "mp",
      width: 100,
      baseX: 500,
      amplitudeX: 100,
      baseY: 400,
      amplitudeY: 0,
      period: 4,
      phase: 0,
    };
    expect(movingPlatformPositionAt(mp, 1.23)).toEqual(movingPlatformPositionAt(mp, 1.23));
  });

  it("oscillates around its base position", () => {
    const mp: MovingPlatform = {
      id: "mp",
      width: 100,
      baseX: 500,
      amplitudeX: 100,
      baseY: 400,
      amplitudeY: 0,
      period: 4,
      phase: 0,
    };
    const p0 = movingPlatformPositionAt(mp, 0);
    expect(p0.x).toBe(500);
    const pQuarter = movingPlatformPositionAt(mp, 1);
    expect(pQuarter.x).toBeGreaterThan(500);
  });
});

describe("findLanding", () => {
  const level = LEVELS[1]; // "Two Tiers": has ground, a gap, and platforms

  it("lands when falling onto a platform", () => {
    const surfaces = resolveSurfaces(level, 0);
    const platform = level.platforms[0];
    const landing = findLanding(surfaces, platform.x + platform.width / 2, 14, platform.y - 10, platform.y + 5);
    expect(landing).not.toBeNull();
    expect(landing?.y).toBe(platform.y);
  });

  it("does not land moving upward through a platform", () => {
    const surfaces = resolveSurfaces(level, 0);
    const platform = level.platforms[0];
    const landing = findLanding(surfaces, platform.x + platform.width / 2, 14, platform.y + 5, platform.y - 10);
    expect(landing).toBeNull();
  });

  it("returns null over a gap", () => {
    const surfaces = resolveSurfaces(level, 0);
    // Level 1's gap is 600-740; 670 is squarely inside it, out of range of
    // any ground segment or platform.
    const landing = findLanding(surfaces, 670, 14, 400, 430);
    expect(landing).toBeNull();
  });

  it("picks the highest of several qualifying surfaces", () => {
    const level2 = LEVELS[1];
    const surfaces = resolveSurfaces(level2, 0);
    // x=940 sits under both tier platforms (800-1020 and 860-1060); falling
    // through both should land on the higher one (tier2, y=210).
    const landing = findLanding(surfaces, 940, 14, 0, 500);
    expect(landing?.y).toBe(210);
  });

  it("still lands when prevY === nextY === surfaceY (dashing in place)", () => {
    const surfaces = resolveSurfaces(level, 0);
    const platform = level.platforms[0];
    const x = platform.x + platform.width / 2;
    const landing = findLanding(surfaces, x, 14, platform.y, platform.y);
    expect(landing).not.toBeNull();
    expect(landing?.y).toBe(platform.y);
  });
});

describe("snapToGround", () => {
  it("leaves an x that is already over ground unchanged", () => {
    const level = LEVELS[0];
    expect(snapToGround(level, 200)).toBe(200);
  });

  it("never resolves inside a gap", () => {
    const level = LEVELS[0]; // gap is 760-900
    const snapped = snapToGround(level, 830);
    const insideAGap = level.groundSegments.every((g) => !(snapped > g.x && snapped < g.x + g.width) || (snapped >= g.x && snapped <= g.x + g.width));
    const onRealGround = level.groundSegments.some((g) => snapped >= g.x && snapped <= g.x + g.width);
    expect(onRealGround).toBe(true);
    expect(insideAGap).toBe(true);
  });
});

describe("enemy patrol-bound clamp", () => {
  it("clamps final position to its patrol bounds while idly wandering into aggro", () => {
    let enemy = spawnEnemy("drifter", 500, 420, 460, 540);
    const player: PlayerState = { ...createInitialPlayer(), pos: { x: 545, y: 420 } };
    // Several frames of aggro-chase movement toward a player just past the
    // enemy's own patrol bound --- it should never cross patrolMaxX.
    for (let i = 0; i < 60; i++) {
      enemy = updateEnemy(enemy, player, 1 / 60, true).enemy;
    }
    expect(enemy.pos.x).toBeLessThanOrEqual(540);
  });

  it("clamps final position to its patrol bounds during a committed attack lunge", () => {
    let enemy = spawnEnemy("sentinel", 1150, 420, 1150, 1200);
    enemy = { ...enemy, state: "attack", stateTimer: 0.3 };
    const player: PlayerState = { ...createInitialPlayer(), pos: { x: 1400, y: 420 } };
    for (let i = 0; i < 30; i++) {
      enemy = updateEnemy(enemy, player, 1 / 60, true).enemy;
    }
    expect(enemy.pos.x).toBeLessThanOrEqual(1200);
  });
});

describe("fall-to-defeat", () => {
  it("bypasses hit-invulnerability so a fall while invulnerable still ends the run", () => {
    const level0 = LEVELS[0]; // gap 760-900
    const base = createInitialRun();
    const state: RunState = {
      ...base,
      phase: "encounter",
      enemies: [],
      player: {
        ...createInitialPlayer(),
        pos: { x: 830, y: level0.killPlaneY - 10 }, // over the gap, already near the kill plane
        vel: { x: 0, y: 400 },
        invulnTimer: 0.5, // still invulnerable from a recent hit
      },
    };

    const { state: next } = update(state, 1 / 30, NO_INPUT, 960);

    expect(next.player.health).toBe(0);
  });
});

describe("level structure", () => {
  for (const level of LEVELS) {
    it(`${level.name}: every spawn sits on real ground or a platform`, () => {
      for (const spawn of level.spawns) {
        const onGround = level.groundSegments.some(
          (g) => spawn.y === g.y && spawn.x >= g.x && spawn.x <= g.x + g.width,
        );
        const onPlatform = level.platforms.some(
          (p) => spawn.y === p.y && spawn.x >= p.x && spawn.x <= p.x + p.width,
        );
        expect(onGround || onPlatform).toBe(true);
      }
    });

    it(`${level.name}: every spawn's patrol range stays within its surface's span`, () => {
      for (const spawn of level.spawns) {
        const surface =
          level.groundSegments.find((g) => spawn.y === g.y && spawn.x >= g.x && spawn.x <= g.x + g.width) ??
          level.platforms.find((p) => spawn.y === p.y && spawn.x >= p.x && spawn.x <= p.x + p.width);
        expect(surface).toBeDefined();
        if (!surface) continue;
        expect(spawn.patrolMinX).toBeGreaterThanOrEqual(surface.x);
        expect(spawn.patrolMaxX).toBeLessThanOrEqual(surface.x + surface.width);
      }
    });
  }
});
