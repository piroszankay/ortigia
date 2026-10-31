// The old rug (a separate, rollable object) and, hidden underneath it, the
// floor panel of circuit tiles for the future "connect the circuit" puzzle.

import * as THREE from 'three';
import { RUG } from '../config';
import { registry } from '../interactables';
import { box, materials, shadowed } from '../materials';
import { colorTexture } from '../textures/canvas';
import { circuitTileCanvas, type TileKind } from '../textures/labels';
import { vnoise } from '../textures/noise';
import { RUG_D, RUG_FRINGE, RUG_W, rugCanvas } from '../textures/rug';

export interface CircuitTileState {
  kind: TileKind;
  /** Quarter turns clockwise (0..3). */
  rotation: number;
  row: number;
  col: number;
}

/** Scrambled layout: source → wires → switch → lamp, with decoys. */
const LAYOUT: [TileKind, number][][] = [
  [['source', 0], ['corner', 1], ['straight', 1], ['corner', 3], ['empty', 0]],
  [['tee', 2], ['straight', 0], ['switch', 1], ['cross', 0], ['corner', 2]],
  [['corner', 0], ['tee', 1], ['straight', 1], ['corner', 2], ['lamp', 2]],
];
const TILE = 0.38;
const GAP = 0.02;

export interface RugParts {
  rug: THREE.Mesh;
  /** 0 = flat, 1 = rolled back. */
  readonly rolled: number;
  toggle(): void;
  setRolled(open: boolean, instant?: boolean): void;
  update(dt: number): void;
}

export function buildRugAndCircuit(scene: THREE.Scene): RugParts {
  buildCircuitPanel(scene);

  // --- Rug mesh: a grid we deform on the CPU to roll it up. ---
  const total = RUG_W + RUG_FRINGE * 2;
  const segX = 90;
  const segZ = 110;
  const geo = new THREE.PlaneGeometry(total, RUG_D, segX, segZ);
  geo.rotateX(-Math.PI / 2); // lies in XZ, +y up; z runs north (−) to south (+)
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const baseX = new Float32Array(pos.count);
  const baseS = new Float32Array(pos.count); // distance from the north edge
  const lump = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    baseX[i] = pos.getX(i);
    baseS[i] = pos.getZ(i) + RUG_D / 2;
    // Lumps and a couple of creases; never lower than the tiles below.
    const x = baseX[i];
    const s = baseS[i];
    const crease = Math.exp(-Math.pow((s - 1.25 - x * 0.08) / 0.05, 2)) * 0.012;
    lump[i] = 0.004 + vnoise(x * 2.2, s * 2.2, 4) * 0.007 + crease;
  }

  const tex = colorTexture(rugCanvas());
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  // The underside is the bare backing weave: duller and paler.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       if (!gl_FrontFacing) diffuseColor.rgb = diffuseColor.rgb * 0.35 + vec3(0.17, 0.15, 0.12);`,
    );
  };
  const rug = new THREE.Mesh(geo, mat);
  rug.name = 'rug';
  rug.position.set(RUG.x, 0.006, RUG.z);
  rug.castShadow = true;
  rug.receiveShadow = true;
  scene.add(rug);
  registry.register({ id: 'rug', label: 'Worn rug', object: rug, state: { rolled: false }, group: 'circuit' });

  // Roll geometry: the north edge rolls toward the south.
  const R0 = 0.05; // innermost radius
  const K = 0.009 / (Math.PI * 2); // radius growth per radian (rug thickness)
  const MAX_ROLL = RUG_D - 0.28;
  let rolled = 0;
  let target = 0;

  const apply = () => {
    const L = rolled * MAX_ROLL;
    const Rout = R0 + K * L; // the roll grows as more rug wraps around it
    for (let i = 0; i < pos.count; i++) {
      const s = baseS[i];
      if (s >= L) {
        pos.setXYZ(i, baseX[i], lump[i], s - RUG_D / 2);
      } else {
        // Archimedean spiral: arc length a from the contact line, radius
        // shrinking inward so the north edge ends up in the middle.
        const a = L - s;
        const r = Rout - K * a;
        const theta = -Math.log(r / Rout) / K;
        const y = Rout - r * Math.cos(theta) + 0.006;
        const z = L - r * Math.sin(theta);
        pos.setXYZ(i, baseX[i], y, z - RUG_D / 2);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  };
  apply();

  const item = registry.get<{ rolled: boolean }>('rug')!;
  return {
    rug,
    get rolled() {
      return rolled;
    },
    toggle() {
      this.setRolled(target === 0);
    },
    setRolled(open: boolean, instant = false) {
      target = open ? 1 : 0;
      if (instant) {
        rolled = target;
        apply();
      }
      item.state.rolled = open;
      item.label = open ? 'Rolled-up rug' : 'Worn rug';
    },
    update(dt: number) {
      if (rolled === target) return;
      const step = dt / RUG.rollSeconds;
      rolled = target > rolled ? Math.min(target, rolled + step) : Math.max(target, rolled - step);
      apply();
    },
  };
}

function buildCircuitPanel(scene: THREE.Scene): void {
  const m = materials();
  const g = new THREE.Group();
  g.name = 'circuit_panel';
  const rows = LAYOUT.length;
  const cols = LAYOUT[0].length;
  const pw = cols * TILE + (cols + 1) * GAP;
  const pd = rows * TILE + (rows + 1) * GAP;
  g.position.set(RUG.x + 0.05, 0, RUG.z + 0.05);

  // Recessed steel tray flush with the floor.
  const tray = box(pw + 0.04, 0.004, pd + 0.04, m.darkSteel());
  tray.position.y = 0.0015;
  g.add(tray);
  const rimMat = m.rust();
  for (const [w, d, x, z] of [
    [pw + 0.06, 0.03, 0, -pd / 2 - 0.02],
    [pw + 0.06, 0.03, 0, pd / 2 + 0.02],
    [0.03, pd + 0.06, -pw / 2 - 0.02, 0],
    [0.03, pd + 0.06, pw / 2 + 0.02, 0],
  ] as const) {
    const r = box(w, 0.005, d, rimMat);
    r.position.set(x, 0.0025, z);
    g.add(r);
  }

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1c, roughness: 0.8 });
  LAYOUT.forEach((row, r) => {
    row.forEach(([kind, rot], c) => {
      const tex = colorTexture(circuitTileCanvas(kind, r * 10 + c));
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.25 });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.005, TILE), [sideMat, sideMat, top, sideMat, sideMat, sideMat]);
      tile.position.set(-pw / 2 + GAP + TILE / 2 + c * (TILE + GAP), 0.0035, -pd / 2 + GAP + TILE / 2 + r * (TILE + GAP));
      tile.rotation.y = (-rot * Math.PI) / 2;
      g.add(tile);
      registry.register<CircuitTileState>({
        id: `circuit_tile_${r}_${c}`,
        label: `Circuit tile (${kind})`,
        object: tile,
        group: 'circuit',
        state: { kind, rotation: rot, row: r, col: c },
      });
    });
  });
  shadowed(g, false, true);
  scene.add(g);
}
