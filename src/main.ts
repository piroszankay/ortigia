import './style.css';
import { GAME, PALETTE, RENDER, SIM } from './config';
import { Game } from './game/game';
import { buildPlaces } from './game/places';
import { DIR_VEC } from './game/player';
import { bindInput } from './input';
import { Graph } from './map/graph';
import mapData from './map/ortigia-map.json';
import type { MapData } from './map/types';
import { drawActors } from './render/actors';
import { MapRenderer } from './render/mapRenderer';
import { View } from './render/view';
import { ActionCard } from './ui/actionCard';
import { Hud } from './ui/hud';
import { showEnding, showTitle } from './ui/screens';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hudEl = document.getElementById('hud')!;
const toastsEl = document.getElementById('toasts')!;
const attribution = document.getElementById('attribution')!;

const graph = new Graph(mapData as MapData);
const view = new View();
const mapLayer = new MapRenderer(graph);
const hud = new Hud(hudEl);
const card = new ActionCard(document.getElementById('action')!, {
  act: () => game?.act(),
  wake: () => game?.wake(true),
  accept: () => game?.acceptOffer(),
  decline: () => game?.declineOffer(),
});
const debug = new URLSearchParams(location.search).has('debug');
const staticPlaces = buildPlaces(graph);
// ?debug exposes the running game for console poking and screenshot scripts
if (debug) Object.defineProperty(window, '__game', { get: () => game });

attribution.innerHTML = graph.data.source === 'osm'
  ? 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  : 'Approximate street plan — rebuild with OpenStreetMap data';

// ---------------------------------------------------------------------------
let game: Game | null = null;
let lastDirAt = -Infinity;

const arrivalBridge = graph.edges.find((e) => e.kind === 'bridge' && e.name === GAME.arrivalBridge) ?? graph.edges.find((e) => e.kind === 'bridge')!;
const arrivalNode = graph.node(arrivalBridge.a).exit ? arrivalBridge.b : arrivalBridge.a;

function title() {
  game = null;
  showTitle((money) => {
    game = new Game(graph, money, arrivalNode, Math.random);
    shownToasts = 0;
    toastsEl.innerHTML = '';
  }, arrivalBridge.name ?? 'the bridge');
}

bindInput(canvas, (d) => {
  if (!game || game.ending) return;
  game.steer(d);
  lastDirAt = game.time;
});
window.addEventListener('keydown', (e) => {
  if (!game || game.ending) return;
  if (game.offer && (e.key === 'y' || e.key === 'Y')) { game.acceptOffer(); return; }
  if (game.offer && (e.key === 'n' || e.key === 'N' || e.key === 'Escape')) { game.declineOffer(); return; }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    if (game.sleeping) game.wake(true);
    else game.act();
  }
});

// ---------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const r = hudEl.getBoundingClientRect();
  const sidebar = r.height > h * 0.6; // wide screens: HUD is a left column
  const inset = sidebar ? { left: r.width, top: 0, right: 0, bottom: 14 } : { left: 0, top: r.height, right: 0, bottom: 14 };
  document.documentElement.style.setProperty('--map-left', `${inset.left}px`);
  view.fit(graph, w, h, inset);
  mapLayer.render(view, dpr, staticPlaces);
}
window.addEventListener('resize', resize);

function update(dt: number) {
  if (!game || game.ending) return;
  game.update(dt);
  if (game.ending) {
    const g = game;
    setTimeout(() => showEnding(g, g.ending!, title), 600);
  }
}

// ---------------------------------------------------------------------------
function draw() {
  const dpr = canvas.width / view.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mapLayer.canvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (debug) {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#000';
    for (const n of graph.nodes) { const p = view.toScreen(n); ctx.fillText(String(n.id), p.x + 3, p.y - 3); }
  }

  if (game) {
    drawNear(game);
    drawActors(ctx, view, game);
    drawPlayer(game);
  }
  hud.update(game);
  card.update(game);
  drawToasts();
}

function drawNear(g: Game) {
  const p = g.near ?? g.sleeping?.place;
  if (!p) return;
  const s = view.toScreen(p.pos);
  const pulse = (Math.sin(g.time * 6) + 1) / 2;
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, RENDER.placeRadiusPx + 3 + pulse * 2.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlayer(g: Game) {
  const w = g.player.walker;
  const p = view.toScreen(w.pos);
  const h = w.heading;
  const r = RENDER.playerRadiusPx;

  // queued-turn hint: a small arrow beside the dot
  const q = g.player.queued;
  if (q) {
    const v = DIR_VEC[q];
    const fade = Math.min(1, (g.time - lastDirAt) / RENDER.queuedHintFade);
    ctx.globalAlpha = 0.55 + 0.45 * (1 - fade);
    const ax = p.x + v.x * (r + 9), ay = p.y - v.y * (r + 9);
    ctx.fillStyle = PALETTE.playerRing;
    ctx.beginPath();
    ctx.moveTo(ax + v.x * 5, ay - v.y * 5);
    ctx.lineTo(ax - v.x * 2 + v.y * 4, ay + v.y * 2 + v.x * 4);
    ctx.lineTo(ax - v.x * 2 - v.y * 4, ay + v.y * 2 - v.x * 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // blink while invulnerable after a hit
  if (g.invulnerable && Math.floor(g.time * 10) % 2) ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(p.x + 1, p.y + 1.5, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g.sleeping ? '#d9d4f0' : g.dirty ? '#d8c3a5' : PALETTE.player;
  ctx.strokeStyle = PALETTE.playerRing;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (g.sleeping) {
    // drifting z's
    ctx.font = 'italic bold 11px Georgia, serif';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(22,50,92,0.8)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const t = (g.time * 0.6 + i / 3) % 1;
      ctx.globalAlpha = 1 - t;
      const zx = p.x + 6 + t * 10 + i * 2, zy = p.y - 8 - t * 18;
      ctx.strokeText('z', zx, zy);
      ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = PALETTE.playerRing;
    ctx.beginPath(); ctx.arc(p.x + h.x * r * 0.45, p.y - h.y * r * 0.45, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let shownToasts = 0;
function drawToasts() {
  if (!game) return;
  while (shownToasts < game.toasts.length) {
    const t = game.toasts[shownToasts++];
    const el = document.createElement('div');
    el.className = `toast ${t.tone}`;
    el.textContent = t.text;
    toastsEl.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
    while (toastsEl.children.length > 3) toastsEl.firstChild!.remove();
  }
}

// ---------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(SIM.maxFrameTime, (now - last) / 1000);
  last = now;
  while (acc >= SIM.step) { update(SIM.step); acc -= SIM.step; }
  draw();
  requestAnimationFrame(frame);
}

hud.update(null);
resize();
title();
requestAnimationFrame(frame);
