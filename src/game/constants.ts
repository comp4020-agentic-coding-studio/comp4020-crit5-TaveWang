// The game world is drawn in a fixed logical coordinate space, not raw CSS
// pixels: the renderer scales logical units to fit whatever viewport it gets
// (see loop.ts), holding vertical proportions --- ground height, jump arc,
// HUD position --- constant whether the canvas is 1920x1080 or 390x844. Only
// the height is fixed; visible horizontal extent is whatever the device's
// aspect ratio gives at that height, which is the standard fit for a
// side-scroller (narrower devices simply see less of the arena at once).
export const LOGICAL_HEIGHT = 540;
export const GRAVITY = 2200;
export const GROUND_Y = 420;
export const ARENA_WIDTH = 2600;
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 46;

export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER = 0.12;
export const INVULN_DURATION = 0.9;
export const AFTERIMAGE_DAMAGE_WINDOW = 0.35;
export const AFTERIMAGE_TICK = 0.12;

export const BASE_STATS = {
  maxHealth: 3,
  moveSpeed: 280,
  jumpSpeed: 760,
  dashSpeed: 920,
  dashDuration: 0.16,
  dashCooldown: 0.55,
  slashWidth: 64,
  slashRange: 78,
  afterimage: false,
};

export const SLASH_DAMAGE = 1;
export const AFTERIMAGE_DAMAGE = 1;

export const HIT_PAUSE_DURATION = 0.06;
export const SHAKE_ON_HIT = 6;
export const SHAKE_ON_PLAYER_HIT = 9;
