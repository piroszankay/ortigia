// Turns OpenStreetMap data into the playable street graph (src/map/ortigia-map.json).
//
//   npm run map:build                 # uses the best input found in data/
//   npm run map:build -- path/to/file # .osm (XML) or Overpass JSON
//
// Input priority: CLI arg → data/ortigia.osm → data/ortigia.overpass.json →
// data/ortigia-approx.overpass.json (hand-traced fallback).
//
// Pipeline: parse → coastline polygons → clip streets to the island →
// split at intersections → merge close junctions / contract short segments /
// prune short dead ends / join pass-through nodes → largest component →
// add bridges (exits) → fix one-way traps (strong connectivity) → simplify.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MAP_BUILD } from '../src/config';
import { project, dist, pointInPolygon, distToPolygonEdge, polylineLength, type Vec } from '../src/geo';
import type { MapData, MapEdge, MapNode, Pt } from '../src/map/types';
import { parseOsm, type OsmData } from './lib/osm';

// ---------------------------------------------------------------------------
// input
const candidates = [process.argv[2], 'data/ortigia.osm', 'data/ortigia.overpass.json', 'data/ortigia-approx.overpass.json'];
const inputPath = candidates.find((p) => p && existsSync(p));
if (!inputPath) throw new Error('No map input found. Run `npm run map:fetch` or `npm run map:approx` first.');
const osm: OsmData = parseOsm(readFileSync(inputPath, 'utf8'));
const source: MapData['source'] = inputPath.includes('approx') ? 'approx' : 'osm';
console.log(`input: ${inputPath} (${osm.nodes.size} nodes, ${osm.ways.length} ways, source=${source})`);

const C = MAP_BUILD;
const proj = (id: number): Vec => {
  const n = osm.nodes.get(id);
  if (!n) throw new Error(`missing node ${id}`);
  return project([n.lat, n.lon]);
};
const [s, w, n, e] = C.bbox;
const bmin = project([s, w]);
const bmax = project([n, e]);
const bounds = { minX: bmin.x, minY: bmin.y, maxX: bmax.x, maxY: bmax.y };

