// Shell of the cellar: four concrete-block walls (with openings for the window
// and the one-way mirror), floor, ceiling, pipes and a wall socket.

import * as THREE from 'three';
import { HALF_D, HALF_W, MIRROR, ROOM, WINDOW } from './config';
import { box, materials, shadowed } from './materials';
import { surfaceToMaps } from './textures/canvas';
import { concreteBlockWall, concreteCeiling, concreteFloor } from './textures/surfaces';

export interface Opening {
  /** Centre along the wall, metres from the wall's left end (as seen from inside). */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WallSpec {
  name: string;
  seed: number;
  /** Rotation about Y that turns local +z into the inward normal. */
  rotY: number;
  /** World position of the wall's local origin (left end, floor, back face). */
  pos: [number, number, number];
  openings: Opening[];
  leaks?: { x: number; y: number; w: number }[];
  rustAt?: number[];
}

const T = ROOM.wallT;
const L = ROOM.w + 2 * T; // each wall strip overlaps the corners

function buildWall(spec: WallSpec): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-T, 0);
  shape.lineTo(ROOM.w + T, 0);
  shape.lineTo(ROOM.w + T, ROOM.h);
  shape.lineTo(-T, ROOM.h);
  shape.closePath();
  for (const o of spec.openings) {
    const hole = new THREE.Path();
    hole.moveTo(o.x - o.w / 2, o.y - o.h / 2);
    hole.lineTo(o.x - o.w / 2, o.y + o.h / 2);
    hole.lineTo(o.x + o.w / 2, o.y + o.h / 2);
    hole.lineTo(o.x + o.w / 2, o.y - o.h / 2);
    hole.closePath();
    shape.holes.push(hole);
  }
  // Extruded caps get UVs = shape coordinates in metres, so the texture is laid
  // out once along the whole strip.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  const surf = concreteBlockWall({
    length: L,
    height: ROOM.h,
    seed: spec.seed,
    leaks: spec.leaks?.map((l) => ({ ...l, x: l.x + T })),
    rustAt: spec.rustAt?.map((x) => x + T),
  });
  const maps = surfaceToMaps(surf, 3.2);
  for (const t of [maps.map, maps.normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / L, 1 / ROOM.h);
    t.offset.set(T / L, 0);
  }
  const mat = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughness: 0.96 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = spec.name;
  mesh.rotation.y = spec.rotY;
  mesh.position.set(...spec.pos);
  return shadowed(mesh);
}

export function buildRoom(scene: THREE.Scene): void {
  const windowOpening: Opening = { x: HALF_D - WINDOW.z, y: WINDOW.bottom + WINDOW.h / 2, w: WINDOW.w, h: WINDOW.h };
  const mirrorOpening: Opening = { x: HALF_D + MIRROR.z, y: MIRROR.centerY, w: MIRROR.w, h: MIRROR.h };

  const walls: WallSpec[] = [
    // North: local x → world +x.
    { name: 'wall_north', seed: 11, rotY: 0, pos: [-HALF_W, 0, -HALF_D - T], openings: [], rustAt: [0.7, 3.4] },
    // East: local x → world +z.
    { name: 'wall_east', seed: 23, rotY: -Math.PI / 2, pos: [HALF_W + T, 0, -HALF_D], openings: [mirrorOpening], rustAt: [0.7] },
    // South: local x → world -x.
    { name: 'wall_south', seed: 37, rotY: Math.PI, pos: [HALF_W, 0, HALF_D + T], openings: [], rustAt: [0.6] },
    // West: local x → world -z.
    {
      name: 'wall_west',
      seed: 41,
      rotY: Math.PI / 2,
      pos: [-HALF_W - T, 0, HALF_D],
      openings: [windowOpening],
      leaks: [{ x: windowOpening.x, y: WINDOW.bottom, w: WINDOW.w * 0.9 }],
      rustAt: [4.3],
    },
  ];
  for (const w of walls) scene.add(buildWall(w));

  // Floor.
  const floorSize = ROOM.w + 2 * T;
  const fm = surfaceToMaps(concreteFloor(floorSize, 5), 2.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ map: fm.map, normalMap: fm.normalMap, roughness: 0.93 }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling (a slab so it also blocks light from above).
  const cm = surfaceToMaps(concreteCeiling(floorSize, 9), 1.6);
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(floorSize, 0.2, floorSize),
    new THREE.MeshStandardMaterial({ map: cm.map, normalMap: cm.normalMap, roughness: 0.97 }),
  );
  ceiling.name = 'ceiling';
  ceiling.position.y = ROOM.h + 0.1;
  shadowed(ceiling);
  scene.add(ceiling);

  scene.add(buildPipes());
  scene.add(buildSocket());
}

