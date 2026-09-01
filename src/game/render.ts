// All visuals are drawn with Canvas 2D primitives (rects, arcs, gradients) --
// there are no image assets, so there is nothing to licence. Silhouettes and
// colour do the work that sprites would elsewhere.
import type { Enemy, PlayerState, RunState } from "./types";
import { getSlashHitbox } from "./combat";
import {
  LEVELS,
  movingPlatformPositionAt,
  type GroundSegment,
  type Hazard,
  type StaticPlatform,
  type WallRect,
} from "./level";
import { FOG_CELL, isRevealed, terrainGridFor } from "./fog";

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
  telegraph: "#ff5a5a",
  health: "#e8b04b",
  healthEmpty: "#332c46",
  dashReady: "#5bc8a8",
  dashCooling: "#332c46",
  text: "#cfc9de",
  fogSeenAir: "rgba(207, 201, 222, 0.06)",
  minimapPanel: "rgba(13, 12, 20, 0.72)",
  minimapBorder: "rgba(207, 201, 222, 0.25)",
};

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  width: number,
  height: number,
  reducedMotion: boolean,
): void {
  ctx.save();
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
  for (const enemy of state.enemies) drawEnemy(ctx, enemy);
  drawPlayer(ctx, state.player);
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

function drawWall(ctx: CanvasRenderingContext2D, wall: WallRect): void {
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
}

function drawGround(ctx: CanvasRenderingContext2D, segments: GroundSegment[]): void {
  for (const g of segments) {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(g.x, g.y, g.width, 400);
    ctx.fillStyle = PALETTE.groundEdge;
    ctx.fillRect(g.x, g.y - 4, g.width, 4);
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, platform: StaticPlatform): void {
  ctx.fillStyle = PALETTE.groundEdge;
  ctx.fillRect(platform.x, platform.y, platform.width, 14);
  ctx.fillStyle = PALETTE.ground;
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

function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerState): void {
  const flicker = player.invulnTimer > 0 && Math.floor(player.invulnTimer * 20) % 2 === 0;
  if (flicker) ctx.globalAlpha = 0.4;

  if (player.afterimageTimer > 0 && player.afterimagePos) {
    ctx.fillStyle = "rgba(232, 176, 75, 0.25)";
    ctx.beginPath();
    ctx.ellipse(player.afterimagePos.x, player.afterimagePos.y - 23, 20, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const w = 28;
  const h = 46;
  const x = player.pos.x - w / 2;
  const y = player.pos.y - h;

  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();

  ctx.fillStyle = PALETTE.playerCore;
  const eyeX = player.facing === 1 ? x + w - 9 : x + 3;
  ctx.beginPath();
  ctx.arc(eyeX, y + 14, 3.5, 0, Math.PI * 2);
  ctx.fill();

  const slash = getSlashHitbox(player);
  if (slash) {
    ctx.fillStyle = "rgba(246, 231, 177, 0.55)";
    ctx.beginPath();
    ctx.roundRect(slash.x, slash.y, slash.w, slash.h, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.slash;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function enemyColor(enemy: Enemy): string {
  if (enemy.kind === "drifter") return PALETTE.drifter;
  if (enemy.kind === "sentinel") return PALETTE.sentinel;
  return PALETTE.warden;
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  if (enemy.state === "dead") {
    const t = enemy.deathTimer;
    ctx.globalAlpha = Math.max(0, t / 0.4);
  }

  const x = enemy.pos.x - enemy.width / 2;
  const y = enemy.pos.y - enemy.height;

  ctx.fillStyle = enemyColor(enemy);
  ctx.beginPath();
  ctx.roundRect(x, y, enemy.width, enemy.height, 6);
  ctx.fill();

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
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
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
