// Headless sanity check of the street graph and movement rules.
//   npm run test:sim
import { readFileSync } from 'node:fs';
import { Graph } from '../src/map/graph';
import type { MapData } from '../src/map/types';
import { Player, type Dir4 } from '../src/game/player';
import { mulberry32 } from '../src/rng';

const graph = new Graph(JSON.parse(readFileSync('src/map/ortigia-map.json', 'utf8')) as MapData);
let failures = 0;
const fail = (m: string) => { failures++; console.error('FAIL', m); };

// 1. every node can reach an exit and be reached from the arrival node (strong connectivity)
const reach = (from: number, rev: boolean) => {
  const seen = new Set([from]), st = [from];
  while (st.length) {
    const v = st.pop()!;
    for (const e of graph.edges) {
      const steps: [number, number][] = [];
      if (e.canTravel(1)) steps.push(rev ? [e.b, e.a] : [e.a, e.b]);
      if (e.canTravel(-1)) steps.push(rev ? [e.a, e.b] : [e.b, e.a]);
      for (const [x, y] of steps) if (x === v && !seen.has(y)) { seen.add(y); st.push(y); }
    }
  }
  return seen;
};
const fwd = reach(0, false), back = reach(0, true);
if (fwd.size !== graph.nodes.length || back.size !== graph.nodes.length) fail(`graph not strongly connected (${fwd.size}/${back.size}/${graph.nodes.length})`);
else console.log(`ok: strongly connected, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.exits.length} exits`);

// 2. random play: never travel a one-way the wrong way; dot never stops before an exit
const dirs: Dir4[] = ['up', 'down', 'left', 'right'];
const visited = new Set<number>();
let exits = 0;
const step = 1 / 60;
for (let seed = 1; seed <= 40; seed++) {
  const rng = mulberry32(seed);
  const start = graph.edges.find((e) => e.kind === 'bridge')!;
  const startNode = graph.node(start.a).exit ? start.b : start.a;
  const p = new Player(graph, startNode, rng);
  for (let t = 0; t < 600 / step; t++) {
    if (rng() < 0.01) p.queue(dirs[Math.floor(rng() * 4)]);
    const before = p.walker.pos;
    p.update(step);
    const w = p.walker;
    visited.add(w.edge.id);
    if (!w.edge.canTravel(w.dir)) { fail(`seed ${seed}: travelling one-way ${w.edge.id} backwards`); break; }
    if (p.exitedVia) { exits++; break; }
    const moved = Math.hypot(w.pos.x - before.x, w.pos.y - before.y);
    if (!w.moving || moved < 1e-6) { fail(`seed ${seed}: player stopped at t=${(t * step).toFixed(1)}`); break; }
  }
}
console.log(`ok: ${exits}/40 random walks reached an exit within 10 min; ${visited.size}/${graph.edges.length} streets visited`);
if (failures) process.exit(1);

// 3. survival rules
import { Game } from '../src/game/game';
import { SLEEP_KINDS } from '../src/config';
{
  const start = graph.edges.find((e) => e.kind === 'bridge')!;
  const startNode = graph.node(start.a).exit ? start.b : start.a;
  const mk = (money: number, seed = 7) => new Game(graph, money, startNode, mulberry32(seed));

  // eating
  let g = mk(80);
  const food = g.places.find((p) => p.kind === 'food')!;
  g.bars.hunger = 10;
  g.near = food; g.act();
  if (g.money !== 80 - food.price || g.bars.hunger !== 10 + food.hunger) fail('eating did not charge / feed');
  // can't spend your last euro
  g = mk(food.price);
  g.bars.hunger = 10; g.near = food;
  if (!g.refusal(food)) fail('should refuse when the meal would take money to 0');
  // sleeping: dot stops, energy fills to cap, then you wake
  g = mk(200);
  const hotel = g.places.find((p) => p.kind === 'hotel')!;
  g.bars.energy = 20; g.near = hotel; g.act();
  if (!g.sleeping || g.player.walker.moving) fail('hotel did not put you to sleep');
  const before = g.player.walker.pos;
  let after = before;
  for (let i = 0; i < 60 * 30 && g.sleeping; i++) { after = g.player.walker.pos; g.update(step); }
  if (g.sleeping || Math.abs(g.bars.energy - SLEEP_KINDS.hotel.maxEnergy) > 1e-6) fail(`did not wake at full energy (${g.bars.energy})`);
  if (before.x !== after.x || before.y !== after.y) fail('moved while asleep');
  // neglect kills: no input for a long time
  const causes: Record<string, number> = {};
  for (let seed = 1; seed <= 20; seed++) {
    g = mk(60, seed);
    for (let i = 0; i < 60 * 60 * 30 && !g.ending; i++) g.update(step);
    const k = g.ending ? (g.ending.kind === 'death' ? g.ending.cause : g.ending.kind) : 'alive';
    causes[k] = (causes[k] ?? 0) + 1;
  }
  console.log('ok: survival rules; hands-off outcomes over 20 runs:', JSON.stringify(causes));
}
if (failures) process.exit(1);
