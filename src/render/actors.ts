import { BAD_GUYS } from '../config';
import type { Game } from '../game/game';
import { groupMembers, type Npc } from '../game/npcs';
import type { View } from './view';

const HATS = ['#ffd23f', '#3bceac', '#ee4266', '#ffffff', '#5aa9e6', '#f78c2b'];

/** Moving characters and street hazards, drawn every frame in screen space. */
export function drawActors(ctx: CanvasRenderingContext2D, view: View, game: Game) {
  for (const p of game.poops) drawPoop(ctx, view.sx(p.pos.x), view.sy(p.pos.y));
  // tourists first so smaller characters stay visible on top
  for (const n of game.npcs) if (n.kind === 'tourists') drawTourists(ctx, view, n, game.time);
  for (const n of game.npcs) {
    if (n.kind === 'tourists') continue;
    const p = view.toScreen(n.walker.pos);
    if (n.kind === 'beggar') drawBeggar(ctx, p.x, p.y);
    else if (n.kind === 'sexworker') drawHeart(ctx, p.x, p.y);
    else if (n.kind === 'bad') drawBadGuy(ctx, p.x, p.y, BAD_GUYS.sizes[n.size!].radiusPx, game.time + n.id);
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x + 0.8, y + 1.6, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBeggar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y, 5);
  ctx.fillStyle = '#8b7d6b';
  ctx.strokeStyle = '#3d342a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // the cup
  ctx.fillStyle = '#f2e7cc';
  ctx.strokeStyle = '#3d342a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 3, y + 2); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x + 8, y + 6.5); ctx.lineTo(x + 4, y + 6.5); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y, 5.5);
  ctx.fillStyle = '#e0559b';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + 5.5);
  ctx.bezierCurveTo(x - 8, y, x - 5, y - 7, x, y - 3);
  ctx.bezierCurveTo(x + 5, y - 7, x + 8, y, x, y + 5.5);
  ctx.fill(); ctx.stroke();
}

function drawBadGuy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  shadow(ctx, x, y, r);
  const spikes = 9, wob = Math.sin(t * 8) * 0.12;
  ctx.fillStyle = '#2a1b1b';
  ctx.strokeStyle = '#d23c2c';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * Math.PI) / spikes + wob, rr = i % 2 ? r * 0.72 : r * 1.12;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // angry eyes
  ctx.fillStyle = '#ffdfd6';
  const e = r * 0.32, ey = y - r * 0.08;
  ctx.beginPath(); ctx.arc(x - e, ey, Math.max(0.9, r * 0.14), 0, Math.PI * 2); ctx.arc(x + e, ey, Math.max(0.9, r * 0.14), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffdfd6';
  ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(x - e * 1.8, ey - r * 0.36); ctx.lineTo(x - e * 0.4, ey - r * 0.16);
  ctx.moveTo(x + e * 1.8, ey - r * 0.36); ctx.lineTo(x + e * 0.4, ey - r * 0.16);
  ctx.stroke();
}

function drawTourists(ctx: CanvasRenderingContext2D, view: View, n: Npc, t: number) {
  const members = groupMembers(n);
  members.forEach((m, i) => {
    const bob = Math.sin(t * 9 + i * 1.7) * 0.6;
    const p = view.toScreen(m);
    const ox = ((n.hats![i] % 7) - 3) * 0.9, oy = ((Math.floor(n.hats![i] / 7) % 7) - 3) * 0.9;
    shadow(ctx, p.x + ox, p.y + oy, 3.2);
    ctx.fillStyle = HATS[n.hats![i] % HATS.length];
    ctx.strokeStyle = 'rgba(30,30,40,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy + bob, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  // the guide's raised umbrella
  const g = view.toScreen(members[0]);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(g.x, g.y - 3); ctx.lineTo(g.x, g.y - 13); ctx.stroke();
  ctx.fillStyle = '#ee4266';
  ctx.beginPath(); ctx.moveTo(g.x - 5, g.y - 12); ctx.quadraticCurveTo(g.x, g.y - 19, g.x + 5, g.y - 12); ctx.closePath(); ctx.fill();
}

function drawPoop(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x + 0.5, y + 2.5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4423';
  ctx.strokeStyle = '#3e2512';
  ctx.lineWidth = 0.8;
  for (const [dy, rx] of [[1.2, 4.6], [-1.2, 3.4], [-3.3, 2.1]] as const) {
    ctx.beginPath(); ctx.ellipse(x, y + dy, rx, 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

/** A few tourists and an umbrella, for the "dragged" card icon. */
export function drawTouristIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  [[-6, 3], [0, 5], [6, 2], [-2, -2], [4, -4]].forEach(([dx, dy], i) => {
    ctx.fillStyle = HATS[i];
    ctx.strokeStyle = 'rgba(30,30,40,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + dx, y + dy + 3, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  ctx.strokeStyle = '#333';
  ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 2, y - 11); ctx.stroke();
  ctx.fillStyle = '#ee4266';
  ctx.beginPath(); ctx.moveTo(x - 8, y - 10); ctx.quadraticCurveTo(x - 2, y - 17, x + 4, y - 10); ctx.closePath(); ctx.fill();
}
