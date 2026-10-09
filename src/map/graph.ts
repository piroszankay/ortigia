import { MOVEMENT } from '../config';
import type { Vec } from '../geo';
import type { MapData, MapEdge, MapNode } from './types';

/** A way to leave a node: along `edge`, in direction `dir` (+1 = a→b, -1 = b→a). */
export interface Departure {
  edge: Edge;
  dir: 1 | -1;
  /** Unit vector of the street's initial direction when leaving the node. */
  heading: Vec;
}

export class Edge {
  readonly id: number;
  readonly a: number;
  readonly b: number;
  readonly pts: Vec[];
  readonly cum: number[];
  readonly length: number;
  readonly oneway: boolean;
  readonly name?: string;
  readonly kind: MapEdge['kind'];

  constructor(e: MapEdge) {
    this.id = e.id;
    this.a = e.a;
    this.b = e.b;
    this.pts = e.pts.map(([x, y]) => ({ x, y }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const p = this.pts[i - 1], q = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
    }
    this.length = this.cum[this.cum.length - 1];
    this.oneway = e.oneway === 1;
    this.name = e.name;
    this.kind = e.kind;
  }

  canTravel(dir: 1 | -1) { return dir === 1 || !this.oneway; }

  private segIndex(s: number): number {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    return i;
  }

  /** Point at distance s from node a. */
  pointAt(s: number): Vec {
    s = Math.max(0, Math.min(this.length, s));
    const i = this.segIndex(s);
    const p = this.pts[i - 1], q = this.pts[i];
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    const t = (s - this.cum[i - 1]) / segLen;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  }

  /** Unit tangent at distance s, pointing in travel direction dir. */
  tangentAt(s: number, dir: 1 | -1): Vec {
    const i = this.segIndex(Math.max(0, Math.min(this.length, s)));
    const p = this.pts[i - 1], q = this.pts[i];
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: ((q.x - p.x) / L) * dir, y: ((q.y - p.y) / L) * dir };
  }

  /** Node reached when travelling in dir. */
  endNode(dir: 1 | -1) { return dir === 1 ? this.b : this.a; }
  startNode(dir: 1 | -1) { return dir === 1 ? this.a : this.b; }
}

export class Graph {
  readonly nodes: MapNode[];
  readonly edges: Edge[];
  /** Legal departures from each node (respecting one-way streets). */
  readonly departures: Departure[][];
  readonly exits: MapNode[];

  constructor(readonly data: MapData) {
    this.nodes = data.nodes;
    this.edges = data.edges.map((e) => new Edge(e));
    this.departures = this.nodes.map(() => []);
    for (const e of this.edges) {
      if (e.canTravel(1)) this.departures[e.a].push({ edge: e, dir: 1, heading: this.headingFrom(e, 1) });
      if (e.canTravel(-1)) this.departures[e.b].push({ edge: e, dir: -1, heading: this.headingFrom(e, -1) });
    }
    this.exits = this.nodes.filter((n) => n.exit);
  }

  private headingFrom(e: Edge, dir: 1 | -1): Vec {
    const d = Math.min(MOVEMENT.headingSampleDistance, e.length);
    const from = e.pointAt(dir === 1 ? 0 : e.length);
    const to = e.pointAt(dir === 1 ? d : e.length - d);
    const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / L, y: (to.y - from.y) / L };
  }

  node(id: number) { return this.nodes[id]; }

  /** Nearest point on any street (bridges excluded) to p. */
  snap(p: Vec): { edge: Edge; s: number; pos: Vec } {
    let best = { edge: this.edges[0], s: 0, pos: this.edges[0].pts[0] }, bd = Infinity;
    for (const e of this.edges) {
      if (e.kind !== 'street') continue;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
        const q = { x: a.x + dx * t, y: a.y + dy * t };
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < bd) { bd = d; best = { edge: e, s: e.cum[i - 1] + t * (e.cum[i] - e.cum[i - 1]), pos: q }; }
      }
    }
    return best;
  }
}
