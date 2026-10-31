// The old, faded rug: a vector-drawn oriental-ish pattern, then aged per pixel
// (fading, threadbare wear, holes, stains, frayed edges, fringe).

import { makeCanvas } from './canvas';
import { clamp, fbm, lerp, rng, smoothstep, vnoise } from './noise';

export const RUG_W = 3.0; // metres, along x
export const RUG_D = 2.0; // metres, along z
export const RUG_FRINGE = 0.09; // metres at each short end

const PX = 400; // px per metre

export function rugCanvas(seed = 21): HTMLCanvasElement {
  const fr = Math.round(RUG_FRINGE * PX);
  const W = Math.round(RUG_W * PX) + fr * 2;
  const H = Math.round(RUG_D * PX);
  const [c, ctx] = makeCanvas(W, H);
  const rand = rng(seed);
  const x0 = fr;
  const x1 = W - fr;
  const rw = x1 - x0;

  const RED = '#7d2b22';
  const NAVY = '#1d2738';
  const CREAM = '#cdb98f';
  const OCHRE = '#b0843a';
  const TEAL = '#2f5650';

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = NAVY;
  ctx.fillRect(x0, 0, rw, H);

  // Border bands.
  const band = (inset: number, width: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x0 + inset, inset, rw - inset * 2, H - inset * 2);
    if (width > 0) {
      ctx.fillStyle = NAVY;
      ctx.fillRect(x0 + inset + width, inset + width, rw - (inset + width) * 2, H - (inset + width) * 2);
    }
  };
  band(14, 6, CREAM);
  // Main border with a rosette repeat.
  ctx.fillStyle = NAVY;
  ctx.fillRect(x0 + 20, 20, rw - 40, H - 40);
  const motif = (x: number, y: number, r: number) => {
    ctx.fillStyle = OCHRE;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let x = x0 + 70; x < x1 - 50; x += 72) {
    motif(x, 58, 26);
    motif(x, H - 58, 26);
  }
  for (let y = 130; y < H - 100; y += 72) {
    motif(x0 + 58, y, 26);
    motif(x1 - 58, y, 26);
  }
  ctx.fillStyle = CREAM;
  ctx.fillRect(x0 + 96, 96, rw - 192, H - 192);
  // Field.
  ctx.fillStyle = RED;
  ctx.fillRect(x0 + 104, 104, rw - 208, H - 208);
  // Lattice of small motifs in the field.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 104, 104, rw - 208, H - 208);
  ctx.clip();
  for (let y = 140; y < H - 110; y += 64) {
    for (let x = x0 + 140 + ((y / 64) % 2) * 32; x < x1 - 110; x += 64) {
      ctx.fillStyle = rand() < 0.5 ? TEAL : NAVY;
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 12);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = OCHRE;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  // Corner spandrels.
  for (const [sx, sy] of [
    [x0 + 104, 104],
    [x1 - 104, 104],
    [x0 + 104, H - 104],
    [x1 - 104, H - 104],
  ]) {
    for (const [r, col] of [
      [210, NAVY],
      [180, CREAM],
      [170, TEAL],
      [120, NAVY],
    ] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * 1.25, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // Central medallion: concentric lozenges with pendants.
  const cx = W / 2;
  const cy = H / 2;
  const lozenge = (rx: number, ry: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.quadraticCurveTo(cx - rx * 0.35, cy - ry * 0.35, cx, cy - ry);
    ctx.quadraticCurveTo(cx + rx * 0.35, cy - ry * 0.35, cx + rx, cy);
    ctx.quadraticCurveTo(cx + rx * 0.35, cy + ry * 0.35, cx, cy + ry);
    ctx.quadraticCurveTo(cx - rx * 0.35, cy + ry * 0.35, cx - rx, cy);
    ctx.fill();
  };
  for (const side of [-1, 1]) {
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.ellipse(cx + side * 360, cy, 48, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = OCHRE;
    ctx.beginPath();
    ctx.ellipse(cx + side * 360, cy, 22, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  lozenge(330, 250, CREAM);
  lozenge(310, 232, NAVY);
  lozenge(250, 186, TEAL);
  lozenge(200, 150, RED);
  lozenge(130, 98, OCHRE);
  lozenge(90, 66, NAVY);
  lozenge(40, 30, CREAM);
  // Hooked "petals" around the medallion.
  ctx.strokeStyle = OCHRE;
  ctx.lineWidth = 6;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 160, cy + Math.sin(a) * 120, 14, a, a + Math.PI * 1.2);
    ctx.stroke();
  }

  // Fringe threads.
  ctx.lineCap = 'round';
  for (const side of [0, 1]) {
    for (let y = 8; y < H - 8; y += 5) {
      if (rand() < 0.12) continue;
      const len = fr * (0.55 + rand() * 0.45);
      const sx = side === 0 ? x0 + 2 : x1 - 2;
      const dir = side === 0 ? -1 : 1;
      const g = 150 + rand() * 50;
      ctx.strokeStyle = `rgb(${g},${g * 0.9},${g * 0.72})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.quadraticCurveTo(sx + dir * len * 0.5, y + (rand() - 0.5) * 6, sx + dir * len, y + (rand() - 0.5) * 10);
      ctx.stroke();
    }
  }

  // Age it.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (d[i + 3] === 0) continue;
      const inRug = px >= x0 && px < x1;
      let r = d[i] / 255;
      let g = d[i + 1] / 255;
      let b = d[i + 2] / 255;
      if (inRug) {
        const u = (px - x0) / PX;
        const v = py / PX;
        // Knot texture.
        const weave = 0.9 + 0.1 * Math.sin(px * 1.9) * Math.sin(py * 1.9);
        // Fade toward a dusty beige.
        const fade = 0.42 + fbm(u * 0.8, v * 0.8, 3, seed) * 0.25;
        r = lerp(r, 0.5, fade);
        g = lerp(g, 0.44, fade);
        b = lerp(b, 0.36, fade);
        // Wear: heaviest along a diagonal traffic path and at the edges.
        const path = Math.exp(-Math.pow((v - 0.6 - u * 0.25) / 0.45, 2));
        const edgeWear = 1 - smoothstep(0, 0.18, Math.min(v, RUG_D - v));
        const wear = fbm(u * 2.5, v * 2.5, 4, seed + 1) * 0.75 + path * 0.25 + edgeWear * 0.25;
        const bare = smoothstep(0.55, 0.68, wear);
        const warp = 0.55 + 0.08 * Math.sin(px * 3.1) * Math.sin(py * 0.7);
        r = lerp(r, warp, bare * 0.85);
        g = lerp(g, warp * 0.9, bare * 0.85);
        b = lerp(b, warp * 0.74, bare * 0.85);
        // Stains.
        const stain = smoothstep(0.64, 0.7, fbm(u * 1.4 + 9, v * 1.4, 4, seed + 2));
        r *= 1 - stain * 0.35;
        g *= 1 - stain * 0.38;
        b *= 1 - stain * 0.35;
        // Dust and grime.
        const grime = 0.78 + vnoise(u * 40, v * 40, seed + 3) * 0.12 + fbm(u, v, 2, seed + 4) * 0.12;
        r *= weave * grime;
        g *= weave * grime;
        b *= weave * grime;
        // Holes where it is worn right through, and a frayed long edge.
        const hole = wear > 0.78 && vnoise(u * 30, v * 30, seed + 5) > 0.4;
        const fray = Math.min(v, RUG_D - v) < 0.004 + vnoise(u * 60, v, seed + 6) * 0.012;
        if (hole || fray) d[i + 3] = 0;
      }
      d[i] = clamp(r) * 255;
      d[i + 1] = clamp(g) * 255;
      d[i + 2] = clamp(b) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
