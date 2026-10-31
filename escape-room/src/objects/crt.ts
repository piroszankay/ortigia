// "The Lord": an old black-and-white CRT on a crate, plugged into the wall.
// Normally static; lordCheckIn(message) shows a barely visible seated
// silhouette with flickering text, then drops back to static.

import * as THREE from 'three';
import { CRT, HALF_D } from '../config';
import { registry } from '../interactables';
import { box, materials, shadowed } from '../materials';
import { SOCKET_POS } from '../room';
import { makeCanvas } from '../textures/canvas';

export const CRATE_SIZE = { w: 0.62, h: 0.5, d: 0.5 } as const;

const SCREEN_W = 0.33;
const SCREEN_H = 0.25;

const ScreenShader = {
  uniforms: {
    uTime: { value: 0 },
    uLord: { value: 0 }, // 0 = static, 1 = the Lord
    uGlitch: { value: 0 }, // brief bursts during switching
    tLord: { value: null as THREE.Texture | null },
    uPower: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uLord;
    uniform float uGlitch;
    uniform float uPower;
    uniform sampler2D tLord;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      // Barrel distortion of the tube.
      vec2 c = vUv - 0.5;
      vec2 uv = 0.5 + c * (1.0 + dot(c, c) * 0.22);
      float frame = floor(uTime * 30.0);

      // Horizontal tearing during glitches.
      float line = floor(uv.y * 240.0);
      uv.x += (hash(vec2(line, mod(frame, 101.0))) - 0.5) * 0.05 * uGlitch;

      // Static: per-pixel noise, smeared horizontally like a real tuner.
      vec2 px = floor(uv * vec2(220.0, 240.0));
      vec2 fo = vec2(mod(frame, 97.0) * 13.7, mod(frame, 89.0) * 7.3);
      float n = hash(px + fo);
      float n2 = hash(vec2(px.x - 1.0, px.y) + fo);
      float stat = mix(n, n2, 0.4);
      stat = pow(stat, 1.35);

      // Rolling bar drifting up the screen.
      float roll = fract(uv.y * 0.9 + uTime * 0.11);
      float bar = smoothstep(0.0, 0.12, roll) * (1.0 - smoothstep(0.12, 0.3, roll));
      float staticImg = stat * (0.62 + bar * 0.45) + bar * 0.08;

      // The Lord: dark silhouette + text from the canvas, flickering.
      float flick = 0.82 + 0.18 * hash(vec2(mod(frame, 113.0), 3.0));
      vec3 lord = texture2D(tLord, uv).rgb * flick + stat * 0.012;
      lord *= 0.92 + 0.08 * sin(uv.y * 600.0 + uTime * 40.0);

      vec3 col = mix(vec3(staticImg), lord, uLord);
      col += stat * uGlitch * 0.5;

      // Scanlines and phosphor tint (cold blue-grey).
      col *= 0.78 + 0.22 * sin(uv.y * 240.0 * 3.14159);
      col *= vec3(0.86, 0.94, 1.0);

      // Rounded tube edge.
      vec2 e = abs(uv - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(0.86, 1.0, max(pow(e.x, 3.0) + pow(e.y, 3.0), 0.0));
      float vig = 1.0 - dot(c, c) * 1.3;
      col *= edge * vig * uPower * 1.25;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export interface CrtParts {
  group: THREE.Group;
  screenPosition: THREE.Vector3;
  /** 0..1 average brightness of the screen this frame, for the light and the sound. */
  brightness: number;
  /** Is the Lord on screen right now? */
  readonly lordActive: boolean;
  lordCheckIn(message: string, seconds?: number): void;
  update(dt: number, time: number): void;
  onModeChange?: (mode: 'static' | 'lord' | 'switch') => void;
}

export function buildCrt(scene: THREE.Scene): CrtParts {
  const m = materials();
  const g = new THREE.Group();
  g.name = 'crt';
  // Sits on the crate, against the south wall, facing into the room (−z).
  g.position.set(CRT.x, CRATE_SIZE.h, CRT.z);
  g.rotation.y = Math.PI + 0.18;

  const caseMat = new THREE.MeshStandardMaterial({ color: 0x2b251e, roughness: 0.55, metalness: 0.05 });
  const body = box(0.46, 0.4, 0.3, caseMat);
  body.position.set(0, 0.2, 0.05);
  g.add(body);
  const rear = box(0.34, 0.3, 0.2, caseMat);
  rear.position.set(0, 0.19, -0.18);
  g.add(rear);
  // Wood-grain side panels, very 70s.
  const sideMat = m.woodDark();
  for (const s of [-1, 1]) {
    const p = box(0.012, 0.4, 0.3, sideMat);
    p.position.set(s * 0.236, 0.2, 0.05);
    g.add(p);
  }
  // Bezel around the tube.
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.7 });
  const bz = 0.025;
  for (const [w, h, x, y] of [
    [SCREEN_W + bz * 2, bz, 0, 0.215 + SCREEN_H / 2 + bz / 2],
    [SCREEN_W + bz * 2, bz, 0, 0.215 - SCREEN_H / 2 - bz / 2],
    [bz, SCREEN_H, -SCREEN_W / 2 - bz / 2 - 0.0, 0.215],
    [bz, SCREEN_H, SCREEN_W / 2 + bz / 2, 0.215],
  ] as const) {
    const b = box(w, h, 0.02, bezelMat);
    b.position.set(x - 0.04, y, 0.205);
    g.add(b);
  }
  // Control strip with two knobs on the right.
  for (const [y, r] of [
    [0.28, 0.016],
    [0.17, 0.013],
  ] as const) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 16), m.plastic(0x1f1d1a));
    k.rotation.x = Math.PI / 2;
    k.position.set(0.185, y, 0.205);
    g.add(k);
  }
  const grille = box(0.06, 0.06, 0.004, m.darkSteel());
  grille.position.set(0.185, 0.07, 0.201);
  g.add(grille);
  // Bent rabbit-ear antenna.
  for (const [a, l] of [
    [0.5, 0.42],
    [-0.9, 0.36],
  ] as const) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, l, 6), m.steel());
    ant.position.set(Math.sin(a) * l * 0.5, 0.4 + Math.cos(a) * l * 0.5 * 0.9, -0.08);
    ant.rotation.z = -a;
    g.add(ant);
  }

  // Curved screen.
  const geo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H, 24, 18);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (SCREEN_W / 2);
    const y = pos.getY(i) / (SCREEN_H / 2);
    pos.setZ(i, 0.018 * (1 - (x * x + y * y) / 2));
  }
  geo.computeVertexNormals();

  const [lc, lctx] = makeCanvas(512, 384);
  const lordTex = new THREE.CanvasTexture(lc);
  lordTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(ScreenShader.uniforms),
    vertexShader: ScreenShader.vertexShader,
    fragmentShader: ScreenShader.fragmentShader,
  });
  screenMat.uniforms.tLord.value = lordTex;
  const screen = new THREE.Mesh(geo, screenMat);
  screen.position.set(-0.04, 0.215, 0.192);
  g.add(screen);
  shadowed(g);
  screen.castShadow = false;
  scene.add(g);

  // Cold glow thrown by the screen.
  const light = new THREE.PointLight(CRT.color, CRT.intensity, 0, 2);
  scene.add(light);
  const screenPosition = new THREE.Vector3();
  g.updateMatrixWorld(true);
  screen.getWorldPosition(screenPosition);
  light.position.copy(screen.localToWorld(new THREE.Vector3(0, 0, 0.12)));

  // Power cable from the back of the set to the wall socket.
  const back = g.localToWorld(new THREE.Vector3(0.05, 0.08, -0.28));
  const curve = new THREE.CatmullRomCurve3([
    back,
    back.clone().add(new THREE.Vector3(0.02, -0.05, 0.05)),
    new THREE.Vector3(back.x + 0.12, 0.25, HALF_D - 0.06),
    new THREE.Vector3(back.x + 0.25, 0.012, HALF_D - 0.12),
    new THREE.Vector3(SOCKET_POS.x - 0.1, 0.012, HALF_D - 0.07),
    new THREE.Vector3(SOCKET_POS.x - 0.02, 0.15, HALF_D - 0.05),
    SOCKET_POS.clone().add(new THREE.Vector3(0, -0.005, -0.045)),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.0045, 6), m.plastic(0x141414));
  cable.castShadow = true;
  scene.add(cable);

  registry.register({ id: 'crt', label: 'Old television', object: g, group: 'lord', state: {}, keepMaterials: true });

  // --- The Lord's appearance on the canvas ---
  const drawLord = (message: string) => {
    const W = 512;
    const H = 384;
    lctx.fillStyle = '#020202';
    lctx.fillRect(0, 0, W, H);
    // Faint backlight behind the figure.
    const bg = lctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, W * 0.55);
    bg.addColorStop(0, '#3a3a3a');
    bg.addColorStop(1, '#060606');
    lctx.fillStyle = bg;
    lctx.fillRect(0, 0, W, H);
    // Seated silhouette: high-backed chair, shoulders, head.
    lctx.fillStyle = '#121212';
    lctx.beginPath();
    lctx.moveTo(W / 2 - 110, H);
    lctx.lineTo(W / 2 - 100, H * 0.18);
    lctx.quadraticCurveTo(W / 2, H * 0.06, W / 2 + 100, H * 0.18);
    lctx.lineTo(W / 2 + 110, H);
    lctx.fill();
    lctx.fillStyle = '#000';
    lctx.beginPath();
    lctx.moveTo(W / 2 - 150, H);
    lctx.quadraticCurveTo(W / 2 - 140, H * 0.58, W / 2 - 60, H * 0.52);
    lctx.lineTo(W / 2 + 60, H * 0.52);
    lctx.quadraticCurveTo(W / 2 + 140, H * 0.58, W / 2 + 150, H);
    lctx.fill();
    lctx.beginPath();
    lctx.ellipse(W / 2, H * 0.36, 40, 52, 0, 0, Math.PI * 2);
    lctx.fill();
    lctx.fillRect(W / 2 - 18, H * 0.42, 36, 50);
    // Barely-there rim light on head and shoulders.
    lctx.strokeStyle = 'rgba(150,150,150,0.3)';
    lctx.lineWidth = 2;
    lctx.beginPath();
    lctx.ellipse(W / 2, H * 0.36, 40, 52, 0, Math.PI * 1.05, Math.PI * 1.95);
    lctx.stroke();
    lctx.beginPath();
    lctx.moveTo(W / 2 - 145, H * 0.75);
    lctx.quadraticCurveTo(W / 2 - 138, H * 0.58, W / 2 - 60, H * 0.52);
    lctx.stroke();
    // Message.
    lctx.fillStyle = '#f2f2f2';
    lctx.shadowColor = '#fff';
    lctx.shadowBlur = 12;
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    let size = 44;
    lctx.font = `bold ${size}px "Courier New", monospace`;
    while (lctx.measureText(message).width > W * 0.86 && size > 18) {
      size -= 2;
      lctx.font = `bold ${size}px "Courier New", monospace`;
    }
    lctx.fillText(message.toUpperCase(), W / 2, H * 0.84);
    lctx.shadowBlur = 0;
    lordTex.needsUpdate = true;
  };

  // --- State machine: static → switch → lord → switch → static ---
  type Phase = 'static' | 'in' | 'lord' | 'out';
  let phase: Phase = 'static';
  let phaseT = 0;
  let hold = 5;
  let lord = 0;
  let glitch = 0;
  const parts: CrtParts = {
    group: g,
    screenPosition,
    brightness: 0.5,
    get lordActive() {
      return phase === 'in' || phase === 'lord';
    },
    lordCheckIn(message: string, seconds = 5) {
      drawLord(message);
      hold = seconds;
      phase = 'in';
      phaseT = 0;
      parts.onModeChange?.('switch');
    },
    update(dt, time) {
      phaseT += dt;
      if (phase === 'in') {
        glitch = 1;
        if (phaseT > 0.45) {
          phase = 'lord';
          phaseT = 0;
          parts.onModeChange?.('lord');
        }
      } else if (phase === 'lord') {
        glitch = Math.random() < 0.02 ? 0.6 : Math.max(0, glitch - dt * 4);
        lord = Math.min(1, lord + dt * 6);
        if (phaseT > hold) {
          phase = 'out';
          phaseT = 0;
          parts.onModeChange?.('switch');
        }
      } else if (phase === 'out') {
        glitch = 1;
        if (phaseT > 0.35) {
          phase = 'static';
          phaseT = 0;
          lord = 0;
          parts.onModeChange?.('static');
        }
      } else {
        glitch = Math.max(0, glitch - dt * 3);
      }
      const u = screenMat.uniforms;
      u.uTime.value = time;
      u.uLord.value = phase === 'in' ? (phaseT > 0.25 ? 1 : 0) : lord;
      u.uGlitch.value = glitch;
      // Approximate screen brightness for the light: static is fairly bright,
      // the Lord is nearly black.
      const flick = 0.85 + Math.random() * 0.3;
      const roll = 0.9 + 0.1 * Math.sin(time * 0.7);
      const target = (u.uLord.value > 0.5 ? 0.12 : 0.55) * flick * roll + glitch * 0.25;
      parts.brightness += (target - parts.brightness) * Math.min(1, dt * 25);
      light.intensity = CRT.intensity * parts.brightness * 2;
    },
  };
  return parts;
}
