import type { FogState } from "./fog";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FacingDir = 1 | -1;

export interface PlayerStats {
  maxHealth: number;
  moveSpeed: number;
  jumpSpeed: number;
  dashSpeed: number;
  dashDuration: number;
  dashCooldown: number;
  slashWidth: number;
  slashRange: number;
  afterimage: boolean;
}

export interface DashState {
  active: boolean;
  timer: number;
  cooldownTimer: number;
  dir: FacingDir;
  originY: number;
}

export type WeaponSlot = "melee" | "ranged";

export type WeaponId = "dagger" | "broadsword" | "spear" | "throwingKnives" | "shortbow" | "crossbow";

export interface WeaponInstance {
  id: WeaponId;
  tier: number;
}

export interface WeaponPickup {
  id: string;
  weaponId: WeaponId;
  tier: number;
  pos: Vec2;
}

export interface Projectile {
  id: string;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  life: number;
  color: string;
}

export interface PlayerState {
  pos: Vec2;
  vel: Vec2;
  facing: FacingDir;
  health: number;
  stats: PlayerStats;
  onGround: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  dash: DashState;
  invulnTimer: number;
  hitEnemiesThisDash: Set<string>;
  afterimageTimer: number;
  afterimagePos: Vec2 | null;
  standingPlatformId: string | null;
  weapons: { melee: WeaponInstance | null; ranged: WeaponInstance | null };
  meleeCooldown: number;
  rangedCooldown: number;
  meleeSwingTimer: number;
  hitEnemiesThisMelee: Set<string>;
}

export type EnemyKind = "drifter" | "sentinel" | "warden" | "wisp";
export type EnemyState = "idle" | "patrol" | "telegraph" | "attack" | "stagger" | "dead";

export interface Enemy {
  id: string;
  kind: EnemyKind;
  pos: Vec2;
  vel: Vec2;
  health: number;
  maxHealth: number;
  width: number;
  height: number;
  state: EnemyState;
  stateTimer: number;
  patrolMinX: number;
  patrolMaxX: number;
  patrolFacing: FacingDir;
  telegraphDuration: number;
  attackDuration: number;
  contactDamage: number;
  deathTimer: number;
}

export type RunPhase = "title" | "encounter" | "cleared" | "upgrade" | "weaponChoice" | "victory" | "defeat";

export type UpgradeId = "longDash" | "wideSlash" | "vitality" | "swiftCooldown" | "afterimage";

export interface RunState {
  phase: RunPhase;
  encounterIndex: number;
  player: PlayerState;
  enemies: Enemy[];
  particles: Particle[];
  upgradesTaken: UpgradeId[];
  upgradeChoices: UpgradeId[];
  time: number;
  cleared: number;
  camera: Vec2;
  shake: number;
  hitPause: number;
  phaseTimer: number;
  arenaWidth: number;
  fog: FogState;
  weaponPickups: WeaponPickup[];
  projectiles: Projectile[];
  enemyProjectiles: Projectile[];
  pendingPickup: WeaponPickup | null;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
