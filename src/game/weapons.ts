import type { WeaponId, WeaponInstance, WeaponSlot } from "./types";

// Icon-first, same as upgrades.ts: each weapon is a shape + colour the
// renderer draws, not a sentence. `label` exists only for PROCESS.md/logging.
export interface WeaponDef {
  id: WeaponId;
  slot: WeaponSlot;
  label: string;
  color: string;
  baseDamage: number;
  cooldown: number;
  range: number;
  projectileSpeed?: number;
  projectileLife?: number;
}

export const WEAPON_POOL: WeaponDef[] = [
  { id: "dagger", slot: "melee", label: "Dagger", color: "#c8985b", baseDamage: 1, cooldown: 0.35, range: 46 },
  { id: "broadsword", slot: "melee", label: "Broadsword", color: "#8c4f4f", baseDamage: 2, cooldown: 0.7, range: 60 },
  { id: "spear", slot: "melee", label: "Spear", color: "#5a7a5a", baseDamage: 1, cooldown: 0.5, range: 90 },
  {
    id: "throwingKnives",
    slot: "ranged",
    label: "Throwing Knives",
    color: "#7a8ca0",
    baseDamage: 1,
    cooldown: 0.4,
    range: 0,
    projectileSpeed: 600,
    projectileLife: 1.1,
  },
  {
    id: "shortbow",
    slot: "ranged",
    label: "Shortbow",
    color: "#a08c5a",
    baseDamage: 1,
    cooldown: 0.55,
    range: 0,
    projectileSpeed: 780,
    projectileLife: 1,
  },
  {
    id: "crossbow",
    slot: "ranged",
    label: "Crossbow",
    color: "#5a4a7a",
    baseDamage: 2,
    cooldown: 0.9,
    range: 0,
    projectileSpeed: 900,
    projectileLife: 0.9,
  },
];

export function weaponById(id: WeaponId): WeaponDef {
  const def = WEAPON_POOL.find((w) => w.id === id);
  if (!def) throw new Error(`unknown weapon ${id}`);
  return def;
}

export function weaponDamage(instance: WeaponInstance): number {
  return weaponById(instance.id).baseDamage + instance.tier;
}

// Drops become more dangerous the deeper into the run they happen ---
// levelIndex 0 always rolls tier 0, later levels can roll up to tier 2.
export const WEAPON_DROP_CHANCE = 0.4;

export function rollWeaponDrop(levelIndex: number, rand: () => number = Math.random): { weaponId: WeaponId; tier: number } {
  const def = WEAPON_POOL[Math.floor(rand() * WEAPON_POOL.length)];
  const tier = Math.round(rand() * Math.min(2, levelIndex));
  return { weaponId: def.id, tier };
}
