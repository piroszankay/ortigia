// Shared procedural materials, generated once and reused by props.

import * as THREE from 'three';
import { colorTexture, surfaceToMaps } from './textures/canvas';
import { paper, rustyMetal, wood } from './textures/surfaces';

let cache: ReturnType<typeof build> | undefined;

function build() {
  const woodDark = surfaceToMaps(wood({ w: 512, h: 256, seed: 3, weather: 0.6 }), 2.5, true);
  const woodPlanks = surfaceToMaps(wood({ w: 1024, h: 512, seed: 8, planks: 5, tone: [0.3, 0.25, 0.2], weather: 0.75 }), 2.5, true);
  const woodRaw = surfaceToMaps(wood({ w: 512, h: 128, seed: 12, tone: [0.45, 0.35, 0.24], weather: 0.7 }), 3, true);
  const rust = surfaceToMaps(rustyMetal(512, 512, 4), 2, true);
  const rustRed = surfaceToMaps(rustyMetal(256, 256, 9, [0.24, 0.12, 0.08]), 2, true);
  const papers = [0, 1, 2, 3].map((i) => colorTexture(paper(40 + i).color));

  const std = (p: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...p });

  return {
    woodDark: () => std({ map: woodDark.map, normalMap: woodDark.normalMap }),
    woodPlanks: () => std({ map: woodPlanks.map, normalMap: woodPlanks.normalMap }),
    woodRaw: () => std({ map: woodRaw.map, normalMap: woodRaw.normalMap }),
    rust: () => std({ map: rust.map, normalMap: rust.normalMap, metalness: 0.55, roughness: 0.75 }),
    rustRed: () => std({ map: rustRed.map, normalMap: rustRed.normalMap, metalness: 0.5, roughness: 0.8 }),
    steel: () => std({ color: 0x5c5f60, metalness: 0.85, roughness: 0.42 }),
    darkSteel: () => std({ color: 0x262829, metalness: 0.7, roughness: 0.6 }),
    brass: () => std({ color: 0x7a5e2e, metalness: 0.85, roughness: 0.58 }),
    plastic: (color: number) => std({ color, roughness: 0.6 }),
    black: () => std({ color: 0x050505, roughness: 0.95 }),
    paper: (i: number) => std({ map: papers[i % papers.length], side: THREE.DoubleSide, roughness: 0.95 }),
    glass: (color = 0x8a9a80) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    concreteChunk: () => std({ color: 0x5d5850, roughness: 1 }),
  };
}

export function materials() {
  cache ??= build();
  return cache;
}

/** Make a mesh cast + receive shadows (and all meshes under a group). */
export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

export function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** Scale a texture's repeat on a cloned material map so it tiles at a given size in metres. */
export function tile(mat: THREE.MeshStandardMaterial, u: number, v: number, rotation = 0): THREE.MeshStandardMaterial {
  for (const key of ['map', 'normalMap'] as const) {
    const t = mat[key];
    if (!t) continue;
    const c = t.clone();
    c.repeat.set(u, v);
    c.rotation = rotation;
    c.center.set(0.5, 0.5);
    c.needsUpdate = true;
    mat[key] = c;
  }
  return mat;
}
