import type { Enemy, EnemyKind, Particle, PlayerState, RunState, UpgradeId } from "./types";
import type { InputState } from "./input";
import {
  applyDamageToPlayer,
  checkPlayerRunEnd,
  resolveSlashDamage,
  startDash,
  updateDashTimers,
} from "./combat";
import { resetEnemyIds, spawnEnemy, updateEnemy } from "./enemies";
import { rollUpgradeChoices, applyUpgrade } from "./upgrades";
import {
  ARENA_WIDTH,
  BASE_STATS,
  COYOTE_TIME,
  GRAVITY,
  GROUND_Y,
  JUMP_BUFFER,
  SHAKE_ON_HIT,
  SHAKE_ON_PLAYER_HIT,
  AFTERIMAGE_DAMAGE,
  AFTERIMAGE_DAMAGE_WINDOW,
  AFTERIMAGE_TICK,
} from "./constants";

// Each encounter is a small, escalating fight; the last one is the boss.
// Spawn x-offsets are measured from the arena's right edge so the fight
// always plays out in the same compact room regardless of arena width.
interface EncounterDef {
  spawns: { kind: EnemyKind; offsetFromRight: number }[];
}

const ENCOUNTERS: EncounterDef[] = [
  { spawns: [{ kind: "drifter", offsetFromRight: 420 }] },
  { spawns: [{ kind: "drifter", offsetFromRight: 480 }, { kind: "drifter", offsetFromRight: 280 }] },
  { spawns: [{ kind: "sentinel", offsetFromRight: 460 }, { kind: "drifter", offsetFromRight: 260 }] },
  { spawns: [{ kind: "warden", offsetFromRight: 420 }] },
];

export function createInitialPlayer(): PlayerState {
  return {
    pos: { x: 140, y: GROUND_Y },
    vel: { x: 0, y: 0 },
    facing: 1,
    health: BASE_STATS.maxHealth,
    stats: { ...BASE_STATS },
    onGround: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    dash: { active: false, timer: 0, cooldownTimer: 0, dir: 1, originY: GROUND_Y },
    invulnTimer: 0,
    hitEnemiesThisDash: new Set(),
    afterimageTimer: 0,
    afterimagePos: null,
  };
}

function spawnEncounter(index: number): Enemy[] {
  const def = ENCOUNTERS[index];
  return def.spawns.map((s) => spawnEnemy(s.kind, ARENA_WIDTH - s.offsetFromRight, GROUND_Y));
}

export function createInitialRun(): RunState {
  resetEnemyIds();
  return {
    phase: "title",
    encounterIndex: 0,
    player: createInitialPlayer(),
    enemies: spawnEncounter(0),
    particles: [],
    upgradesTaken: [],
    upgradeChoices: [],
    time: 0,
    cleared: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    hitPause: 0,
    phaseTimer: 0,
    arenaWidth: ARENA_WIDTH,
  };
}

