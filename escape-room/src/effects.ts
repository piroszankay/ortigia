// Atmosphere: fog, drifting dust lit by the bulb, light shafts through the
// window planks, and the post-processing chain (bloom, film grain, vignette).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BULB, DAYLIGHT, FOG, HALF_D, HALF_W, POST, ROOM, WINDOW } from './config';
import { NO_RAYCAST_LAYER } from './interaction';
import { softDot } from './textures/surfaces';

export function addFog(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(FOG.color, FOG.density);
  scene.background = new THREE.Color(0x000000);
}

// ---------- Dust ----------

export interface Dust {
  update(time: number, bulbPos: THREE.Vector3, bulbLevel: number, crtPos: THREE.Vector3, crtLevel: number): void;
}

export function addDust(scene: THREE.Scene, sunDir: THREE.Vector3, count = 1400): Dust {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * (HALF_W - 0.1);
    pos[i * 3 + 1] = 0.1 + Math.random() * (ROOM.h - 0.2);
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * (HALF_D - 0.1);
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const tex = new THREE.CanvasTexture(softDot());
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uTex: { value: tex },
      uBulb: { value: new THREE.Vector3() },
      uBulbLevel: { value: 1 },
      uBulbColor: { value: new THREE.Color(BULB.color) },
      uCrt: { value: new THREE.Vector3() },
      uCrtLevel: { value: 0.5 },
      uSunOrigin: { value: new THREE.Vector3(-HALF_W, WINDOW.bottom + WINDOW.h / 2, WINDOW.z) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(DAYLIGHT.color) },
      uPixel: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uBulb;
      uniform float uBulbLevel;
      uniform vec3 uBulbColor;
      uniform vec3 uCrt;
      uniform float uCrtLevel;
      uniform vec3 uSunOrigin;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uPixel;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        float t = uTime * (0.6 + aSeed * 0.6);
        // Slow Brownian-ish drift plus a gentle settle that wraps around.
        p.x += sin(t * 0.21 + aSeed * 40.0) * 0.18 + sin(t * 0.53 + aSeed * 13.0) * 0.05;
        p.z += cos(t * 0.17 + aSeed * 23.0) * 0.18 + sin(t * 0.61 + aSeed * 7.0) * 0.05;
        p.y = mod(p.y - uTime * 0.012 * (0.3 + aSeed) + sin(t * 0.3 + aSeed * 9.0) * 0.08, ${ROOM.h.toFixed(2)});

        float db = distance(p, uBulb);
        vec3 col = uBulbColor * uBulbLevel * 0.9 / (0.15 + db * db * 1.8);
        float dc = distance(p, uCrt);
        col += vec3(0.62, 0.72, 0.85) * uCrtLevel * 0.12 / (0.08 + dc * dc * 2.5);
        // Inside the window light shafts?
        vec3 rel = p - uSunOrigin;
        float along = dot(rel, uSunDir);
        vec3 perp = rel - uSunDir * along;
        float inShaft = step(0.0, along) * (1.0 - smoothstep(0.25, 0.55, length(perp.xy))) * (1.0 - smoothstep(0.4, 0.62, abs(perp.z)));
        col += uSunColor * inShaft * 0.55 * exp(-along * 0.4);
        vColor = col;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (0.004 + aSeed * 0.006) * uPixel;
        gl_PointSize = clamp(size * 900.0 / -mv.z, 1.0, 14.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying vec3 vColor;
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a;
        gl_FragColor = vec4(vColor * a * 0.55, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'dust';
  points.frustumCulled = false;
  points.layers.set(NO_RAYCAST_LAYER);
  scene.add(points);
  mat.uniforms.uPixel.value = Math.min(devicePixelRatio, 1.5);
  return {
    update(time, bulbPos, bulbLevel, crtPos, crtLevel) {
      const u = mat.uniforms;
      u.uTime.value = time;
      u.uBulb.value.copy(bulbPos);
      u.uBulbLevel.value = bulbLevel;
      u.uCrt.value.copy(crtPos);
      u.uCrtLevel.value = crtLevel;
    },
  };
}

// ---------- Light shafts through the window gaps ----------

export function addLightShafts(scene: THREE.Scene, gaps: { y: number; h: number }[], dir: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.name = 'light_shafts';
  const d = dir.clone().normalize();
  const length = 4.3;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(DAYLIGHT.color) }, uTime: { value: 0 }, uStrength: { value: 0.032 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        // vUv.x along the shaft (0 at the window), vUv.y across the gap.
        float across = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);
        float fade = pow(1.0 - vUv.x, 1.6) * smoothstep(0.0, 0.03, vUv.x);
        float shimmer = 0.85 + 0.15 * sin(vUv.x * 30.0 - uTime * 0.7 + vUv.y * 6.0);
        gl_FragColor = vec4(uColor * across * fade * shimmer * uStrength, 1.0);
      }`,
  });
  for (const gap of gaps) {
    // A sheet spanning the gap's width (along z), extruded along the light direction,
    // thickened a little so it reads from most angles.
    for (const spread of [0, 1]) {
      const geo = new THREE.BufferGeometry();
      const halfW = WINDOW.w / 2 - 0.02;
      const thick = gap.h * (spread ? 2.2 : 0.8) + 0.002;
      const o = new THREE.Vector3(-HALF_W + 0.03, gap.y, WINDOW.z);
      const end = o.clone().addScaledVector(d, length);
      // Two crossed quads: one sheet in the plane of the gap, one rotated.
      const up = new THREE.Vector3(0, 1, 0);
      const verts: number[] = [];
      // Corners: a = origin-left, b = end-left, c = end-right, e = origin-right.
      const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3) => {
        verts.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...e.toArray());
      };
      // Sheet across the slit width.
      const zA = new THREE.Vector3(0, 0, -halfW);
      const zB = new THREE.Vector3(0, 0, halfW);
      quad(o.clone().add(zA), end.clone().add(zA).addScaledVector(up, -0.05), end.clone().add(zB).addScaledVector(up, -0.05), o.clone().add(zB));
      // Thin vertical sheet giving the slit some thickness when seen edge-on.
      for (const z of [-halfW * 0.5, 0, halfW * 0.5]) {
        const zz = new THREE.Vector3(0, 0, z);
        const t1 = up.clone().multiplyScalar(-thick / 2);
        const t2 = up.clone().multiplyScalar(thick / 2);
        quad(o.clone().add(zz).add(t1), end.clone().add(zz).add(t1.clone().multiplyScalar(4)), end.clone().add(zz).add(t2.clone().multiplyScalar(4)), o.clone().add(zz).add(t2));
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(shaftUvs(verts.length / 3), 2));
      const mesh = new THREE.Mesh(geo, spread ? mat.clone() : mat);
      if (spread) (mesh.material as THREE.ShaderMaterial).uniforms.uStrength.value = 0.012;
      mesh.layers.set(NO_RAYCAST_LAYER);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      g.add(mesh);
    }
  }
  scene.add(g);
  return g;
}

/** UVs for the quads above: x along the shaft (0 at the window), y across it. */
function shaftUvs(vertexCount: number): number[] {
  const corner = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 1],
  ];
  const out: number[] = [];
  for (let i = 0; i < vertexCount; i++) out.push(...corner[i % 6]);
  return out;
}

// ---------- Post-processing ----------

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: POST.grain },
    uVignette: { value: POST.vignette },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;
    float hash(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // Vignette (aspect-aware, slightly oval).
      vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(1.05, 0.25, length(c) * uVignette);
      col *= mix(0.25, 1.0, v);
      // Film grain: stronger in the shadows, like real film.
      float n = hash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * uGrain * (1.0 - lum * 0.7);
      // Slightly crushed, cold-shifted blacks.
      col = max(col, vec3(0.0)) + vec3(0.004, 0.005, 0.007);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export interface Post {
  composer: EffectComposer;
  setSize(w: number, h: number): void;
  render(time: number): void;
}

export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass(GrainVignetteShader);
  composer.addPass(grain);
  return {
    composer,
    setSize(w, h) {
      composer.setSize(w, h);
      grain.uniforms.uAspect.value = w / h;
    },
    render(time) {
      grain.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
