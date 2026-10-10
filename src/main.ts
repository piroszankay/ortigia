import './style.css';
import { GAME, NIGHT, PALETTE, RENDER, SIM, TOUCH } from './config';
import { Game } from './game/game';
import { buildPlaces } from './game/places';
import { DIR_VEC } from './game/player';
import { bindInput } from './input';
import { Graph } from './map/graph';
import mapData from './map/ortigia-map.json';
import type { MapData } from './map/types';
import { drawActors } from './render/actors';
import { drawPlaceGlyph } from './render/glyphs';
import { MapRenderer } from './render/mapRenderer';
import { View } from './render/view';
import { ActionCard } from './ui/actionCard';
import { Hud } from './ui/hud';
import { MarketPanel } from './ui/marketPanel';
import { howToSeen, showEnding, showHowTo, showTitle } from './ui/screens';
import { hideOverlay, showOverlay } from './ui/overlay';
import { isMuted, play, toggleMute, unlockAudio } from './sound';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hudEl = document.getElementById('hud')!;
const attribution = document.getElementById('attribution')!;

const graph = new Graph(mapData as MapData);
const view = new View();
const mapLayer = new MapRenderer(graph);
const hud = new Hud(hudEl);
const card = new ActionCard(document.getElementById('action')!, {
  act: () => game?.act(),
  pickpocket: () => game?.pickpocket(),
  offerDrink: () => game?.offerDrink(),
  drinkSpare: () => game?.drinkSpare(),
  stopFishing: () => game?.stopFishing(),
  wake: () => game?.wake(true),
  accept: () => game?.acceptOffer(),
  decline: () => game?.declineOffer(),
});
const market = new MarketPanel(document.getElementById('market')!, () => game?.buy(), () => game?.sell());
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
const trail: { x: number; y: number; t: number }[] = [];

const arrivalBridge = graph.edges.find((e) => e.kind === 'bridge' && e.name === GAME.arrivalBridge) ?? graph.edges.find((e) => e.kind === 'bridge')!;
const arrivalNode = graph.node(arrivalBridge.a).exit ? arrivalBridge.b : arrivalBridge.a;

function title() {
  game = null;
  game = null;
  showTitle((money) => {
    game = new Game(graph, money, arrivalNode, Math.random);
    paused = false;
    play('start');
    shownToasts = 0;
    hud.clearMessages();
    trail.length = 0;
  }, arrivalBridge.name ?? 'the bridge');
}

bindInput(canvas, (d) => {
  if (!game || game.ending || paused) return;
  game.steer(d);
  lastDirAt = game.time;
}, () => (game && !game.ending ? view.toScreen(game.player.walker.pos) : null));

// audio may only start after a user gesture
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

// ---------------------------------------------------------------------------
// pause: HUD button, Esc, or switching away from the tab
let paused = false;
function setPaused(p: boolean) {
  if (!game || game.ending || p === paused) return;
  paused = p;
  if (p) {
    showOverlay(`<h1>Paused</h1><p>The labyrinth waits for you.</p><button id="resume" type="button">Carry on</button>`);
    const b = document.getElementById('resume') as HTMLButtonElement;
    b.onclick = () => setPaused(false);
    b.focus();
  } else hideOverlay();
}
hud.bindButtons(() => toggleMute(), () => setPaused(!paused), isMuted());
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

