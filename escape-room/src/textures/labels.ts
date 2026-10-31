// Small canvases with drawn graphics: circuit tiles, keypad keys, the symbol.

import { makeCanvas } from './canvas';
import { fbm, rng, vnoise } from './noise';

/** Which tile edges a circuit tile connects: north, east, south, west. */
export type TileKind = 'empty' | 'straight' | 'corner' | 'tee' | 'cross' | 'switch' | 'source' | 'lamp';

export const TILE_EDGES: Record<TileKind, [boolean, boolean, boolean, boolean]> = {
  empty: [false, false, false, false],
  straight: [false, true, false, true],
  corner: [false, true, true, false],
  tee: [false, true, true, true],
  cross: [true, true, true, true],
  switch: [false, true, false, true],
  source: [false, true, false, false],
  lamp: [false, false, false, true],
};

export function circuitTileCanvas(kind: TileKind, seed: number, size = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i += 4) {
      const n = fbm(x * 0.02, y * 0.02, 4, seed) * 0.6 + vnoise(x * 0.4, y * 0.4, seed + 1) * 0.4;
      const v = 28 + n * 22;
      img.data[i] = v * 0.9;
      img.data[i + 1] = v;
      img.data[i + 2] = v * 0.95;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Bevelled tile edge.
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  ctx.strokeStyle = 'rgba(160,160,150,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  const m = size / 2;
  const edges = TILE_EDGES[kind];
  const copper = (w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'butt';
    const ends: [number, number][] = [
      [m, 0],
      [size, m],
      [m, size],
      [0, m],
    ];
    edges.forEach((on, k) => {
      if (!on) return;
      if (kind === 'switch') {
        // Gap in the middle for the knife switch.
        const [ex, ey] = ends[k];
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(m + (ex - m) * 0.32, m + (ey - m) * 0.32);
        ctx.stroke();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(m, m);
      ctx.lineTo(ends[k][0], ends[k][1]);
      ctx.stroke();
    });
  };
  copper(26, '#3b2414');
  copper(18, '#9a6236');
  copper(6, 'rgba(240,180,120,0.35)');

  const pad = (x: number, y: number, r: number) => {
    ctx.fillStyle = '#5a3a20';
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8b0a0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (kind === 'tee' || kind === 'cross' || kind === 'corner') pad(m, m, 14);
  if (kind === 'switch') {
    pad(m - 42, m, 10);
    pad(m + 42, m, 10);
    ctx.strokeStyle = '#c9c2b0';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m - 42, m);
    ctx.lineTo(m + 30, m - 50);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(m + 30, m - 50, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === 'source') {
    ctx.fillStyle = '#9a6236';
    ctx.fillRect(m - 40, m - 34, 18, 68);
    ctx.fillRect(m - 4, m - 20, 12, 40);
    ctx.fillRect(m + 26, m - 34, 18, 68);
    ctx.fillStyle = '#c8b89a';
    ctx.font = 'bold 34px monospace';
    ctx.fillText('+', m + 52, m - 34);
  }
  if (kind === 'lamp') {
    ctx.strokeStyle = '#9a6236';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(m, m, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m - 25, m - 25);
    ctx.lineTo(m + 25, m + 25);
    ctx.moveTo(m + 25, m - 25);
    ctx.lineTo(m - 25, m + 25);
    ctx.stroke();
  }
  // Dirt over everything.
  const rand = rng(seed);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = `rgba(20,16,12,${0.1 + rand() * 0.3})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 4, 1 + rand() * 4);
  }
  return c;
}

export function keyCapCanvas(label: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#5b5a55');
  g.addColorStop(1, '#3a3935');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  ctx.fillStyle = '#d8d2c2';
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 32, 35);
  return c;
}

/** The placeholder clue in the hidden room: an eye in a broken circle. */
export function symbolCanvas(size = 512): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  const m = size / 2;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(m, m, size * 0.4, 0.3, Math.PI * 2 - 0.3);
  ctx.stroke();
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(m - size * 0.28, m);
  ctx.quadraticCurveTo(m, m - size * 0.24, m + size * 0.28, m);
  ctx.quadraticCurveTo(m, m + size * 0.24, m - size * 0.28, m);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(m, m, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) {
    ctx.beginPath();
    ctx.moveTo(m + Math.sin(a) * size * 0.2, m - Math.cos(a) * size * 0.16);
    ctx.lineTo(m + Math.sin(a) * size * 0.3, m - Math.cos(a) * size * 0.27);
    ctx.stroke();
  }
  return c;
}
