// The single registry of everything the player can interact with.
// Puzzles attach behaviour by id: `registry.setHandler('lock_1', fn)`.

import * as THREE from 'three';

export type InteractHandler<S> = (item: Interactable<S>) => void;

export interface Interactable<S = Record<string, unknown>> {
  /** Stable id, e.g. "lock_1", "keypad_7", "rug". Puzzles key off this. */
  readonly id: string;
  /** Human-readable name shown under the crosshair. */
  label: string;
  /** Root object; every mesh below it counts as part of this interactable. */
  readonly object: THREE.Object3D;
  /** Free-form puzzle state (e.g. { locked: true }). */
  state: S;
  /** Disabled items are not highlighted and ignore clicks. */
  enabled: boolean;
  /** Optional per-item reach override, metres. */
  range?: number;
  /** Optional group tag ("door", "keypad", "circuit"...) for puzzles that span several objects. */
  group?: string;
  handler?: InteractHandler<S>;
}

export interface RegisterOptions<S> {
  id: string;
  label: string;
  object: THREE.Object3D;
  state?: S;
  group?: string;
  range?: number;
  handler?: InteractHandler<S>;
  /** Keep the object's materials shared (needed for e.g. the Reflector, whose uniforms are wired up internally). */
  keepMaterials?: boolean;
}

type Listener = (item: Interactable) => void;

const HIGHLIGHT = new THREE.Color(0.02, 0.015, 0.01);

class Registry {
  private items = new Map<string, Interactable<any>>();
  private listeners: Listener[] = [];

  register<S extends object = Record<string, unknown>>(o: RegisterOptions<S>): Interactable<S> {
    if (this.items.has(o.id)) throw new Error(`Duplicate interactable id: ${o.id}`);
    const item: Interactable<S> = {
      id: o.id,
      label: o.label,
      object: o.object,
      state: (o.state ?? {}) as S,
      enabled: true,
      range: o.range,
      group: o.group,
      handler: o.handler,
    };
    o.object.name = o.id;
    o.object.traverse((child) => {
      child.userData.interactableId = o.id;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !o.keepMaterials) {
        // Own the materials so highlighting one object never lights up another.
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      }
    });
    this.items.set(o.id, item);
    return item;
  }

  get<S = Record<string, unknown>>(id: string): Interactable<S> | undefined {
    return this.items.get(id) as Interactable<S> | undefined;
  }

  all(): Interactable[] {
    return [...this.items.values()];
  }

  byGroup(group: string): Interactable[] {
    return this.all().filter((i) => i.group === group);
  }

  /** Attach (or replace) the behaviour for an object. */
  setHandler<S = Record<string, unknown>>(id: string, handler: InteractHandler<S>): void {
    const item = this.items.get(id);
    if (!item) throw new Error(`No interactable with id ${id}`);
    item.handler = handler;
  }

  /** Listen to every interaction (analytics, sound, a puzzle manager...). */
  onInteract(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Walk up from a hit object to the interactable that owns it. */
  fromObject(obj: THREE.Object3D | null): Interactable | undefined {
    while (obj) {
      const id = obj.userData.interactableId as string | undefined;
      if (id) return this.items.get(id);
      obj = obj.parent;
    }
    return undefined;
  }

  interact(id: string): void {
    const item = this.items.get(id);
    if (!item || !item.enabled) return;
    console.log(`interacted: ${item.id}`);
    item.handler?.(item);
    for (const l of this.listeners) l(item);
  }

  setHighlighted(item: Interactable, on: boolean): void {
    item.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        if (std.userData.baseEmissive === undefined) std.userData.baseEmissive = std.emissive.clone();
        const base = std.userData.baseEmissive as THREE.Color;
        std.emissive.copy(base);
        if (on) std.emissive.add(HIGHLIGHT);
      }
    });
  }
}

export const registry = new Registry();
