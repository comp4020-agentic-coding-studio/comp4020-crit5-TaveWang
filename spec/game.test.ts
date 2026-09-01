import { describe, expect, it } from "vitest";
import {
  applyDamageToPlayer,
  checkPlayerRunEnd,
  resolveMeleeDamage,
  resolveSlashDamage,
  spawnProjectile,
  updateEnemyProjectiles,
  updateProjectiles,
  updateWeaponTimers,
} from "../src/game/combat";
import { BASE_STATS, GROUND_Y } from "../src/game/constants";
import { spawnEnemy, updateEnemy } from "../src/game/enemies";
import { LEVELS } from "../src/game/level";
import { chooseUpgrade, createInitialRun, resolveWeaponChoice, update } from "../src/game/run";
import { WEAPON_SPRITE_URLS } from "../src/game/sprites";
import { rollWeaponDrop, WEAPON_POOL } from "../src/game/weapons";
import type { Enemy, PlayerState, RunState } from "../src/game/types";

const NO_INPUT = {
  left: false,
  right: false,
  jumpPressed: false,
  jumpHeld: false,
  dashPressed: false,
  meleeAttackPressed: false,
  rangedAttackPressed: false,
};

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
    weapons: { melee: null, ranged: null },
    meleeCooldown: 0,
    rangedCooldown: 0,
    meleeSwingTimer: 0,
    hitEnemiesThisMelee: new Set(),
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

  it("takes only one hit's worth of damage when two enemies land contact on the same frame", () => {
    // Regression: the cross-tier leash (see "enemies chase across height
    // tiers") makes it common for more than one aggro'd enemy to reach the
    // player at once. Before this was fixed, run.ts summed every enemy's
    // damageToPlayer for the frame instead of capping it at one hit, so two
    // simultaneous attackers could cost 2 health in a single tick even though
    // each individually only deals contactDamage: 1.
    const player = makePlayer({ pos: { x: 200, y: GROUND_Y }, health: 3, invulnTimer: 0 });
    const attacker = (id: string): Enemy =>
      makeEnemy({ id, pos: { x: 200, y: GROUND_Y }, state: "attack", stateTimer: 0.2, contactDamage: 1 });
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [attacker("a"), attacker("b")],
      player,
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.player.health).toBe(2);
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

describe("melee weapon: hit detection", () => {
  it("damages an enemy inside the swing box while the swing is active", () => {
    const player = makePlayer({
      dash: { active: false, timer: 0, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
      weapons: { melee: { id: "dagger", tier: 0 }, ranged: null },
      meleeSwingTimer: 0.1,
    });
    const enemy = makeEnemy({ pos: { x: 230, y: GROUND_Y } });

    const { enemies, hitIds } = resolveMeleeDamage(player, [enemy]);

    expect(hitIds).toContain(enemy.id);
    expect(enemies[0].health).toBe(enemy.health - 1);
  });

  it("does not damage anything without a melee weapon equipped", () => {
    const player = makePlayer({
      dash: { active: false, timer: 0, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
      weapons: { melee: null, ranged: null },
      meleeSwingTimer: 0.1,
    });
    const enemy = makeEnemy({ pos: { x: 230, y: GROUND_Y } });

    const { hitIds } = resolveMeleeDamage(player, [enemy]);

    expect(hitIds).toHaveLength(0);
  });

  it("does not damage anything once the swing window has ended", () => {
    const player = makePlayer({
      dash: { active: false, timer: 0, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
      weapons: { melee: { id: "dagger", tier: 0 }, ranged: null },
      meleeSwingTimer: 0,
    });
    const enemy = makeEnemy({ pos: { x: 230, y: GROUND_Y } });

    const { hitIds } = resolveMeleeDamage(player, [enemy]);

    expect(hitIds).toHaveLength(0);
  });

  it("hits an enemy at most once per swing, even across repeated frames", () => {
    const player = makePlayer({
      dash: { active: false, timer: 0, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
      weapons: { melee: { id: "dagger", tier: 0 }, ranged: null },
      meleeSwingTimer: 0.1,
    });
    const enemy = makeEnemy({ pos: { x: 230, y: GROUND_Y } });
    let enemies = [enemy];

    const first = resolveMeleeDamage(player, enemies);
    enemies = first.enemies;
    const second = resolveMeleeDamage(player, enemies);

    expect(first.hitIds).toContain(enemy.id);
    expect(second.hitIds).not.toContain(enemy.id);
  });
});

describe("ranged weapon: projectiles", () => {
  it("does not fire without a ranged weapon equipped", () => {
    const player = makePlayer({ weapons: { melee: null, ranged: null } });
    expect(spawnProjectile(player)).toBeNull();
  });

  it("fires in the direction the player is facing", () => {
    const player = makePlayer({ weapons: { melee: null, ranged: { id: "shortbow", tier: 0 } }, facing: -1 });
    const fired = spawnProjectile(player);
    expect(fired).not.toBeNull();
    expect(fired!.projectile.vel.x).toBeLessThan(0);
  });

  it("damages an overlapping enemy and removes the projectile", () => {
    const level = LEVELS[0];
    const enemy = makeEnemy({ pos: { x: 240, y: GROUND_Y } });
    const projectile = { id: "p0", pos: { x: 238, y: GROUND_Y - 10 }, vel: { x: 600, y: 0 }, damage: 1, life: 1, color: "#fff" };

    const result = updateProjectiles([projectile], [enemy], level, 1 / 60);

    expect(result.hitIds).toContain(enemy.id);
    expect(result.projectiles).toHaveLength(0);
    expect(result.enemies[0].health).toBe(enemy.health - 1);
  });

  it("ignores already-dead enemies", () => {
    const level = LEVELS[0];
    const enemy = makeEnemy({ pos: { x: 240, y: GROUND_Y }, state: "dead" });
    const projectile = { id: "p0", pos: { x: 238, y: GROUND_Y - 10 }, vel: { x: 600, y: 0 }, damage: 1, life: 1, color: "#fff" };

    const result = updateProjectiles([projectile], [enemy], level, 1 / 60);

    expect(result.hitIds).toHaveLength(0);
    expect(result.projectiles).toHaveLength(1);
  });

  it("expires once its life runs out", () => {
    const level = LEVELS[0];
    const projectile = { id: "p0", pos: { x: 500, y: GROUND_Y }, vel: { x: 0, y: 0 }, damage: 1, life: 0.01, color: "#fff" };

    const result = updateProjectiles([projectile], [], level, 1 / 30);

    expect(result.projectiles).toHaveLength(0);
  });

  it("stops at a wall", () => {
    const level = LEVELS[2]; // has wall rects
    const wall = level.walls[0];
    const projectile = {
      id: "p0",
      pos: { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 },
      vel: { x: 0, y: 0 },
      damage: 1,
      life: 1,
      color: "#fff",
    };

    const result = updateProjectiles([projectile], [], level, 1 / 60);

    expect(result.projectiles).toHaveLength(0);
  });
});

describe("weapon timers", () => {
  it("clears the per-swing hit memory once the swing window ends", () => {
    const player = makePlayer({
      weapons: { melee: { id: "dagger", tier: 0 }, ranged: null },
      meleeSwingTimer: 0.001,
      hitEnemiesThisMelee: new Set(["test-enemy"]),
    });

    const next = updateWeaponTimers(player, 1 / 30);

    expect(next.meleeSwingTimer).toBe(0);
    expect(next.hitEnemiesThisMelee.size).toBe(0);
  });
});

describe("weapon pickup and swap", () => {
  const stillDash = { active: false, timer: 0, cooldownTimer: 0, dir: 1 as const, originY: GROUND_Y };

  it("auto-equips a weapon pickup into an empty matching slot", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [],
      weaponPickups: [{ id: "wp-1", weaponId: "dagger", tier: 0, pos: { x: 200, y: GROUND_Y } }],
      player: makePlayer({ pos: { x: 200, y: GROUND_Y }, dash: stillDash }),
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.player.weapons.melee?.id).toBe("dagger");
    expect(next.weaponPickups).toHaveLength(0);
    expect(next.phase).not.toBe("weaponChoice");
  });

  it("raises a weaponChoice prompt instead of overwriting an occupied slot", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "encounter",
      enemies: [],
      weaponPickups: [{ id: "wp-1", weaponId: "broadsword", tier: 1, pos: { x: 200, y: GROUND_Y } }],
      player: makePlayer({
        pos: { x: 200, y: GROUND_Y },
        dash: stillDash,
        weapons: { melee: { id: "dagger", tier: 0 }, ranged: null },
      }),
    };

    const { state: next } = update(state, 1 / 60, NO_INPUT, 960);

    expect(next.phase).toBe("weaponChoice");
    expect(next.pendingPickup?.weaponId).toBe("broadsword");
    expect(next.player.weapons.melee?.id).toBe("dagger"); // unchanged until resolved
  });

  it("resolveWeaponChoice(true) keeps the current weapon", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "weaponChoice",
      pendingPickup: { id: "wp-1", weaponId: "broadsword", tier: 1, pos: { x: 200, y: GROUND_Y } },
      player: makePlayer({ weapons: { melee: { id: "dagger", tier: 0 }, ranged: null } }),
    };

    const next = resolveWeaponChoice(state, true);

    expect(next.player.weapons.melee?.id).toBe("dagger");
    expect(next.pendingPickup).toBeNull();
    expect(next.phase).toBe("encounter");
  });

  it("resolveWeaponChoice(false) takes the new weapon", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "weaponChoice",
      pendingPickup: { id: "wp-1", weaponId: "broadsword", tier: 1, pos: { x: 200, y: GROUND_Y } },
      player: makePlayer({ weapons: { melee: { id: "dagger", tier: 0 }, ranged: null } }),
    };

    const next = resolveWeaponChoice(state, false);

    expect(next.player.weapons.melee).toEqual({ id: "broadsword", tier: 1 });
    expect(next.pendingPickup).toBeNull();
    expect(next.phase).toBe("encounter");
  });
});

