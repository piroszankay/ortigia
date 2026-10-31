// The heavy reinforced door in the north wall, four distinct locks
// (lock_1..lock_4) and the numeric keypad beside it.

import * as THREE from 'three';
import { DOOR, HALF_D, KEYPAD, ROOM } from '../config';
import { registry } from '../interactables';
import { box, materials, shadowed, tile } from '../materials';
import { makeCanvas } from '../textures/canvas';
import { keyCapCanvas } from '../textures/labels';

export interface LockState {
  locked: boolean;
  /** What kind of lock it is, for puzzles to branch on. */
  kind: 'key' | 'combination' | 'disc' | 'chain';
}

export interface KeypadState {
  /** Characters typed so far (stub: puzzles decide what to do with them). */
  entry: string;
}

export interface DoorParts {
  group: THREE.Group;
  /** Show text on the keypad's little display. */
  setKeypadDisplay(text: string): void;
}

const FACE = -HALF_D; // inner face of the north wall (z)

export function buildDoor(scene: THREE.Scene): DoorParts {
  const g = new THREE.Group();
  g.name = 'door_assembly';
  const m = materials();

  // Steel frame (angle section) set into the wall.
  const frameMat = m.rust();
  const fw = 0.07;
  const frame = new THREE.Group();
  for (const [w, h, x, y] of [
    [fw, DOOR.h + fw, DOOR.x - DOOR.w / 2 - fw / 2, (DOOR.h + fw) / 2],
    [fw, DOOR.h + fw, DOOR.x + DOOR.w / 2 + fw / 2, (DOOR.h + fw) / 2],
    [DOOR.w + fw * 2, fw, DOOR.x, DOOR.h + fw / 2],
  ] as const) {
    const b = box(w, h, 0.05, frameMat);
    b.position.set(x, y, FACE + 0.025);
    frame.add(b);
  }
  g.add(frame);

  // The door leaf: vertical planks, iron straps, rivets, strap hinges.
  const door = new THREE.Group();
  door.name = 'door';
  const leafMat = tile(m.woodPlanks(), 1, 1, Math.PI / 2);
  const leaf = box(DOOR.w, DOOR.h, DOOR.t, leafMat);
  leaf.position.set(DOOR.x, DOOR.h / 2 + 0.005, FACE + DOOR.t / 2 + 0.01);
  door.add(leaf);
  const front = FACE + DOOR.t + 0.01;

  const strapMat = m.darkSteel();
  const rivetGeo = new THREE.SphereGeometry(0.008, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const rivetMat = m.rust();
  const rivets: THREE.Vector3[] = [];
  for (const y of [0.28, 1.02, 1.8]) {
    const s = box(DOOR.w - 0.03, 0.085, 0.01, strapMat);
    s.position.set(DOOR.x, y, front + 0.005);
    door.add(s);
    for (let i = 0; i < 7; i++) rivets.push(new THREE.Vector3(DOOR.x - DOOR.w / 2 + 0.07 + (i * (DOOR.w - 0.14)) / 6, y, front + 0.01));
  }
  // Diagonal brace between the lower and middle straps.
  const dx = DOOR.w - 0.12;
  const dy = 1.02 - 0.28 - 0.085;
  const brace = box(Math.hypot(dx, dy), 0.07, 0.01, strapMat);
  brace.position.set(DOOR.x, (0.28 + 1.02) / 2, front + 0.004);
  brace.rotation.z = Math.atan2(dy, dx);
  door.add(brace);
  // Strap hinges on the left, reaching onto the frame.
  for (const y of [0.4, 1.65]) {
    const hinge = box(0.42, 0.05, 0.012, strapMat);
    hinge.position.set(DOOR.x - DOOR.w / 2 + 0.17, y, front + 0.012);
    door.add(hinge);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 12), strapMat);
    knuckle.position.set(DOOR.x - DOOR.w / 2 - 0.02, y, front - 0.005);
    door.add(knuckle);
  }
  const rivetMesh = new THREE.InstancedMesh(rivetGeo, rivetMat, rivets.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  rivets.forEach((p, i) => rivetMesh.setMatrixAt(i, mtx.compose(p, q, new THREE.Vector3(1, 1, 1))));
  door.add(rivetMesh);

  // Heavy ring pull.
  const ringPlate = box(0.07, 0.1, 0.01, strapMat);
  ringPlate.position.set(DOOR.x + 0.12, 1.22, front + 0.01);
  door.add(ringPlate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 24), m.rust());
  ring.position.set(DOOR.x + 0.12, 1.17, front + 0.02);
  ring.rotation.x = 0.25;
  door.add(ring);
  g.add(door);

  registry.register({ id: 'door', label: 'Heavy door', object: door, state: { open: false }, group: 'door' });

  // --- Four locks on the opening (right) edge ---
  const edgeX = DOOR.x + DOOR.w / 2;
  const lockDefs: [string, string, number, LockState['kind'], (m: ReturnType<typeof materials>) => THREE.Group][] = [
    ['lock_1', 'Brass padlock', 1.62, 'key', brassPadlock],
    ['lock_2', 'Combination padlock', 1.36, 'combination', comboPadlock],
    ['lock_3', 'Disc lock', 1.08, 'disc', discLock],
    ['lock_4', 'Chained padlock', 0.74, 'chain', chainedPadlock],
  ];
  for (const [id, label, y, kind, make] of lockDefs) {
    // Hasp: hinged plate on the door, staple on the frame.
    const hasp = new THREE.Group();
    const plate = box(0.11, 0.035, 0.008, m.darkSteel());
    plate.position.set(edgeX - 0.03, y, front + 0.008);
    hasp.add(plate);
    const staple = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12, Math.PI), m.steel());
    staple.position.set(edgeX + 0.035, y, front + 0.012);
    staple.rotation.set(0, Math.PI / 2, Math.PI / 2);
    hasp.add(staple);
    g.add(hasp);

    const lock = make(m);
    lock.position.set(edgeX + 0.035, y - 0.012, front + 0.03);
    g.add(lock);
    registry.register<LockState>({ id, label: `${label} (locked)`, object: lock, state: { locked: true, kind }, group: 'door' });
  }

  const keypad = buildKeypad(g, m);
  shadowed(g);
  scene.add(g);
  return { group: g, setKeypadDisplay: keypad };
}

