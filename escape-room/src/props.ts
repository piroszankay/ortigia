// Set dressing: crate (under the CRT), shelf with jars, broken chair, bucket,
// debris and papers. All simple procedural geometry. Returns 2D colliders.

import * as THREE from 'three';
import { CRT, HALF_D, HALF_W } from './config';
import type { Collider } from './controls';
import { registry } from './interactables';
import { box, materials, shadowed, tile } from './materials';
import { CRATE_SIZE } from './objects/crt';
import { rng } from './textures/noise';

export function buildProps(scene: THREE.Scene): Collider[] {
  const colliders: Collider[] = [];
  const rand = rng(1234);

  // --- Crate under the CRT ---
  const crate = buildCrate(CRATE_SIZE.w, CRATE_SIZE.h, CRATE_SIZE.d);
  crate.position.set(CRT.x, 0, CRT.z);
  crate.rotation.y = 0.05;
  scene.add(crate);
  colliders.push({ x: CRT.x, z: CRT.z, hw: CRATE_SIZE.w / 2 + 0.02, hd: CRATE_SIZE.d / 2 + 0.02 });

  // --- Shelf with jars on the west wall, south end ---
  const shelf = buildShelf(rand);
  shelf.position.set(-HALF_W + 0.17, 0, 1.55);
  shelf.rotation.y = Math.PI / 2;
  shelf.rotation.z = -0.012; // leaning into the wall
  scene.add(shelf);
  colliders.push({ x: -HALF_W + 0.17, z: 1.55, hw: 0.2, hd: 0.52 });

  // --- Broken chair, north-east corner ---
  const chair = buildBrokenChair();
  chair.position.set(1.75, 0, -1.55);
  chair.rotation.y = -0.7;
  scene.add(chair);
  colliders.push({ x: 1.75, z: -1.55, hw: 0.3, hd: 0.3 });

  // --- Bucket near the door corner ---
  const bucket = buildBucket();
  bucket.position.set(-2.05, 0, -2.05);
  scene.add(bucket);
  colliders.push({ x: -2.05, z: -2.05, hw: 0.17, hd: 0.17 });
  registry.register({ id: 'bucket', label: 'Rusty bucket', object: bucket, group: 'props', state: {} });

  // --- Debris: fallen concrete chunks along the walls ---
  const m = materials();
  const chunkMat = m.concreteChunk();
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand() * 4);
    const along = (rand() - 0.5) * 4.6;
    const off = 0.05 + Math.pow(rand(), 2) * 0.45;
    const x = side === 0 ? along : side === 1 ? HALF_W - off : side === 2 ? along : -HALF_W + off;
    const z = side === 0 ? -HALF_D + off : side === 1 ? along : side === 2 ? HALF_D - off : along;
    const s = 0.012 + Math.pow(rand(), 3) * 0.06;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    geo.scale(1 + rand() * 0.6, 0.5 + rand() * 0.5, 1 + rand() * 0.4);
    const c = new THREE.Mesh(geo, chunkMat);
    c.position.set(x, s * 0.4, z);
    c.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    scene.add(shadowed(c));
  }
  // A broken half-block.
  const half = box(0.2, 0.19, 0.19, chunkMat);
  half.position.set(-1.6, 0.095, 2.2);
  half.rotation.set(0, 0.6, 0.05);
  scene.add(shadowed(half));

  // --- Papers, slightly curled ---
  const paperSpots: [number, number, number][] = [
    [-1.9, 1.0, 0.4],
    [-1.55, 1.45, 2.1],
    [0.7, 1.8, -0.6],
    [1.6, -0.3, 1.2],
    [-0.4, -1.95, 0.2],
    [2.0, 0.9, 2.6],
    [-2.15, -0.9, 1.3],
  ];
  paperSpots.forEach(([x, z, r], i) => {
    const geo = new THREE.PlaneGeometry(0.21, 0.297, 6, 8);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k);
      const py = p.getY(k);
      p.setZ(k, Math.pow(Math.abs(px) / 0.105, 2) * 0.008 + Math.sin(py * 14 + i) * 0.002 + rand() * 0.0015);
    }
    geo.computeVertexNormals();
    const sheet = new THREE.Mesh(geo, m.paper(i));
    sheet.rotation.set(-Math.PI / 2, 0, r);
    sheet.position.set(x, 0.002 + i * 0.0004, z);
    sheet.receiveShadow = true;
    scene.add(sheet);
  });
  // A crumpled ball of paper.
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), m.paper(2));
  const bp = ball.geometry.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < bp.count; k++) {
    const f = 0.75 + rand() * 0.45;
    bp.setXYZ(k, bp.getX(k) * f, bp.getY(k) * f, bp.getZ(k) * f);
  }
  ball.geometry.computeVertexNormals();
  ball.position.set(0.9, 0.03, 2.2);
  scene.add(shadowed(ball));

  // A few splinters of wood near the chair.
  for (let i = 0; i < 4; i++) {
    const sp = box(0.18 + rand() * 0.15, 0.015, 0.025, m.woodRaw());
    sp.position.set(1.4 + rand() * 0.5, 0.008, -1.15 - rand() * 0.4);
    sp.rotation.y = rand() * Math.PI;
    scene.add(shadowed(sp));
  }

  return colliders;
}