// ---------------------------------------------------------------------------
// coastline → island polygon + other land
function stitch(ways: number[][]): number[][] {
  const chains = ways.map((w) => [...w]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const a = chains[i], b = chains[j];
        if (a[0] === a[a.length - 1]) continue;
        if (a[a.length - 1] === b[0]) {
          chains[i] = [...a, ...b.slice(1)];
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

const perimeter = 2 * (bounds.maxX - bounds.minX) + 2 * (bounds.maxY - bounds.minY);
const W = bounds.maxX - bounds.minX, H = bounds.maxY - bounds.minY;
// Position along the bbox boundary, counter-clockwise from bottom-left.
function perimT(p: Vec): number {
  const d = [p.y - bounds.minY, bounds.maxX - p.x, bounds.maxY - p.y, p.x - bounds.minX];
  const side = d.indexOf(Math.min(...d));
  if (side === 0) return p.x - bounds.minX;
  if (side === 1) return W + (p.y - bounds.minY);
  if (side === 2) return W + H + (bounds.maxX - p.x);
  return 2 * W + H + (bounds.maxY - p.y);
}
function perimPoint(t: number): Vec {
  t = ((t % perimeter) + perimeter) % perimeter;
  if (t < W) return { x: bounds.minX + t, y: bounds.minY };
  if (t < W + H) return { x: bounds.maxX, y: bounds.minY + (t - W) };
  if (t < 2 * W + H) return { x: bounds.maxX - (t - W - H), y: bounds.maxY };
  return { x: bounds.minX, y: bounds.maxY - (t - 2 * W - H) };
}
const inBox = (p: Vec) => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;

/** Close an open coastline chain (land on its left) along the bbox, counter-clockwise. */
function closeAlongBox(chain: Vec[]): Vec[] | null {
  // longest run of points inside the box
  const clamp = (p: Vec): Vec => ({
    x: Math.max(bounds.minX, Math.min(bounds.maxX, p.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, p.y)),
  });
  let best: Vec[] = [], cur: Vec[] = [];
  chain.forEach((p, i) => {
    if (inBox(p)) {
      // entering the box: start from the outside neighbour pulled onto the edge
      if (!cur.length && i > 0) cur.push(clamp(chain[i - 1]));
      cur.push(p);
    } else if (cur.length) {
      cur.push(clamp(p));
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  });
  if (cur.length > best.length) best = cur;
  if (best.length < 2) return null;
  const tEnd = perimT(best[best.length - 1]);
  let tStart = perimT(best[0]);
  if (tStart <= tEnd) tStart += perimeter;
  const ring = [...best, perimPoint(tEnd)];
  const corners = [W, W + H, 2 * W + H, perimeter, perimeter + W, perimeter + W + H, perimeter + 2 * W + H];
  for (const c of corners) if (c > tEnd && c < tStart) ring.push(perimPoint(c));
  ring.push(perimPoint(tStart));
  return ring;
}

const coastWays = osm.ways.filter((w) => w.tags.natural === 'coastline').map((w) => w.nodes);
const chains = stitch(coastWays);
const probe = project(C.islandProbe);
let island: Vec[] | null = null;
const otherLand: Vec[][] = [];
for (const ch of chains) {
  const pts = ch.map(proj);
  if (ch[0] === ch[ch.length - 1]) {
    const ring = pts.slice(0, -1);
    if (!island && pointInPolygon(probe, ring)) island = ring;
    else otherLand.push(ring);
  } else {
    const ring = closeAlongBox(pts);
    if (ring) otherLand.push(ring);
  }
}
if (!island) throw new Error('Could not find a closed coastline ring around MAP_BUILD.islandProbe');
const islandPoly: Vec[] = island;
console.log(`coastline: island ring ${islandPoly.length} pts, ${otherLand.length} other land polygons`);

// ---------------------------------------------------------------------------
// streets → raw segments
type Dir = 'both' | 'fwd';
interface Seg { a: number; b: number; pts: Vec[]; oneway: Dir; name?: string; hw: string }

const onIsland = (p: Vec) => pointInPolygon(p, islandPoly) && distToPolygonEdge(p, islandPoly) >= C.islandInset;
const streetWays = osm.ways.filter((w) => {
  const hw = w.tags.highway;
  if (!hw || !C.highwayTypes.includes(hw)) return false;
  if (w.tags.area === 'yes') return false;
  if (hw === 'service' && C.dropServiceTags.includes(w.tags.service ?? '')) return false;
  return true;
});

// runs of consecutive on-island nodes, oriented so travel a→b is the legal one-way direction
const runs: { nodes: number[]; oneway: Dir; name?: string; hw: string }[] = [];
for (const w of streetWays) {
  const ow = w.tags.oneway;
  let nodes = [...w.nodes];
  let oneway: Dir = 'both';
  if (ow === 'yes' || ow === 'true' || ow === '1' || w.tags.junction === 'roundabout') oneway = 'fwd';
  else if (ow === '-1' || ow === 'reverse') { oneway = 'fwd'; nodes.reverse(); }
  let cur: number[] = [];
  for (const id of nodes) {
    if (onIsland(proj(id))) cur.push(id);
    else { if (cur.length > 1) runs.push({ nodes: cur, oneway, name: w.tags.name, hw: w.tags.highway }); cur = []; }
  }
  if (cur.length > 1) runs.push({ nodes: cur, oneway, name: w.tags.name, hw: w.tags.highway });
}

const useCount = new Map<number, number>();
for (const r of runs) r.nodes.forEach((id, i) => {
  const end = i === 0 || i === r.nodes.length - 1;
  useCount.set(id, (useCount.get(id) ?? 0) + (end ? 2 : 1));
});
const isJunction = (id: number) => (useCount.get(id) ?? 0) >= 2;

let segs: Seg[] = [];
for (const r of runs) {
  let start = 0;
  for (let i = 1; i < r.nodes.length; i++) {
    if (isJunction(r.nodes[i]) || i === r.nodes.length - 1) {
      const ids = r.nodes.slice(start, i + 1);
      segs.push({ a: ids[0], b: ids[ids.length - 1], pts: ids.map(proj), oneway: r.oneway, name: r.name, hw: r.hw });
      start = i;
    }
  }
}
segs = segs.filter((sg) => sg.a !== sg.b);

// graph nodes: position by id
const pos = new Map<number, Vec>();
for (const sg of segs) { pos.set(sg.a, sg.pts[0]); pos.set(sg.b, sg.pts[sg.pts.length - 1]); }
console.log(`raw: ${pos.size} junctions, ${segs.length} segments`);

// ---------------------------------------------------------------------------
// simplification helpers
function mergeNodes(keep: number, drop: number) {
  const p = pos.get(keep)!, q = pos.get(drop)!;
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  pos.set(keep, m);
  pos.delete(drop);
  for (const sg of segs) {
    if (sg.a === drop) sg.a = keep;
    if (sg.b === drop) sg.b = keep;
    if (sg.a === keep) sg.pts[0] = m;
    if (sg.b === keep) sg.pts[sg.pts.length - 1] = m;
  }
  segs = segs.filter((sg) => sg.a !== sg.b);
}

function incident(id: number) { return segs.filter((sg) => sg.a === id || sg.b === id); }

function mergeCloseJunctions(): boolean {
  const ids = [...pos.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos.get(ids[i]), q = pos.get(ids[j]);
      if (p && q && dist(p, q) < C.mergeDistance) { mergeNodes(ids[i], ids[j]); return true; }
    }
  return false;
}

function contractShortEdges(): boolean {
  for (const sg of segs) {
    if (polylineLength(sg.pts) < C.minEdgeLength && incident(sg.a).length > 1 && incident(sg.b).length > 1) {
      mergeNodes(sg.a, sg.b);
      return true;
    }
  }
  return false;
}

function pruneDeadEnds(): boolean {
  for (const [id] of pos) {
    const inc = incident(id);
    if (inc.length === 1 && polylineLength(inc[0].pts) < C.minDeadEndLength) {
      segs = segs.filter((sg) => sg !== inc[0]);
      pos.delete(id);
      return true;
    }
    if (inc.length === 0) pos.delete(id);
  }
  return false;
}

/** Join the two streets meeting at a node that is not really an intersection. */
function collapsePassThrough(): boolean {
  for (const [id] of pos) {
    const inc = incident(id);
    if (inc.length !== 2) continue;
    const [e1, e2] = inc;
    const X = e1.a === id ? e1.b : e1.a;
    const Y = e2.a === id ? e2.b : e2.a;
    if (X === Y) continue;
    // orient e1 as X→id and e2 as id→Y
    const p1 = e1.b === id ? e1.pts : [...e1.pts].reverse();
    const p2 = e2.a === id ? e2.pts : [...e2.pts].reverse();
    const e1Fwd = e1.oneway === 'both' || e1.b === id; // X→id allowed
    const e1Back = e1.oneway === 'both' || e1.a === id; // id→X allowed
    const e2Fwd = e2.oneway === 'both' || e2.a === id; // id→Y allowed
    const e2Back = e2.oneway === 'both' || e2.b === id; // Y→id allowed
    const fwd = e1Fwd && e2Fwd, back = e1Back && e2Back;
    const pts = [...p1, ...p2.slice(1)];
    const name = polylineLength(e1.pts) >= polylineLength(e2.pts) ? e1.name : e2.name;
    const hw = e1.hw;
    let merged: Seg;
    if (fwd && back) merged = { a: X, b: Y, pts, oneway: 'both', name, hw };
    else if (fwd) merged = { a: X, b: Y, pts, oneway: 'fwd', name, hw };
    else if (back) merged = { a: Y, b: X, pts: [...pts].reverse(), oneway: 'fwd', name, hw };
    else merged = { a: X, b: Y, pts, oneway: 'both', name, hw }; // contradictory one-ways: open it up
    segs = segs.filter((sg) => sg !== e1 && sg !== e2);
    segs.push(merged);
    pos.delete(id);
    return true;
  }
  return false;
}

let guard = 0;
while (guard++ < 100000) {
  if (mergeCloseJunctions()) continue;
  if (contractShortEdges()) continue;
  if (pruneDeadEnds()) continue;
  if (collapsePassThrough()) continue;
  break;
}
console.log(`simplified: ${pos.size} junctions, ${segs.length} segments`);

// ---------------------------------------------------------------------------
// largest connected component
{
  const adj = new Map<number, number[]>();
  for (const sg of segs) {
    (adj.get(sg.a) ?? adj.set(sg.a, []).get(sg.a)!).push(sg.b);
    (adj.get(sg.b) ?? adj.set(sg.b, []).get(sg.b)!).push(sg.a);
  }
  let best = new Set<number>();
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = new Set<number>([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length) for (const nb of adj.get(stack.pop()!)!) if (!seen.has(nb)) { seen.add(nb); comp.add(nb); stack.push(nb); }
    if (comp.size > best.size) best = comp;
  }
  segs = segs.filter((sg) => best.has(sg.a));
  for (const id of [...pos.keys()]) if (!best.has(id)) pos.delete(id);
}

// ---------------------------------------------------------------------------
// bridges → exits
let nextSynthetic = -1;
const exitName = new Map<number, string>();
for (const br of C.bridges) {
  const ip = project(br.island), mp = project(br.mainland);
  let nearest = -1, nd = Infinity;
  for (const [id, p] of pos) { const d = dist(p, ip); if (d < nd) { nd = d; nearest = id; } }
  if (nd > 120) console.warn(`warning: ${br.name} island end is ${nd.toFixed(0)} m from the nearest street`);
  const exitId = nextSynthetic--;
  pos.set(exitId, mp);
  exitName.set(exitId, br.name);
  segs.push({ a: nearest, b: exitId, pts: [pos.get(nearest)!, mp], oneway: 'both', name: br.name, hw: 'bridge' });
}

// ---------------------------------------------------------------------------
// one-way traps: open one-way edges until the directed graph is strongly connected
function sccs(): Map<number, number> {
  const out = new Map<number, number[]>();
  for (const id of pos.keys()) out.set(id, []);
  for (const sg of segs) { out.get(sg.a)!.push(sg.b); if (sg.oneway === 'both') out.get(sg.b)!.push(sg.a); }
  // iterative Tarjan
  let index = 0;
  const idx = new Map<number, number>(), low = new Map<number, number>(), comp = new Map<number, number>();
  const stack: number[] = [], onStack = new Set<number>();
  let compCount = 0;
  for (const root of pos.keys()) {
    if (idx.has(root)) continue;
    const work: [number, number][] = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const [v, i] = top;
      if (i === 0) { idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v); }
      const nbrs = out.get(v)!;
      if (i < nbrs.length) {
        top[1]++;
        const w = nbrs[i];
        if (!idx.has(w)) work.push([w, 0]);
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u)!, low.get(v)!)); }
        if (low.get(v) === idx.get(v)) {
          let x: number;
          do { x = stack.pop()!; onStack.delete(x); comp.set(x, compCount); } while (x !== v);
          compCount++;
        }
      }
    }
  }
  return comp;
}
let opened = 0;
for (;;) {
  const comp = sccs();
  if (new Set(comp.values()).size <= 1) break;
  // prefer opening the shortest one-way that bridges two components
  const cands = segs.filter((sg) => sg.oneway === 'fwd' && comp.get(sg.a) !== comp.get(sg.b));
  if (!cands.length) throw new Error('graph not connected — cannot fix one-way traps');
  cands.sort((x, y) => polylineLength(x.pts) - polylineLength(y.pts));
  cands[0].oneway = 'both';
  opened++;
}
console.log(`one-way fix: opened ${opened} one-way street(s) to remove traps`);

