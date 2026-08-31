// Enemy AI: a small state machine per enemy. Every attack is telegraphed
// (a pause with a growing warning) before it becomes dangerous, so a player
// who reads the wind-up can always dodge it --- the "no unavoidable damage"
// rule from the brief lives here, not in the renderer.
import type { Enemy, EnemyKind, FacingDir, PlayerState, Rect } from "./types";
import { rectsOverlap } from "./combat";

let nextId = 0;
export function resetEnemyIds(): void {
  nextId = 0;
}

interface EnemyTemplate {
  health: number;
  width: number;
  height: number;
  telegraphDuration: number;
  attackDuration: number;
  contactDamage: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
}

const TEMPLATES: Record<EnemyKind, EnemyTemplate> = {
  drifter: {
    health: 2,
    width: 30,
    height: 34,
    telegraphDuration: 0.9,
    attackDuration: 0.35,
    contactDamage: 1,
    speed: 70,
    aggroRange: 260,
    attackRange: 60,
  },
  sentinel: {
    health: 3,
    width: 34,
    height: 50,
    telegraphDuration: 0.6,
    attackDuration: 0.3,
    contactDamage: 1,
    speed: 110,
    aggroRange: 320,
    attackRange: 70,
  },
  warden: {
    health: 8,
    width: 56,
    height: 72,
    telegraphDuration: 0.55,
    attackDuration: 0.4,
    contactDamage: 1,
    speed: 130,
    aggroRange: 500,
    attackRange: 90,
  },
};

export function spawnEnemy(
  kind: EnemyKind,
  x: number,
  y: number,
  patrolMinX: number,
  patrolMaxX: number,
): Enemy {
  const t = TEMPLATES[kind];
  return {
    id: `e${nextId++}`,
    kind,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    health: t.health,
    maxHealth: t.health,
    width: t.width,
    height: t.height,
    state: "idle",
    stateTimer: 0,
    patrolMinX,
    patrolMaxX,
    patrolFacing: -1,
    telegraphDuration: t.telegraphDuration,
    attackDuration: t.attackDuration,
    contactDamage: t.contactDamage,
    deathTimer: 0.4,
  };
}

function playerRect(player: PlayerState, width: number, height: number): Rect {
  return { x: player.pos.x - width / 2, y: player.pos.y - height, w: width, h: height };
}

function enemyRect(enemy: Enemy): Rect {
  return { x: enemy.pos.x - enemy.width / 2, y: enemy.pos.y - enemy.height, w: enemy.width, h: enemy.height };
}

export interface EnemyUpdateResult {
  enemy: Enemy;
  damageToPlayer: number;
}

export function updateEnemy(
  enemy: Enemy,
  player: PlayerState,
  dt: number,
  active: boolean,
): EnemyUpdateResult {
  if (enemy.state === "dead") {
    return { enemy: { ...enemy, deathTimer: Math.max(0, enemy.deathTimer - dt) }, damageToPlayer: 0 };
  }
  if (!active) return { enemy, damageToPlayer: 0 };

  const t = TEMPLATES[enemy.kind];
  const toPlayer = player.pos.x - enemy.pos.x;
  const distance = Math.abs(toPlayer);
  let { state, stateTimer, patrolFacing } = enemy;
  let vel = { ...enemy.vel };
  let damageToPlayer = 0;

  switch (state) {
    case "idle":
      if (distance < t.aggroRange) state = "patrol";
      vel.x = 0;
      break;

    case "patrol": {
      if (distance < t.attackRange) {
        state = "telegraph";
        stateTimer = enemy.telegraphDuration;
        vel.x = 0;
        break;
      }
      // Wander within the spawn's platform until the player is close enough
      // to threaten --- this is what makes the first drifter safe to walk up
      // to and observe, and (on a tiered level) what stops it wandering off
      // its own platform's edge.
      if (enemy.pos.x >= enemy.patrolMaxX) patrolFacing = -1;
      else if (enemy.pos.x <= enemy.patrolMinX) patrolFacing = 1;
      if (distance < t.aggroRange) {
        patrolFacing = toPlayer > 0 ? 1 : -1;
      }
      vel.x = patrolFacing * t.speed * 0.5;
      break;
    }

    case "telegraph":
      vel.x = 0;
      stateTimer -= dt;
      if (stateTimer <= 0) {
        state = "attack";
        stateTimer = enemy.attackDuration;
      }
      break;

    case "attack": {
      const dir: FacingDir = toPlayer >= 0 ? 1 : -1;
      vel.x = dir * t.speed * 2.2;
      stateTimer -= dt;
      if (rectsOverlap(enemyRect(enemy), playerRect(player, 28, 46))) {
        damageToPlayer = enemy.contactDamage;
      }
      if (stateTimer <= 0) {
        state = "stagger";
        stateTimer = 0.5;
      }
      break;
    }

    case "stagger":
      vel.x = 0;
      stateTimer -= dt;
      if (stateTimer <= 0) state = "patrol";
      break;
  }

  // Clamped in every state, not just patrol --- otherwise an aggro'd enemy
  // on an elevated platform can walk (or lunge) straight off its own edge
  // once levels have tiers instead of one flat room.
  const rawX = enemy.pos.x + vel.x * dt;
  const pos = { x: Math.max(enemy.patrolMinX, Math.min(enemy.patrolMaxX, rawX)), y: enemy.pos.y };
  return {
    enemy: { ...enemy, pos, vel, state, stateTimer, patrolFacing },
    damageToPlayer,
  };
}
