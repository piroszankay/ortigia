// ---------------------------------------------------------------------------
// ORTIGIA — every tunable number lives here.
// Change values in this file to balance the game; no logic lives here.
// Units: distances in metres (world space), times in seconds, speeds in m/s.
// ---------------------------------------------------------------------------

export type LatLon = [lat: number, lon: number];

// ---------------------------------------------------------------------------
// MAP BUILD (used by `npm run map:build`, which turns OSM data into the game
// graph in src/map/ortigia-map.json). Re-run the build after changing these.
// ---------------------------------------------------------------------------
export const MAP_BUILD = {
  /** Projection origin (roughly the centre of Ortigia). */
  origin: [37.06, 15.293] as LatLon,
  /** Area fetched from Overpass and shown on screen: [south, west, north, east]. */
  bbox: [37.05226, 15.28568, 37.06738, 15.30032] as [number, number, number, number],
  /** A point that is definitely on the island (used to pick the island polygon). */
  islandProbe: [37.0600, 15.2930] as LatLon,

  /** OSM highway=* values that become playable streets. */
  highwayTypes: [
    'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
    'living_street', 'pedestrian', 'service', 'footway', 'path',
  ],
  /** Service roads with these service=* tags are dropped (parking aisles, driveways). */
  dropServiceTags: ['parking_aisle', 'driveway'],
  /** Nodes must be at least this far inside the island coastline (m). Negative = allow outside. */
  islandInset: 2,

  /** Intersections closer than this are merged into one (m). */
  mergeDistance: 14,
  /** Street segments shorter than this between two intersections are contracted (m). */
  minEdgeLength: 16,
  /** Dead-end alleys shorter than this are removed (repeatedly) (m). */
  minDeadEndLength: 45,
  /** Polyline simplification tolerance (Douglas–Peucker) (m). */
  simplifyTolerance: 2.5,

  /** Bridges to the mainland = exits. The island end is snapped to the nearest street node. */
  bridges: [
    { name: 'Ponte Umbertino', island: [37.064994, 15.290186] as LatLon, mainland: [37.066209, 15.289623] as LatLon },
    { name: 'Ponte Santa Lucia', island: [37.065309, 15.293675] as LatLon, mainland: [37.066344, 15.294013] as LatLon },
  ],
};

// ---------------------------------------------------------------------------
// MAP DECORATION (render only — positions are lat/lon so they survive a rebuild)
// ---------------------------------------------------------------------------
export const MAP_DECOR = {
  piazzas: [
    { name: 'Piazza Duomo', at: [37.059892, 15.293135] as LatLon, rx: 22, ry: 48 },
    { name: 'Piazza Archimede', at: [37.06171, 15.293225] as LatLon, rx: 26, ry: 24 },
    { name: 'Largo XXV Luglio', at: [37.064769, 15.293225] as LatLon, rx: 34, ry: 22 },
    { name: 'Piazza Pancali', at: [37.064679, 15.292325] as LatLon, rx: 22, ry: 18 },
  ],
  landmarks: [
    { name: 'Tempio di Apollo', at: [37.064274, 15.292831] as LatLon, kind: 'temple' },
    { name: 'Duomo', at: [37.059865, 15.293619] as LatLon, kind: 'church' },
    { name: 'Fonte Aretusa', at: [37.058965, 15.291739] as LatLon, kind: 'spring' },
    { name: 'Castello Maniace', at: [37.053206, 15.29345] as LatLon, kind: 'castle' },
  ],
  mainlandLabel: { text: 'SIRACUSA', at: [37.066614, 15.291874] as LatLon },
  seaLabels: [
    { text: 'Porto Grande', at: [37.0582, 15.287934] as LatLon },
    { text: 'Mar Ionio', at: [37.0573, 15.298403] as LatLon },
  ],
  /** Castello Maniace footprint (m). */
  castleSize: 50,
};

// ---------------------------------------------------------------------------
// RENDERING
// ---------------------------------------------------------------------------
export const RENDER = {
  /** Screen padding around the map (CSS px). */
  padding: 8,
  /** Street width on screen (CSS px) — minimum and per metre-of-screen scaling. */
  streetWidthPx: 6.5,
  bridgeWidthPx: 8,
  /** One-way arrows: spacing along a street (m) and size (CSS px). */
  onewayArrowSpacing: 55,
  onewayArrowSize: 3.2,
  /** Show street names (only for streets at least this long, m). 0 = never. */
  streetLabelMinLength: 0,
  playerRadiusPx: 6,
  /** Seconds a queued-turn hint arrow stays visible after input. */
  queuedHintFade: 0.4,
};

export const PALETTE = {
  seaDeep: '#1d5a86',
  seaShallow: '#3b8fb8',
  seaShimmer: 'rgba(255,255,255,0.10)',
  surf: 'rgba(180,225,235,0.55)',
  mainland: '#d8c7a3',
  mainlandRoof: '#c9b48d',
  roofs: ['#c46a43', '#bf6640', '#c97350', '#b9603b', '#cc7a52', '#c26c47'],
  quay: '#efe3c6',
  streetEdge: '#9e8460',
  street: '#f2e7cc',
  piazza: '#f6edd6',
  bridge: '#e9dcbc',
  bridgeRail: '#7f6a4c',
  arrow: 'rgba(120,96,64,0.55)',
  label: 'rgba(70,50,30,0.75)',
  labelOnSea: 'rgba(235,245,250,0.85)',
  exit: '#2f9e6b',
  player: '#ffffff',
  playerRing: '#16325c',
};

// ---------------------------------------------------------------------------
// MOVEMENT
// ---------------------------------------------------------------------------
export const MOVEMENT = {
  /** Player speed (m/s). The island is ~1.4 km north–south. */
  playerSpeed: 34,
  /** A queued turn is forgotten after this many seconds if it could not be taken. */
  turnQueueExpiry: 3.0,
  /** At an intersection, a street counts as "straight on" if within this angle (deg). */
  straightMaxAngle: 40,
  /** A queued direction matches a street if within this angle (deg). */
  turnMatchMaxAngle: 60,
  /** Queuing the opposite direction reverses immediately on a two-way street. */
  allowInstantReverse: true,
  /** Distance along a street used to measure its heading at an intersection (m). */
  headingSampleDistance: 14,
};

export const INPUT = {
  /** Minimum finger travel (CSS px) to register a swipe. */
  swipeThreshold: 22,
};

// ---------------------------------------------------------------------------
// SIMULATION
// ---------------------------------------------------------------------------
export const SIM = {
  /** Fixed simulation step (s). */
  step: 1 / 60,
  /** Max real time simulated per frame (prevents spiral of death after tab switch). */
  maxFrameTime: 0.25,
};

// ---------------------------------------------------------------------------
// GAME FLOW
// ---------------------------------------------------------------------------
export const GAME = {
  /** The traveller arrives over this bridge (must match a MAP_BUILD.bridges name). */
  arrivalBridge: 'Ponte Umbertino',
};
