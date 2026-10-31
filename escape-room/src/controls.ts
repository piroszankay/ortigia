// First-person controls: pointer-lock mouse look, WASD walking, and circle-vs-box
// collision so the player stays inside the cellar and out of the furniture.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HALF_D, HALF_W, PLAYER } from './config';

/** Axis-aligned obstacle on the floor plane: centre and half extents. */
export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export class FirstPersonControls {
  readonly look: PointerLockControls;
  private keys = new Set<string>();
  private vel = new THREE.Vector2();
  private bobT = 0;
  private colliders: Collider[] = [];

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.look = new PointerLockControls(camera, dom);
    this.look.pointerSpeed = 0.8;
    camera.position.set(PLAYER.start.x, PLAYER.eye, PLAYER.start.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(PLAYER.start.pitch, PLAYER.start.yaw, 0);
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  setColliders(c: Collider[]): void {
    this.colliders = c;
  }

  get locked(): boolean {
    return this.look.isLocked;
  }

  update(dt: number): void {
    const k = this.keys;
    let fx = 0;
    let fz = 0;
    if (this.locked) {
      if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    // Ease velocity toward the wished-for direction (local: x = strafe, y = forward).
    const a = 1 - Math.exp(-PLAYER.accel * dt);
    this.vel.x += (fx * PLAYER.speed - this.vel.x) * a;
    this.vel.y += (fz * PLAYER.speed - this.vel.y) * a;

    // Move in the horizontal plane relative to where we look.
    const yaw = this.camera.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dx = (this.vel.x * cos - this.vel.y * sin) * dt;
    const dz = (-this.vel.x * sin - this.vel.y * cos) * dt;
    const p = this.camera.position;
    const next = this.resolve(p.x + dx, p.z + dz);
    p.x = next.x;
    p.z = next.z;

    const speed = this.vel.length();
    this.bobT += dt * PLAYER.bobFreq * (speed / PLAYER.speed);
    p.y = PLAYER.eye + Math.sin(this.bobT) * PLAYER.bobAmp * Math.min(1, speed / PLAYER.speed);
  }

  /** Push a circle of PLAYER.radius out of the walls and every collider. */
  private resolve(x: number, z: number): { x: number; z: number } {
    const r = PLAYER.radius;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
        const cx = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw));
        const cz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
        const ddx = x - cx;
        const ddz = z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + (ddx / d) * r;
            z = cz + (ddz / d) * r;
          } else {
            // Centre inside the box: push out along the shallowest axis.
            const px = c.hw - Math.abs(x - c.x) + r;
            const pz = c.hd - Math.abs(z - c.z) + r;
            if (px < pz) x += Math.sign(x - c.x || 1) * px;
            else z += Math.sign(z - c.z || 1) * pz;
          }
        }
      }
      x = Math.max(-HALF_W + r, Math.min(HALF_W - r, x));
      z = Math.max(-HALF_D + r, Math.min(HALF_D - r, z));
    }
    return { x, z };
  }
}
