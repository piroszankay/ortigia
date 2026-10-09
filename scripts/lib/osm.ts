// Minimal OSM reader: Overpass JSON or .osm XML (as exported from openstreetmap.org).

export interface OsmNode { lat: number; lon: number; tags: Record<string, string> }
export interface OsmWay { id: number; nodes: number[]; tags: Record<string, string> }
export interface OsmData { nodes: Map<number, OsmNode>; ways: OsmWay[] }

export function parseOsm(text: string): OsmData {
  return text.trimStart().startsWith('<') ? parseXml(text) : parseJson(text);
}

function parseJson(text: string): OsmData {
  const json = JSON.parse(text) as { elements: any[] };
  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  for (const el of json.elements) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags ?? {} });
    else if (el.type === 'way') ways.push({ id: el.id, nodes: el.nodes, tags: el.tags ?? {} });
  }
  return { nodes, ways };
}

const attr = (s: string, k: string) => {
  const m = new RegExp(`\\b${k}="([^"]*)"`).exec(s);
  return m ? decode(m[1]) : undefined;
};
const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function parseXml(text: string): OsmData {
  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  // <node .../> or <node ...>...</node>
  for (const m of text.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
    const tags: Record<string, string> = {};
    for (const t of (m[3] ?? '').matchAll(/<tag\b([^>]*)\/>/g)) tags[attr(t[1], 'k')!] = attr(t[1], 'v')!;
    nodes.set(Number(attr(m[1], 'id')), { lat: Number(attr(m[1], 'lat')), lon: Number(attr(m[1], 'lon')), tags });
  }
  for (const m of text.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const tags: Record<string, string> = {};
    for (const t of m[2].matchAll(/<tag\b([^>]*)\/>/g)) tags[attr(t[1], 'k')!] = attr(t[1], 'v')!;
    const nds = [...m[2].matchAll(/<nd\b[^>]*ref="(-?\d+)"/g)].map((x) => Number(x[1]));
    ways.push({ id: Number(attr(m[1], 'id')), nodes: nds, tags });
  }
  return { nodes, ways };
}