window.addEventListener('keydown', (e) => {
  if (!game || game.ending) return;
  if (e.key === 'Escape' && !game.offer) { setPaused(!paused); return; }
  if (paused) return;
  if (e.key === 'o' || e.key === 'O') { game.offerDrink(); return; }
  if (game.offer && (e.key === 'y' || e.key === 'Y')) { game.acceptOffer(); return; }
  if (game.offer && (e.key === 'n' || e.key === 'N' || e.key === 'Escape')) { game.declineOffer(); return; }
  if (e.key === 'p' || e.key === 'P') { game.pickpocket(); return; }
  if (e.key === '1') { game.buy(); return; }
  if (e.key === '2') { game.sell(); return; }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    if (game.sleeping) game.wake(true);
    else if (game.fishing) game.stopFishing();
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
  document.documentElement.style.setProperty('--hud-bottom', `${sidebar ? 0 : r.height}px`);
  view.fit(graph, w, h, inset);
  mapLayer.render(view, dpr, staticPlaces);
}
window.addEventListener('resize', resize);

function update(dt: number) {
  if (!game || game.ending || paused) return;
  game.update(dt);
  for (const s of game.sfx) {
    play(s);
    if (s === 'hit' && TOUCH.vibrateMs) navigator.vibrate?.(TOUCH.vibrateMs);
  }
  game.sfx.length = 0;
  if (game.ending) {
    const g = game;
    play(g.ending!.kind === 'win' ? 'win' : g.ending!.kind === 'poorer' ? 'start' : 'death');
    setTimeout(() => showEnding(g, g.ending!, title), 600);
  }
}

/** Night falls with the in-game clock: a soft blue tint over the map (0 = day). */
function nightAlpha(min: number) {
  const h = (min / 60) % 24, n = NIGHT;
  let k = 0;
  if (h >= n.nightStart || h < n.dawnStart) k = 1;
  else if (h >= n.duskStart) k = (h - n.duskStart) / (n.nightStart - n.duskStart);
  else if (h < n.dayStart) k = 1 - (h - n.dawnStart) / (n.dayStart - n.dawnStart);
  return k * n.maxAlpha;
}

function drawParty(g: Game) {
  if (!g.party) return;
  const p = view.toScreen(g.party.place.pos);
  const t = g.time;
  // pulsing dance floor and confetti
  for (let i = 0; i < 2; i++) {
    const ph = ((t * 0.8 + i * 0.5) % 1);
    ctx.strokeStyle = `rgba(190,90,240,${0.6 * (1 - ph)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 9 + ph * 22, 0, Math.PI * 2); ctx.stroke();
  }
  const colors = ['#ffd23f', '#ee4266', '#3bceac', '#5aa9e6', '#ffffff'];
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63 + t * 1.3, r = 12 + ((i * 7 + t * 9) % 14);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(p.x + Math.cos(a) * r - 1.2, p.y + Math.sin(a) * r - 1.2, 2.4, 2.4);
  }
  drawPlaceGlyph(ctx, 'party', p.x, p.y, RENDER.placeRadiusPx + 1, g.party.attended);
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
    const na = nightAlpha(game.clockMinutes);
    if (na > 0) {
      ctx.fillStyle = `rgba(12,20,58,${na})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }
    drawParty(game);
    drawNear(game);
    drawActors(ctx, view, game);
    drawPlayer(game);
  }
  hud.update(game);
  card.update(game);
  market.update(game);
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
  // fading trail of where you just were
  if (w.moving && g.time - (trail[0]?.t ?? -1) >= RENDER.playerTrailGap) {
    trail.unshift({ ...w.pos, t: g.time });
    trail.length = Math.min(trail.length, RENDER.playerTrailDots);
  }
  trail.forEach((tp, i) => {
    if (i === 0) return;
    const sp = view.toScreen(tp);
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - i / trail.length)})`;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r * (0.75 - (0.4 * i) / trail.length), 0, Math.PI * 2); ctx.fill();
  });
  // "you are here" ping: a yellow ring that keeps growing out of the dot
  const ph = (g.time % RENDER.playerPingPeriod) / RENDER.playerPingPeriod;
  ctx.strokeStyle = PALETTE.playerPing;
  ctx.globalAlpha = 0.9 * (1 - ph);
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r + 2 + ph * (RENDER.playerPingMaxPx - r), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  // blink while invulnerable after a hit
  if (g.invulnerable && Math.floor(g.time * 10) % 2) ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(p.x + 1, p.y + 2, r + 3, 0, Math.PI * 2); ctx.fill();
  // yellow halo, dark ring, white core: reads on roofs, streets and sea alike
  ctx.fillStyle = PALETTE.playerPing;
  ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g.sleeping ? '#d9d4f0' : g.dirty ? '#d8c3a5' : PALETTE.player;
  ctx.strokeStyle = PALETTE.playerRing;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (g.fishing) {
    // a line out to sea with a bobbing float, cast away from the island's middle
    const c = graph.data.island.reduce((a, [x, y]) => ({ x: a.x + x, y: a.y + y }), { x: 0, y: 0 });
    const cx = c.x / graph.data.island.length, cy = c.y / graph.data.island.length;
    let dx = w.pos.x - cx, dy = w.pos.y - cy;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const fx = p.x + dx * 22, fy = p.y - dy * 22 + Math.sin(g.time * 4) * 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + dx * 14, p.y - dy * 14 - 8, fx, fy); ctx.stroke();
    ctx.fillStyle = '#ff4b3e';
    ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, Math.PI * 2); ctx.fill();
  }
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
    hud.message(t.text, t.tone);
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
if (howToSeen()) title();
else showHowTo(title);
requestAnimationFrame(frame);
