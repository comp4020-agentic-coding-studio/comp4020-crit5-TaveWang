import { describe, expect, it } from "vitest";
import { createFogState, isRevealed, revealAround, FOG_CELL } from "../src/game/fog";
import { LEVELS } from "../src/game/level";
import { createInitialRun, chooseUpgrade, update } from "../src/game/run";
import type { InputState } from "../src/game/input";
import type { RunState } from "../src/game/types";

const NO_INPUT: InputState = { left: false, right: false, jumpPressed: false, dashPressed: false };

describe("createFogState", () => {
  it("sizes the grid from the level's world bounds", () => {
    const level = LEVELS[1]; // arenaWidth 1300, worldTop 170, worldBottom 1120
    const fog = createFogState(level);
    expect(fog.cols).toBe(Math.ceil(level.arenaWidth / FOG_CELL));
    expect(fog.rows).toBe(Math.ceil((level.worldBottom - level.worldTop) / FOG_CELL));
    expect(fog.revealed.every((v) => v === 0)).toBe(true);
  });
});

describe("revealAround", () => {
  it("reveals cells near the given point and leaves far cells unrevealed", () => {
    const level = LEVELS[0];
    const fog = createFogState(level);
    revealAround(fog, level.entryX, level.entryY);

    const nearGx = Math.floor(level.entryX / FOG_CELL);
    const nearGy = Math.floor((level.entryY - fog.worldTop) / FOG_CELL);
    expect(isRevealed(fog, nearGx, nearGy)).toBe(true);

    const farGx = fog.cols - 1;
    const farGy = fog.rows - 1;
    expect(isRevealed(fog, farGx, farGy)).toBe(false);
  });

  it("is idempotent", () => {
    const level = LEVELS[0];
    const fog = createFogState(level);
    revealAround(fog, level.entryX, level.entryY);
    const before = fog.revealed.slice();
    revealAround(fog, level.entryX, level.entryY);
    expect(fog.revealed).toEqual(before);
  });

  it("ignores out-of-bounds coordinates instead of throwing", () => {
    const level = LEVELS[0];
    const fog = createFogState(level);
    expect(() => revealAround(fog, -500, -500)).not.toThrow();
  });
});

describe("fog integration with the run loop", () => {
  it("reveals the cell under the player as the run updates", () => {
    let state: RunState = { ...createInitialRun(), phase: "encounter" };
    for (let i = 0; i < 5; i++) {
      state = update(state, 1 / 60, NO_INPUT, 960).state;
    }
    const gx = Math.floor(state.player.pos.x / FOG_CELL);
    const gy = Math.floor((state.player.pos.y - state.fog.worldTop) / FOG_CELL);
    expect(isRevealed(state.fog, gx, gy)).toBe(true);
  });

  it("resets to a fresh, fully-unrevealed grid on entering a new level", () => {
    let state: RunState = { ...createInitialRun(), phase: "encounter" };
    for (let i = 0; i < 5; i++) {
      state = update(state, 1 / 60, NO_INPUT, 960).state;
    }
    expect(state.fog.revealed.some((v) => v === 1)).toBe(true);

    const next = chooseUpgrade(state, "longDash");
    expect(next.fog.revealed.every((v) => v === 0)).toBe(true);
    expect(next.fog.cols).toBe(Math.ceil(LEVELS[1].arenaWidth / FOG_CELL));
  });
});
