import type { Enemy, Particle, PlayerState, RunState, UpgradeId, WeaponPickup } from "./types";
import type { InputState } from "./input";
import {
  applyDamageToPlayer,
  checkPlayerRunEnd,
  resolveSlashDamage,
  resolveMeleeDamage,
  rectsOverlap,
  resetProjectileIds,
  startDash,
  startMeleeAttack,
  spawnProjectile,
  updateDashTimers,
  updateProjectiles,
  updateWeaponTimers,
} from "./combat";
import { resetEnemyIds, spawnEnemy, updateEnemy } from "./enemies";
import { rollUpgradeChoices, applyUpgrade } from "./upgrades";
import { rollWeaponDrop, weaponById, WEAPON_DROP_CHANCE } from "./weapons";
import { LEVELS, exitRect, findLanding, movingPlatformPositionAt, resolveSurfaces, type LevelDef } from "./level";
import { createFogState, revealAround } from "./fog";
import {
  BASE_STATS,
  CLIMB_SLIDE_SPEED,
  CLIMB_SPEED,
  COYOTE_TIME,
  GRAVITY,
  GROUND_Y,
  JUMP_BUFFER,
  LOGICAL_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SHAKE_ON_HIT,
  SHAKE_ON_PLAYER_HIT,
  AFTERIMAGE_DAMAGE,
  AFTERIMAGE_DAMAGE_WINDOW,
  AFTERIMAGE_TICK,
} from "./constants";

const PLAYER_HALF_WIDTH = PLAYER_WIDTH / 2;
const HAZARD_CONTACT_DAMAGE = 1;

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
    standingPlatformId: null,
    weapons: { melee: null, ranged: null },
    meleeCooldown: 0,
    rangedCooldown: 0,
    meleeSwingTimer: 0,
    hitEnemiesThisMelee: new Set(),
  };
}

function spawnEncounter(index: number): Enemy[] {
  const level = LEVELS[index];
  return level.spawns.map((s) => spawnEnemy(s.kind, s.x, s.y, s.patrolMinX, s.patrolMaxX));
}

