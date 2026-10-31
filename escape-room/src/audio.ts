// Generated sound (Web Audio, no files): the CRT's mains hum and static
// (positional, from the set), the bulb's faint buzz, and low room tone.

import * as THREE from 'three';

export interface CellarAudio {
  /** 0..1 static loudness (the CRT drives this). */
  setStatic(level: number): void;
  /** Bulb flicker level, 0..1. */
  setBulb(level: number): void;
  /** A burst of interference (switching channels). */
  burst(): void;
}

function noiseBuffer(ctx: AudioContext, seconds: number, brown = false): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export function startAudio(camera: THREE.Camera, crt: THREE.Object3D, bulb: THREE.Object3D): CellarAudio {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  const ctx = listener.context;
  void ctx.resume();

  // --- CRT: 50 Hz mains hum + harmonics + static, positioned at the set ---
  const crtSound = new THREE.PositionalAudio(listener);
  crtSound.setRefDistance(0.6);
  crtSound.setRolloffFactor(1.4);
  const crtMix = ctx.createGain();
  crtMix.gain.value = 1;

  const humGain = ctx.createGain();
  humGain.gain.value = 0.05;
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 420;
  for (const [f, g] of [
    [50, 0.6],
    [100, 0.45],
    [150, 0.2],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = f === 50 ? 'sawtooth' : 'sine';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og).connect(humFilter);
    o.start();
  }
  humFilter.connect(humGain).connect(crtMix);

  // The 15.7 kHz line-whine, very faint.
  const whine = ctx.createOscillator();
  whine.frequency.value = 15734;
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.0025;
  whine.connect(whineGain).connect(crtMix);
  whine.start();

  const staticSrc = ctx.createBufferSource();
  staticSrc.buffer = noiseBuffer(ctx, 3);
  staticSrc.loop = true;
  const staticBand = ctx.createBiquadFilter();
  staticBand.type = 'bandpass';
  staticBand.frequency.value = 2600;
  staticBand.Q.value = 0.5;
  const staticGain = ctx.createGain();
  staticGain.gain.value = 0.02;
  staticSrc.connect(staticBand).connect(staticGain).connect(crtMix);
  staticSrc.start();

  crtSound.setNodeSource(crtMix as unknown as AudioBufferSourceNode);
  crt.add(crtSound);

  // --- Bulb buzz: a 100 Hz filament buzz that crackles when it flickers ---
  const bulbSound = new THREE.PositionalAudio(listener);
  bulbSound.setRefDistance(0.4);
  const buzz = ctx.createOscillator();
  buzz.type = 'square';
  buzz.frequency.value = 100;
  const buzzFilter = ctx.createBiquadFilter();
  buzzFilter.type = 'bandpass';
  buzzFilter.frequency.value = 900;
  buzzFilter.Q.value = 2;
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.004;
  buzz.connect(buzzFilter).connect(buzzGain);
  buzz.start();
  bulbSound.setNodeSource(buzzGain as unknown as AudioBufferSourceNode);
  bulb.add(bulbSound);

  // --- Room tone: low brown noise everywhere ---
  const tone = ctx.createBufferSource();
  tone.buffer = noiseBuffer(ctx, 4, true);
  tone.loop = true;
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 180;
  const toneGain = ctx.createGain();
  toneGain.gain.value = 0.05;
  tone.connect(toneFilter).connect(toneGain).connect(listener.getInput());
  tone.start();

  let lastBulb = 1;
  return {
    setStatic(level) {
      staticGain.gain.setTargetAtTime(0.004 + level * 0.035, ctx.currentTime, 0.05);
    },
    setBulb(level) {
      // Buzz gets louder and rougher when the filament stutters.
      const jump = Math.abs(level - lastBulb);
      lastBulb = level;
      buzzGain.gain.setTargetAtTime(0.003 + Math.min(0.03, jump * 0.25), ctx.currentTime, 0.01);
    },
    burst() {
      const t = ctx.currentTime;
      staticGain.gain.cancelScheduledValues(t);
      staticGain.gain.setValueAtTime(0.12, t);
      staticGain.gain.exponentialRampToValueAtTime(0.02, t + 0.45);
      humGain.gain.setValueAtTime(0.09, t);
      humGain.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    },
  };
}
