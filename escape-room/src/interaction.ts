// Looks down the crosshair, highlights the interactable in reach, and
// forwards clicks to the registry.

import * as THREE from 'three';
import { INTERACT_RANGE } from './config';
import { registry, type Interactable } from './interactables';

/** Objects on this layer are rendered but never block or receive the crosshair ray. */
export const NO_RAYCAST_LAYER = 1;

export class Interaction {
  private ray = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private current: Interactable | undefined;
  private label = document.getElementById('label')!;
  private crosshair = document.getElementById('crosshair')!;

  constructor(
    private camera: THREE.Camera,
    private scene: THREE.Scene,
  ) {
    this.ray.far = INTERACT_RANGE + 0.5;
    this.ray.layers.set(0);
  }

  update(): void {
    this.ray.setFromCamera(this.center, this.camera);
    const hits = this.ray.intersectObjects(this.scene.children, true);
    let found: Interactable | undefined;
    for (const h of hits) {
      if (!h.object.visible || !isVisible(h.object)) continue;
      const item = registry.fromObject(h.object);
      if (item && item.enabled && h.distance <= (item.range ?? INTERACT_RANGE)) found = item;
      break; // first solid thing blocks everything behind it
    }
    if (found !== this.current) {
      if (this.current) registry.setHighlighted(this.current, false);
      if (found) registry.setHighlighted(found, true);
      this.current = found;
      this.label.textContent = found?.label ?? '';
      this.label.classList.toggle('show', !!found);
      this.crosshair.classList.toggle('active', !!found);
    }
  }

  click(): void {
    if (this.current) registry.interact(this.current.id);
  }
}

function isVisible(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
