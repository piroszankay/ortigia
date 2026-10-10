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
  playerRadiusPx: 7.5,
  /** "You are here" ping: a ring that grows from the player every period (s) up to maxPx. */
  playerPingPeriod: 1.4,
  playerPingMaxPx: 26,
  /** Fading trail behind the player: number of dots and seconds between them. */
  playerTrailDots: 7,
  playerTrailGap: 0.05,
  placeRadiusPx: 7.5,
  /** Seconds a queued-turn hint arrow stays visible after input. */
  queuedHintFade: 0.4,
};

export const HUD_LOG = {
  /** Messages kept in the desktop sidebar log (phones show only the newest). */
  keep: 5,
  /** A message dims after this many seconds. */
  fadeAfter: 3.5,
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
  playerRing: '#0d1b33',
  playerPing: '#ffe14d',
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
  swipeThreshold: 18,
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
  /** In-game clock: starting hour and game minutes per real second. */
  clockStartHour: 9,
  clockMinutesPerSecond: 2,
};

// ---------------------------------------------------------------------------
// STARTING MONEY — two dice. Start money = base + (die1 + die2) × perPip (€).
// ---------------------------------------------------------------------------
export const DICE = {
  count: 2,
  base: 20,
  perPip: 10,
  /** Tumbling animation length (s). */
  rollTime: 1.4,
};

// ---------------------------------------------------------------------------
// THE FOUR BARS (0–100)
// ---------------------------------------------------------------------------
export const BARS = {
  start: { hunger: 80, thirst: 80, energy: 85, health: 100 },
  /** Points lost per second while awake. Full → empty in 100/rate seconds. */
  drain: { hunger: 0.55, thirst: 0.8, energy: 0.42 },
  /** Drain multiplier for hunger/thirst while asleep. */
  sleepDrainFactor: 0.4,
  /** Health lost per second for EACH of hunger/thirst/energy sitting at zero. */
  healthLossPerEmptyBar: 1.6,
  /** Health regained per second when hunger, thirst and energy are all at or above healthyThreshold. */
  healthRegen: 0.35,
  healthyThreshold: 35,
  /** Bars at or below this blink in the HUD. */
  warnAt: 20,
};

// ---------------------------------------------------------------------------
// LOCATIONS — fixed places. `at` is lat/lon, snapped to the nearest street.
// price in €; hunger/thirst = points added instantly (capped at 100).
// ---------------------------------------------------------------------------
export const INTERACT = {
  /** Action window opens when the dot is this close to a place (m). */
  radius: 42,
  /** …and stays open this long after you walk out of range (s). */
  grace: 1.4,
  /** A place can't be used again until this many seconds have passed. */
  cooldown: 8,
};

export const WATER_POINTS = [
  { name: 'Fontana di Diana', at: [37.06171, 15.293225] as LatLon },
  { name: 'Fonte Aretusa', at: [37.05937, 15.291649] as LatLon },
  { name: 'Fontanella del Foro', at: [37.062699, 15.290242] as LatLon },
  { name: 'Fontanella di Levante', at: [37.060585, 15.296636] as LatLon },
  { name: 'Fontanella della Giudecca', at: [37.057885, 15.294835] as LatLon },
  { name: 'Fontanella del Castello', at: [37.055366, 15.29354] as LatLon },
];
export const WATER = {
  price: 0,
  thirst: 45,
  /** Free fountains are used automatically when you walk past (if thirst < 100). */
  autoUseWhenFree: true,
};

