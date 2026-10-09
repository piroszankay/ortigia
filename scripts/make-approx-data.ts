// Generates data/ortigia-approx.overpass.json: a HAND-TRACED APPROXIMATION of
// Ortigia's street network in Overpass JSON format. It is only a fallback for
// when real OpenStreetMap data is unavailable (see README: `npm run map:fetch`
// or drop an exported .osm file into data/). The build pipeline treats both
// the same way, so swapping in real data needs no code change.
//
// Coordinates here are metres (x east, y north) from MAP_BUILD.origin.

import { writeFileSync, mkdirSync } from 'node:fs';
import { unproject } from '../src/geo';

type XY = [number, number];

// Coastline of Ortigia, counter-clockwise (OSM convention: land on the left).
const island: XY[] = [
  [40, -800], [110, -760], [150, -680], [190, -560], [235, -430], [275, -300],
  [315, -160], [340, -20], [355, 120], [362, 260], [358, 380], [335, 480],
  [290, 560], [200, 610], [80, 625], [-40, 615], [-150, 590], [-250, 575],
  [-320, 545], [-310, 470], [-285, 380], [-255, 260], [-220, 140], [-195, 40],
  [-175, -60], [-165, -110], [-150, -200], [-130, -320], [-110, -450],
  [-90, -570], [-60, -680], [-20, -760],
];
// Mainland shore across the Darsena channel, west→east (land/north on the left).
const mainland: XY[] = [
  [-900, 560], [-700, 600], [-500, 640], [-380, 680], [-250, 692], [-100, 700],
  [50, 705], [200, 700], [330, 682], [450, 662], [700, 640], [900, 620],
];

// Street junctions.
const J: Record<string, XY> = {
  UMB: [-250, 555], R1: [-150, 540], PAN: [-60, 520], LXV: [20, 530], SLU: [60, 590],
  VV1: [150, 505], NE1: [285, 505],
  W1: [-265, 430], A1: [-165, 435], B1: [-55, 430], C1: [35, 440], D1: [100, 445], E1: [205, 450], F1: [320, 430],
  W2: [-255, 340], A2: [-160, 345], B2: [-45, 340], C2: [30, 345], D2: [100, 350], E2: [210, 345], F2: [330, 340],
  W3: [-235, 260], A3: [-150, 262], B3: [-35, 265], C3: [25, 262], D3: [95, 265], E3: [210, 262], F3: [335, 260],
  W4: [-215, 190], A4: [-140, 190], B4: [-25, 195], ARC: [20, 190], D4: [95, 195], E4: [210, 190], F4: [332, 185],
  W5: [-195, 110], A5: [-125, 112], B5: [-15, 115], D5: [90, 112], E5: [205, 108], F5: [328, 105],
  W6: [-175, 30], A6: [-110, 32], DN: [10, 35], D6: [85, 30], E6: [200, 28], F6: [318, 25],
  ARE: [-150, -80], A7: [-90, -60], DS: [15, -55], D7: [90, -60], E7: [195, -60], F7: [305, -65],
  W8: [-135, -170], B8: [-40, -170], C8: [30, -170], D8: [110, -175], E8: [195, -170], F8: [285, -170],
  W9: [-112, -300], C9: [35, -300], D9: [130, -300], F9: [250, -300],
  W10: [-92, -450], C10: [45, -450], F10: [205, -450],
  W11: [-70, -580], C11: [50, -580], F11: [165, -580],
  CAS: [40, -690],
};