function spawnBurst(particles: Particle[], x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 90 + Math.random() * 120;
    particles.push({
      pos: { x, y },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 40 },
      life: 0.35 + Math.random() * 0.2,
      maxLife: 0.5,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

function updatePlayerPhysics(player: PlayerState, input: InputState, dt: number, arenaWidth: number): PlayerState {
  let { pos, vel, onGround, coyoteTimer, jumpBufferTimer, facing } = player;
  pos = { ...pos };
  vel = { ...vel };

  const dashing = player.dash.active;

  if (!dashing) {
    if (input.left && !input.right) {
      vel.x = -player.stats.moveSpeed;
      facing = -1;
    } else if (input.right && !input.left) {
      vel.x = player.stats.moveSpeed;
      facing = 1;
    } else {
      vel.x = 0;
    }
  } else {
    vel.x = player.dash.dir * player.stats.dashSpeed;
  }

  if (input.jumpPressed) jumpBufferTimer = JUMP_BUFFER;
  else jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

  coyoteTimer = onGround ? COYOTE_TIME : Math.max(0, coyoteTimer - dt);

  if (jumpBufferTimer > 0 && coyoteTimer > 0 && !dashing) {
    vel.y = -player.stats.jumpSpeed;
    onGround = false;
    coyoteTimer = 0;
    jumpBufferTimer = 0;
  }

  if (!dashing) {
    vel.y += GRAVITY * dt;
  } else {
    vel.y = 0;
    pos.y = player.dash.originY;
  }

  pos.x += vel.x * dt;
  pos.y += vel.y * dt;

  pos.x = Math.max(40, Math.min(arenaWidth - 40, pos.x));

  if (pos.y >= GROUND_Y) {
    pos.y = GROUND_Y;
    vel.y = 0;
    onGround = true;
  } else {
    onGround = false;
  }

  return { ...player, pos, vel, onGround, coyoteTimer, jumpBufferTimer, facing };
}

export interface UpdateResult {
  state: RunState;
  events: string[];
}

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function restartRun(): RunState {
  return createInitialRun();
}

export function update(state: RunState, dtRaw: number, input: InputState, viewportWidth: number): UpdateResult {
  const events: string[] = [];
  const dt = Math.min(dtRaw, 1 / 30);

  if (state.hitPause > 0) {
    const hitPause = Math.max(0, state.hitPause - dt);
    return { state: { ...state, hitPause }, events };
  }

  if (state.phase === "victory" || state.phase === "defeat") {
    if (input.jumpPressed || input.dashPressed) {
      return { state: restartRun(), events: ["select"] };
    }
    const particles = advanceParticles(state.particles, dt);
    return { state: { ...state, particles, time: state.time + dt }, events };
  }

  if (state.phase === "title") {
    if (input.left || input.right || input.jumpPressed || input.dashPressed) {
      return update({ ...state, phase: "encounter" }, dt, input, viewportWidth);
    }
    const particles = advanceParticles(state.particles, dt);
    return { state: { ...state, particles, time: state.time + dt }, events };
  }

  if (state.phase === "upgrade") {
    // Choices are presented as clickable icons by the React layer, which
    // calls `chooseUpgrade` directly; `update` just idles the world so
    // nothing keeps fighting behind the overlay.
    const particles = advanceParticles(state.particles, dt);
    return { state: { ...state, particles, time: state.time + dt }, events };
  }

  let player = updatePlayerPhysics(state.player, input, dt, state.arenaWidth);

  if (input.dashPressed && !player.dash.active && player.dash.cooldownTimer <= 0) {
    player = startDash(player, player.facing);
    events.push("dash");
  }
  player = updateDashTimers(player, dt);
  if (player.invulnTimer > 0) player = { ...player, invulnTimer: Math.max(0, player.invulnTimer - dt) };

  const particles = [...state.particles];
  let shake = Math.max(0, state.shake - dt * 30);

  const slash = resolveSlashDamage(player, state.enemies);
  let enemies = slash.enemies;
  if (slash.hitIds.length > 0) {
    events.push("hit");
    shake = Math.max(shake, reducedMotion ? SHAKE_ON_HIT * 0.3 : SHAKE_ON_HIT);
    for (const id of slash.hitIds) {
      const enemy = enemies.find((e) => e.id === id);
      if (enemy) spawnBurst(particles, enemy.pos.x, enemy.pos.y - enemy.height / 2, "#e8b04b", 10);
    }
  }

  // Afterimage: a short damaging trail left where the dash ended, ticking
  // any enemy that lingers in it. Optional, unlocked by an upgrade.
  let afterimageTimer = Math.max(0, player.afterimageTimer - dt);
  let afterimagePos = player.afterimagePos;
  if (!player.dash.active && state.player.dash.active && player.stats.afterimage) {
    afterimageTimer = AFTERIMAGE_DAMAGE_WINDOW;
    afterimagePos = { x: player.pos.x, y: player.pos.y };
  }
  if (afterimageTimer > 0 && afterimagePos) {
    const tickPhase = Math.floor(afterimageTimer / AFTERIMAGE_TICK);
    const prevPhase = Math.floor((afterimageTimer + dt) / AFTERIMAGE_TICK);
    if (tickPhase !== prevPhase) {
      enemies = enemies.map((enemy) => {
        if (enemy.state === "dead") return enemy;
        const dx = Math.abs(enemy.pos.x - afterimagePos!.x);
        if (dx > 40) return enemy;
        const health = Math.max(0, enemy.health - AFTERIMAGE_DAMAGE);
        return { ...enemy, health, state: health <= 0 ? "dead" : enemy.state };
      });
    }
  } else {
    afterimagePos = null;
  }

  let damageToPlayer = 0;
  enemies = enemies.map((enemy) => {
    const result = updateEnemy(enemy, player, dt, true);
    damageToPlayer += result.damageToPlayer;
    return result.enemy;
  });

  if (damageToPlayer > 0 && player.invulnTimer <= 0) {
    const before = player.health;
    player = applyDamageToPlayer(player, damageToPlayer);
    if (player.health < before) {
      events.push("playerHit");
      shake = reducedMotion ? SHAKE_ON_PLAYER_HIT * 0.3 : SHAKE_ON_PLAYER_HIT;
      spawnBurst(particles, player.pos.x, player.pos.y - 24, "#c85b8a", 8);
    }
  }

  const justDied = enemies.filter((e, i) => e.state === "dead" && state.enemies[i]?.state !== "dead");
  for (const enemy of justDied) {
    events.push("enemyDeath");
    spawnBurst(particles, enemy.pos.x, enemy.pos.y - enemy.height / 2, "#8f6fd8", 14);
  }

  const advancedParticles = advanceParticles(particles, dt);

  const camera = {
    x: Math.max(0, Math.min(Math.max(0, state.arenaWidth - viewportWidth), player.pos.x - viewportWidth / 2)),
    y: 0,
  };

  const runEnd = checkPlayerRunEnd(player);
  if (runEnd === "defeat") {
    events.push("defeat");
    return {
      state: {
        ...state,
        player,
        enemies,
        particles: advancedParticles,
        shake,
        camera,
        phase: "defeat",
        time: state.time + dt,
      },
      events,
    };
  }

  const allDead = enemies.every((e) => e.state === "dead" && e.deathTimer <= 0);
  if (allDead && enemies.length > 0) {
    const isLast = state.encounterIndex >= ENCOUNTERS.length - 1;
    if (isLast) {
      events.push("victory");
      return {
        state: {
          ...state,
          player,
          enemies,
          particles: advancedParticles,
          shake,
          camera,
          phase: "victory",
          time: state.time + dt,
        },
        events,
      };
    }
    return {
      state: {
        ...state,
        player,
        enemies,
        particles: advancedParticles,
        shake,
        camera,
        phase: "upgrade",
        upgradeChoices: rollUpgradeChoices(),
        time: state.time + dt,
      },
      events,
    };
  }

  return {
    state: {
      ...state,
      player: { ...player, afterimageTimer, afterimagePos },
      enemies,
      particles: advancedParticles,
      shake,
      camera,
      time: state.time + dt,
    },
    events,
  };
}

// A dash can carry the player deep into the arena before the last enemy of an
// encounter falls, so the *next* encounter's spawns (fixed offsets from the
// arena's right edge) can otherwise land right on top of --- or past --- where
// the player already is. That's exactly the "enemy spawning on the player"
// case the brief forbids, so every encounter transition re-anchors the player
// a safe distance left of its nearest spawn, clear of any enemy's attack
// range, before the fight resumes.
const ENCOUNTER_SAFETY_MARGIN = 320;

function safeEncounterStartX(enemies: Enemy[]): number {
  if (enemies.length === 0) return 140;
  const leftmost = Math.min(...enemies.map((e) => e.pos.x));
  return Math.max(140, leftmost - ENCOUNTER_SAFETY_MARGIN);
}

export function chooseUpgrade(state: RunState, id: UpgradeId): RunState {
  const upgraded = applyUpgrade(state.player, id);
  const nextIndex = state.encounterIndex + 1;
  const enemies = spawnEncounter(nextIndex);
  const player: PlayerState = {
    ...upgraded,
    pos: { x: safeEncounterStartX(enemies), y: GROUND_Y },
    vel: { x: 0, y: 0 },
    onGround: true,
    dash: { active: false, timer: 0, cooldownTimer: 0, dir: upgraded.facing, originY: GROUND_Y },
    hitEnemiesThisDash: new Set(),
  };
  return {
    ...state,
    player,
    upgradesTaken: [...state.upgradesTaken, id],
    upgradeChoices: [],
    encounterIndex: nextIndex,
    enemies,
    phase: "encounter",
  };
}

function advanceParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map((p) => ({
      ...p,
      pos: { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt },
      vel: { x: p.vel.x * 0.9, y: p.vel.y + 200 * dt },
      life: p.life - dt,
    }))
    .filter((p) => p.life > 0);
}
