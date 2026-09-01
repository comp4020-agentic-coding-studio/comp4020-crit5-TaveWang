import { describe, expect, it } from "vitest";
import { applyDamageToPlayer, checkPlayerRunEnd, resolveSlashDamage } from "../src/game/combat";
import { BASE_STATS, GROUND_Y } from "../src/game/constants";
import { LEVELS } from "../src/game/level";
import { createInitialRun, update } from "../src/game/run";
import type { Enemy, PlayerState, RunState } from "../src/game/types";

const NO_INPUT = { left: false, right: false, jumpPressed: false, dashPressed: false };

// These exercise the dash-slash rule directly against the pure game-logic
// layer --- no canvas, no DOM, matching the crit-5 brief's requirement that
// gameplay rules be testable without rendering anything.

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    pos: { x: 200, y: GROUND_Y },
    vel: { x: 0, y: 0 },
    facing: 1,
    health: BASE_STATS.maxHealth,
    stats: { ...BASE_STATS },
    onGround: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    dash: { active: true, timer: 0.1, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
    invulnTimer: 0,
    hitEnemiesThisDash: new Set(),
    afterimageTimer: 0,
    afterimagePos: null,
    standingPlatformId: null,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: "test-enemy",
    kind: "drifter",
    pos: { x: 240, y: GROUND_Y },
    vel: { x: 0, y: 0 },
    health: 2,
    maxHealth: 2,
    width: 30,
    height: 34,
    state: "patrol",
    stateTimer: 0,
    patrolMinX: 150,
    patrolMaxX: 330,
    patrolFacing: -1,
    telegraphDuration: 0.9,
    attackDuration: 0.35,
    contactDamage: 1,
    deathTimer: 0.4,
    ...overrides,
  };
}

describe("dash-slash: hit detection", () => {
  it("damages an enemy standing inside the active slash area", () => {
    const player = makePlayer();
    const enemy = makeEnemy({ pos: { x: 240, y: GROUND_Y } });

    const { enemies, hitIds } = resolveSlashDamage(player, [enemy]);

    expect(hitIds).toContain(enemy.id);
    expect(enemies[0].health).toBe(enemy.health - 1);
  });

  it("does not damage an enemy standing outside the active slash area", () => {
    const player = makePlayer();
    const enemy = makeEnemy({ pos: { x: 900, y: GROUND_Y } });

    const { enemies, hitIds } = resolveSlashDamage(player, [enemy]);

    expect(hitIds).not.toContain(enemy.id);
    expect(enemies[0].health).toBe(enemy.health);
  });

  it("does not damage an enemy while the player is not dashing", () => {
    const player = makePlayer({ dash: { active: false, timer: 0, cooldownTimer: 0.2, dir: 1, originY: GROUND_Y } });
    const enemy = makeEnemy({ pos: { x: 240, y: GROUND_Y } });

    const { hitIds } = resolveSlashDamage(player, [enemy]);

    expect(hitIds).toHaveLength(0);
  });
});

describe("dash-slash: one dash, one hit per enemy", () => {
  it("cannot damage the same enemy more than once across repeated frames of one dash", () => {
    let player = makePlayer();
    const enemy = makeEnemy({ pos: { x: 240, y: GROUND_Y } });
    let enemies = [enemy];

    const first = resolveSlashDamage(player, enemies);
    enemies = first.enemies;
    player = { ...player, hitEnemiesThisDash: player.hitEnemiesThisDash };

    // Same dash, several more resolve calls in the frames that follow ---
    // the enemy already took its hit and staggered, so no more health
    // should come off no matter how many frames the overlap persists.
    const second = resolveSlashDamage(player, enemies);
    enemies = second.enemies;
    const third = resolveSlashDamage(player, enemies);
    enemies = third.enemies;

    expect(first.hitIds).toContain(enemy.id);
    expect(second.hitIds).not.toContain(enemy.id);
    expect(third.hitIds).not.toContain(enemy.id);
    expect(enemies[0].health).toBe(enemy.health - 1);
  });
});

describe("player damage and invulnerability", () => {
  it("grants temporary invulnerability after taking damage", () => {
    const player = makePlayer({ health: 3, invulnTimer: 0 });

    const hit = applyDamageToPlayer(player, 1);

    expect(hit.health).toBe(2);
    expect(hit.invulnTimer).toBeGreaterThan(0);
  });

  it("ignores further damage while invulnerable", () => {
    const player = makePlayer({ health: 3, invulnTimer: 0 });
    const first = applyDamageToPlayer(player, 1);

    const second = applyDamageToPlayer(first, 1);

    expect(second.health).toBe(first.health);
  });
});

// Killing every enemy only unlocks the exit --- the level isn't cleared
// until the player actually reaches it. These exercise that gate directly
// against the run loop, the same way the dash-slash rule above is tested
// without a canvas.
describe("level-clear: exit gates the transition", () => {
  const level0 = LEVELS[0];
  const stillDash = { active: false, timer: 0, cooldownTimer: 0, dir: 1 as const, originY: GROUND_Y };

  it("stays in the cleared phase when all enemies are dead but the player hasn't reached the exit", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [makeEnemy({ state: "dead", deathTimer: 0 })],
      player: makePlayer({ pos: { x: 200, y: GROUND_Y }, dash: stillDash }),
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.phase).toBe("cleared");
  });

  it("transitions to upgrade once all enemies are dead and the player reaches the exit", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [makeEnemy({ state: "dead", deathTimer: 0 })],
      player: makePlayer({
        pos: { x: level0.exitX, y: level0.exitY },
        dash: { ...stillDash, originY: level0.exitY },
      }),
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.phase).toBe("upgrade");
  });

  it("does not skip the fight: standing at the exit while enemies are still alive keeps the encounter going", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [makeEnemy({ state: "patrol" })],
      player: makePlayer({
        pos: { x: level0.exitX, y: level0.exitY },
        dash: { ...stillDash, originY: level0.exitY },
      }),
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.phase).toBe("encounter");
  });
});

describe("run end condition", () => {
  it("stays ongoing while the player has health", () => {
    const player = makePlayer({ health: 1 });
    expect(checkPlayerRunEnd(player)).toBe("ongoing");
  });

  it("ends the run when health reaches zero", () => {
    const player = makePlayer({ health: 0 });
    expect(checkPlayerRunEnd(player)).toBe("defeat");
  });
});