function buildPipes(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'pipes';
  const m = materials();
  const rust = m.rust();
  const rustRed = m.rustRed();

  // Main pipe running east–west close to the north wall.
  const mainR = 0.055;
  const main = new THREE.Mesh(new THREE.CylinderGeometry(mainR, mainR, ROOM.w, 20), rust);
  main.rotation.z = Math.PI / 2;
  main.position.set(0, ROOM.h - 0.14, -HALF_D + 0.42);
  g.add(main);
  // Collars / joints.
  for (const x of [-1.6, 0, 1.6]) {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(mainR + 0.012, mainR + 0.012, 0.07, 20), rust);
    j.rotation.z = Math.PI / 2;
    j.position.set(x, main.position.y, main.position.z);
    g.add(j);
  }
  // Hanger straps up to the ceiling.
  for (const x of [-2.0, -0.8, 0.8, 2.0]) {
    const strap = box(0.025, 0.09, 0.012, rust);
    strap.position.set(x, ROOM.h - 0.045, main.position.z);
    g.add(strap);
  }

  // Thinner pipe running north–south near the east wall, dropping down the south wall.
  const r2 = 0.028;
  const x2 = HALF_W - 0.35;
  const y2 = ROOM.h - 0.08;
  const run = new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, ROOM.d - 0.35, 14), rustRed);
  run.rotation.x = Math.PI / 2;
  run.position.set(x2, y2, -0.175);
  g.add(run);
  const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.12, r2, 10, 16, Math.PI / 2), rustRed);
  elbow.rotation.y = -Math.PI / 2;
  elbow.position.set(x2, y2 - 0.12, HALF_D - 0.35 + 0.0);
  g.add(elbow);
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, y2 - 0.12, 14), rustRed);
  drop.position.set(x2, (y2 - 0.12) / 2, HALF_D - 0.23);
  g.add(drop);
  // A valve wheel on the drop.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), m.rustRed());
  wheel.position.set(x2, 1.15, HALF_D - 0.23 - 0.06);
  g.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = box(0.12, 0.008, 0.008, m.rustRed());
    spoke.rotation.z = (i / 3) * Math.PI;
    spoke.position.copy(wheel.position);
    g.add(spoke);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), m.rustRed());
  stem.rotation.x = Math.PI / 2;
  stem.position.set(x2, 1.15, HALF_D - 0.23 - 0.03);
  g.add(stem);
  return shadowed(g);
}

/** Wall socket on the south wall that the CRT is plugged into. */
export const SOCKET_POS = new THREE.Vector3(1.85, 0.32, HALF_D - 0.012);

function buildSocket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'socket';
  const plate = box(0.085, 0.085, 0.02, materials().plastic(0x8f8a7c));
  g.add(plate);
  for (const dx of [-0.011, 0.011]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.022, 8), materials().black());
    hole.rotation.x = Math.PI / 2;
    hole.position.set(dx, 0, 0.002);
    g.add(hole);
  }
  // The plug.
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.035, 14), materials().plastic(0x1a1a1a));
  plug.rotation.x = Math.PI / 2;
  plug.position.z = 0.028;
  g.add(plug);
  g.position.copy(SOCKET_POS);
  g.rotation.y = Math.PI; // faces into the room (−z)
  return shadowed(g);
}
