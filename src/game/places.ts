import { FISHING_SPOTS, ILLNESS, MIKATU, PHARMACIES, RESTAURANTS, SLEEP_KINDS, SLEEP_PLACES, WATER, WATER_POINTS } from '../config';
import { project, type Vec } from '../geo';
import type { Edge, Graph } from '../map/graph';

export type SleepKind = keyof typeof SLEEP_KINDS;
export type PlaceKind = 'water' | 'food' | 'pharmacy' | 'haven' | 'fishing' | 'cat' | 'party' | SleepKind;

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
  /** Restaurants: chance a meal gives you food poisoning. */
  risk: number;
  lastUsed: number;
}

export const isSleep = (k: PlaceKind): k is SleepKind => k in SLEEP_KINDS;

/** Resolve every fixed location from config onto the current street graph. */
export function buildPlaces(graph: Graph): Place[] {
  const places: Place[] = [];
  const add = (p: Omit<Place, 'id' | 'pos' | 'edge' | 's' | 'lastUsed' | 'risk'> & { at: [number, number]; risk?: number }) => {
    const { at, risk = 0, ...rest } = p;
    const snap = graph.snap(project(at));
    places.push({ ...rest, risk, id: places.length, pos: snap.pos, edge: snap.edge, s: snap.s, lastUsed: -Infinity });
  };
  for (const w of WATER_POINTS) add({ kind: 'water', name: w.name, at: w.at, price: WATER.price, hunger: 0, thirst: WATER.thirst, detail: 'fresh water' });
  for (const r of RESTAURANTS) {
    const risk = 'fishRisk' in r ? r.fishRisk : ILLNESS.badFishChance;
    add({ kind: 'food', name: r.name, at: r.at, price: r.price, hunger: r.hunger, thirst: r.thirst, detail: r.menu, risk });
  }
  add({ kind: 'haven', name: MIKATU.name, at: MIKATU.at, price: MIKATU.price, hunger: 100, thirst: 100, detail: 'food, drink, rest & friends' });
  for (const f of FISHING_SPOTS) add({ kind: 'fishing', name: f.name, at: f.at, price: 0, hunger: 0, thirst: 0, detail: 'fishing spot' });
  for (const ph of PHARMACIES) add({ kind: 'pharmacy', name: ph.name, at: ph.at, price: 0, hunger: 0, thirst: 0, detail: 'medicine' });
  for (const s of SLEEP_PLACES) {
    const k = SLEEP_KINDS[s.kind];
    add({ kind: s.kind, name: s.name, at: s.at, price: k.price, hunger: 0, thirst: 0, detail: k.label });
  }
  return places;
}
