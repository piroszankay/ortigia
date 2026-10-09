import { MOVEMENT } from '../config';
import type { Vec } from '../geo';
import type { Graph } from '../map/graph';
import { Walker, matchDirection, straightOrRandom, type Rng } from './walker';

export type Dir4 = 'up' | 'down' | 'left' | 'right';
export const DIR_VEC: Record<Dir4, Vec> = {
  up: { x: 0, y: 1 }, down: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

/** The player's dot: Pac-Man steering on top of a Walker. */
export class Player {
  readonly walker: Walker;
  queued: Dir4 | null = null;
  queuedAge = 0;
  /** Name of the bridge the player left by, once they reach an exit. */
  exitedVia: string | null = null;

  constructor(readonly graph: Graph, startNode: number, private rng: Rng) {
    const deps = graph.departures[startNode].filter((d) => d.edge.kind !== 'bridge');
    const dep = deps[Math.floor(rng() * deps.length)] ?? graph.departures[startNode][0];
    this.walker = new Walker(graph, dep, MOVEMENT.playerSpeed);
  }

  queue(d: Dir4) {
    this.queued = d;
    this.queuedAge = 0;
    // Pac-Man reversal: pushing against your heading turns you round at once.
    const h = this.walker.heading, v = DIR_VEC[d];
    if (MOVEMENT.allowInstantReverse && h.x * v.x + h.y * v.y < -0.7 && this.walker.reverse()) this.queued = null;
  }

  update(dt: number) {
    if (this.queued) {
      this.queuedAge += dt;
      if (this.queuedAge > MOVEMENT.turnQueueExpiry) this.queued = null;
    }
    this.walker.advance(dt, (nodeId, arrivedOn, arrivalHeading) => {
      const node = this.graph.node(nodeId);
      if (node.exit) { this.exitedVia = node.exit; return null; }
      if (this.queued) {
        const m = matchDirection(this.graph, nodeId, arrivedOn, DIR_VEC[this.queued]);
        if (m) { this.queued = null; return m; }
      }
      return straightOrRandom(this.graph, nodeId, arrivedOn, arrivalHeading, this.rng);
    });
  }
}
