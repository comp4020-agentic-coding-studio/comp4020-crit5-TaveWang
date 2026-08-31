import type { PlayerState, UpgradeId } from "./types";

// Icon-first by design: each upgrade is a shape + colour the renderer draws,
// not a sentence. `label` exists only as a short caption under the icon and
// as an internal name for PROCESS.md/logging --- it never explains a control.
export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  color: string;
  apply: (player: PlayerState) => PlayerState;
}

export const UPGRADE_POOL: UpgradeDef[] = [
  {
    id: "longDash",
    label: "Long Dash",
    color: "#e8b04b",
    apply: (p) => ({
      ...p,
      stats: { ...p.stats, dashSpeed: p.stats.dashSpeed + 180, dashDuration: p.stats.dashDuration + 0.03 },
    }),
  },
  {
    id: "wideSlash",
    label: "Wide Slash",
    color: "#8f6fd8",
    apply: (p) => ({
      ...p,
      stats: { ...p.stats, slashWidth: p.stats.slashWidth + 22, slashRange: p.stats.slashRange + 14 },
    }),
  },
  {
    id: "vitality",
    label: "Vitality",
    color: "#4f8fd8",
    apply: (p) => ({
      ...p,
      stats: { ...p.stats, maxHealth: p.stats.maxHealth + 1 },
      health: p.health + 1,
    }),
  },
  {
    id: "swiftCooldown",
    label: "Swift Recovery",
    color: "#5bc8a8",
    apply: (p) => ({
      ...p,
      stats: { ...p.stats, dashCooldown: Math.max(0.22, p.stats.dashCooldown - 0.16) },
    }),
  },
  {
    id: "afterimage",
    label: "Afterimage",
    color: "#c85b8a",
    apply: (p) => ({
      ...p,
      stats: { ...p.stats, afterimage: true },
    }),
  },
];

export function upgradeById(id: UpgradeId): UpgradeDef {
  const def = UPGRADE_POOL.find((u) => u.id === id);
  if (!def) throw new Error(`unknown upgrade ${id}`);
  return def;
}

// Two distinct, random choices --- distinct so the choice is never
// cosmetic, and small enough that repeated runs still feel different
// without a big content system.
export function rollUpgradeChoices(rand: () => number = Math.random): UpgradeId[] {
  const pool = [...UPGRADE_POOL];
  const first = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const second = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  return [first.id, second.id];
}

export function applyUpgrade(player: PlayerState, id: UpgradeId): PlayerState {
  return upgradeById(id).apply(player);
}
