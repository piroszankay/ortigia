// Downloads Ortigia's streets, coastline and points of interest from the
// Overpass API into data/ortigia.overpass.json. Then run `npm run map:build`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { MAP_BUILD } from '../src/config';

const [s, w, n, e] = MAP_BUILD.bbox;
const bbox = `${s},${w},${n},${e}`;
const query = `[out:json][timeout:90];
(
  way["highway"](${bbox});
  way["natural"="coastline"](${bbox});
  node["amenity"~"^(drinking_water|fountain|restaurant|bar|cafe|fast_food|pharmacy|bench)$"](${bbox});
  node["tourism"~"^(hotel|hostel|guest_house)$"](${bbox});
);
(._;>;);
out body;`;

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

for (const url of endpoints) {
  try {
    console.log(`fetching from ${url} …`);
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    mkdirSync('data', { recursive: true });
    writeFileSync('data/ortigia.overpass.json', text);
    console.log(`saved data/ortigia.overpass.json (${(text.length / 1024).toFixed(0)} KB). Now run: npm run map:build`);
    process.exit(0);
  } catch (err) {
    console.warn(`  failed: ${(err as Error).message}`);
  }
}
console.error('All Overpass endpoints failed. Export an .osm file from openstreetmap.org (Export → Manually select area) and save it as data/ortigia.osm, then run npm run map:build.');
process.exit(1);