function buildCrate(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'crate';
  const m = materials();
  const slatMat = tile(m.woodRaw(), 1, 1);
  const postMat = m.woodDark();
  const slats = 3;
  const sh = h / slats - 0.012;
  for (let i = 0; i < slats; i++) {
    const y = 0.006 + sh / 2 + i * (h / slats);
    for (const sz of [-1, 1]) {
      const s = box(w, sh, 0.018, slatMat);
      s.position.set(0, y, (sz * (d - 0.018)) / 2);
      g.add(s);
    }
    for (const sx of [-1, 1]) {
      const s = box(0.018, sh, d - 0.036, slatMat);
      s.position.set((sx * (w - 0.018)) / 2, y, 0);
      g.add(s);
    }
  }
  const lid = box(w + 0.01, 0.02, d + 0.01, tile(m.woodRaw(), 1, 1));
  lid.position.y = h - 0.01;
  g.add(lid);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = box(0.045, h - 0.02, 0.045, postMat);
      p.position.set((sx * (w - 0.04)) / 2, (h - 0.02) / 2, (sz * (d - 0.04)) / 2);
      g.add(p);
    }
  }
  return shadowed(g);
}

function buildShelf(rand: () => number): THREE.Group {
  // Local frame: x along the wall (1 m), z out from the wall (0.3 m deep).
  const g = new THREE.Group();
  g.name = 'shelf';
  const m = materials();
  const W = 1.0;
  const D = 0.3;
  const H = 1.7;
  const wood = m.woodDark();
  for (const sx of [-1, 1]) {
    const side = box(0.025, H, D, wood);
    side.position.set((sx * W) / 2, H / 2, 0);
    g.add(side);
  }
  const boardYs = [0.12, 0.6, 1.05, 1.5];
  boardYs.forEach((y, i) => {
    const b = box(W - 0.02, 0.022, D - 0.01, tile(m.woodRaw(), 1, 0.4));
    b.position.set(0, y, 0);
    if (i === 2) b.rotation.z = 0.035; // one board has slipped off its peg
    g.add(b);
  });
  const brace = box(Math.hypot(W, 0.9), 0.03, 0.012, wood);
  brace.position.set(0, 0.85, -D / 2 + 0.006);
  brace.rotation.z = Math.atan2(0.9, W);
  g.add(brace);

  // Jars, tins and a bottle.
  const jarProfile = (r: number, h: number) =>
    [
      [0, 0],
      [r * 0.92, 0],
      [r, h * 0.08],
      [r, h * 0.78],
      [r * 0.72, h * 0.9],
      [r * 0.7, h],
    ].map(([x, y]) => new THREE.Vector2(x, y));
  const contents = [0x3b4a1c, 0x5a2a14, 0x2a2416, 0x6b5a2a, 0x1e1e14];
  const place = (y: number, items: number) => {
    for (let i = 0; i < items; i++) {
      const x = -W / 2 + 0.12 + (i * (W - 0.24)) / Math.max(1, items - 1) + (rand() - 0.5) * 0.05;
      const z = (rand() - 0.5) * 0.1;
      const kind = rand();
      if (kind < 0.6) {
        const r = 0.04 + rand() * 0.025;
        const h = 0.1 + rand() * 0.1;
        const jar = new THREE.Group();
        const glass = new THREE.Mesh(new THREE.LatheGeometry(jarProfile(r, h), 18), m.glass(rand() < 0.5 ? 0x8a9a80 : 0x9a8f70));
        jar.add(glass);
        const fill = rand();
        if (fill > 0.25) {
          const level = h * (0.2 + fill * 0.55);
          const stuff = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.94, r * 0.9, level, 16),
            new THREE.MeshStandardMaterial({ color: contents[Math.floor(rand() * contents.length)], roughness: 0.6 }),
          );
          stuff.position.y = level / 2 + 0.004;
          jar.add(stuff);
        }
        if (rand() < 0.75) {
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.016, 16), m.rust());
          lid.position.y = h + 0.006;
          jar.add(lid);
        }
        jar.position.set(x, y + 0.011, z);
        if (rand() < 0.12) {
          jar.rotation.z = Math.PI / 2;
          jar.position.y += r;
        }
        g.add(jar);
      } else if (kind < 0.85) {
        const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.11, 16), m.rust());
        tin.position.set(x, y + 0.066, z);
        g.add(tin);
      } else {
        const bottle = new THREE.Mesh(
          new THREE.LatheGeometry(
            [
              [0, 0],
              [0.032, 0],
              [0.033, 0.16],
              [0.012, 0.21],
              [0.011, 0.26],
            ].map(([a, b]) => new THREE.Vector2(a, b)),
            16,
          ),
          m.glass(0x40502a),
        );
        bottle.position.set(x, y + 0.011, z);
        g.add(bottle);
      }
    }
  };
  place(boardYs[0], 2);
  place(boardYs[1], 4);
  place(boardYs[2], 3);
  place(boardYs[3], 5);
  shadowed(g);
  // Glass casts faint shadows only through its contents.
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).transparent) mesh.castShadow = false;
  });
  registry.register({ id: 'shelf_jars', label: 'Shelf of old jars', object: g, group: 'props', state: {} });
  return g;
}