export function createInitialRun(): RunState {
  resetEnemyIds();
  resetProjectileIds();
  const firstLevel = LEVELS[0];
  return {
    phase: "title",
    encounterIndex: 0,
    player: { ...createInitialPlayer(), pos: { x: firstLevel.entryX, y: firstLevel.entryY } },
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
    arenaWidth: LEVELS[0].arenaWidth,
    fog: createFogState(firstLevel),
    weaponPickups: [],
    projectiles: [],
    pendingPickup: null,
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

interface PhysicsResult {
  player: PlayerState;
  fellIntoVoid: boolean;
}

function updatePlayerPhysics(
  player: PlayerState,
  input: InputState,
  dt: number,
  level: LevelDef,
  time: number,
): PhysicsResult {
  const prevY = player.pos.y;
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

  // A vine/ladder: hold jump to climb it, let go to slide down slowly ---
  // the fix for the un-jumpable oscillating platform this replaced. Checked
  // against the frame's starting position; dash always takes priority.
  const climbable = !dashing
    ? level.climbables.find(
        (c) => pos.x >= c.x && pos.x <= c.x + c.width && pos.y > c.yTop && pos.y < c.yBottom,
      )
    : undefined;

  if (input.jumpPressed) jumpBufferTimer = JUMP_BUFFER;
  else jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

  coyoteTimer = onGround ? COYOTE_TIME : Math.max(0, coyoteTimer - dt);

  if (jumpBufferTimer > 0 && coyoteTimer > 0 && !dashing && !climbable) {
    vel.y = -player.stats.jumpSpeed;
    onGround = false;
    coyoteTimer = 0;
    jumpBufferTimer = 0;
  }

  if (climbable) {
    vel.y = input.jumpHeld ? -CLIMB_SPEED : CLIMB_SLIDE_SPEED;
    onGround = false;
  } else if (!dashing) {
    vel.y += GRAVITY * dt;
  } else {
    vel.y = 0;
    pos.y = player.dash.originY;
  }

  pos.x += vel.x * dt;
  pos.y += vel.y * dt;

  pos.x = Math.max(40, Math.min(level.arenaWidth - 40, pos.x));

  const surfaces = resolveSurfaces(level, time);
  const landing = findLanding(surfaces, pos.x, PLAYER_HALF_WIDTH, prevY, pos.y);
  let standingPlatformId: string | null = null;
  if (landing) {
    pos.y = landing.y;
    vel.y = 0;
    onGround = true;
    standingPlatformId = landing.platformId;
  } else {
    onGround = false;
  }

  // Ride along with the moving platform the player is standing on --- if it
  // outruns the player's own reaction, they fall off, which is the intended
  // difficulty of that mechanism, not a bug.
  if (standingPlatformId) {
    const mp = level.movingPlatforms.find((m) => m.id === standingPlatformId);
    if (mp) {
      const prev = movingPlatformPositionAt(mp, time - dt);
      const curr = movingPlatformPositionAt(mp, time);
      pos.x += curr.x - prev.x;
    }
  }

  const fellIntoVoid = !onGround && pos.y > level.killPlaneY;

  return {
    player: { ...player, pos, vel, onGround, coyoteTimer, jumpBufferTimer, facing, standingPlatformId },
    fellIntoVoid,
  };
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

  if (state.phase === "weaponChoice") {
    // Same idle-the-world treatment as "upgrade": the React layer calls
    // resolveWeaponChoice directly once the player picks a card.
    const particles = advanceParticles(state.particles, dt);
    return { state: { ...state, particles, time: state.time + dt }, events };
  }

  const level = LEVELS[state.encounterIndex];
  const time = state.time + dt;
  const physics = updatePlayerPhysics(state.player, input, dt, level, time);
  let player = physics.player;
  revealAround(state.fog, player.pos.x, player.pos.y);

  if (input.dashPressed && !player.dash.active && player.dash.cooldownTimer <= 0) {
    player = startDash(player, player.facing);
    events.push("dash");
  }
  player = updateDashTimers(player, dt);
  if (player.invulnTimer > 0) player = { ...player, invulnTimer: Math.max(0, player.invulnTimer - dt) };

  // Melee is blocked mid-dash so the dash-slash and the melee weapon never
  // fight over the same frame's hit resolution; the ranged weapon has no
  // such conflict, since firing a projectile doesn't move the player.
  if (input.meleeAttackPressed && !player.dash.active) {
    player = startMeleeAttack(player);
    if (player.meleeSwingTimer > 0) events.push("meleeAttack");
  }
  let projectiles = state.projectiles;
  if (input.rangedAttackPressed) {
    const fired = spawnProjectile(player);
    if (fired) {
      player = fired.player;
      projectiles = [...projectiles, fired.projectile];
      events.push("rangedAttack");
    }
  }
  player = updateWeaponTimers(player, dt);

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

  const melee = resolveMeleeDamage(player, enemies);
  enemies = melee.enemies;
  if (melee.hitIds.length > 0) {
    events.push("hit");
    shake = Math.max(shake, reducedMotion ? SHAKE_ON_HIT * 0.3 : SHAKE_ON_HIT);
    for (const id of melee.hitIds) {
      const enemy = enemies.find((e) => e.id === id);
      if (enemy) spawnBurst(particles, enemy.pos.x, enemy.pos.y - enemy.height / 2, "#e8b04b", 10);
    }
  }

  const projectileResult = updateProjectiles(projectiles, enemies, level, dt);
  enemies = projectileResult.enemies;
  projectiles = projectileResult.projectiles;
  if (projectileResult.hitIds.length > 0) {
    events.push("hit");
    shake = Math.max(shake, reducedMotion ? SHAKE_ON_HIT * 0.3 : SHAKE_ON_HIT);
    for (const id of projectileResult.hitIds) {
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

  const playerRect = {
    x: player.pos.x - PLAYER_WIDTH / 2,
    y: player.pos.y - PLAYER_HEIGHT,
    w: PLAYER_WIDTH,
    h: PLAYER_HEIGHT,
  };
  for (const hazard of level.hazards) {
    if (rectsOverlap(playerRect, { x: hazard.x, y: hazard.y - hazard.height, w: hazard.width, h: hazard.height })) {
      damageToPlayer += HAZARD_CONTACT_DAMAGE;
    }
  }

  if (damageToPlayer > 0 && player.invulnTimer <= 0) {
    const before = player.health;
    player = applyDamageToPlayer(player, damageToPlayer);
    if (player.health < before) {
      events.push("playerHit");
      shake = reducedMotion ? SHAKE_ON_PLAYER_HIT * 0.3 : SHAKE_ON_PLAYER_HIT;
      spawnBurst(particles, player.pos.x, player.pos.y - 24, "#c85b8a", 8);
    }
  }

  // A fall into a pit is a ring-out, not a hit --- it must bypass invuln
  // entirely, or a player who falls while still invulnerable from a recent
  // hit would fall forever with no defeat trigger.
  if (physics.fellIntoVoid && player.health > 0) {
    player = { ...player, health: 0 };
    events.push("playerHit");
    shake = reducedMotion ? SHAKE_ON_PLAYER_HIT * 0.3 : SHAKE_ON_PLAYER_HIT;
    spawnBurst(particles, player.pos.x, player.pos.y - 24, "#c85b8a", 8);
  }

  const justDied = enemies.filter((e, i) => e.state === "dead" && state.enemies[i]?.state !== "dead");
  let weaponPickups = state.weaponPickups;
  for (const enemy of justDied) {
    events.push("enemyDeath");
    spawnBurst(particles, enemy.pos.x, enemy.pos.y - enemy.height / 2, "#8f6fd8", 14);
    if (Math.random() < WEAPON_DROP_CHANCE) {
      const drop = rollWeaponDrop(state.encounterIndex);
      weaponPickups = [
        ...weaponPickups,
        { id: `wp-${enemy.id}`, weaponId: drop.weaponId, tier: drop.tier, pos: { x: enemy.pos.x, y: enemy.pos.y } },
      ];
    }
  }

  // Weapon pickups: an empty matching slot equips immediately; a full slot
  // pauses the world with a same-slot swap choice (mirrors the "upgrade"
  // early-return elsewhere in this function) rather than silently discarding
  // either weapon.
  const pickupRect = (p: WeaponPickup) => ({ x: p.pos.x - 16, y: p.pos.y - 32, w: 32, h: 32 });
  const touchedPickup = weaponPickups.find((p) => rectsOverlap(playerRect, pickupRect(p)));
  if (touchedPickup) {
    const def = weaponById(touchedPickup.weaponId);
    const remainingPickups = weaponPickups.filter((p) => p.id !== touchedPickup.id);
    const currentInSlot = player.weapons[def.slot];
    if (!currentInSlot) {
      player = {
        ...player,
        weapons: { ...player.weapons, [def.slot]: { id: touchedPickup.weaponId, tier: touchedPickup.tier } },
      };
      events.push("pickup");
      weaponPickups = remainingPickups;
    } else {
      const advancedParticles = advanceParticles(particles, dt);
      return {
        state: {
          ...state,
          player,
          enemies,
          particles: advancedParticles,
          projectiles,
          weaponPickups: remainingPickups,
          shake,
          phase: "weaponChoice",
          pendingPickup: touchedPickup,
          time: state.time + dt,
        },
        events,
      };
    }
  }

  const advancedParticles = advanceParticles(particles, dt);

  const camera = {
    x: Math.max(0, Math.min(Math.max(0, state.arenaWidth - viewportWidth), player.pos.x - viewportWidth / 2)),
    y: Math.max(
      level.worldTop,
      Math.min(Math.max(level.worldTop, level.worldBottom - LOGICAL_HEIGHT), player.pos.y - LOGICAL_HEIGHT / 2),
    ),
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
        projectiles,
        weaponPickups,
        shake,
        camera,
        phase: "defeat",
        time: state.time + dt,
      },
      events,
    };
  }

  // Killing every enemy only unlocks the exit --- reaching it is what
  // actually clears the level. "cleared" is an otherwise-unused RunPhase
  // that exists for exactly this: enemies are down but the player still has
  // to walk/dash to the exit, so the world keeps simulating normally.
  const allDead = enemies.every((e) => e.state === "dead" && e.deathTimer <= 0);
  if (allDead && enemies.length > 0 && rectsOverlap(playerRect, exitRect(level))) {
    const isLast = state.encounterIndex >= LEVELS.length - 1;
    if (isLast) {
      events.push("victory");
      return {
        state: {
          ...state,
          player,
          enemies,
          particles: advancedParticles,
          projectiles,
          weaponPickups,
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
        projectiles,
        weaponPickups,
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
      projectiles,
      weaponPickups,
      shake,
      camera,
      phase: allDead && enemies.length > 0 ? "cleared" : state.phase,
      time: state.time + dt,
    },
    events,
  };
}

export function chooseUpgrade(state: RunState, id: UpgradeId): RunState {
  const upgraded = applyUpgrade(state.player, id);
  const nextIndex = state.encounterIndex + 1;
  const nextLevel = LEVELS[nextIndex];
  const enemies = spawnEncounter(nextIndex);
  const player: PlayerState = {
    ...upgraded,
    pos: { x: nextLevel.entryX, y: nextLevel.entryY },
    vel: { x: 0, y: 0 },
    onGround: true,
    dash: { active: false, timer: 0, cooldownTimer: 0, dir: upgraded.facing, originY: nextLevel.entryY },
    hitEnemiesThisDash: new Set(),
    standingPlatformId: null,
    meleeSwingTimer: 0,
    hitEnemiesThisMelee: new Set(),
  };
  return {
    ...state,
    player,
    upgradesTaken: [...state.upgradesTaken, id],
    upgradeChoices: [],
    encounterIndex: nextIndex,
    enemies,
    arenaWidth: nextLevel.arenaWidth,
    fog: createFogState(nextLevel),
    phase: "encounter",
  };
}

// Resolves the two-card weapon-swap prompt raised when a pickup's slot is
// already occupied: keeping the current weapon leaves the player untouched,
// otherwise the pickup's {id, tier} overwrites that slot. Either way the
// pending pickup clears and the world resumes from "encounter".
export function resolveWeaponChoice(state: RunState, keepCurrent: boolean): RunState {
  const pickup = state.pendingPickup;
  if (!pickup) return state;
  const def = weaponById(pickup.weaponId);
  const player: PlayerState = keepCurrent
    ? state.player
    : {
        ...state.player,
        weapons: { ...state.player.weapons, [def.slot]: { id: pickup.weaponId, tier: pickup.tier } },
      };
  return {
    ...state,
    player,
    pendingPickup: null,
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
