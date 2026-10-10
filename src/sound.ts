import { SOUND } from './config';
import type { Sfx } from './game/game';

/**
 * Tiny synthesized sound effects (Web Audio, no files). The audio context is
 * created on the first user gesture, as browsers require.
 */
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted = !SOUND.enabledByDefault;
try { muted = localStorage.getItem('ortigia-muted') === '1' ? true : muted; } catch { /* storage unavailable */ }

export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  try {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = muted ? 0 : SOUND.volume;
    master.connect(ac.destination);
  } catch { ac = null; }
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : SOUND.volume;
  try { localStorage.setItem('ortigia-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

type Wave = OscillatorType;
/** One note: frequency (Hz, optional glide target), start offset, length, wave, loudness. */
function tone(f: number, at: number, len: number, wave: Wave = 'sine', vol = 0.3, glideTo?: number) {
  if (!ac || !master || muted) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + len + 0.02);
}

function noise(at: number, len: number, vol = 0.2, freq = 800) {
  if (!ac || !master || muted) return;
  const t = ac.currentTime + at;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(filt).connect(g).connect(master);
  src.start(t);
}

/** A cat's meow: a nasal sawtooth gliding up then down through a vowel-like filter. */
function meow(at: number) {
  if (!ac || !master || muted) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(480, t);
  o.frequency.exponentialRampToValueAtTime(820, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(560, t + 0.45);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(900, t);              // "mm"
  f.frequency.linearRampToValueAtTime(1800, t + 0.15); // "ee-ow"
  f.frequency.linearRampToValueAtTime(1100, t + 0.45);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
  g.gain.setValueAtTime(0.5, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.55);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, A4 = 440, C6 = 1046.5;

export function play(s: Sfx | 'dice' | 'start' | 'win' | 'death') {
  switch (s) {
    case 'meow': meow(0); break;
    case 'clink': tone(1568, 0, 0.05, 'triangle', 0.08); break;
    case 'eat': tone(330, 0, 0.08, 'triangle', 0.25); tone(440, 0.07, 0.1, 'triangle', 0.25); break;
    case 'drink': tone(600, 0, 0.18, 'sine', 0.25, 1200); break;
    case 'coin': tone(988, 0, 0.07, 'square', 0.12); tone(1319, 0.07, 0.18, 'square', 0.12); break;
    case 'spend': tone(700, 0, 0.08, 'triangle', 0.18); tone(500, 0.07, 0.12, 'triangle', 0.15); break;
    case 'hit': noise(0, 0.18, 0.5, 500); tone(140, 0, 0.2, 'sawtooth', 0.25, 60); break;
    case 'bad': tone(300, 0, 0.22, 'sawtooth', 0.12, 180); break;
    case 'fish': noise(0, 0.25, 0.25, 1500); tone(C5, 0.15, 0.1, 'triangle'); tone(G5, 0.25, 0.2, 'triangle'); break;
    case 'cast': noise(0, 0.3, 0.12, 2500); break;
    case 'market': tone(A4 * 2, 0, 0.1, 'sine', 0.2); tone(A4 * 2.5, 0.12, 0.15, 'sine', 0.2); break;
    case 'party': [C5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.09, 0.12, 'square', 0.08)); break;
    case 'police': for (let i = 0; i < 3; i++) { tone(700, i * 0.3, 0.15, 'square', 0.1); tone(950, i * 0.3 + 0.15, 0.15, 'square', 0.1); } break;
    case 'sleep': tone(392, 0, 0.3, 'sine', 0.15); tone(330, 0.25, 0.5, 'sine', 0.12); break;
    case 'cure': [E5, G5, C6].forEach((f, i) => tone(f, i * 0.08, 0.15, 'sine', 0.18)); break;
    case 'squelch': noise(0, 0.2, 0.4, 300); tone(120, 0, 0.15, 'sine', 0.2, 70); break;
    case 'friend': [G5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.1, 0.14, 'triangle', 0.18)); break;
    case 'dice': for (let i = 0; i < 6; i++) noise(i * 0.06 + Math.random() * 0.03, 0.04, 0.35, 3000); break;
    case 'start': tone(C5, 0, 0.12, 'triangle'); tone(G5, 0.1, 0.2, 'triangle'); break;
    case 'win': [C5, E5, G5, C6, G5, C6].forEach((f, i) => tone(f, i * 0.12, 0.18, 'triangle', 0.22)); break;
    case 'death': [G5, E5, C5, A4 / 2].forEach((f, i) => tone(f, i * 0.22, 0.3, 'sine', 0.2)); break;
  }
}
