import { describe, expect, it } from "vitest";
import { GROUND_Y } from "../src/game/constants";
import { LEVELS, findLanding, movingPlatformPositionAt, resolveSurfaces, type MovingPlatform } from "../src/game/level";
import { spawnEnemy, updateEnemy } from "../src/game/enemies";
import { createInitialPlayer, createInitialRun, update } from "../src/game/run";
import type { PlayerState, RunState } from "../src/game/types";

const NO_INPUT = {
  left: false,
  right: false,
  jumpPressed: false,
  jumpHeld: false,
  dashPressed: false,
  meleeAttackPressed: false,
  rangedAttackPressed: false,
};

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
    // x=700 sits under L1 (660-840, y=520), L3 (660-840, y=720), and the
    // bottom corridor ground (700-1200, y=920); falling through all three
    // should land on the highest, L1 (y=520).
    const landing = findLanding(surfaces, 700, 14, 0, 1000);
    expect(landing?.y).toBe(520);
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

  it("during a committed attack lunge, crosses the tight patrol bound but stays within the wider aggro leash", () => {
    let enemy = spawnEnemy("sentinel", 1150, 420, 1150, 1200);
    enemy = { ...enemy, state: "attack", stateTimer: 0.3 };
    const player: PlayerState = { ...createInitialPlayer(), pos: { x: 1400, y: 420 } };
    for (let i = 0; i < 30; i++) {
      enemy = updateEnemy(enemy, player, 1 / 60, true).enemy;
    }
    // Once aggro'd, an enemy is allowed to chase past its spawn's tight
    // patrol strip (see the "enemies chase across height tiers" behaviour) --
    // it should cross the old patrolMaxX here, but a 400px leash still caps it.
    expect(enemy.pos.x).toBeGreaterThan(1200);
    expect(enemy.pos.x).toBeLessThanOrEqual(1200 + 400);
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

    it(`${level.name}: entry point sits on real ground or a platform`, () => {
      const onGround = level.groundSegments.some(
        (g) => level.entryY === g.y && level.entryX >= g.x && level.entryX <= g.x + g.width,
      );
      const onPlatform = level.platforms.some(
        (p) => level.entryY === p.y && level.entryX >= p.x && level.entryX <= p.x + p.width,
      );
      expect(onGround || onPlatform).toBe(true);
    });

    it(`${level.name}: exit point sits on real ground or a platform`, () => {
      const onGround = level.groundSegments.some(
        (g) => level.exitY === g.y && level.exitX >= g.x && level.exitX <= g.x + g.width,
      );
      const onPlatform = level.platforms.some(
        (p) => level.exitY === p.y && level.exitX >= p.x && level.exitX <= p.x + p.width,
      );
      expect(onGround || onPlatform).toBe(true);
    });

    it(`${level.name}: every climbable's base connects to real ground or a platform`, () => {
      for (const climbable of level.climbables) {
        const midX = climbable.x + climbable.width / 2;
        const surfaceAt = (y: number) =>
          level.groundSegments.some((g) => y === g.y && midX >= g.x && midX <= g.x + g.width) ||
          level.platforms.some((p) => y === p.y && midX >= p.x && midX <= p.x + p.width);
        expect(surfaceAt(climbable.yBottom)).toBe(true);
      }
    });

  }
});

describe("climbing", () => {
  const level2 = LEVELS[2];
  const climbable = level2.climbables[0];
  const midX = climbable.x + climbable.width / 2;
  const startY = climbable.yTop + (climbable.yBottom - climbable.yTop) / 2;

  function makeClimbState(): RunState {
    return {
      ...createInitialRun(),
      phase: "encounter",
      encounterIndex: 2,
      arenaWidth: level2.arenaWidth,
      enemies: [],
      player: { ...createInitialPlayer(), pos: { x: midX, y: startY }, vel: { x: 0, y: 0 }, onGround: false },
    };
  }

  it("climbs upward while jump is held on a climbable", () => {
    const { state: next } = update(makeClimbState(), 1 / 30, { ...NO_INPUT, jumpHeld: true }, 960);
    expect(next.player.pos.y).toBeLessThan(startY);
  });

  it("slides down slowly on a climbable when jump is not held", () => {
    const { state: next } = update(makeClimbState(), 1 / 30, NO_INPUT, 960);
    const dy = next.player.pos.y - startY;
    expect(dy).toBeGreaterThan(0);
    expect(dy).toBeLessThan(10); // slow slide, not full-gravity free-fall
  });
});

describe("level 2 moving platforms", () => {
  it("no longer includes the un-jumpable mp_tower1 platform", () => {
    const level2 = LEVELS[2];
    expect(level2.movingPlatforms.some((mp) => mp.id === "mp_tower1")).toBe(false);
  });
});

describe("enemy aggro/attack range is 2D", () => {
  it("does not telegraph or attack a player who is horizontally close but far above", () => {
    let enemy = spawnEnemy("sentinel", 500, 420, 400, 600);
    const player: PlayerState = { ...createInitialPlayer(), pos: { x: 520, y: 420 - 400 } };
    for (let i = 0; i < 60; i++) {
      enemy = updateEnemy(enemy, player, 1 / 60, true).enemy;
    }
    expect(enemy.state).not.toBe("telegraph");
    expect(enemy.state).not.toBe("attack");
  });
});

describe("level 3 (Warden's Hall) fall-recovery climbable", () => {
  it("lets the player climb from the ground floor back up to R1's height, so a fall no longer softlocks", () => {
    const level3 = LEVELS[3];
    const climbable = level3.climbables[0];
    const midX = climbable.x + climbable.width / 2;

    let state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      encounterIndex: 3,
      arenaWidth: level3.arenaWidth,
      enemies: [],
      player: { ...createInitialPlayer(), pos: { x: midX, y: GROUND_Y }, vel: { x: 0, y: 0 }, onGround: true },
    };

    for (let i = 0; i < 400; i++) {
      // A single jumpPressed frame leaves the ground (jumpHeld alone never
      // triggers a jump); once airborne and inside the climbable's column,
      // holding jumpHeld climbs it the rest of the way.
      const input = { ...NO_INPUT, jumpPressed: i === 0, jumpHeld: true };
      const result = update(state, 1 / 60, input, 960);
      state = result.state;
    }

    expect(state.player.pos.y).toBe(climbable.yTop);
    expect(state.player.onGround).toBe(true);
  });

  it("ends directly over the arrival ledge, so releasing at the top cannot drop the player back down", () => {
    const level3 = LEVELS[3];
    const climbable = level3.climbables[0];
    const midX = climbable.x + climbable.width / 2;
    const topSurface = level3.platforms.find(
      (platform) => platform.y === climbable.yTop && midX >= platform.x && midX <= platform.x + platform.width,
    );

    expect(topSurface).toBeDefined();
  });
});
