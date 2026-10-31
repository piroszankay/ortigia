# The Cellar: escape-room prototype

A first-person visual prototype of one escape-room scene: a run-down 5 × 5 × 2.5 m basement
cellar, built with Three.js and Vite. Every texture, model and sound is generated in code;
there are no asset files.

This is a standalone project inside the Ortigia repository. It has its own `package.json`
and is not part of the Ortigia game build or deploy.

## Run it

```bash
cd escape-room
npm install
npm run dev        # opens on http://localhost:5174
```

Click the page to enter (this locks the mouse and starts the sound). `npm run build` writes a
static build to `dist/`.

The textures are generated when the page loads, which takes a second or two.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk |
| Mouse | Look (pointer lock) |
| Click | Interact with the highlighted object (logs `interacted: <id>` to the console) |
| **R** | Test: `revealHiddenRoom()`. Press again to hide the room. |
| **L** | Test: `lordCheckIn("You have one hour.")` |
| **T** | Test: roll the rug back or lay it down again (clicking the rug does the same) |
| Esc | Release the mouse |

From the dev-tools console, `cellar.lordCheckIn('…')`, `cellar.revealHiddenRoom()` and
`cellar.registry.all()` are available.

Screenshot/debug URL parameters: `?noui&view=x,y,z,yawDeg,pitchDeg&reveal&lord&rug`.

## Layout

Room interior: x and z from −2.5 to 2.5, floor at y = 0. The camera sits at 1.7 m.

- **North wall:** the reinforced door with `lock_1`…`lock_4`, and the keypad.
- **East wall:** the one-way mirror (120 × 80 cm, centred at 1.6 m), with the hidden room behind it.
- **West wall:** the boarded window (100 × 50 cm, from 190 to 240 cm).
- **South wall:** the CRT on a crate, plugged into a wall socket.
- **Floor:** the rug, with the circuit-tile panel underneath it.

## Code map

| File | What it holds |
| --- | --- |
| `src/config.ts` | Every tunable number: dimensions, positions, light levels, post-processing |
| `src/interactables.ts` | **The registry**: every interactive object, by id |
| `src/interaction.ts` | Crosshair raycast (2 m reach), highlight, label, click |
| `src/room.ts` | Walls (with openings), floor, ceiling, pipes, wall socket |
| `src/lighting.ts` | Flickering bulb, window daylight, ambient fill |
| `src/effects.ts` | Fog, dust particles, light shafts, bloom + grain + vignette |
| `src/audio.ts` | Generated hum, static, bulb buzz and room tone (Web Audio) |
| `src/controls.ts` | Pointer-lock look, WASD movement, collision |
| `src/objects/door.ts` | Door, four locks, keypad |
| `src/objects/mirror.ts` | One-way mirror shader, hidden room, `reveal()` |
| `src/objects/crt.ts` | The CRT, its screen shader, `lordCheckIn()` |
| `src/objects/rug.ts` | Rollable rug and the circuit-tile floor panel |
| `src/objects/window.ts` | Boarded window |
| `src/props.ts` | Crate, shelf with jars, broken chair, bucket, debris, papers |
| `src/textures/` | Canvas generators: noise, concrete, wood, rust, rug, labels |
| `src/puzzles/index.ts` | Where puzzles attach; for now it holds the stub behaviours |

## Plugging in puzzles

Every interactive object is registered once, with a stable id, a label, a `state` object and a
`group`:

| Group | Ids |
| --- | --- |
| door | `door`, `lock_1` … `lock_4` (state `{ locked, kind }`) |
| keypad | `keypad_0` … `keypad_9`, `keypad_star`, `keypad_hash`, `keypad_display` |
| circuit | `rug`, `circuit_tile_<row>_<col>` (state `{ kind, rotation, row, col }`) |
| mirror | `mirror`, `hidden_symbol` |
| lord | `crt` |
| props | `window`, `bucket`, `shelf_jars`, `broken_chair` |

A puzzle claims an object by attaching a handler:

```ts
import { registry } from '../interactables';
import type { LockState } from '../objects/door';

registry.setHandler<LockState>('lock_2', (lock) => {
  // open a combination UI, then:
  lock.state.locked = false;
  lock.label = 'Combination padlock (open)';
});
```

`registry.onInteract(fn)` sees every click, `registry.byGroup('keypad')` returns a whole set,
and `item.enabled = false` stops an object from highlighting or responding.