// ---------- Locks: each built around its shackle point at the origin ----------

function shackle(radius: number, thick: number, legs: number, mat: THREE.Material): THREE.Group {
  const s = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 8, 20, Math.PI), mat);
  arc.position.y = legs;
  s.add(arc);
  for (const x of [-radius, radius]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, legs, 8), mat);
    leg.position.set(x, legs / 2, 0);
    s.add(leg);
  }
  return s;
}

function keyhole(mat: THREE.Material, scale = 1): THREE.Group {
  const k = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.004 * scale, 12), mat);
  top.position.y = 0.003 * scale;
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.003 * scale, 0.008 * scale), mat);
  slot.position.y = -0.001 * scale;
  k.add(top, slot);
  return k;
}

function brassPadlock(m: ReturnType<typeof materials>): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.048, 0.042, 0.018, m.brass());
  body.position.y = -0.03;
  g.add(body);
  const sh = shackle(0.014, 0.0035, 0.012, m.steel());
  sh.position.y = -0.012;
  g.add(sh);
  const kh = keyhole(m.black());
  kh.position.set(0, -0.036, 0.0095);
  g.add(kh);
  g.rotation.z = 0.08;
  return g;
}

function comboPadlock(m: ReturnType<typeof materials>): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.058, 0.064, 0.026, m.darkSteel());
  body.position.y = -0.045;
  g.add(body);
  const sh = shackle(0.017, 0.0045, 0.016, m.steel());
  sh.position.y = -0.014;
  g.add(sh);
  // Four number wheels across the front.
  const [c, ctx] = makeCanvas(128, 32);
  ctx.fillStyle = '#2b2b28';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#d6cfba';
  ctx.font = 'bold 22px monospace';
  for (let i = 0; i < 10; i++) ctx.fillText(String(i), i * 12.8 + 2, 24);
  const numTex = new THREE.CanvasTexture(c);
  numTex.colorSpace = THREE.SRGBColorSpace;
  numTex.wrapS = THREE.RepeatWrapping;
  for (let i = 0; i < 4; i++) {
    const wheelMat = new THREE.MeshStandardMaterial({ map: numTex.clone(), roughness: 0.5, metalness: 0.3 });
    wheelMat.map!.offset.x = Math.random();
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.011, 16), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.rotation.x = Math.random() * Math.PI * 2;
    wheel.position.set(-0.019 + i * 0.0127, -0.05, 0.011);
    g.add(wheel);
  }
  g.rotation.z = -0.05;
  return g;
}