describe("weapon drop scaling", () => {
  it("has a real sprite asset for every weapon that can drop", () => {
    expect(Object.keys(WEAPON_SPRITE_URLS).sort()).toEqual(WEAPON_POOL.map((weapon) => weapon.id).sort());
    for (const weapon of WEAPON_POOL) {
      expect(WEAPON_SPRITE_URLS[weapon.id]).toMatch(/\.png/);
    }
  });

  it("never rolls a tier above min(2, levelIndex)", () => {
    for (const levelIndex of [0, 1, 2, 3]) {
      for (let i = 0; i < 200; i++) {
        const { tier } = rollWeaponDrop(levelIndex);
        expect(tier).toBeLessThanOrEqual(Math.min(2, levelIndex));
        expect(tier).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("always rolls tier 0 on the first level", () => {
    for (let i = 0; i < 50; i++) {
      expect(rollWeaponDrop(0).tier).toBe(0);
    }
  });
});

describe("full health refill on level advance", () => {
  it("chooseUpgrade refills health to the (possibly upgraded) max, not the previous level's leftover", () => {
    const state: RunState = {
      ...createInitialRun(),
      phase: "upgrade",
      player: makePlayer({ health: 1 }),
      upgradeChoices: ["longDash", "wideSlash"],
    };

    const next = chooseUpgrade(state, "longDash");

    expect(next.player.health).toBe(next.player.stats.maxHealth);
    expect(next.player.health).toBeGreaterThan(1);
  });
});

describe("enemy attack range", () => {
  it("a drifter telegraphs an attack from farther than the old close range, once aggro'd", () => {
    let enemy = spawnEnemy("drifter", 500, GROUND_Y, 300, 700);
    // Distance 95: beyond the old attackRange (60), within the new one (110).
    const player = makePlayer({ pos: { x: 595, y: GROUND_Y } });

    enemy = updateEnemy(enemy, player, 1 / 60, true).enemy; // idle -> patrol
    enemy = updateEnemy(enemy, player, 1 / 60, true).enemy; // patrol -> telegraph

    expect(enemy.state).toBe("telegraph");
  });
});

describe("wisp: ranged attack", () => {
  it("fires a projectile on the frame it enters the attack state, not the frame it leaves telegraph", () => {
    let enemy = spawnEnemy("wisp", 500, GROUND_Y, 400, 600);
    enemy = { ...enemy, state: "telegraph", stateTimer: 1 / 60 };
    const player = makePlayer({ pos: { x: 700, y: GROUND_Y } });

    const entering = updateEnemy(enemy, player, 1 / 60, true);
    expect(entering.enemy.state).toBe("attack");
    expect(entering.projectileSpawn).toBeNull();

    const firing = updateEnemy(entering.enemy, player, 1 / 60, true);
    expect(firing.projectileSpawn).not.toBeNull();
    expect(firing.projectileSpawn!.vel.x).toBeGreaterThan(0);
  });

  it("holds its position instead of lunging while attacking", () => {
    let enemy = spawnEnemy("wisp", 500, GROUND_Y, 400, 600);
    enemy = { ...enemy, state: "attack", stateTimer: 0.3 };
    const player = makePlayer({ pos: { x: 700, y: GROUND_Y } });

    const result = updateEnemy(enemy, player, 1 / 60, true);

    expect(result.enemy.pos.x).toBe(500);
  });
});

describe("enemy projectiles (wisp bolts)", () => {
  it("damages an overlapping player and removes the projectile", () => {
    const level = LEVELS[0];
    const player = makePlayer({ pos: { x: 240, y: GROUND_Y } });
    const projectile = {
      id: "ep0",
      pos: { x: 238, y: GROUND_Y - 10 },
      vel: { x: 600, y: 0 },
      damage: 1,
      life: 1,
      color: "#9a5ad1",
    };

    const result = updateEnemyProjectiles([projectile], player, level, 1 / 60);

    expect(result.damage).toBe(1);
    expect(result.projectiles).toHaveLength(0);
  });

  it("expires once its life runs out", () => {
    const level = LEVELS[0];
    const player = makePlayer({ pos: { x: 900, y: GROUND_Y } });
    const projectile = {
      id: "ep0",
      pos: { x: 500, y: GROUND_Y },
      vel: { x: 0, y: 0 },
      damage: 1,
      life: 0.01,
      color: "#9a5ad1",
    };

    const result = updateEnemyProjectiles([projectile], player, level, 1 / 30);

    expect(result.projectiles).toHaveLength(0);
    expect(result.damage).toBe(0);
  });

  it("stops at a wall", () => {
    const level = LEVELS[2]; // has wall rects
    const wall = level.walls[0];
    const player = makePlayer({ pos: { x: 5000, y: GROUND_Y } });
    const projectile = {
      id: "ep0",
      pos: { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 },
      vel: { x: 0, y: 0 },
      damage: 1,
      life: 1,
      color: "#9a5ad1",
    };

    const result = updateEnemyProjectiles([projectile], player, level, 1 / 60);

    expect(result.projectiles).toHaveLength(0);
  });
});

describe("enemies chase across height tiers once aggro'd", () => {
  it("an aggro'd enemy's x can exceed its original patrol bound and its y drifts toward the player's", () => {
    let enemy = spawnEnemy("sentinel", 500, 420, 460, 540);
    const player = makePlayer({ pos: { x: 700, y: 220 } });
    const levelBounds = { minY: -1000, maxY: 1000 };

    for (let i = 0; i < 180; i++) {
      enemy = updateEnemy(enemy, player, 1 / 60, true, levelBounds).enemy;
    }

    expect(enemy.pos.x).toBeGreaterThan(540);
    expect(enemy.pos.y).toBeLessThan(420);
  });

  it("an idle (never-aggro'd) enemy's position is unaffected by an active update", () => {
    const enemy = spawnEnemy("sentinel", 500, 420, 460, 540);
    const player = makePlayer({ pos: { x: 5000, y: -5000 } }); // far outside aggroRange

    const result = updateEnemy(enemy, player, 1 / 60, true);

    expect(result.enemy.pos).toEqual(enemy.pos);
    expect(result.enemy.state).toBe("idle");
  });
});
