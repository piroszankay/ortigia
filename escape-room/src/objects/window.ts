// The high window in the west wall, boarded over from inside. Cold daylight
// leaks through the gaps between rough planks.

import * as THREE from 'three';
import { DAYLIGHT, HALF_W, ROOM, WINDOW } from '../config';
import { registry } from '../interactables';
import { box, materials, shadowed, tile } from '../materials';
import { rng } from '../textures/noise';

export interface WindowParts {
  group: THREE.Group;
  /** Gaps between planks (world y centre + height), used for light beams. */
  gaps: { y: number; h: number }[];
}

export function buildWindow(scene: THREE.Scene): WindowParts {
  const g = new THREE.Group();
  g.name = 'window';
  const m = materials();
  const rand = rng(77);
  const cy = WINDOW.bottom + WINDOW.h / 2;

  // Outside: a bright, cold, overcast backdrop with a hint of ground.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64;
  skyCanvas.height = 64;
  const sctx = skyCanvas.getContext('2d')!;
  const grad = sctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#e6eef7');
  grad.addColorStop(0.55, '#b9c7d6');
  grad.addColorStop(0.62, '#4b5246');
  grad.addColorStop(1, '#2a2e27');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.w * 2.4, WINDOW.h * 3),
    new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(DAYLIGHT.color).multiplyScalar(2.2), fog: false }),
  );
  sky.position.set(-HALF_W - ROOM.wallT - 0.5, cy + 0.15, WINDOW.z);
  sky.rotation.y = Math.PI / 2;
  g.add(sky);

  // Old window frame + filthy glass inside the wall opening.
  const frameMat = tile(m.woodDark(), 1, 0.2);
  const fx = -HALF_W - ROOM.wallT * 0.6;
  for (const [w, h, dy, dz] of [
    [WINDOW.w, 0.04, WINDOW.h / 2 - 0.02, 0],
    [WINDOW.w, 0.04, -WINDOW.h / 2 + 0.02, 0],
    [0.04, WINDOW.h, 0, WINDOW.w / 2 - 0.02],
    [0.04, WINDOW.h, 0, -WINDOW.w / 2 + 0.02],
    [0.03, WINDOW.h, 0, 0],
  ] as const) {
    const bar = box(0.04, h, w, frameMat);
    bar.position.set(fx, cy + dy, WINDOW.z + dz);
    g.add(bar);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.w, WINDOW.h),
    new THREE.MeshStandardMaterial({ color: 0x9aa79a, transparent: true, opacity: 0.35, roughness: 0.4, depthWrite: false }),
  );
  glass.position.set(fx - 0.005, cy, WINDOW.z);
  glass.rotation.y = Math.PI / 2;
  g.add(glass);

  // Planks nailed across the opening, flush on the inner wall face.
  const heights = [0.094, 0.106, 0.084, 0.1, 0.088];
  const gapsH = [0.02, 0.028, 0.014, 0.024];
  const total = heights.reduce((a, b) => a + b, 0) + gapsH.reduce((a, b) => a + b, 0);
  let y = cy - total / 2;
  const gaps: { y: number; h: number }[] = [];
  const nailMat = m.rust();
  const planks = new THREE.Group();
  heights.forEach((h, i) => {
    const len = WINDOW.w + 0.22 + rand() * 0.08;
    const plankMat = tile(m.woodRaw(), len / 1.4, 1, 0);
    const p = box(0.02, h, len, plankMat);
    // Rough, uneven: a little roll, offset and per-plank twist.
    p.position.set(-HALF_W + 0.014 + rand() * 0.006, y + h / 2, WINDOW.z + (rand() - 0.5) * 0.06);
    p.rotation.x = (rand() - 0.5) * 0.02;
    p.rotation.y = (rand() - 0.5) * 0.02;
    planks.add(p);
    // Nails at both ends (one bent).
    for (const end of [-1, 1]) {
      for (const dy of [-h * 0.25, h * 0.25]) {
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 8), nailMat);
        nail.rotation.z = Math.PI / 2;
        nail.position.set(p.position.x + 0.014, p.position.y + dy + end * Math.sin(p.rotation.x) * (len / 2 - 0.05), p.position.z + end * (len / 2 - 0.05));
        planks.add(nail);
      }
    }
    if (i === 2) {
      const bent = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.035, 6), nailMat);
      bent.position.set(p.position.x + 0.03, p.position.y, p.position.z + len / 2 - 0.15);
      bent.rotation.set(0.6, 0, 1.0);
      planks.add(bent);
    }
    y += h;
    if (i < gapsH.length) {
      gaps.push({ y: y + gapsH[i] / 2, h: gapsH[i] });
      y += gapsH[i];
    }
  });
  g.add(planks);
  shadowed(g);
  sky.castShadow = false;
  glass.castShadow = false;
  scene.add(g);

  registry.register({ id: 'window', label: 'Boarded window', object: planks, state: { boarded: true }, group: 'window', range: 2.2 });
  return { group: g, gaps };
}