// [name, junctions in order, oneway?, highway type]
const streets: [string, string[], boolean, string][] = [
  ['Foro Italico', ['UMB', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'ARE'], false, 'tertiary'],
  ['Lungomare Alfeo', ['ARE', 'W8', 'W9', 'W10', 'W11', 'CAS'], false, 'tertiary'],
  ['Lungomare di Levante', ['NE1', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'CAS'], false, 'tertiary'],
  ['Riva della Posta', ['UMB', 'R1', 'PAN', 'LXV'], false, 'secondary'],
  ['Largo XXV Luglio', ['LXV', 'SLU', 'VV1'], false, 'secondary'],
  ['Via Vittorio Veneto', ['VV1', 'NE1'], false, 'residential'],
  ['Via Vittorio Veneto', ['VV1', 'E1', 'E2', 'E3', 'E4'], true, 'residential'],
  ['Corso Matteotti', ['LXV', 'C1', 'C2', 'C3', 'ARC'], false, 'secondary'],
  ['Via Cavour', ['DN', 'B5', 'B4', 'B3', 'B2', 'B1', 'PAN'], true, 'residential'],
  ['Via Resalibera', ['R1', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], true, 'residential'],
  ['Via Roma', ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'], true, 'residential'],
  ['Via del Crocifisso', ['E4', 'E5', 'E6'], false, 'residential'],
  ['Via della Giudecca', ['E6', 'E7', 'E8'], false, 'residential'],
  ['Via Capodieci', ['DS', 'C8', 'C9'], true, 'residential'],
  ['Via Castello Maniace', ['C9', 'C10', 'C11', 'CAS'], false, 'residential'],
  ['Via Dione', ['W1', 'A1', 'B1', 'C1'], false, 'residential'],
  ['Via Dione', ['C1', 'D1', 'E1'], true, 'residential'],
  ['Via Dione', ['E1', 'F1'], false, 'residential'],
  ['Via Mirabella', ['C2', 'B2', 'A2', 'W2'], true, 'residential'],
  ['Via Mirabella', ['D2', 'E2', 'F2'], false, 'residential'],
  ['Via Gargallo', ['W3', 'A3', 'B3', 'C3', 'D3', 'E3'], true, 'residential'],
  ['Via Montalto', ['B4', 'ARC'], false, 'residential'],
  ['Via Montalto', ['A4', 'W4'], true, 'residential'],
  ['Via Montalto', ['B4', 'A4'], false, 'residential'],
  ['Via della Maestranza', ['ARC', 'D4', 'E4', 'F4'], false, 'residential'],
  ['Via Amalfitania', ['F5', 'E5', 'D5', 'B5', 'A5', 'W5'], true, 'residential'],
  ['Via Landolina', ['W6', 'A6', 'DN'], false, 'pedestrian'],
  ['Via Minerva', ['DN', 'D6'], false, 'pedestrian'],
  ['Via San Martino', ['D6', 'E6', 'F6'], true, 'residential'],
  ['Piazza Duomo', ['DN', 'DS'], false, 'pedestrian'],
  ['Via Picherali', ['ARE', 'A7', 'DS'], false, 'pedestrian'],
  ['Via Saverio Landolina', ['DS', 'D7'], true, 'residential'],
  ['Via Mario Minniti', ['D7', 'E7', 'F7'], false, 'residential'],
  ['Via Santa Teresa', ['W8', 'B8', 'C8'], false, 'residential'],
  ['Via Alagona', ['B8', 'A7'], false, 'residential'],
  ['Via del Labirinto', ['C8', 'D8'], true, 'residential'],
  ['Via Larga', ['D8', 'E8', 'F8'], false, 'residential'],
  ['Via Larga', ['E8', 'D9'], true, 'residential'],
  ['Via Salomone', ['W9', 'C9'], false, 'residential'],
  ['Via Salomone', ['F9', 'D9', 'C9'], true, 'residential'],
  ['Via del Collegio', ['W10', 'C10', 'F10'], false, 'residential'],
  ['Via Nizza', ['W11', 'C11'], true, 'residential'],
  ['Via Nizza', ['C11', 'F11'], false, 'residential'],
  ['Vicolo dei Pescatori', ['D5', 'E6'], false, 'living_street'],
  ['Vicolo del Sole', ['B2', 'A3'], false, 'living_street'],
  ['Vicolo Zuccalà', ['C2', 'D3'], true, 'living_street'],
];

// --- emit Overpass JSON ------------------------------------------------------
let nextId = 1;
const elements: unknown[] = [];
const nodeId = new Map<string, number>();
const addNode = ([x, y]: XY) => {
  const id = nextId++;
  const [lat, lon] = unproject({ x, y });
  elements.push({ type: 'node', id, lat: +lat.toFixed(7), lon: +lon.toFixed(7) });
  return id;
};
for (const [k, xy] of Object.entries(J)) nodeId.set(k, addNode(xy));

const addWay = (nodes: number[], tags: Record<string, string>) =>
  elements.push({ type: 'way', id: nextId++, nodes, tags });

const ring = island.map(addNode);
addWay([...ring, ring[0]], { natural: 'coastline', name: 'Ortigia' });
addWay(mainland.map(addNode), { natural: 'coastline' });

for (const [name, js, oneway, highway] of streets) {
  const ids = js.map((k) => {
    const id = nodeId.get(k);
    if (id === undefined) throw new Error(`unknown junction ${k}`);
    return id;
  });
  const tags: Record<string, string> = { highway, name };
  if (oneway) tags.oneway = 'yes';
  addWay(ids, tags);
}

mkdirSync('data', { recursive: true });
writeFileSync(
  'data/ortigia-approx.overpass.json',
  JSON.stringify({ version: 0.6, generator: 'ortigia hand-traced approximation', elements }, null, 0),
);
console.log(`wrote data/ortigia-approx.overpass.json (${elements.length} elements)`);
