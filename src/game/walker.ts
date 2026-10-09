import { MOVEMENT } from '../config';
import type { Vec } from '../geo';
import type { Departure, Edge, Graph } from '../map/graph';

export type Rng = () => number;

/**
 * Something that moves along the street graph and never stops by itself:
 * the player and (later) every wandering character.
 */
export class Walker {
  edge: Edge;
  /** Distance from the edge's node a. */
  s: number;
  dir: 1 | -1;
  speed: number;
  /** When false, advance() does nothing (sleeping, fishing, caught at an exit…). */
  moving = true;

  constructor(readonly graph: Graph, dep: Departure, speed: number) {
    this.edge = dep.edge;
    this.dir = dep.dir;
    this.s = dep.dir === 1 ? 0 : dep.edge.length;
    this.speed = speed;
  }

  get pos(): Vec { return this.edge.pointAt(this.s); }
  get heading(): Vec { return this.edge.tangentAt(this.s, this.dir); }
  /** Distance left until the next node. */
  get remaining() { return this.dir === 1 ? this.edge.length - this.s : this.s; }

  /** Turn around on the spot if the street allows it. */
  reverse(): boolean {
    if (!this.edge.canTravel(this.dir === 1 ? -1 : 1)) return false;
    this.dir = this.dir === 1 ? -1 : 1;
    return true;
  }

  /**
   * Move forward by speed·dt. At each node, `choose` picks the next street;
   * returning null stops the walker at that node.
   */
  advance(dt: number, choose: (nodeId: number, arrivedOn: Edge, arrivalHeading: Vec) => Departure | null) {
    if (!this.moving) return;
    let left = this.speed * dt;
    let guard = 0;
    while (left > 0 && guard++ < 16) {
      const rem = this.remaining;
      if (left < rem) {
        this.s += left * this.dir;
        return;
      }
      left -= rem;
      const nodeId = this.edge.endNode(this.dir);
      const arrivalHeading = this.edge.tangentAt(this.dir === 1 ? this.edge.length : 0, this.dir);
      this.s = this.dir === 1 ? this.edge.length : 0;
      const next = choose(nodeId, this.edge, arrivalHeading);
      if (!next) { this.moving = false; return; }
      this.edge = next.edge;
      this.dir = next.dir;
      this.s = next.dir === 1 ? 0 : next.edge.length;
    }
  }
}

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cosDeg = (d: number) => Math.cos((d * Math.PI) / 180);

/** Legal ways on from a node, not counting a U-turn back along `arrivedOn` unless it is the only way. */
export function onwardOptions(graph: Graph, nodeId: number, arrivedOn: Edge): { options: Departure[]; uTurn?: Departure } {
  const all = graph.departures[nodeId];
  const options = all.filter((d) => d.edge !== arrivedOn);
  const uTurn = all.find((d) => d.edge === arrivedOn);
  return { options, uTurn };
}

/** "Go straight if you can, otherwise pick a random legal street" (dead end → U-turn). */
export function straightOrRandom(
  graph: Graph, nodeId: number, arrivedOn: Edge, arrivalHeading: Vec, rng: Rng,
): Departure | null {
  const { options, uTurn } = onwardOptions(graph, nodeId, arrivedOn);
  if (!options.length) return uTurn ?? null;
  let best: Departure | null = null, bestDot = cosDeg(MOVEMENT.straightMaxAngle);
  for (const d of options) {
    const k = dot(d.heading, arrivalHeading);
    if (k >= bestDot) { bestDot = k; best = d; }
  }
  return best ?? options[Math.floor(rng() * options.length)];
}

/** The street from this node that best matches a wanted compass direction, if any is close enough. */
export function matchDirection(graph: Graph, nodeId: number, arrivedOn: Edge, want: Vec): Departure | null {
  const { options, uTurn } = onwardOptions(graph, nodeId, arrivedOn);
  const all = uTurn ? [...options, uTurn] : options;
  let best: Departure | null = null, bestDot = cosDeg(MOVEMENT.turnMatchMaxAngle);
  for (const d of all) {
    const k = dot(d.heading, want);
    if (k >= bestDot) { bestDot = k; best = d; }
  }
  return best;
}
