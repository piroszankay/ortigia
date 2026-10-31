// Every tunable number for the cellar lives here. 1 unit = 1 metre.
// Room interior spans x ∈ [-2.5, 2.5], z ∈ [-2.5, 2.5], y ∈ [0, 2.5].
// North wall (z = -2.5): door + keypad. East wall (x = +2.5): one-way mirror.
// West wall (x = -2.5): boarded window. South wall (z = +2.5): CRT on a crate.

export const ROOM = { w: 5, d: 5, h: 2.5, wallT: 0.25 } as const;
export const HALF_W = ROOM.w / 2;
export const HALF_D = ROOM.d / 2;

export const PLAYER = {
  eye: 1.7,
  radius: 0.28,
  speed: 1.45, // m/s, a cautious walk
  accel: 10,
  bobAmp: 0.018,
  bobFreq: 7.5,
  start: { x: 0.55, z: 1.75, yaw: 0.12, pitch: -0.06 },
} as const;

export const INTERACT_RANGE = 2.0;

export const DOOR = { x: -0.75, w: 0.95, h: 2.05, t: 0.07 } as const;
export const KEYPAD = { x: 0.22, y: 1.38 } as const;

/** Window in the west wall: 100 × 50 cm, bottom edge at 190 cm. */
export const WINDOW = { z: 0.1, w: 1.0, h: 0.5, bottom: 1.9 } as const;

/** One-way mirror in the east wall: 120 × 80 cm centred around eye height. */
export const MIRROR = { z: 0.0, w: 1.2, h: 0.8, centerY: 1.6 } as const;
export const HIDDEN_ROOM = { depth: 2.4, width: 2.8, height: 2.4 } as const;

export const BULB = {
  x: 0.15,
  z: -0.15,
  cord: 0.55, // drop from the ceiling to the socket
  color: 0xffa25a,
  intensity: 5.5, // candela; a weak 25-40 W bulb in a dark room
  swing: 0.012,
} as const;

export const CRT = { x: 1.3, z: 2.15, color: 0x9fb6d0, intensity: 0.9 } as const;

/** Cold daylight: a spot outside the window, aimed down into the room. */
export const DAYLIGHT = {
  color: 0xbfd0e6,
  intensity: 70,
  // Low, raking angle (~30°) so light gets through the narrow gaps between thick planks.
  pos: [-3.75, 2.88, 0.3] as const,
  target: [1.25, 0, -0.05] as const,
} as const;

export const FOG = { color: 0x0a0908, density: 0.07 } as const;

export const RUG = { x: -0.05, z: 0.25, rollSeconds: 2.4 } as const;

export const POST = {
  bloomStrength: 0.32,
  bloomRadius: 0.55,
  bloomThreshold: 0.72,
  grain: 0.075,
  vignette: 1.05,
  exposure: 1.15,
} as const;
