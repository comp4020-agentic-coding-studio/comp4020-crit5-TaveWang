// Keyboard-only input with coyote time and jump buffering: a jump pressed
// slightly before landing or slightly after leaving a ledge still fires,
// which is what "forgiving" means in practice rather than in name.
const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const JUMP = new Set(["ArrowUp", "KeyW", "Space"]);
const DASH = new Set(["ShiftLeft", "ShiftRight", "KeyJ", "KeyK"]);
const ALL_KEYS = new Set([...LEFT, ...RIGHT, ...JUMP, ...DASH]);

export interface InputState {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
}

export class InputTracker {
  private held = new Set<string>();
  private jumpQueued = false;
  private dashQueued = false;
  private active = true;

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (ALL_KEYS.has(e.code)) e.preventDefault();
    if (JUMP.has(e.code) && !this.held.has(e.code)) this.jumpQueued = true;
    if (DASH.has(e.code) && !this.held.has(e.code)) this.dashQueued = true;
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  attach(target: Window = window): void {
    target.addEventListener("keydown", this.onKeyDown, { passive: false });
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("blur", this.onBlur);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.held.clear();
  }

  // Consumes the one-shot "just pressed" flags for jump/dash so a held key
  // doesn't retrigger every frame.
  poll(): InputState {
    const left = [...LEFT].some((k) => this.held.has(k));
    const right = [...RIGHT].some((k) => this.held.has(k));
    const jumpPressed = this.jumpQueued;
    const dashPressed = this.dashQueued;
    this.jumpQueued = false;
    this.dashQueued = false;
    return { left, right, jumpPressed, dashPressed };
  }
}