function discLock(m: ReturnType<typeof materials>): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.024, 28), m.steel());
  body.rotation.x = Math.PI / 2;
  body.position.y = -0.032;
  g.add(body);
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.002, 6, 28), m.darkSteel());
  ridge.position.set(0, -0.032, 0.012);
  g.add(ridge);
  const kh = keyhole(m.black(), 1.3);
  kh.position.set(0, -0.032, 0.0125);
  g.add(kh);
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0045, 8, 16, Math.PI), m.steel());
  sh.position.y = -0.004;
  g.add(sh);
  return g;
}

function chainedPadlock(m: ReturnType<typeof materials>): THREE.Group {
  const g = new THREE.Group();
  // Chain sagging from the hasp to an eye bolt in the wall to the right.
  const linkGeo = new THREE.TorusGeometry(0.013, 0.0035, 6, 12);
  linkGeo.scale(1.5, 1, 1);
  const linkMat = m.rust();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const link = new THREE.Mesh(linkGeo, linkMat);
    link.position.set(t * 0.2, -Math.sin(t * Math.PI) * 0.04, 0);
    const slope = Math.cos(t * Math.PI) * -0.6;
    link.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, slope);
    g.add(link);
  }
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.005, 8, 16), m.rust());
  eye.position.set(0.21, 0.005, -0.02);
  g.add(eye);
  // Big old iron padlock hanging from the middle of the chain.
  const lock = new THREE.Group();
  const body = box(0.07, 0.075, 0.03, m.rustRed());
  body.position.y = -0.06;
  lock.add(body);
  const sh = shackle(0.019, 0.005, 0.015, m.rust());
  sh.position.y = -0.023;
  lock.add(sh);
  const cover = new THREE.Mesh(new THREE.CircleGeometry(0.01, 14), m.brass());
  cover.position.set(0, -0.06, 0.0155);
  lock.add(cover);
  lock.position.set(0.1, -0.04, 0.01);
  lock.rotation.z = 0.1;
  g.add(lock);
  return g;
}

// ---------- Keypad ----------

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function keypadId(key: string): string {
  return key === '*' ? 'keypad_star' : key === '#' ? 'keypad_hash' : `keypad_${key}`;
}

function buildKeypad(parent: THREE.Group, m: ReturnType<typeof materials>): (text: string) => void {
  const g = new THREE.Group();
  g.name = 'keypad';
  g.position.set(KEYPAD.x, KEYPAD.y, FACE);
  const housing = box(0.13, 0.215, 0.03, m.darkSteel());
  housing.position.z = 0.015;
  g.add(housing);
  const bezel = box(0.115, 0.2, 0.004, m.plastic(0x1b1c1c));
  bezel.position.z = 0.031;
  g.add(bezel);
  // Conduit up to the ceiling.
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, ROOM.h - KEYPAD.y - 0.1, 8), m.rust());
  conduit.position.set(0.045, (ROOM.h - KEYPAD.y) / 2 + 0.05, 0.012);
  g.add(conduit);

  // Display.
  const [dc, dctx] = makeCanvas(256, 64);
  const dispTex = new THREE.CanvasTexture(dc);
  dispTex.colorSpace = THREE.SRGBColorSpace;
  const draw = (text: string) => {
    dctx.fillStyle = '#071008';
    dctx.fillRect(0, 0, 256, 64);
    dctx.fillStyle = '#5fbf6a';
    dctx.font = 'bold 40px monospace';
    dctx.textAlign = 'right';
    dctx.textBaseline = 'middle';
    dctx.fillText(text, 240, 34);
    dispTex.needsUpdate = true;
  };
  draw('- - - -');
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.026),
    new THREE.MeshStandardMaterial({ map: dispTex, emissiveMap: dispTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.3 }),
  );
  display.position.set(0, 0.07, 0.034);
  g.add(display);
  registry.register({ id: 'keypad_display', label: 'Keypad display', object: display, group: 'keypad' });

  // Keys: 3 × 4 grid, each a separate mesh.
  const keyGeo = new THREE.BoxGeometry(0.024, 0.022, 0.008);
  KEYS.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const tex = new THREE.CanvasTexture(keyCapCanvas(k));
    tex.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color: 0x3a3935, roughness: 0.7 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 });
    const key = new THREE.Mesh(keyGeo, [side, side, side, side, top, side]);
    key.position.set((col - 1) * 0.032, 0.025 - row * 0.03, 0.036);
    g.add(key);
    registry.register<KeypadState>({ id: keypadId(k), label: `Key ${k}`, object: key, group: 'keypad', state: { entry: '' } });
  });
  parent.add(g);
  return draw;
}
