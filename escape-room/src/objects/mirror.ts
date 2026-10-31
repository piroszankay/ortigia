// The one-way mirror in the east wall and the small hidden room behind it.
// revealHiddenRoom() switches the hidden light on and fades the pane from a
// dirty mirror to semi-transparent glass.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HALF_W, HIDDEN_ROOM, MIRROR, ROOM } from '../config';
import { registry } from '../interactables';
import { box, materials, shadowed, tile } from '../materials';
import { makeCanvas, surfaceToMaps } from '../textures/canvas';
import { symbolCanvas } from '../textures/labels';
import { fbm, rng, smoothstep, vnoise } from '../textures/noise';
import { concreteBlockWall } from '../textures/surfaces';

const MirrorShader = {
  name: 'OneWayMirrorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tDirt: { value: null },
    uReveal: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUvProj;
    varying vec2 vUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = uv;
      vUvProj = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDirt;
    uniform float uReveal;
    varying vec4 vUvProj;
    varying vec2 vUv;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec4 dirt = texture2D(tDirt, vUv);      // r: grime, g: desilvering, b: smears
      vec4 projUv = vUvProj;
      projUv.xy += (dirt.b - 0.5) * 0.004 * projUv.w; // slight waviness of old glass
      vec3 refl = texture2DProj(tDiffuse, projUv).rgb * color;
      // Desilvered patches reflect almost nothing.
      refl *= 1.0 - dirt.g * 0.85;
      // Grime: a faint dusty film catching a little light.
      vec3 film = vec3(0.018, 0.016, 0.013) * (0.4 + dirt.r);
      vec3 col = mix(refl, film, clamp(dirt.r * 0.7, 0.0, 1.0));
      // Revealed: reflection weakens, pane becomes see-through (still dirty).
      col *= mix(1.0, 0.35, uReveal);
      float alpha = mix(1.0, 0.16 + dirt.r * 0.35 + dirt.g * 0.15, uReveal);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function dirtCanvas(): HTMLCanvasElement {
  const W = 384;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      const u = x / W;
      const v = y / H;
      const edge = Math.min(u, 1 - u, v * 1.5, (1 - v) * 1.5);
      const grime = fbm(u * 6, v * 4, 5, 3) * 0.7 + (1 - smoothstep(0, 0.12, edge)) * 0.5;
      const lowGrime = smoothstep(0.4, 1, v) * 0.25; // dust collects at the bottom
      const desilver = smoothstep(0.62, 0.72, fbm(u * 9, v * 6, 4, 7)) * (1 - smoothstep(0.02, 0.18, edge) * 0.7);
      const spots = vnoise(u * 90, v * 60, 9) > 0.9 ? 0.6 : 0;
      const smear = fbm(u * 2 + v * 3, v * 2, 3, 11);
      img.data[i] = Math.min(1, grime * 0.75 + lowGrime) * 255;
      img.data[i + 1] = Math.min(1, desilver + spots) * 255;
      img.data[i + 2] = smear * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Finger smears.
  const rand = rng(5);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    ctx.strokeStyle = 'rgba(60,0,0,0.25)';
    ctx.lineWidth = 6 + rand() * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x = W * (0.2 + rand() * 0.6);
    const y = H * (0.3 + rand() * 0.5);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 20 * (rand() - 0.5), y + 30, x + 40 * (rand() - 0.5), y + 60 + rand() * 30);
    ctx.stroke();
  }
  return c;
}

export interface MirrorParts {
  reveal(): void;
  hide(): void;
  readonly revealed: boolean;
  update(dt: number, time: number): void;
}

