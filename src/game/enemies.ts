// Enemy AI: a small state machine per enemy. Every attack is telegraphed
// (a pause with a growing warning) before it becomes dangerous, so a player
// who reads the wind-up can always dodge it --- the "no unavoidable damage"
// rule from the brief lives here, not in the renderer.
import type { Enemy, EnemyKind, FacingDir, PlayerState, Projectile, Rect } from "./types";
import { rectsOverlap } from "./combat";

let nextId = 0;
export function resetEnemyIds(): void {
  nextId = 0;
}

let nextEnemyProjectileId = 0;
export function resetEnemyProjectileIds(): void {
  nextEnemyProjectileId = 0;
}

const WISP_PROJECTILE_SPEED = 420;
const WISP_PROJECTILE_LIFE = 1.8;
const WISP_BOLT_COLOR = "#9a5ad1";

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
    attackRange: 110,
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
    attackRange: 130,
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
    attackRange: 160,
  },
  wisp: {
    health: 2,
    width: 28,
    height: 28,
    telegraphDuration: 0.6,
    attackDuration: 0.3,
    contactDamage: 1,
    speed: 90,
    aggroRange: 420,
    attackRange: 260,
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
  projectileSpawn: Projectile | null;
}

export function updateEnemy(
  enemy: Enemy,
  player: PlayerState,
  dt: number,
  active: boolean,
  levelBounds: { minY: number; maxY: number } = { minY: -Infinity, maxY: Infinity },
): EnemyUpdateResult {
  if (enemy.state === "dead") {
    return {
      enemy: { ...enemy, deathTimer: Math.max(0, enemy.deathTimer - dt) },
      damageToPlayer: 0,
      projectileSpawn: null,
    };
  }
  if (!active) return { enemy, damageToPlayer: 0, projectileSpawn: null };

  const t = TEMPLATES[enemy.kind];
  const toPlayer = player.pos.x - enemy.pos.x;
  const dy = player.pos.y - enemy.pos.y;
  const distance = Math.hypot(toPlayer, dy);
  let { state, stateTimer, patrolFacing } = enemy;
  let vel = { ...enemy.vel };
  let damageToPlayer = 0;
  let projectileSpawn: Projectile | null = null;

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
      if (enemy.kind === "wisp") {
        // Holds position and fires a single bolt on the frame it enters
        // "attack" --- stateTimer still equals the freshly-set duration only
        // on that first tick, so this is a cheap "just entered" check.
        const justEntered = stateTimer === enemy.attackDuration;
        vel.x = 0;
        stateTimer -= dt;
        if (justEntered) {
          const dir: FacingDir = toPlayer >= 0 ? 1 : -1;
          projectileSpawn = {
            id: `ep${nextEnemyProjectileId++}`,
            pos: { x: enemy.pos.x, y: enemy.pos.y - enemy.height / 2 },
            vel: { x: dir * WISP_PROJECTILE_SPEED, y: 0 },
            damage: 1,
            life: WISP_PROJECTILE_LIFE,
            color: WISP_BOLT_COLOR,
          };
        }
      } else {
        const dir: FacingDir = toPlayer >= 0 ? 1 : -1;
        vel.x = dir * t.speed * 2.2;
        stateTimer -= dt;
        if (rectsOverlap(enemyRect(enemy), playerRect(player, 28, 46))) {
          damageToPlayer = enemy.contactDamage;
        }
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

  // Clamped in every state, not just patrol --- otherwise an enemy that
  // hasn't noticed the player can walk (or lunge) straight off its own
  // platform's edge. Once it has ever left "idle" it's aggro'd for good (the
  // state machine never returns there), so from that point on it's allowed a
  // soft leash beyond its spawn strip to follow the player onto adjacent
  // platforms, instead of staying pinned to its spawn's exact edges forever.
  const hasAggroed = state !== "idle";
  const leash = 400;
  const minX = hasAggroed ? enemy.patrolMinX - leash : enemy.patrolMinX;
  const maxX = hasAggroed ? enemy.patrolMaxX + leash : enemy.patrolMaxX;
  const rawX = enemy.pos.x + vel.x * dt;
  const x = Math.max(minX, Math.min(maxX, rawX));

  // Vertical movement: the hollow's wanderers have no jump animation, so
  // rather than simulate platforming they simply drift toward a sensed
  // presence once aggro'd, clamped to the level's bounds so they can't drift
  // off-arena. Not aggro'd, they hold their spawn height exactly as before.
  let y = enemy.pos.y;
  if (hasAggroed) {
    const dyToPlayer = player.pos.y - enemy.pos.y;
    const maxStep = t.speed * 0.55 * dt;
    y += Math.max(-maxStep, Math.min(maxStep, dyToPlayer));
    y = Math.max(levelBounds.minY, Math.min(levelBounds.maxY, y));
  }

  const pos = { x, y };
  return {
    enemy: { ...enemy, pos, vel, state, stateTimer, patrolFacing },
    damageToPlayer,
    projectileSpawn,
  };
}
