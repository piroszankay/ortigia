// Shape of src/map/ortigia-map.json (produced by scripts/build-map.ts).
// Coordinates are metres in the local projection (x east, y north).

export type Pt = [x: number, y: number];

export interface MapNode {
  id: number;
  x: number;
  y: number;
  /** Set on the mainland end of a bridge. Reaching it leaves the island. */
  exit?: string;
}

export interface MapEdge {
  id: number;
  a: number;
  b: number;
  /** Polyline from node a to node b (inclusive of both ends). */
  pts: Pt[];
  length: number;
  /** 1 = may only be travelled a→b; 0 = two-way. */
  oneway: 0 | 1;
  name?: string;
  kind: 'street' | 'bridge';
}

export interface MapData {
  /** 'osm' when built from OpenStreetMap data, 'approx' for the hand-traced fallback. */
  source: 'osm' | 'approx';
  builtAt: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Land polygons. island = Ortigia; others = mainland/islets (already closed). */
  island: Pt[];
  otherLand: Pt[][];
  nodes: MapNode[];
  edges: MapEdge[];
}
