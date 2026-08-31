// The dash-slash rule, kept pure and independent of rendering so it can be
// unit-tested without a canvas: given a player mid-dash and a list of
// enemies, decide who gets hit. A dash tracks which enemies it has already
// hit (`hitEnemiesThisDash`) so a single dash can't tick the same enemy every
// frame it overlaps them --- the dash has to end and restart to hit again.
import type { Enemy, FacingDir, PlayerState, Rect } from "./types";
import { INVULN_DURATION, SLASH_DAMAGE } from "./constants";

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
