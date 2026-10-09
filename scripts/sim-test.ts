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