export const RESTAURANTS = [
  { name: 'Bar Apollo', at: [37.063536, 15.293371] as LatLon, price: 6, hunger: 25, thirst: 35, menu: 'granita & brioche' },
  { name: 'Trattoria della Giudecca', at: [37.05946, 15.29461] as LatLon, price: 22, hunger: 70, thirst: 40, menu: 'pasta con le sarde', fishRisk: 0.1 },
  { name: 'Arancini da Turi', at: [37.061737, 15.292066] as LatLon, price: 5, hunger: 35, thirst: 5, menu: 'two arancini' },
  { name: 'Caffè del Duomo', at: [37.05991, 15.293146] as LatLon, price: 12, hunger: 30, thirst: 40, menu: 'espresso, cannolo, water' },
  { name: 'Pescheria Levante', at: [37.057885, 15.296017] as LatLon, price: 18, hunger: 60, thirst: 30, menu: 'fried calamari', fishRisk: 0.16 },
  { name: 'Panineria del Mercato', at: [37.063914, 15.292887] as LatLon, price: 9, hunger: 50, thirst: 15, menu: 'market sandwich' },
  { name: 'Osteria della Marina', at: [37.055051, 15.294959] as LatLon, price: 9, hunger: 45, thirst: 25, menu: 'pasta alla norma' },
];

/**
 * Sleeping places. comfort = energy restored per second asleep; maxEnergy = how
 * full a night there gets you. Theft risk is in SLEEP_THEFT. The friend's sofa
 * costs `price` until you have made a friend.
 */
export const SLEEP_PLACES = [
  { kind: 'bench', name: 'Bench on the Foro', at: [37.06135, 15.290692] as LatLon },
  { kind: 'bench', name: 'Bench on the Levante', at: [37.062367, 15.296726] as LatLon },
  { kind: 'bench', name: 'Bench at the Darsena', at: [37.064769, 15.291818] as LatLon },
  { kind: 'hostel', name: 'Ostello Aretusa', at: [37.061026, 15.292212] as LatLon },
  { kind: 'hotel', name: 'Grand Hotel Ortigia', at: [37.05982, 15.296512] as LatLon },
  { kind: 'sofa', name: "Friend's sofa", at: [37.057301, 15.293934] as LatLon },
] as const;
export const SLEEP_KINDS = {
  bench: { label: 'Bench', price: 0, comfort: 5, maxEnergy: 70 },
  hostel: { label: 'Hostel bunk', price: 18, comfort: 10, maxEnergy: 95 },
  hotel: { label: 'Hotel room', price: 55, comfort: 16, maxEnergy: 100 },
  sofa: { label: "Friend's sofa", price: 12, friendPrice: 0, comfort: 12, maxEnergy: 100 },
};
export const SLEEP = {
  /** You can only lie down if energy is below this. */
  minEnergyToSleep: 95,
};

// ---------------------------------------------------------------------------
// WANDERING CHARACTERS (Milestone 3)
// Speeds in m/s (player is MOVEMENT.playerSpeed). radius = contact distance (m).
// All of them obey one-way streets and never cross the bridges.
// ---------------------------------------------------------------------------
export const NPC = {
  /** Characters spawn at least this far from the arrival point (m). */
  spawnMinDistance: 160,
  /** At an intersection, chance a wanderer keeps going straight if it can. */
  straightBias: 0.55,
  /** After a contact, the same character ignores you for this long (s). */
  contactCooldown: 4,
};

export const BEGGARS = { count: 2, speed: 17, radius: 9, toll: 3 };

export const SEX_WORKERS = {
  count: 2,
  speed: 19,
  radius: 9,
  price: 30,
  /** Paying restores this much health (a pleasant hour, nothing more said). */
  healthBoost: 12,
  /** How long the pay/walk-on choice stays open (s). Ignoring it = walk on. */
  offerWindow: 4,
};

/** Bad guys: bigger = more dangerous. Spawn `count` of each size. */
export const BAD_GUYS = {
  sizes: {
    small: { count: 3, speed: 25, radius: 8, radiusPx: 5, damage: 8, energyDrain: 6 },
    medium: { count: 2, speed: 22, radius: 10, radiusPx: 7, damage: 16, energyDrain: 12 },
    large: { count: 1, speed: 18, radius: 13, radiusPx: 9.5, damage: 30, energyDrain: 20 },
  },
  /** Seconds of invulnerability after being hit. */
  invulnerable: 2.5,
};