export function buildMirror(scene: THREE.Scene, renderScale: number): MirrorParts {
  const m = materials();
  const paneX = HALF_W + 0.035; // set slightly back into the wall opening

  // --- The pane ---
  const dirtTex = new THREE.CanvasTexture(dirtCanvas());
  dirtTex.colorSpace = THREE.NoColorSpace;
  const texW = Math.round(1024 * renderScale);
  const pane = new Reflector(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), {
    textureWidth: texW,
    textureHeight: Math.round((texW * MIRROR.h) / MIRROR.w),
    color: 0x9a9a92,
    shader: MirrorShader,
    multisample: 2,
    clipBias: 0.002,
  });
  pane.name = 'mirror_pane';
  pane.position.set(paneX, MIRROR.centerY, MIRROR.z);
  pane.rotation.y = -Math.PI / 2;
  const paneMat = pane.material as THREE.ShaderMaterial;
  paneMat.uniforms.tDirt.value = dirtTex;
  paneMat.transparent = true;
  scene.add(pane);

  // --- Grimy frame ---
  const frame = new THREE.Group();
  frame.name = 'mirror';
  const fMat = tile(m.woodDark(), 1, 0.25);
  const fw = 0.075;
  for (const [w, h, y, z] of [
    [MIRROR.w + fw * 2, fw, MIRROR.centerY + MIRROR.h / 2 + fw / 2, MIRROR.z],
    [MIRROR.w + fw * 2, fw * 1.2, MIRROR.centerY - MIRROR.h / 2 - fw * 0.6, MIRROR.z],
    [fw, MIRROR.h, MIRROR.centerY, MIRROR.z - MIRROR.w / 2 - fw / 2],
    [fw, MIRROR.h, MIRROR.centerY, MIRROR.z + MIRROR.w / 2 + fw / 2],
  ] as const) {
    const b = box(0.045, h, w, fMat);
    b.position.set(HALF_W - 0.022, y, z);
    frame.add(b);
  }
  // Corner screws.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), m.rust());
      screw.rotation.z = Math.PI / 2;
      screw.position.set(HALF_W - 0.046, MIRROR.centerY + sy * (MIRROR.h / 2 + fw / 2), MIRROR.z + sz * (MIRROR.w / 2 + fw / 2));
      frame.add(screw);
    }
  }
  shadowed(frame);
  scene.add(frame);
  // The pane itself is the clickable part.
  registry.register({ id: 'mirror', label: 'Dirty mirror', object: pane, state: { revealed: false }, group: 'mirror', keepMaterials: true });

  // --- Hidden room behind the wall ---
  const hidden = new THREE.Group();
  hidden.name = 'hidden_room';
  const x0 = HALF_W + ROOM.wallT;
  const D = HIDDEN_ROOM.depth;
  const Wd = HIDDEN_ROOM.width;
  const Hh = HIDDEN_ROOM.height;
  const wallSurf = concreteBlockWall({ length: Wd * 2 + D * 2, height: Hh, seed: 91, pxPerM: 110 });
  const wm = surfaceToMaps(wallSurf, 2.5);
  const wallMat = new THREE.MeshStandardMaterial({ map: wm.map, normalMap: wm.normalMap, color: 0xb8c4b0, roughness: 0.92, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(D, Hh, Wd), wallMat);
  shell.position.set(x0 + D / 2, Hh / 2, MIRROR.z);
  shell.receiveShadow = true;
  hidden.add(shell);
  // Plain floor so the bright room does not look like a box.
  const hFloor = box(D, 0.01, Wd, new THREE.MeshStandardMaterial({ color: 0x3d3a35, roughness: 0.95 }));
  hFloor.position.set(x0 + D / 2, 0.005, MIRROR.z);
  hidden.add(hFloor);

  // A table and a chair facing the glass.
  const tableMat = tile(m.woodDark(), 1, 1);
  const top = box(0.7, 0.04, 1.0, tableMat);
  top.position.set(x0 + 1.2, 0.74, MIRROR.z);
  hidden.add(top);
  for (const dx of [-0.3, 0.3]) {
    for (const dz of [-0.45, 0.45]) {
      const leg = box(0.04, 0.72, 0.04, m.darkSteel());
      leg.position.set(x0 + 1.2 + dx, 0.36, MIRROR.z + dz);
      hidden.add(leg);
    }
  }
  const chair = new THREE.Group();
  const seat = box(0.42, 0.04, 0.42, m.darkSteel());
  seat.position.y = 0.46;
  chair.add(seat);
  const back = box(0.03, 0.45, 0.42, m.darkSteel());
  back.position.set(0.2, 0.7, 0);
  chair.add(back);
  for (const dx of [-0.19, 0.19]) {
    for (const dz of [-0.19, 0.19]) {
      const leg = box(0.025, 0.46, 0.025, m.darkSteel());
      leg.position.set(dx, 0.23, dz);
      chair.add(leg);
    }
  }
  chair.position.set(x0 + 1.75, 0, MIRROR.z + 0.05);
  chair.rotation.y = 0.12;
  hidden.add(chair);

  // The future clue: a glowing symbol painted on the far wall.
  const symTex = new THREE.CanvasTexture(symbolCanvas());
  symTex.colorSpace = THREE.SRGBColorSpace;
  const symMat = new THREE.MeshStandardMaterial({
    color: 0x220600,
    emissive: 0xff4a1c,
    emissiveMap: symTex,
    emissiveIntensity: 0.25,
    alphaMap: symTex,
    transparent: true,
    depthWrite: false,
  });
  const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), symMat);
  symbol.position.set(x0 + D - 0.01, 1.6, MIRROR.z - 0.05);
  symbol.rotation.y = -Math.PI / 2;
  hidden.add(symbol);
  registry.register({ id: 'hidden_symbol', label: 'Strange symbol', object: symbol, group: 'mirror', state: {}, range: 6 });

  // Its own light: a fluorescent tube that is off by default.
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xd8ecff, emissiveIntensity: 0 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 12), tubeMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(x0 + 0.9, Hh - 0.06, MIRROR.z);
  hidden.add(tube);
  const fixture = box(0.08, 0.03, 1.1, m.darkSteel());
  fixture.position.set(x0 + 0.9, Hh - 0.025, MIRROR.z);
  hidden.add(fixture);
  // A wide spot aimed away from the glass: it lights the room but never reaches
  // through the wall onto the cellar side (no shadow map needed).
  const hiddenLight = new THREE.SpotLight(0xd6e8ff, 0, 0, 1.25, 0.6, 2);
  hiddenLight.position.set(x0 + 0.35, Hh - 0.12, MIRROR.z);
  hiddenLight.target.position.set(x0 + D, 0.4, MIRROR.z);
  hidden.add(hiddenLight, hiddenLight.target);
  shadowed(hidden, true, true);
  shell.castShadow = false;
  symbol.castShadow = false;
  scene.add(hidden);

  // --- Reveal animation ---
  let target = 0;
  let reveal = 0;
  let lightTarget = 0;
  let lightLevel = 0;
  let stutter = 0;
  const HIDDEN_LIGHT = 24;

  return {
    get revealed() {
      return target === 1;
    },
    reveal() {
      if (target === 1) return;
      target = 1;
      lightTarget = 1;
      stutter = 1.1; // fluorescent tube strikes a few times before catching
      registry.get('mirror')!.state.revealed = true;
      registry.get('mirror')!.label = 'One-way mirror';
    },
    hide() {
      target = 0;
      lightTarget = 0;
      stutter = 0;
      registry.get('mirror')!.state.revealed = false;
      registry.get('mirror')!.label = 'Dirty mirror';
    },
    update(dt, time) {
      reveal += (target - reveal) * (1 - Math.exp(-dt * 1.4));
      paneMat.uniforms.uReveal.value = reveal;
      let l = lightTarget;
      if (stutter > 0) {
        stutter -= dt;
        l = Math.random() < 0.35 ? 1 : 0.05;
      }
      lightLevel += (l - lightLevel) * (1 - Math.exp(-dt * (stutter > 0 ? 60 : 6)));
      const hum = 0.97 + Math.sin(time * 100) * 0.015;
      hiddenLight.intensity = HIDDEN_LIGHT * lightLevel * hum;
      tubeMat.emissiveIntensity = 2.5 * lightLevel;
      symMat.emissiveIntensity = 0.25 + lightLevel * (1.1 + Math.sin(time * 2.1) * 0.25);
    },
  };
}
