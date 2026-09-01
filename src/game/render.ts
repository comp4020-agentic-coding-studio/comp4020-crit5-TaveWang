// Terrain, the hero, and enemies are drawn from CC0 sprite art (see
// src/assets/sprites/LICENSES.md for sources); particles, the HUD, and every
// gameplay-feedback overlay (telegraph outlines, stagger flash, health pips,
// the dash-ready gauge) stay plain Canvas 2D primitives, same as before.
import type { Enemy, PlayerState, Projectile, RunState, WeaponPickup } from "./types";
import { getMeleeHitbox, getSlashHitbox } from "./combat";
import { weaponById } from "./weapons";
import {
  LEVELS,
  exitRect,
  movingPlatformPositionAt,
  type Climbable,
  type GroundSegment,
  type Hazard,
  type LevelDef,
  type StaticPlatform,
  type WallRect,
} from "./level";
import { FOG_CELL, isRevealed, terrainGridFor } from "./fog";
import {
  ENEMY_SPRITES,
  FX_SPRITES,
  TILE_SPRITES,
  WEAPON_SPRITES,
  drawSheetFrame,
  drawStaticSprite,
  drawTintedSprite,
  isReady,
  pickHeroFrame,
  tilePattern,
} from "./sprites";

const PALETTE = {
  bgFar: "#14121d",
  bgMid: "#1c1830",
  bgNear: "#241f3d",
  ground: "#0d0c14",
  groundEdge: "#3a3552",
  wall: "#241f3d",
  player: "#f2ede0",
  playerCore: "#e8b04b",
  slash: "#f6e7b1",
  drifter: "#6a5a8c",
  sentinel: "#4f5f8c",
  warden: "#8c4f5a",
  wisp: "#9a5ad1",
  telegraph: "#ff5a5a",
  health: "#e8b04b",
  healthEmpty: "#332c46",
  dashReady: "#5bc8a8",
  dashCooling: "#332c46",
  exitClosed: "#2a2640",
  exitOpen: "#5bc8a8",
  text: "#cfc9de",
  fogSeenAir: "rgba(207, 201, 222, 0.06)",
  minimapPanel: "rgba(13, 12, 20, 0.72)",
  minimapBorder: "rgba(207, 201, 222, 0.25)",
  vine: "#5a7a5a",
};

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  width: number,
  height: number,
  reducedMotion: boolean,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const shakeAmt = reducedMotion ? 0 : state.shake;
  const shakeX = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
  const shakeY = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;

  drawBackground(ctx, width, height, state.camera.x);

  const level = LEVELS[state.encounterIndex];

  ctx.save();
  ctx.translate(-state.camera.x + shakeX, -state.camera.y + shakeY);

  for (const wall of level.walls) drawWall(ctx, wall);
  drawGround(ctx, level.groundSegments);
  for (const platform of level.platforms) drawPlatform(ctx, platform);
  for (const mp of level.movingPlatforms) {
    const p = movingPlatformPositionAt(mp, state.time);
    drawPlatform(ctx, { x: p.x, width: mp.width, y: p.y });
  }
  for (const hazard of level.hazards) drawHazard(ctx, hazard);
  for (const climbable of level.climbables) drawClimbable(ctx, climbable, state.time);
  drawExit(ctx, level, state.phase === "cleared", state.time);
  for (const enemy of state.enemies) drawEnemy(ctx, enemy);
  for (const pickup of state.weaponPickups) drawWeaponPickup(ctx, pickup);
  for (const projectile of state.projectiles) drawProjectile(ctx, projectile);
  for (const projectile of state.enemyProjectiles) drawProjectile(ctx, projectile);
  drawPlayer(ctx, state.player, state.time);
  drawParticles(ctx, state.particles);

  ctx.restore();
  ctx.restore();

  drawHud(ctx, state, width, height);

  if (state.phase === "title") drawTitleOverlay(ctx, width, height, state.time);
  if (state.phase === "victory") drawEndOverlay(ctx, width, height, "The hollow quiets.");
  if (state.phase === "defeat") drawEndOverlay(ctx, width, height, "The dark folds over you.");
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, camX: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, PALETTE.bgFar);
  grad.addColorStop(1, PALETTE.bgMid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = PALETTE.bgNear;
  const farOffset = -(camX * 0.2) % 240;
  for (let x = farOffset - 240; x < width + 240; x += 240) {
    ctx.beginPath();
    ctx.moveTo(x, height * 0.55);
    ctx.lineTo(x + 120, height * 0.35);
    ctx.lineTo(x + 240, height * 0.55);
    ctx.lineTo(x + 240, height);
    ctx.lineTo(x, height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(143, 111, 216, 0.06)";
  const midOffset = -(camX * 0.45) % 180;
  for (let x = midOffset - 180; x < width + 180; x += 180) {
    ctx.beginPath();
    ctx.arc(x + 90, height * 0.4, 70, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Plain fill, not a sprite --- the one wall texture found in the source pack
// turned out to be a single decorative brick-pile graphic rather than a
// seamlessly tileable one, so repeating it as a CanvasPattern along these
// tall, narrow rects produced a visibly seamed stack of disjoint chunks.
// Left as the flat palette colour instead of shipping that regression.
function drawWall(ctx: CanvasRenderingContext2D, wall: WallRect): void {
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
}

function drawGround(ctx: CanvasRenderingContext2D, segments: GroundSegment[]): void {
  const pattern = tilePattern(ctx, TILE_SPRITES.ground);
  for (const g of segments) {
    ctx.fillStyle = pattern ?? PALETTE.ground;
    ctx.fillRect(g.x, g.y, g.width, 400);
    ctx.fillStyle = PALETTE.groundEdge;
    ctx.fillRect(g.x, g.y - 4, g.width, 4);
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, platform: StaticPlatform): void {
  const pattern = tilePattern(ctx, TILE_SPRITES.platform);
  ctx.fillStyle = PALETTE.groundEdge;
  ctx.fillRect(platform.x, platform.y, platform.width, 14);
  ctx.fillStyle = pattern ?? PALETTE.ground;
  ctx.fillRect(platform.x, platform.y + 14, platform.width, 10);
}

function drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard): void {
  ctx.fillStyle = PALETTE.telegraph;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  const spikes = Math.max(1, Math.round(hazard.width / 14));
  const spikeWidth = hazard.width / spikes;
  for (let i = 0; i < spikes; i++) {
    const sx = hazard.x + i * spikeWidth;
    ctx.moveTo(sx, hazard.y);
    ctx.lineTo(sx + spikeWidth / 2, hazard.y - hazard.height);
    ctx.lineTo(sx + spikeWidth, hazard.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A vine: a wavy line with a few rung marks, drawn down its climbable band.
// Reads as a route to hold onto, not another platform to time a jump for.
function drawClimbable(ctx: CanvasRenderingContext2D, climbable: Climbable, time: number): void {
  const cx = climbable.x + climbable.width / 2;
  ctx.save();
  ctx.strokeStyle = PALETTE.vine;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const sway = 6;
  const step = 18;
  for (let y = climbable.yTop; y <= climbable.yBottom; y += step) {
    const x = cx + Math.sin(y * 0.05 + time * 0.6) * sway;
    if (y === climbable.yTop) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = PALETTE.vine;
  for (let y = climbable.yTop + step; y < climbable.yBottom; y += step * 2) {
    const x = cx + Math.sin(y * 0.05 + time * 0.6) * sway;
    ctx.fillRect(x - 8, y - 2, 16, 4);
  }
  ctx.restore();
}

// Every weapon pickup uses its own sprite, with tier pips beneath (the same
// visual language as enemy health) so power is readable without text. The
// simple silhouette is retained only as a loading fallback for the first
// frame before an image has decoded.
function drawWeaponPickup(ctx: CanvasRenderingContext2D, pickup: WeaponPickup): void {
  const def = weaponById(pickup.weaponId);
  const x = pickup.pos.x;
  const y = pickup.pos.y - 20;
  ctx.save();

  const sprite = WEAPON_SPRITES[pickup.weaponId];
  if (isReady(sprite)) {
    drawStaticSprite(ctx, sprite, x - 14, y - 14, 28, 28, false);
  } else {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    if (def.slot === "melee") {
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 11, y + 10);
      ctx.lineTo(x - 11, y + 10);
    } else {
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x, y + 12);
      ctx.lineTo(x - 10, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = def.color;
  for (let i = 0; i <= pickup.tier; i++) {
    ctx.fillRect(x - 9 + i * 8, y + 16, 5, 4);
  }
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile): void {
  const angle = Math.atan2(projectile.vel.y, projectile.vel.x);
  const len = 16;
  ctx.save();
  ctx.strokeStyle = projectile.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(projectile.pos.x - Math.cos(angle) * len, projectile.pos.y - Math.sin(angle) * len);
  ctx.lineTo(projectile.pos.x, projectile.pos.y);
  ctx.stroke();
  ctx.restore();
}

// The exit is always visible so its state change is the only "you can leave
// now" feedback the game gives --- no on-screen text. Closed/dim while any
// enemy survives, pulsing open once the level's `"cleared"` phase is entered.
function drawExit(ctx: CanvasRenderingContext2D, level: LevelDef, active: boolean, time: number): void {
  const rect = exitRect(level);
  const archReady = isReady(TILE_SPRITES.exit);

  if (active) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 3.2);
    ctx.save();
    ctx.shadowColor = PALETTE.exitOpen;
    ctx.shadowBlur = 18 + pulse * 10;
    ctx.fillStyle = PALETTE.exitOpen;
    ctx.globalAlpha = 0.55 + pulse * 0.25;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, [rect.w / 2, rect.w / 2, 0, 0]);
    ctx.fill();
    ctx.restore();

    if (archReady) drawStaticSprite(ctx, TILE_SPRITES.exit, rect.x, rect.y, rect.w, rect.h, false);

    ctx.strokeStyle = PALETTE.exitOpen;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, [rect.w / 2, rect.w / 2, 0, 0]);
    ctx.stroke();
  } else {
    if (archReady) {
      ctx.save();
      ctx.filter = "brightness(0.45) saturate(0.5)";
      drawStaticSprite(ctx, TILE_SPRITES.exit, rect.x, rect.y, rect.w, rect.h, false);
      ctx.restore();
    } else {
      ctx.fillStyle = PALETTE.exitClosed;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, [rect.w / 2, rect.w / 2, 0, 0]);
      ctx.fill();
    }
    ctx.strokeStyle = PALETTE.groundEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, [rect.w / 2, rect.w / 2, 0, 0]);
    ctx.stroke();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerState, time: number): void {
  const flicker = player.invulnTimer > 0 && Math.floor(player.invulnTimer * 20) % 2 === 0;
  if (flicker) ctx.globalAlpha = 0.4;

  if (player.afterimageTimer > 0 && player.afterimagePos) {
    ctx.fillStyle = "rgba(232, 176, 75, 0.25)";
    ctx.beginPath();
    ctx.ellipse(player.afterimagePos.x, player.afterimagePos.y - 23, 20, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A slightly larger box than the 28x46 hit-box: the sprite's own frame is
  // 24px wide pixel art, and drawing it hit-box-sized reads as too small.
  const w = 40;
  const h = 48;
  const x = player.pos.x - w / 2;
  const y = player.pos.y - h;
  const frame = pickHeroFrame(player, time);

  if (isReady(frame.sheet.image)) {
    drawSheetFrame(ctx, frame, x, y, w, h, player.facing !== 1);
  } else {
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.roundRect(player.pos.x - 14, y, 28, h, 10);
    ctx.fill();
  }

  const slash = getSlashHitbox(player);
  if (slash) {
    if (isReady(FX_SPRITES.slash)) {
      drawTintedSprite(ctx, FX_SPRITES.slash, slash.x, slash.y, slash.w, slash.h, PALETTE.slash, 0.85);
    } else {
      ctx.fillStyle = "rgba(246, 231, 177, 0.55)";
      ctx.beginPath();
      ctx.roundRect(slash.x, slash.y, slash.w, slash.h, 8);
      ctx.fill();
      ctx.strokeStyle = PALETTE.slash;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const melee = getMeleeHitbox(player);
  if (melee && player.weapons.melee) {
    const color = weaponById(player.weapons.melee.id).color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.roundRect(melee.x, melee.y, melee.w, melee.h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function enemyColor(enemy: Enemy): string {
  if (enemy.kind === "drifter") return PALETTE.drifter;
  if (enemy.kind === "sentinel") return PALETTE.sentinel;
  if (enemy.kind === "wisp") return PALETTE.wisp;
  return PALETTE.warden;
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const x = enemy.pos.x - enemy.width / 2;
  const y = enemy.pos.y - enemy.height;

  if (enemy.state === "dead") {
    const t = Math.max(0, enemy.deathTimer);
    ctx.globalAlpha = Math.max(0, t / 0.4);
    // A smoke puff grows in as the body fades out, rather than the body
    // simply disappearing --- the death effect Kenney's particle pack ships.
    if (isReady(FX_SPRITES.smoke)) {
      const grown = enemy.width * (1.4 + (1 - t / 0.4) * 0.6);
      drawTintedSprite(
        ctx,
        FX_SPRITES.smoke,
        enemy.pos.x - grown / 2,
        enemy.pos.y - enemy.height / 2 - grown / 2,
        grown,
        grown,
        PALETTE.text,
        Math.max(0, 1 - t / 0.4) * 0.7,
      );
    }
  }

  const sprite = ENEMY_SPRITES[enemy.kind];
  if (isReady(sprite)) {
    drawStaticSprite(ctx, sprite, x, y, enemy.width, enemy.height, enemy.patrolFacing === -1);
  } else {
    ctx.fillStyle = enemyColor(enemy);
    ctx.beginPath();
    ctx.roundRect(x, y, enemy.width, enemy.height, 6);
    ctx.fill();
  }

  if (enemy.state === "telegraph") {
    const progress = 1 - Math.max(0, enemy.stateTimer) / enemy.telegraphDuration;
    ctx.strokeStyle = PALETTE.telegraph;
    ctx.lineWidth = 2 + progress * 3;
    ctx.globalAlpha = 0.4 + progress * 0.5;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, enemy.width + 6, enemy.height + 6, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (enemy.state === "stagger") {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.roundRect(x, y, enemy.width, enemy.height, 6);
    ctx.fill();
  }

  // Health pips above tougher enemies only --- the single drifter doesn't
  // need a bar to be readable, but the boss does.
  if (enemy.maxHealth > 3 && enemy.state !== "dead") {
    const pipW = 6;
    const gap = 3;
    const total = enemy.maxHealth * pipW + (enemy.maxHealth - 1) * gap;
    let px = enemy.pos.x - total / 2;
    for (let i = 0; i < enemy.maxHealth; i++) {
      ctx.fillStyle = i < enemy.health ? PALETTE.telegraph : "rgba(255,255,255,0.15)";
      ctx.fillRect(px, y - 12, pipW, 4);
      px += pipW + gap;
    }
  }

  ctx.globalAlpha = 1;
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: RunState["particles"]): void {
  const sparkReady = isReady(FX_SPRITES.spark);
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    if (sparkReady) {
      const d = p.size * 4;
      drawTintedSprite(ctx, FX_SPRITES.spark, p.pos.x - d / 2, p.pos.y - d / 2, d, d, p.color, alpha);
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx: CanvasRenderingContext2D, state: RunState, width: number, height: number): void {
  if (state.phase === "title") return;
  const player = state.player;

  const pipSize = 16;
  const gap = 6;
  const startX = 20;
  const startY = 20;
  for (let i = 0; i < player.stats.maxHealth; i++) {
    const cx = startX + i * (pipSize + gap) + pipSize / 2;
    const cy = startY + pipSize / 2;
    ctx.fillStyle = i < player.health ? PALETTE.health : PALETTE.healthEmpty;
    ctx.beginPath();
    ctx.arc(cx, cy, pipSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const dashCx = width - 36;
  const dashCy = 36;
  ctx.beginPath();
  ctx.arc(dashCx, dashCy, 14, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.dashCooling;
  ctx.lineWidth = 4;
  ctx.stroke();

  const ready = player.dash.cooldownTimer <= 0;
  const progress = ready ? 1 : 1 - player.dash.cooldownTimer / player.stats.dashCooldown;
  ctx.beginPath();
  ctx.arc(dashCx, dashCy, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = ready ? PALETTE.dashReady : PALETTE.text;
  ctx.lineWidth = 4;
  ctx.stroke();

  drawMinimap(ctx, state, width, height);
  drawInventory(ctx, player, height);
}

// Bottom-left, two fixed slots: left is always melee (Y), right is always
// ranged (U) --- the keybind is conveyed purely by which slot is on which
// side, never by a label, matching the no-on-screen-text rule everywhere
// else in the HUD.
function drawInventory(ctx: CanvasRenderingContext2D, player: PlayerState, height: number): void {
  const slotSize = 40;
  const gap = 8;
  const pad = 8;
  const panelW = slotSize * 2 + gap + pad * 2;
  const panelH = slotSize + pad * 2;
  const panelX = 14;
  const panelY = height - panelH - 14;

  ctx.save();
  ctx.fillStyle = PALETTE.minimapPanel;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.minimapBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const slots: Array<{ instance: typeof player.weapons.melee; x: number }> = [
    { instance: player.weapons.melee, x: panelX + pad },
    { instance: player.weapons.ranged, x: panelX + pad + slotSize + gap },
  ];

  for (const slot of slots) {
    const y = panelY + pad;
    ctx.strokeStyle = PALETTE.minimapBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(slot.x, y, slotSize, slotSize, 5);
    ctx.stroke();

    if (slot.instance) {
      const def = weaponById(slot.instance.id);
      const cx = slot.x + slotSize / 2;
      const cy = y + slotSize / 2 - 3;
      const sprite = WEAPON_SPRITES[slot.instance.id];
      if (isReady(sprite)) {
        drawStaticSprite(ctx, sprite, cx - 12, cy - 12, 24, 24, false);
      } else {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        if (def.slot === "melee") {
          ctx.moveTo(cx, cy - 9);
          ctx.lineTo(cx + 8, cy + 7);
          ctx.lineTo(cx - 8, cy + 7);
        } else {
          ctx.moveTo(cx, cy - 9);
          ctx.lineTo(cx + 8, cy);
          ctx.lineTo(cx, cy + 9);
          ctx.lineTo(cx - 8, cy);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = def.color;
      for (let i = 0; i <= slot.instance.tier; i++) {
        ctx.fillRect(slot.x + 5 + i * 8, y + slotSize - 7, 5, 4);
      }
    }
  }
  ctx.restore();
}

// A small fog-of-war map, bottom-right: the level's terrain is only drawn
// where the player has already been (state.fog), so the layout is
// discovered by exploring rather than visible up front.
function drawMinimap(ctx: CanvasRenderingContext2D, state: RunState, width: number, height: number): void {
  const level = LEVELS[state.encounterIndex];
  const fog = state.fog;
  const terrain = terrainGridFor(level);

  const panelW = 168;
  const panelH = 104;
  const pad = 8;
  const panelX = width - panelW - 14;
  const panelY = height - panelH - 14;

  ctx.fillStyle = PALETTE.minimapPanel;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.minimapBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const worldH = level.worldBottom - level.worldTop;
  const scale = Math.min((panelW - pad * 2) / level.arenaWidth, (panelH - pad * 2) / worldH);
  const mapW = level.arenaWidth * scale;
  const mapH = worldH * scale;
  const originX = panelX + (panelW - mapW) / 2;
  const originY = panelY + (panelH - mapH) / 2;

  const cellPx = Math.max(1, FOG_CELL * scale);
  for (let gy = 0; gy < fog.rows; gy++) {
    for (let gx = 0; gx < fog.cols; gx++) {
      if (!isRevealed(fog, gx, gy)) continue;
      const hasTerrain = terrain[gy * fog.cols + gx] === 1;
      ctx.fillStyle = hasTerrain ? PALETTE.groundEdge : PALETTE.fogSeenAir;
      ctx.fillRect(originX + gx * cellPx, originY + gy * cellPx, cellPx + 0.5, cellPx + 0.5);
    }
  }

  // The camera's current view, so the minimap reads as "where this screen sits".
  ctx.strokeStyle = PALETTE.text;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(
    originX + state.camera.x * scale,
    originY + (state.camera.y - level.worldTop) * scale,
    width * scale,
    height * scale,
  );
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // The player's own position is always known, fog or not.
  ctx.fillStyle = PALETTE.playerCore;
  ctx.beginPath();
  ctx.arc(originX + state.player.pos.x * scale, originY + (state.player.pos.y - level.worldTop) * scale, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawTitleOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, time: number): void {
  const pulse = 0.55 + 0.25 * Math.sin(time * 1.4);
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(232, 176, 75, ${pulse})`;
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText("Ashen Hollow", width / 2, height * 0.28);
  ctx.restore();
}

function drawEndOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, line: string): void {
  ctx.save();
  ctx.fillStyle = "rgba(10, 9, 15, 0.45)";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.text;
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(line, width / 2, height * 0.42);
  ctx.restore();
}