function buildBrokenChair(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'broken_chair';
  const m = materials();
  const wood = m.woodDark();
  const inner = new THREE.Group();
  const seat = box(0.42, 0.03, 0.4, tile(m.woodRaw(), 1, 1));
  seat.position.y = 0.45;
  inner.add(seat);
  // Three legs; the fourth (front right) snapped off.
  const legs: [number, number, number][] = [
    [-0.18, -0.17, 0.45],
    [0.18, -0.17, 0.45],
    [-0.18, 0.17, 0.45],
    [0.18, 0.17, 0.12],
  ];
  for (const [x, z, h] of legs) {
    const l = box(0.032, h, 0.032, wood);
    l.position.set(x, 0.45 - h / 2, z);
    inner.add(l);
  }
  // Back: two posts, one remaining slat, one hanging off.
  for (const x of [-0.18, 0.18]) {
    const p = box(0.03, 0.48, 0.03, wood);
    p.position.set(x, 0.69, -0.18);
    inner.add(p);
  }
  const slat = box(0.36, 0.06, 0.018, wood);
  slat.position.set(0, 0.86, -0.18);
  inner.add(slat);
  const hanging = box(0.36, 0.05, 0.016, wood);
  hanging.position.set(0.1, 0.63, -0.18);
  hanging.rotation.z = -0.9;
  inner.add(hanging);
  // Tipped forward-right onto the missing leg.
  inner.rotation.set(0.0, 0, -0.33);
  inner.position.set(0.07, 0.07, 0);
  g.add(inner);
  // The broken leg lying on the floor.
  const loose = box(0.032, 0.33, 0.032, wood);
  loose.rotation.set(Math.PI / 2, 0, 0.8);
  loose.position.set(-0.3, 0.016, 0.35);
  g.add(loose);
  shadowed(g);
  registry.register({ id: 'broken_chair', label: 'Broken chair', object: g, group: 'props', state: {} });
  return g;
}

function buildBucket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bucket';
  const m = materials();
  const profile = [
    [0, 0.005],
    [0.11, 0.0],
    [0.115, 0.01],
    [0.145, 0.27],
    [0.15, 0.28],
    [0.145, 0.28],
    [0.14, 0.27],
    [0.108, 0.015],
    [0, 0.018],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const mat = m.rust();
  mat.side = THREE.DoubleSide;
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), mat);
  g.add(body);
  // Stagnant water.
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.128, 28),
    new THREE.MeshStandardMaterial({ color: 0x0d0f0a, roughness: 0.05, metalness: 0.2 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.12;
  g.add(water);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.004, 6, 24, Math.PI), m.steel());
  handle.rotation.set(-1.25, 0, 0);
  handle.position.y = 0.27;
  g.add(handle);
  return shadowed(g);
}
