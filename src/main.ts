import './style.css';
import { GAME, PALETTE, RENDER, SIM } from './config';
import { DIR_VEC, Player } from './game/player';
import { bindInput } from './input';
import { Graph } from './map/graph';
import mapData from './map/ortigia-map.json';
import type { MapData } from './map/types';
import { MapRenderer } from './render/mapRenderer';
import { View } from './render/view';
import { showOverlay, hideOverlay } from './ui/overlay';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const attribution = document.getElementById('attribution')!;

const graph = new Graph(mapData as MapData);
const view = new View();
const mapLayer = new MapRenderer(graph);
const debug = new URLSearchParams(location.search).has('debug');

attribution.innerHTML = graph.data.source === 'osm'
  ? 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  : 'Approximate street plan — rebuild with OpenStreetMap data';

// ---------------------------------------------------------------------------
type Phase = 'title' | 'playing' | 'ended';
let phase: Phase = 'title';
let player: Player;
let elapsed = 0;
let lastDirAt = -Infinity;

function arrivalNode(): number {
  const bridge = graph.edges.find((e) => e.kind === 'bridge' && e.name === GAME.arrivalBridge) ?? graph.edges.find((e) => e.kind === 'bridge')!;
  return graph.node(bridge.a).exit ? bridge.b : bridge.a;
}

function newGame() {
  player = new Player(graph, arrivalNode(), Math.random);
  elapsed = 0;
  phase = 'playing';
  hideOverlay();
}

function endGame(via: string) {
  phase = 'ended';
  const t = Math.round(elapsed);
  showOverlay(`
    <h1>Arrivederci</h1>
    <p>You crossed <b>${via}</b> back to the mainland after ${Math.floor(t / 60)}m ${t % 60}s on the island.</p>
    <p class="small">Milestone 1 — money, hunger and the rest arrive in Milestone 2.</p>
    <button id="again">Walk in again</button>`);
  document.getElementById('again')!.onclick = newGame;
}

function title() {
  showOverlay(`
    <h1>Ortigia</h1>
    <p>A labyrinth of limestone on the sea. Your dot never stops walking.</p>
    <p class="small">Steer with <b>arrow keys / WASD</b> or <b>swipe</b>. Your turn is taken at the next corner where it's possible. Push against your direction to turn round. One-way streets are marked with small arrows. The green markers are the bridges out.</p>
    <button id="start">Enter Ortigia</button>`);
  document.getElementById('start')!.onclick = newGame;
}

bindInput(canvas, (d) => {
  if (phase !== 'playing') return;
  player.queue(d);
  lastDirAt = elapsed;
});
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && phase !== 'playing') { e.preventDefault(); newGame(); }
});

// ---------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const hudH = hud.getBoundingClientRect().height;
  view.fit(graph, w, h, hudH, 14);
  mapLayer.render(view, dpr);
}
window.addEventListener('resize', resize);

function update(dt: number) {
  if (phase !== 'playing') return;
  elapsed += dt;
  player.update(dt);
  if (player.exitedVia) endGame(player.exitedVia);
}

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

  if (phase === 'title' || !player) { drawHud(); return; }
  const w = player.walker;
  const p = view.toScreen(w.pos);
  const h = w.heading;
  const r = RENDER.playerRadiusPx;

  // queued-turn hint: a small arrow beside the dot
  if (player.queued) {
    const v = DIR_VEC[player.queued];
    const fade = Math.min(1, (elapsed - lastDirAt) / RENDER.queuedHintFade);
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
  // the traveller
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(p.x + 1, p.y + 1.5, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.strokeStyle = PALETTE.playerRing;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PALETTE.playerRing;
  ctx.beginPath(); ctx.arc(p.x + h.x * r * 0.45, p.y - h.y * r * 0.45, r * 0.32, 0, Math.PI * 2); ctx.fill();

  drawHud();
}

let hudCache = '';
function drawHud() {
  const t = Math.floor(elapsed);
  const street = phase === 'playing' ? player.walker.edge.name ?? '' : '';
  const html = `<span class="title">Ortigia</span><span class="spacer"></span><span class="hint">${street}</span><span>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`;
  if (html !== hudCache) { hud.innerHTML = html; hudCache = html; }
}

let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(SIM.maxFrameTime, (now - last) / 1000);
  last = now;
  while (acc >= SIM.step) { update(SIM.step); acc -= SIM.step; }
  draw();
  requestAnimationFrame(frame);
}

drawHud();
resize();
title();
requestAnimationFrame(frame);
