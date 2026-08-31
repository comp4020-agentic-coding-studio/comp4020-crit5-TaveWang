// requestAnimationFrame driver: clamps dt, pauses on tab blur (per the brief
// "pause safely on tab blur"), and keeps the canvas backing store matched to
// devicePixelRatio so the game stays crisp on hi-DPI screens without the CSS
// size changing.
import type { RunState } from "./types";
import type { InputState, InputTracker } from "./input";
import { update } from "./run";
import { drawFrame } from "./render";
import { playSound, unlockAudio, type SoundEvent } from "./audio";

export interface LoopHandle {
  stop: () => void;
}

export function startLoop(
  canvas: HTMLCanvasElement,
  input: InputTracker,
  getState: () => RunState,
  setState: (state: RunState) => void,
): LoopHandle {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2d context unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let raf = 0;
  let last = 0;
  let stopped = false;
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onVisibility(): void {
    input.setActive(!document.hidden);
    last = 0;
  }

  function onPointerDown(): void {
    unlockAudio();
  }

  function frame(t: number): void {
    if (stopped) return;
    if (document.hidden) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = last ? Math.min((t - last) / 1000, 1 / 20) : 0;
    last = t;

    const inputState: InputState = input.poll();
    const current = getState();
    const { state, events } = update(current, dt, inputState);
    setState(state);
    for (const event of events) playSound(event as SoundEvent);

    const rect = canvas.getBoundingClientRect();
    drawFrame(ctx, state, rect.width, rect.height, Boolean(reducedMotion));

    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointerdown", onPointerDown);
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onPointerDown);
    },
  };
}
