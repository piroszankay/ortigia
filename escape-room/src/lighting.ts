// Lights: the flickering bare bulb, cold daylight leaking through the boarded
// window, and a faint ambient fill. The CRT and hidden-room lights live with
// their objects.

import * as THREE from 'three';
import { BULB, DAYLIGHT, ROOM } from './config';
import { materials, shadowed } from './materials';

/**
 * Irregular flicker: mostly a steady, slightly unstable glow, with random
 * bursts of stutter (and the odd near-blackout) every few seconds.
 */
export class Flicker {
  private t = 0;
  private nextBurst = 2 + Math.random() * 4;
  private burstLeft = 0;
  private burstLevel = 1;
  private burstHold = 0;
  value = 1;

  update(dt: number): number {
    this.t += dt;
    // Mains-level wobble: slow drift plus a little jitter.
    let v = 0.94 + Math.sin(this.t * 1.7) * 0.025 + Math.sin(this.t * 7.3) * 0.015 + (Math.random() - 0.5) * 0.03;
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.burstLeft <= 0) {
      this.burstLeft = 0.08 + Math.random() * (Math.random() < 0.25 ? 1.1 : 0.45);
      this.nextBurst = 2.5 + Math.random() * 9;
    }
    if (this.burstLeft > 0) {
      this.burstLeft -= dt;
      this.burstHold -= dt;
      if (this.burstHold <= 0) {
        // Pick a new level for a few frames: dips, near-offs, surges.
        const r = Math.random();
        this.burstLevel = r < 0.35 ? 0.05 + Math.random() * 0.15 : r < 0.8 ? 0.35 + Math.random() * 0.4 : 1.08;
        this.burstHold = 0.02 + Math.random() * 0.09;
      }
      v *= this.burstLevel;
    }
    // Filament has thermal inertia: smooth a little.
    const k = 1 - Math.exp(-dt * 38);
    this.value += (v - this.value) * k;
    return this.value;
  }
}

export interface Lighting {
  bulbLight: THREE.PointLight;
  bulbPosition: THREE.Vector3;
  flicker: Flicker;
  update(dt: number, time: number): void;
}

export function buildLighting(scene: THREE.Scene): Lighting {
  // Very low fill so the deep corners are not pure black.
  const hemi = new THREE.HemisphereLight(0x4a4238, 0x0c0a08, 0.22);
  scene.add(hemi);

  // --- The bulb ---
  const pendant = new THREE.Group();
  pendant.name = 'bulb_pendant';
  pendant.position.set(BULB.x, ROOM.h, BULB.z);
  scene.add(pendant);

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, BULB.cord, 6), materials().black());
  cord.position.y = -BULB.cord / 2;
  pendant.add(cord);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.055, 14), materials().plastic(0x2a2622));
  socket.position.y = -BULB.cord - 0.02;
  pendant.add(socket);
  shadowed(pendant, false, true);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x222018,
    emissive: new THREE.Color(BULB.color),
    emissiveIntensity: 3,
    roughness: 0.2,
    transparent: true,
    opacity: 0.95,
  });
  const bulbGeo = new THREE.SphereGeometry(0.03, 20, 14);
  bulbGeo.scale(1, 1.3, 1);
  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  bulb.position.y = -BULB.cord - 0.07;
  pendant.add(bulb);

  const bulbLight = new THREE.PointLight(BULB.color, BULB.intensity, 0, 2);
  bulbLight.position.y = -BULB.cord - 0.07;
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(1024, 1024);
  bulbLight.shadow.bias = -0.0015;
  bulbLight.shadow.normalBias = 0.02;
  bulbLight.shadow.radius = 4;
  bulbLight.shadow.camera.near = 0.04;
  bulbLight.shadow.camera.far = 9;
  pendant.add(bulbLight);

  // --- Daylight through the boarded window (west wall) ---
  const sun = new THREE.SpotLight(DAYLIGHT.color, DAYLIGHT.intensity, 0, 0.3, 0.25, 2);
  sun.position.set(...DAYLIGHT.pos);
  sun.target.position.set(...DAYLIGHT.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.01;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 8;
  scene.add(sun, sun.target);

  const flicker = new Flicker();
  const bulbPosition = new THREE.Vector3();
  const swingPhase = Math.random() * 10;

  return {
    bulbLight,
    bulbPosition,
    flicker,
    update(dt, time) {
      const f = flicker.update(dt);
      bulbLight.intensity = BULB.intensity * f;
      bulbMat.emissiveIntensity = 0.3 + 3.2 * f;
      // A barely perceptible sway makes the shadows breathe.
      pendant.rotation.z = Math.sin(time * 0.9 + swingPhase) * BULB.swing;
      pendant.rotation.x = Math.sin(time * 0.63 + swingPhase * 2) * BULB.swing * 0.7;
      bulbLight.getWorldPosition(bulbPosition);
    },
  };
}