export const TOURISTS = {
  groups: 3,
  /** People per group (drawn as a little trail behind the guide). */
  size: [4, 7] as [number, number],
  speed: 13,
  /** Spacing between people in a group along the street (m). */
  spacing: 6,
  radius: 8,
  /** Chance that bumping into a group drags you along; otherwise you bounce back. */
  dragChance: 0.45,
  /** Taps (any steering input or action) needed to wriggle free. */
  tapsToEscape: 6,
  /** Chance per intersection that a queued turn gets you out of the crowd. */
  turnEscapeChance: 0.5,
  /** After escaping, the groups can't grab you again for this long (s). */
  escapeImmunity: 3,
};

export const DOG_POOP = {
  maxActive: 5,
  /** Seconds between new spawns. */
  spawnEvery: 11,
  /** Seconds before a pile disappears (rain, street sweepers, other shoes). */
  lifetime: 100,
  /** Never spawns closer than this to the player (m). */
  minDistanceFromPlayer: 70,
  /** Stepping radius (m). */
  radius: 6,
};

/**
 * Pickpockets while you sleep. Chance per night by sleep kind, and the share
 * of your money taken (random between min and max).
 */
export const SLEEP_THEFT = {
  chance: { bench: 0.4, hostel: 0.06, hotel: 0, sofa: 0 } as Record<string, number>,
  shareMin: 0.2,
  shareMax: 0.45,
};

// ---------------------------------------------------------------------------
// HEALTH EVENTS (Milestone 4)
// ---------------------------------------------------------------------------
export const ILLNESS = {
  /** Chance a restaurant meal gives you food poisoning (a restaurant may override with fishRisk). */
  badFishChance: 0.07,
  /** Health lost per second while food-poisoned. */
  poisoningDrain: 0.8,
  /** Seconds after exposure before the infection shows symptoms. */
  infectionIncubation: 25,
  /** Health lost per second while infected (after incubation). */
  infectionDrain: 0.45,
};

/**
 * Mikatu: eat, drink, rest and spend time with friends. One visit fills
 * food, water and sleep to 100 and brings health back up to healthFloor
 * (it never lowers health, and it does not cure illness).
 */
export const MIKATU = {
  name: 'Mikatu',
  at: [37.055366, 15.292088] as LatLon,
  price: 12,
  healthFloor: 50,
};

export const PHARMACIES = [
  { name: 'Farmacia Archimede', at: [37.061386, 15.294047] as LatLon },
  { name: 'Farmacia del Castello', at: [37.056626, 15.29345] as LatLon },
];
export const MEDICINE = {
  /** Price of the cure for each illness; one purchase cures everything you have. */
  poisoningCure: 8,
  infectionCure: 25,
  /** When you're well, the pharmacy sells a tonic instead. */
  tonicPrice: 6,
  tonicHealth: 15,
};

// ---------------------------------------------------------------------------
// ECONOMY (Milestone 5)
// ---------------------------------------------------------------------------
export const FISHING_SPOTS = [
  { name: 'Foro Italico pier', at: [37.062025, 15.290467] as LatLon },
  { name: 'Levante rocks', at: [37.061305, 15.296715] as LatLon },
  { name: 'Alfeo steps', at: [37.056626, 15.291852] as LatLon },
  { name: 'Ionian rocks', at: [37.056626, 15.295567] as LatLon },
];
export const FISHING = {
  /** Seconds before a bite: random between min and max. */
  waitMin: 3,
  waitMax: 7,
  /** Fish weight (kg): skewed towards small. Price = kg × pricePerKg (sold at once). */
  minKg: 0.2,
  maxKg: 3.5,
  pricePerKg: 9,
  /** A spot needs this long to recover after you fish there (s). */
  spotCooldown: 30,
};

export const PICKPOCKET = {
  /** You can pick pockets when a tour group is this close (m). */
  radius: 26,
  /** Euros stolen: random between min and max. */
  min: 6,
  max: 24,
  /** The same group can't be robbed again for this long (s). */
  groupCooldown: 30,
};

