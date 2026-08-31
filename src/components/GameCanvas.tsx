import { useEffect, useRef, useState } from "react";
import type { RunState } from "../game/types";
import { createInitialRun, chooseUpgrade } from "../game/run";
import { InputTracker } from "../game/input";
import { startLoop } from "../game/loop";
import { isMuted, playSound, setMuted, unlockAudio } from "../game/audio";
import { UPGRADE_POOL } from "../game/upgrades";

// The upgrade choice is the one moment the brief allows over-canvas HTML: two
// icon cards, no sentences. Everything else the player needs to know is
// communicated by the canvas itself, per the no-tutorial rule in CLAUDE.md's
// spirit and the crit-5 brief.
export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunState>(createInitialRun());
  const [phase, setPhase] = useState(stateRef.current.phase);
  const [choices, setChoices] = useState(stateRef.current.upgradeChoices);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const input = new InputTracker();
    input.attach();

    let lastPhase = stateRef.current.phase;
    const loop = startLoop(
      canvas,
      input,
      () => stateRef.current,
      (next) => {
        stateRef.current = next;
        if (next.phase !== lastPhase) {
          lastPhase = next.phase;
          setPhase(next.phase);
          setChoices(next.upgradeChoices);
        }
      },
    );

    return () => {
      loop.stop();
      input.detach();
    };
  }, []);

  function handleUpgrade(id: (typeof UPGRADE_POOL)[number]["id"]): void {
    stateRef.current = chooseUpgrade(stateRef.current, id);
    setPhase(stateRef.current.phase);
    playSound("select");
  }

  function toggleMute(): void {
    unlockAudio();
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }

  return (
    <div className="game-stage">
      <canvas ref={canvasRef} className="game-stage__canvas" />
      <button
        type="button"
        className="game-stage__mute"
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onClick={toggleMute}
      >
        {muted ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 9v6h4l5 5V4L8 9H4zm12.3 3-2.3 2.3-1.4-1.4L14.9 10.6 12.6 8.3 14 6.9l2.3 2.3 2.3-2.3 1.4 1.4L17.7 10.6l2.3 2.3-1.4 1.4L16.3 12z"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
          </svg>
        )}
      </button>
      {phase === "upgrade" && (
        <div className="upgrade-overlay" role="group" aria-label="Choose an upgrade">
          {choices.map((id) => {
            const def = UPGRADE_POOL.find((u) => u.id === id)!;
            return (
              <button
                key={id}
                type="button"
                className="upgrade-card"
                style={{ ["--upgrade-color" as string]: def.color }}
                onClick={() => handleUpgrade(id)}
                aria-label={def.label}
              >
                <span className="upgrade-card__icon" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
