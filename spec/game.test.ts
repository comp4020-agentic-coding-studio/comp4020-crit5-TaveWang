import { describe, expect, it } from "vitest";
import { applyDamageToPlayer, checkPlayerRunEnd, resolveSlashDamage } from "../src/game/combat";
import { BASE_STATS, GROUND_Y } from "../src/game/constants";
import type { Enemy, PlayerState } from "../src/game/types";

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