export const POLICE = {
  count: 3,
  speed: 21,
  /** Touch distance for asking an officer for help (m). */
  radius: 10,
  /** Criminal on the same street segment as an officer = caught. */
  caughtGameOver: false,
  /** If not game over: share of your money confiscated. */
  caughtFineShare: 0.6,
  /** Not a criminal and robbed in your sleep: touching an officer recovers this share. */
  recoverShare: 0.5,
};

export const CATS = {
  count: 5,
  /** Feeding a cat costs this much and clears your criminal record. */
  feedPrice: 2,
  /** A fed cat wanders off to a new spot after this long (s). */
  relocateAfter: 20,
};

export const MARKET = {
  /** First offer after this many seconds, then one every `interval`. */
  firstAt: 20,
  interval: 60,
  /** How long the buy/sell panel stays open (s). */
  window: 10,
  /** Offer price = base × random(buyMin, buyMax); demand price = base × random(sellMin, sellMax). */
  buyMin: 0.55,
  buyMax: 1.35,
  sellMin: 0.75,
  sellMax: 1.7,
  /** Chance the buyer wants something you already own (when you own anything). */
  wantsOwnedChance: 0.5,
};

export const ITEMS = [
  { id: 'coin', name: 'Old Greek coin', short: 'Coin', base: 40 },
  { id: 'moor', name: "Ceramic Moor's head", short: "Moor's head", base: 35 },
  { id: 'camera', name: 'Vintage camera', short: 'Camera', base: 30 },
  { id: 'lemon', name: 'Lemon tree cutting', short: 'Lemon cutting', base: 8 },
  { id: 'bag', name: 'Fake designer bag', short: 'Fake bag', base: 15 },
  { id: 'papyrus', name: 'Papyrus scroll', short: 'Papyrus', base: 20 },
  { id: 'coral', name: 'Coral necklace', short: 'Coral', base: 28 },
  { id: 'pupo', name: 'Sicilian puppet', short: 'Puppet', base: 45 },
  { id: 'marsala', name: 'Bottle of Marsala', short: 'Marsala', base: 12 },
  { id: 'pastry', name: 'Box of almond pastries', short: 'Pastries', base: 10 },
  { id: 'map', name: 'Antique map of Siracusa', short: 'Old map', base: 38 },
  { id: 'lantern', name: "Fisherman's lantern", short: 'Lantern', base: 18 },
  { id: 'postcard', name: 'Caravaggio postcard', short: 'Postcard', base: 4 },
  { id: 'vespa', name: 'Mysterious Vespa key', short: 'Vespa key', base: 25 },
];

// ---------------------------------------------------------------------------
// PARTIES, SOUND, POLISH (Milestone 6)
// ---------------------------------------------------------------------------
export const PARTY = {
  /** First party after this many seconds, then one every `interval` (random ± jitter). */
  firstAt: 45,
  interval: 75,
  jitter: 20,
  /** How long a party lasts (s). */
  duration: 40,
  /** Parties start at least this far from you (m). */
  minDistanceFromPlayer: 140,
  entry: 10,
  /** The first drink, drunk on entry. */
  healthBoost: 15,
  thirstBoost: 30,
  /** Drinking the spare drink yourself. */
  spareThirst: 25,
  /** Offer the spare drink to a character this close (m). */
  offerRadius: 30,
};

export const SOUND = {
  volume: 0.5,
  enabledByDefault: true,
};

export const NIGHT = {
  /** Darkness fades in from duskStart to nightStart and out from dawnStart to dayStart (hours). */
  duskStart: 19,
  nightStart: 21.5,
  dawnStart: 5,
  dayStart: 7,
  /** Strength of the night tint (0–1). */
  maxAlpha: 0.38,
};

export const TOUCH = {
  /** Tap anywhere on the map: the dot turns towards the tap (dominant direction). */
  tapToSteer: true,
  /** A touch counts as a tap if it moves less than this (CSS px) … */
  tapMaxMove: 12,
  /** … and lasts less than this (ms). */
  tapMaxTime: 300,
  /** Vibrate on hits where the phone supports it (ms, 0 = off). */
  vibrateMs: 60,
};
