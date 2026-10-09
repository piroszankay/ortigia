import { RESTAURANTS, SLEEP_KINDS, SLEEP_PLACES, WATER, WATER_POINTS } from '../config';
import { project, type Vec } from '../geo';
import type { Edge, Graph } from '../map/graph';

export type SleepKind = keyof typeof SLEEP_KINDS;
export type PlaceKind = 'water' | 'food' | SleepKind;

export interface Place {
  id: number;
  kind: PlaceKind;
  name: string;
  /** Snapped onto the street network. */
  pos: Vec;
  edge: Edge;
  s: number;
  price: number;
  hunger: number;
  thirst: number;
  /** Short description of what you get (menu, bed type). */
  detail: string;
  lastUsed: number;
}

export const isSleep = (k: PlaceKind): k is SleepKind => k in SLEEP_KINDS;

/** Resolve every fixed location from config onto the current street graph. */
export function buildPlaces(graph: Graph): Place[] {
  const places: Place[] = [];
  const add = (p: Omit<Place, 'id' | 'pos' | 'edge' | 's' | 'lastUsed'> & { at: [number, number] }) => {
    const { at, ...rest } = p;
    const snap = graph.snap(project(at));
    places.push({ ...rest, id: places.length, pos: snap.pos, edge: snap.edge, s: snap.s, lastUsed: -Infinity });
  };
  for (const w of WATER_POINTS) add({ kind: 'water', name: w.name, at: w.at, price: WATER.price, hunger: 0, thirst: WATER.thirst, detail: 'fresh water' });
  for (const r of RESTAURANTS) add({ kind: 'food', name: r.name, at: r.at, price: r.price, hunger: r.hunger, thirst: r.thirst, detail: r.menu });
  for (const s of SLEEP_PLACES) {
    const k = SLEEP_KINDS[s.kind];
    add({ kind: s.kind, name: s.name, at: s.at, price: k.price, hunger: 0, thirst: 0, detail: k.label });
  }
  return places;
}
