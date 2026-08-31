// requestAnimationFrame driver: clamps dt, pauses on tab blur (per the brief
// "pause safely on tab blur"), and keeps the canvas backing store matched to
// devicePixelRatio so the game stays crisp on hi-DPI screens without the CSS
// size changing.
//
// Drawing happens in a fixed-height logical coordinate space (LOGICAL_HEIGHT)
// rather than raw CSS pixels: the transform scales logical units to fill the
// canvas's actual height, and the visible logical width is whatever the
// device's aspect ratio gives at that height. That's what keeps ground
// height, jump arc, and HUD placement consistent between a 1920x1080 desktop
// and a 390x844 phone instead of one of them showing a sliver of the scene.
import type { RunState } from "./types";
import type { InputState, InputTracker } from "./input";
import { update } from "./run";
import { drawFrame } from "./render";
import { playSound, unlockAudio, type SoundEvent } from "./audio";
import { LOGICAL_HEIGHT } from "./constants";

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
  let dpr = 1;
  let scale = 1;
  let logicalWidth = LOGICAL_HEIGHT * (16 / 9);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = rect.height > 0 ? rect.height / LOGICAL_HEIGHT : 1;
    logicalWidth = scale > 0 ? rect.width / scale : LOGICAL_HEIGHT * (16 / 9);
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
    const { state, events } = update(current, dt, inputState, logicalWidth);
    setState(state);
    for (const event of events) playSound(event as SoundEvent);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawFrame(ctx, state, logicalWidth, LOGICAL_HEIGHT, Boolean(reducedMotion));

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
