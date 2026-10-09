import { BAD_GUYS, BEGGARS, NPC, SEX_WORKERS, TOURISTS } from '../config';
import { dist, type Vec } from '../geo';
import type { Departure, Edge, Graph } from '../map/graph';
import { Walker, onwardOptions, type Rng } from './walker';

export type BadSize = keyof typeof BAD_GUYS.sizes;
export type NpcKind = 'beggar' | 'sexworker' | 'bad' | 'tourists';

export interface Npc {
  id: number;
  kind: NpcKind;
  walker: Walker;
  /** Contact distance (m). */
  radius: number;
  /** Ignores the player until this game time. */
  cooldownUntil: number;
  size?: BadSize;
  /** Hidden: this sex worker carries the infection. */
  infected?: boolean;
  /** Tourist groups: recent positions; people are drawn along this trail. */
  trail?: Vec[];
  people?: number;
  /** Tourists: colour seed per person. */
  hats?: number[];
}

/** Wander: mostly straight on, otherwise a random legal street; never onto a bridge. */
export function wander(graph: Graph, rng: Rng) {
  return (nodeId: number, arrivedOn: Edge, arrivalHeading: Vec): Departure | null => {
    const { options, uTurn } = onwardOptions(graph, nodeId, arrivedOn);
    const legal = options.filter((d) => d.edge.kind !== 'bridge');
    if (!legal.length) return uTurn ?? graph.departures[nodeId][0];
    if (rng() < NPC.straightBias) {
      let best: Departure | null = null, bd = Math.cos((40 * Math.PI) / 180);
      for (const d of legal) {
        const k = d.heading.x * arrivalHeading.x + d.heading.y * arrivalHeading.y;
        if (k > bd) { bd = k; best = d; }
      }
      if (best) return best;
    }
    return legal[Math.floor(rng() * legal.length)];
  };
}

/** A random street position at least `minDist` from `avoid`, facing a legal way. */
function randomSpot(graph: Graph, rng: Rng, avoid: Vec, minDist: number): Departure & { s: number } {
  const streets = graph.edges.filter((e) => e.kind === 'street');
  for (let tries = 0; tries < 200; tries++) {
    const e = streets[Math.floor(rng() * streets.length)];
    const s = rng() * e.length;
    if (dist(e.pointAt(s), avoid) < minDist && tries < 190) continue;
    const dir: 1 | -1 = e.oneway ? 1 : rng() < 0.5 ? 1 : -1;
    return { edge: e, dir, heading: e.tangentAt(s, dir), s };
  }
  throw new Error('no spawn spot');
}

export function spawnNpcs(graph: Graph, rng: Rng, avoid: Vec): Npc[] {
  const npcs: Npc[] = [];
  const add = (kind: NpcKind, speed: number, radius: number, extra: Partial<Npc> = {}) => {
    const spot = randomSpot(graph, rng, avoid, NPC.spawnMinDistance);
    const walker = new Walker(graph, spot, speed);
    walker.s = spot.s;
    npcs.push({ id: npcs.length, kind, walker, radius, cooldownUntil: 0, ...extra });
  };
  for (let i = 0; i < BEGGARS.count; i++) add('beggar', BEGGARS.speed, BEGGARS.radius);
  const infected = Math.floor(rng() * SEX_WORKERS.count);
  for (let i = 0; i < SEX_WORKERS.count; i++) add('sexworker', SEX_WORKERS.speed, SEX_WORKERS.radius, { infected: i === infected });
  for (const [size, def] of Object.entries(BAD_GUYS.sizes) as [BadSize, (typeof BAD_GUYS.sizes)[BadSize]][]) {
    for (let i = 0; i < def.count; i++) add('bad', def.speed, def.radius, { size });
  }
  for (let i = 0; i < TOURISTS.groups; i++) {
    const [lo, hi] = TOURISTS.size;
    const people = lo + Math.floor(rng() * (hi - lo + 1));
    add('tourists', TOURISTS.speed, TOURISTS.radius, { people, trail: [], hats: Array.from({ length: people }, () => Math.floor(rng() * 1000)) });
  }
  return npcs;
}

/** Where each tourist in a group stands: the guide first, the others strung out behind. */
export function groupMembers(n: Npc): Vec[] {
  const trail = n.trail!;
  const out: Vec[] = [n.walker.pos];
  // trail holds recent positions newest-last; walk back along it at fixed spacing
  let need = TOURISTS.spacing, acc = 0;
  for (let i = trail.length - 1; i > 0 && out.length < n.people!; i--) {
    acc += dist(trail[i], trail[i - 1]);
    if (acc >= need) { out.push(trail[i - 1]); need += TOURISTS.spacing; }
  }
  while (out.length < n.people!) out.push(out[out.length - 1]);
  return out;
}

export function updateNpc(n: Npc, dt: number, choose: ReturnType<typeof wander>) {
  n.walker.advance(dt, choose);
  if (n.trail) {
    const p = n.walker.pos, last = n.trail[n.trail.length - 1];
    if (!last || dist(p, last) > 1.5) n.trail.push(p);
    const maxLen = Math.ceil((n.people! * TOURISTS.spacing) / 1.5) + 4;
    if (n.trail.length > maxLen) n.trail.splice(0, n.trail.length - maxLen);
  }
}

/** Closest distance from p to any part of the character (whole group for tourists). */
export function npcDistance(n: Npc, p: Vec): number {
  if (n.kind !== 'tourists') return dist(n.walker.pos, p);
  let d = Infinity;
  for (const m of groupMembers(n)) d = Math.min(d, dist(m, p));
  return d;
}
