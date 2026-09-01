// All sound is synthesised, not sampled: short oscillator/noise bursts built
// at call time, so there are no asset files or licences to track. Every
// entry point is wrapped so a browser without (or blocking) AudioContext
// leaves the game fully playable, just silent.
export type SoundEvent =
  | "dash"
  | "hit"
  | "playerHit"
  | "enemyDeath"
  | "select"
  | "victory"
  | "defeat"
  | "pickup"
  | "meleeAttack"
  | "rangedAttack";

let ctx: AudioContext | null = null;
let muted = false;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const c = getContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, duration: number, type: OscillatorType, gainValue: number, sweep?: number): void {
  if (muted) return;
  const c = getContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), c.currentTime + duration);
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch {
    // Audio is best-effort; a failure here should never break gameplay.
  }
}

function noiseBurst(duration: number, gainValue: number): void {
  if (muted) return;
  const c = getContext();
  if (!c) return;
  try {
    const size = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    src.connect(gain).connect(c.destination);
    src.start();
  } catch {
    // ignore
  }
}

export function playSound(event: SoundEvent): void {
  switch (event) {
    case "dash":
      tone(520, 0.12, "sawtooth", 0.05, -260);
      break;
    case "hit":
      noiseBurst(0.08, 0.12);
      tone(180, 0.09, "square", 0.07, -60);
      break;
    case "playerHit":
      tone(120, 0.22, "sawtooth", 0.09, -70);
      break;
    case "enemyDeath":
      tone(300, 0.3, "triangle", 0.07, -220);
      break;
    case "select":
      tone(660, 0.08, "sine", 0.05, 120);
      break;
    case "victory":
      tone(440, 0.5, "sine", 0.06, 220);
      break;
    case "defeat":
      tone(200, 0.6, "sine", 0.06, -140);
      break;
    case "pickup":
      tone(500, 0.14, "sine", 0.06, 260);
      break;
    case "meleeAttack":
      noiseBurst(0.05, 0.08);
      tone(140, 0.08, "square", 0.06, -40);
      break;
    case "rangedAttack":
      tone(720, 0.06, "triangle", 0.05, 140);
      break;
  }
}
