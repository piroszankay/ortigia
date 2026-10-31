// Entry point: builds the cellar, wires controls, effects, test keys and the loop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { startAudio, type CellarAudio } from './audio';
import { DAYLIGHT, POST } from './config';
import { FirstPersonControls } from './controls';
import { addDust, addFog, addLightShafts, buildPost } from './effects';
import { registry } from './interactables';
import { Interaction, NO_RAYCAST_LAYER } from './interaction';
import { buildLighting } from './lighting';
import { buildCrt, type CrtParts } from './objects/crt';
import { buildDoor, type DoorParts } from './objects/door';
import { buildMirror, type MirrorParts } from './objects/mirror';
import { buildRugAndCircuit, type RugParts } from './objects/rug';
import { buildWindow } from './objects/window';
import { buildProps } from './props';
import { installPuzzleStubs } from './puzzles';
import { buildRoom } from './room';

export interface Game {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  door: DoorParts;
  mirror: MirrorParts;
  crt: CrtParts;
  rug: RugParts;
  /** Turn on the hidden room's light and fade the mirror to see-through. */
  revealHiddenRoom(): void;
  /** Show the Lord on the CRT with a message, then go back to static. */
  lordCheckIn(message: string, seconds?: number): void;
}

const params = new URLSearchParams(location.search);
const overlay = document.getElementById('overlay')!;
const overlayHint = overlay.querySelector('p')!;
overlayHint.textContent = 'Building the cellar…';

// Let the overlay paint before the (synchronous) texture generation starts.
requestAnimationFrame(() => setTimeout(init, 0));

function init(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = POST.exposure;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 30);
  camera.layers.enable(NO_RAYCAST_LAYER);
  scene.add(camera);

  // A whisper of image-based fill so metal and glass read at all.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.035;

  addFog(scene);
  buildRoom(scene);
  const lighting = buildLighting(scene);
  const win = buildWindow(scene);
  const door = buildDoor(scene);
  const mirror = buildMirror(scene, pixelRatio);
  const crt = buildCrt(scene);
  const rug = buildRugAndCircuit(scene);
  const colliders = buildProps(scene);
  const sunDir = new THREE.Vector3(...DAYLIGHT.target).sub(new THREE.Vector3(...DAYLIGHT.pos)).normalize();
  const dust = addDust(scene, sunDir);
  const shafts = addLightShafts(scene, win.gaps, sunDir);

  const controls = new FirstPersonControls(camera, renderer.domElement);
  controls.setColliders(colliders);
  const interaction = new Interaction(camera, scene);
  const post = buildPost(renderer, scene, camera);
  post.setSize(innerWidth, innerHeight);

  let audio: CellarAudio | undefined;
  crt.onModeChange = (mode) => {
    if (mode === 'switch') audio?.burst();
  };

  const game: Game = {
    scene,
    camera,
    door,
    mirror,
    crt,
    rug,
    revealHiddenRoom: () => mirror.reveal(),
    lordCheckIn: (message, seconds) => crt.lordCheckIn(message, seconds),
  };
  installPuzzleStubs(game);
  // Handy from the dev-tools console: cellar.registry.all(), cellar.lordCheckIn('...').
  Object.assign(window, { cellar: { ...game, registry } });

  // --- Input ---
  overlayHint.textContent = 'Click to enter';
  overlay.addEventListener('click', () => {
    audio ??= startAudio(camera, crt.group, lighting.bulbLight);
    controls.look.lock();
  });
  controls.look.addEventListener('lock', () => overlay.classList.add('hidden'));
  controls.look.addEventListener('unlock', () => overlay.classList.remove('hidden'));
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (controls.locked && e.button === 0) interaction.click();
  });
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyR') {
      // Test binding: toggle so the effect can be compared both ways.
      if (mirror.revealed) mirror.hide();
      else game.revealHiddenRoom();
    } else if (e.code === 'KeyL') {
      game.lordCheckIn('You have one hour.');
    } else if (e.code === 'KeyT') {
      rug.toggle();
    }
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
  });

  // --- Debug / screenshot parameters: ?view=x,y,z,yawDeg,pitchDeg&reveal&lord&rug&noui ---
  const view = params.get('view');
  if (view) {
    const [x, y, z, yaw, pitch] = view.split(',').map(Number);
    camera.position.set(x, y, z);
    camera.rotation.set(THREE.MathUtils.degToRad(pitch || 0), THREE.MathUtils.degToRad(yaw || 0), 0);
  }
  if (params.has('reveal')) mirror.reveal();
  if (params.has('lord')) game.lordCheckIn('You have one hour.', 60);
  if (params.has('rug')) rug.setRolled(true, true);
  if (params.has('noui')) overlay.classList.add('hidden');

  // --- Loop ---
  const timer = new THREE.Timer();
  const shaftMats: THREE.ShaderMaterial[] = [];
  shafts.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms && !shaftMats.includes(mat)) shaftMats.push(mat);
  });

  let frames = 0;
  renderer.setAnimationLoop((now) => {
    if (++frames === 20) document.body.dataset.ready = '1'; // lets automated checks know we're up
    timer.update(now);
    const dt = THREE.MathUtils.clamp(timer.getDelta(), 0, 0.05); // rAF time can precede the timer start
    const time = timer.getElapsed();
    if (!view || controls.locked) controls.update(dt);
    lighting.update(dt, time);
    crt.update(dt, time);
    mirror.update(dt, time);
    rug.update(dt);
    dust.update(time, lighting.bulbPosition, lighting.flicker.value, crt.screenPosition, crt.brightness);
    for (const m of shaftMats) m.uniforms.uTime.value = time;
    audio?.setStatic(crt.lordActive ? 0.15 : crt.brightness);
    audio?.setBulb(lighting.flicker.value);
    interaction.update();
    post.render(time);
  });
}