// ---------------------------------------------------------------------------
// output
function simplify(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, md = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / L;
    if (d > md) { md = d; idx = i; }
  }
  if (md <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}
/** Closed ring: split at the point farthest from the start so neither half is degenerate. */
function simplifyRing(ring: Vec[], tol: number): Vec[] {
  let far = 0, fd = -1;
  ring.forEach((p, i) => { const d = dist(p, ring[0]); if (d > fd) { fd = d; far = i; } });
  const h1 = simplify(ring.slice(0, far + 1), tol);
  const h2 = simplify([...ring.slice(far), ring[0]], tol);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}
const r1 = (v: number) => Math.round(v * 10) / 10;
const toPt = (p: Vec): Pt => [r1(p.x), r1(p.y)];

const idMap = new Map<number, number>();
const nodes: MapNode[] = [];
for (const [id, p] of pos) {
  const nn: MapNode = { id: nodes.length, x: r1(p.x), y: r1(p.y) };
  if (exitName.has(id)) nn.exit = exitName.get(id);
  idMap.set(id, nn.id);
  nodes.push(nn);
}
const edges: MapEdge[] = segs.map((sg, i) => {
  const pts = simplify(sg.pts, C.simplifyTolerance).map(toPt);
  return {
    id: i,
    a: idMap.get(sg.a)!,
    b: idMap.get(sg.b)!,
    pts,
    length: r1(polylineLength(pts.map(([x, y]) => ({ x, y })))),
    oneway: sg.oneway === 'fwd' ? 1 : 0,
    ...(sg.name ? { name: sg.name } : {}),
    kind: sg.hw === 'bridge' ? 'bridge' : 'street',
  };
});

const coastTol = 1.5;
const out: MapData = {
  source,
  builtAt: new Date().toISOString(),
  bounds: { minX: r1(bounds.minX), minY: r1(bounds.minY), maxX: r1(bounds.maxX), maxY: r1(bounds.maxY) },
  island: simplifyRing(islandPoly, coastTol).map(toPt),
  otherLand: otherLand.map((r) => simplifyRing(r, coastTol).map(toPt)),
  nodes,
  edges,
};
writeFileSync('src/map/ortigia-map.json', JSON.stringify(out));
const oneways = edges.filter((e) => e.oneway).length;
console.log(`wrote src/map/ortigia-map.json: ${nodes.length} nodes, ${edges.length} edges (${oneways} one-way), exits: ${[...exitName.values()].join(', ')}`);
