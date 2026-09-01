// The dash-slash rule, kept pure and independent of rendering so it can be
// unit-tested without a canvas: given a player mid-dash and a list of
// enemies, decide who gets hit. A dash tracks which enemies it has already
// hit (`hitEnemiesThisDash`) so a single dash can't tick the same enemy every
// frame it overlaps them --- the dash has to end and restart to hit again.
import type { Enemy, FacingDir, PlayerState, Projectile, Rect } from "./types";
import type { LevelDef } from "./level";
import { INVULN_DURATION, MELEE_HITBOX_HEIGHT, SLASH_DAMAGE } from "./constants";
import { weaponById, weaponDamage } from "./weapons";

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function enemyRect(enemy: Enemy): Rect {
  return { x: enemy.pos.x - enemy.width / 2, y: enemy.pos.y - enemy.height, w: enemy.width, h: enemy.height };
}

// The slash hitbox: a box extending `slashRange` ahead of the player in the
// dash direction, `slashWidth` tall, centred on the player.
export function getSlashHitbox(player: PlayerState): Rect | null {
  if (!player.dash.active) return null;
  const dir: FacingDir = player.dash.dir;
  const height = player.stats.slashWidth;
  const range = player.stats.slashRange;
  const x = dir === 1 ? player.pos.x : player.pos.x - range;
  return { x, y: player.pos.y - height, w: range, h: height };
}

export interface SlashResult {
  enemies: Enemy[];
  hitIds: string[];
}

// Applies slash damage to any live enemy overlapping the active hitbox that
// this dash hasn't already hit. Mutates `player.hitEnemiesThisDash` (the
// per-dash memory that prevents repeat hits) but returns new enemy objects.
export function resolveSlashDamage(player: PlayerState, enemies: Enemy[]): SlashResult {
  const hitbox = getSlashHitbox(player);
  if (!hitbox) return { enemies, hitIds: [] };

  const hitIds: string[] = [];
  const next = enemies.map((enemy) => {
    if (enemy.state === "dead") return enemy;
    if (player.hitEnemiesThisDash.has(enemy.id)) return enemy;
    if (!rectsOverlap(hitbox, enemyRect(enemy))) return enemy;

    player.hitEnemiesThisDash.add(enemy.id);
    hitIds.push(enemy.id);
    const health = Math.max(0, enemy.health - SLASH_DAMAGE);
    return {
      ...enemy,
      health,
      state: health <= 0 ? ("dead" as const) : ("stagger" as const),
      stateTimer: health <= 0 ? enemy.deathTimer : 0.35,
      vel: { x: (enemy.pos.x - player.pos.x < 0 ? -1 : 1) * 260, y: enemy.vel.y },
    };
  });

  return { enemies: next, hitIds };
}

export function startDash(player: PlayerState, dir: FacingDir): PlayerState {
  if (player.dash.cooldownTimer > 0 || player.dash.active) return player;
  return {
    ...player,
    dash: {
      active: true,
      timer: player.stats.dashDuration,
      cooldownTimer: player.stats.dashCooldown,
      dir,
      originY: player.pos.y,
    },
    hitEnemiesThisDash: new Set(),
    facing: dir,
  };
}

export function updateDashTimers(player: PlayerState, dt: number): PlayerState {
  const dash = { ...player.dash };
  let hitEnemiesThisDash = player.hitEnemiesThisDash;
  if (dash.active) {
    dash.timer -= dt;
    if (dash.timer <= 0) {
      dash.active = false;
    }
  }
  if (dash.cooldownTimer > 0) {
    dash.cooldownTimer = Math.max(0, dash.cooldownTimer - dt);
  }
  if (!dash.active && player.dash.active) {
    // Dash just ended this frame: clear the per-dash hit memory so the next
    // dash can hit the same enemies again.
    hitEnemiesThisDash = new Set();
  }
  return { ...player, dash, hitEnemiesThisDash };
}

// Damage only lands outside the invulnerability window; a hit resets the
// timer so the player gets a brief grace period to recover, not stack more
// hits while already reeling.
export function applyDamageToPlayer(player: PlayerState, amount: number): PlayerState {
  if (player.invulnTimer > 0 || player.health <= 0) return player;
  return {
    ...player,
    health: Math.max(0, player.health - amount),
    invulnTimer: INVULN_DURATION,
  };
}

export type RunEndState = "ongoing" | "defeat";

export function checkPlayerRunEnd(player: PlayerState): RunEndState {
  return player.health <= 0 ? "defeat" : "ongoing";
}

// The melee weapon's hitbox: a box extending the weapon's own `range` ahead
// of the player, only live while `meleeSwingTimer` is counting down (started
// by run.ts on a fresh key press) --- mirrors getSlashHitbox exactly, but
// keyed off the equipped weapon instead of the dash.
export function getMeleeHitbox(player: PlayerState): Rect | null {
  const melee = player.weapons.melee;
  if (!melee || player.meleeSwingTimer <= 0) return null;
  const def = weaponById(melee.id);
  const height = MELEE_HITBOX_HEIGHT;
  const x = player.facing === 1 ? player.pos.x : player.pos.x - def.range;
  return { x, y: player.pos.y - height, w: def.range, h: height };
}

export interface MeleeResult {
  enemies: Enemy[];
  hitIds: string[];
}

// Identical shape to resolveSlashDamage: one hit per enemy per swing, tracked
// via hitEnemiesThisMelee (the melee equivalent of hitEnemiesThisDash).
export function resolveMeleeDamage(player: PlayerState, enemies: Enemy[]): MeleeResult {
  const hitbox = getMeleeHitbox(player);
  if (!hitbox) return { enemies, hitIds: [] };
  const melee = player.weapons.melee!;
  const damage = weaponDamage(melee);

  const hitIds: string[] = [];
  const next = enemies.map((enemy) => {
    if (enemy.state === "dead") return enemy;
    if (player.hitEnemiesThisMelee.has(enemy.id)) return enemy;
    if (!rectsOverlap(hitbox, enemyRect(enemy))) return enemy;

    player.hitEnemiesThisMelee.add(enemy.id);
    hitIds.push(enemy.id);
    const health = Math.max(0, enemy.health - damage);
    return {
      ...enemy,
      health,
      state: health <= 0 ? ("dead" as const) : ("stagger" as const),
      stateTimer: health <= 0 ? enemy.deathTimer : 0.35,
      vel: { x: (enemy.pos.x - player.pos.x < 0 ? -1 : 1) * 260, y: enemy.vel.y },
    };
  });

  return { enemies: next, hitIds };
}

// Starts a melee swing, gated by the weapon's own cooldown. Blocked while
// dashing (run.ts enforces this) so the dash-slash and melee weapon never
// fight over the same frame's hit resolution.
export function startMeleeAttack(player: PlayerState): PlayerState {
  const melee = player.weapons.melee;
  if (!melee || player.meleeCooldown > 0) return player;
  const def = weaponById(melee.id);
  return {
    ...player,
    meleeSwingTimer: 0.18,
    meleeCooldown: def.cooldown,
    hitEnemiesThisMelee: new Set(),
  };
}

// Ticks the melee/ranged cooldowns and the active swing window down; clears
// the per-swing hit memory the frame the swing ends, mirroring how
// updateDashTimers clears hitEnemiesThisDash.
export function updateWeaponTimers(player: PlayerState, dt: number): PlayerState {
  const meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  const rangedCooldown = Math.max(0, player.rangedCooldown - dt);
  const meleeSwingTimer = Math.max(0, player.meleeSwingTimer - dt);
  let hitEnemiesThisMelee = player.hitEnemiesThisMelee;
  if (meleeSwingTimer <= 0 && player.meleeSwingTimer > 0) {
    hitEnemiesThisMelee = new Set();
  }
  return { ...player, meleeCooldown, rangedCooldown, meleeSwingTimer, hitEnemiesThisMelee };
}

let nextProjectileId = 0;
export function resetProjectileIds(): void {
  nextProjectileId = 0;
}

// Fires the equipped ranged weapon, gated by its own cooldown; returns the
// new projectile and the player with the cooldown started, or null (player
// unchanged) if there's no ranged weapon equipped or it's still cooling down.
export function spawnProjectile(player: PlayerState): { player: PlayerState; projectile: Projectile } | null {
  const ranged = player.weapons.ranged;
  if (!ranged || player.rangedCooldown > 0) return null;
  const def = weaponById(ranged.id);
  const speed = def.projectileSpeed ?? 700;
  const life = def.projectileLife ?? 1;
  const projectile: Projectile = {
    id: `p${nextProjectileId++}`,
    pos: { x: player.pos.x, y: player.pos.y - 24 },
    vel: { x: speed * player.facing, y: 0 },
    damage: weaponDamage(ranged),
    life,
    color: def.color,
  };
  return { player: { ...player, rangedCooldown: def.cooldown }, projectile };
}

export interface ProjectileUpdateResult {
  enemies: Enemy[];
  projectiles: Projectile[];
  hitIds: string[];
}

// Moves every projectile, dropping it on expiry, on leaving the arena, or on
// hitting a wall rect or the first live enemy it overlaps --- one hit each,
// then it's removed rather than piercing through.
export function updateProjectiles(
  projectiles: Projectile[],
  enemies: Enemy[],
  level: LevelDef,
  dt: number,
): ProjectileUpdateResult {
  let nextEnemies = enemies;
  const hitIds: string[] = [];
  const surviving: Projectile[] = [];

  for (const proj of projectiles) {
    const pos = { x: proj.pos.x + proj.vel.x * dt, y: proj.pos.y + proj.vel.y * dt };
    const life = proj.life - dt;
    if (life <= 0 || pos.x < 0 || pos.x > level.arenaWidth) continue;

    const projRect: Rect = { x: pos.x - 4, y: pos.y - 4, w: 8, h: 8 };

    const hitWall = level.walls.some((w) => rectsOverlap(projRect, { x: w.x, y: w.y, w: w.width, h: w.height }));
    if (hitWall) continue;

    const target = nextEnemies.find((e) => e.state !== "dead" && rectsOverlap(projRect, enemyRect(e)));
    if (target) {
      hitIds.push(target.id);
      nextEnemies = nextEnemies.map((e) => {
        if (e.id !== target.id) return e;
        const health = Math.max(0, e.health - proj.damage);
        return {
          ...e,
          health,
          state: health <= 0 ? ("dead" as const) : ("stagger" as const),
          stateTimer: health <= 0 ? e.deathTimer : 0.35,
          vel: { x: (e.pos.x - pos.x < 0 ? -1 : 1) * 260, y: e.vel.y },
        };
      });
      continue;
    }

    surviving.push({ ...proj, pos, life });
  }

  return { enemies: nextEnemies, projectiles: surviving, hitIds };
}
