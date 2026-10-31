// Procedural surface generators: concrete block walls, floor, ceiling, wood,
// rusty metal, paper. Each returns colour + normal canvases (via Surface).

import { blobPath, drawChunk, drawCrack, makeSurface, paintPixels, type Surface } from './canvas';
import { cellHash, clamp, fbm, lerp, rng, smoothstep, vnoise } from './noise';

export interface WallOptions {
  /** Total length of the wall strip in metres (including corner overlap). */
  length: number;
  height: number;
  seed: number;
  pxPerM?: number;
  /** Rectangles (metres, x from strip start, y from floor) to drip water stains under. */
  leaks?: { x: number; y: number; w: number }[];
  /** Rust-streak sources along the top (e.g. under pipes), x in metres. */
  rustAt?: number[];
}

const BLOCK_W = 0.4;
const BLOCK_H = 0.2;

export function concreteBlockWall(o: WallOptions): Surface {
  const P = o.pxPerM ?? 180;
  const W = Math.round(o.length * P);
  const H = Math.round(o.height * P);
  const s = makeSurface(W, H);
  const seed = o.seed;
  const leaks = o.leaks ?? [];
  const rustAt = o.rustAt ?? [];

  paintPixels(s, (px, py, out) => {
    const mx = px / P;
    const my = (H - py) / P;
    const row = Math.floor(my / BLOCK_H);
    const off = (row & 1) * (BLOCK_W / 2);
    const col = Math.floor((mx + off) / BLOCK_W);
    const lx = mx + off - col * BLOCK_W;
    const ly = my - row * BLOCK_H;
    const edge = Math.min(lx, BLOCK_W - lx, ly, BLOCK_H - ly);

    const crumble = fbm(mx * 28, my * 28, 3, seed + 3);
    const chip = smoothstep(0.62, 0.8, fbm(mx * 9, my * 9, 3, seed + 9)) * 0.022;
    const mortarW = 0.005 + crumble * 0.007 + chip;

    const bh = cellHash(col, row, seed);
    const grain = vnoise(mx * 190, my * 190, seed + 1) - 0.5;
    const mid = fbm(mx * 11, my * 11, 4, seed + 2) - 0.5;
    const big = fbm(mx * 0.9, my * 0.9, 3, seed + 4);

    let r: number, g: number, b: number, h: number;
    if (edge < mortarW) {
      // Crumbling mortar: recessed, sandy, uneven.
      const m = 0.3 + crumble * 0.12 + grain * 0.1;
      r = m * 1.05;
      g = m * 1.0;
      b = m * 0.9;
      h = 0.32 + crumble * 0.2 + grain * 0.05;
    } else {
      const base = 0.43 + (bh - 0.5) * 0.09 + mid * 0.12 + grain * 0.07;
      const tint = (cellHash(col, row, seed + 7) - 0.5) * 0.03;
      r = base + tint;
      g = base;
      b = base * 0.95 - tint;
      // Rounded block edges + pits.
      const bevel = smoothstep(mortarW, mortarW + 0.012, edge);
      h = 0.55 + bevel * 0.3 + mid * 0.18 + grain * 0.06;
      const pit = vnoise(mx * 85, my * 85, seed + 5);
      if (pit > 0.84) {
        const k = (pit - 0.84) / 0.16;
        r *= 1 - k * 0.45;
        g *= 1 - k * 0.45;
        b *= 1 - k * 0.45;
        h -= k * 0.35;
      }
      h *= lerp(0.7, 1, bevel);
    }

    // Large-scale grime.
    const grime = lerp(0.7, 1.06, big);
    r *= grime;
    g *= grime;
    b *= grime;

    // Rising damp with a salty tide line.
    const dampLine = 0.32 + fbm(mx * 1.3, 3.7, 3, seed + 11) * 0.75;
    const wet = 1 - smoothstep(dampLine - 0.25, dampLine, my);
    if (wet > 0) {
      const k = wet * (0.75 + fbm(mx * 4, my * 4, 3, seed + 12) * 0.25);
      r = lerp(r, r * 0.5, k);
      g = lerp(g, g * 0.53, k);
      b = lerp(b, b * 0.45, k);
    }
    const tide = Math.exp(-Math.pow((my - dampLine) / 0.018, 2)) * smoothstep(0.35, 0.7, vnoise(mx * 18, my * 4, seed + 13));
    r = lerp(r, 0.62, tide * 0.5);
    g = lerp(g, 0.6, tide * 0.5);
    b = lerp(b, 0.55, tide * 0.5);

    // Vertical seepage streaks from the top.
    const streak = Math.pow(vnoise(mx * 22, my * 0.7, seed + 14), 3) * smoothstep(o.height - 1.7, o.height, my);
    r *= 1 - streak * 0.4;
    g *= 1 - streak * 0.42;
    b *= 1 - streak * 0.46;

    // Rust streaks under pipe brackets.
    for (const rx of rustAt) {
      const dx = Math.abs(mx - rx);
      if (dx < 0.12) {
        const k =
          (1 - dx / 0.12) *
          smoothstep(o.height - 1.4 - vnoise(mx * 30, 1, seed) * 0.5, o.height - 0.05, my) *
          vnoise(mx * 40, my * 2, seed + 15);
        r = lerp(r, 0.36, k * 0.8);
        g = lerp(g, 0.2, k * 0.8);
        b = lerp(b, 0.1, k * 0.8);
      }
    }

    // Water stains running down from leaks (e.g. under the window).
    for (const l of leaks) {
      const dx = (mx - l.x) / (l.w / 2);
      if (Math.abs(dx) < 1.2 && my < l.y) {
        const fall = smoothstep(l.y - 1.6 - vnoise(mx * 12, 0, seed) * 0.6, l.y, my);
        const k = fall * (1 - smoothstep(0.6, 1.2, Math.abs(dx))) * (0.5 + vnoise(mx * 26, my * 1.2, seed + 16) * 0.5);
        r *= 1 - k * 0.45;
        g *= 1 - k * 0.42;
        b *= 1 - k * 0.38;
      }
    }

    // Mould specks near the ceiling and the floor.
    const mould = smoothstep(0.72, 0.9, fbm(mx * 7, my * 7, 4, seed + 17)) *
      (smoothstep(o.height - 0.6, o.height, my) + (1 - smoothstep(0, 0.5, my)));
    if (mould > 0 && vnoise(mx * 120, my * 120, seed + 18) > 0.45) {
      r = lerp(r, 0.1, mould * 0.8);
      g = lerp(g, 0.12, mould * 0.8);
      b = lerp(b, 0.08, mould * 0.8);
    }

    out[0] = clamp(r);
    out[1] = clamp(g);
    out[2] = clamp(b);
    out[3] = clamp(h);
  });

  const rand = rng(seed * 31 + 7);
  // Cracks: a couple of long diagonal ones following no particular plan.
  const cracks = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < cracks; i++) {
    const fromTop = rand() < 0.6;
    drawCrack(
      s,
      rand,
      rand() * W,
      fromTop ? rand() * H * 0.15 : H * (0.4 + rand() * 0.5),
      fromTop ? Math.PI / 2 + (rand() - 0.5) * 1.2 : (rand() - 0.5) * 1.4 + (rand() < 0.5 ? 0 : Math.PI),
      P * (0.5 + rand() * 1.1),
      1.2 + rand() * 1.4,
    );
  }
  // Missing chunks, mostly at block corners and low on the wall (kicked, bumped).
  const chunks = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < chunks; i++) {
    const row = Math.floor(rand() * (o.height / BLOCK_H));
    const off = (row & 1) * (BLOCK_W / 2);
    const col = Math.floor(rand() * (o.length / BLOCK_W));
    const cx = (col * BLOCK_W - off + (rand() < 0.5 ? 0 : BLOCK_W)) * P;
    const cy = H - row * BLOCK_H * P - (rand() < 0.5 ? 0 : BLOCK_H * P);
    drawChunk(s, rand, cx, cy, P * (0.03 + rand() * 0.06));
  }
  return s;
}

export function concreteFloor(size: number, seed: number, pxPerM = 170): Surface {
  const P = pxPerM;
  const N = Math.round(size * P);
  const s = makeSurface(N, N);
  const half = size / 2;
  paintPixels(s, (px, py, out) => {
    const mx = px / P;
    const my = py / P;
    const mott = fbm(mx * 1.6, my * 1.6, 4, seed);
    const mid = fbm(mx * 9, my * 9, 4, seed + 1) - 0.5;
    const grain = vnoise(mx * 220, my * 220, seed + 2) - 0.5;
    let v = 0.36 + (mott - 0.5) * 0.16 + mid * 0.08 + grain * 0.06;
    let h = 0.5 + mid * 0.3 + grain * 0.1;
    // Exposed aggregate.
    const agg = vnoise(mx * 60, my * 60, seed + 3);
    if (agg > 0.8) {
      v += (agg - 0.8) * 0.5 * (cellHash(Math.floor(mx * 60), Math.floor(my * 60), seed) - 0.3);
      h += (agg - 0.8) * 1.2;
    }
    // Darker, damp band along the walls.
    const dEdge = half - Math.max(Math.abs(mx - half), Math.abs(my - half));
    const damp = (1 - smoothstep(0.05, 0.6 + fbm(mx * 2, my * 2, 2, seed + 4) * 0.5, dEdge)) * 0.45;
    v *= 1 - damp;
    // Scuffed walking path (lighter, smoother) through the middle.
    const worn = smoothstep(0.55, 0.75, fbm(mx * 0.8 + 3, my * 0.8, 3, seed + 5)) * 0.06;
    v += worn;
    let r = v * 1.02;
    let g = v;
    let b = v * 0.94;
    // Oily / water stains.
    const st = smoothstep(0.66, 0.74, fbm(mx * 1.1, my * 1.1, 4, seed + 6));
    r *= 1 - st * 0.4;
    g *= 1 - st * 0.42;
    b *= 1 - st * 0.4;
    out[0] = clamp(r);
    out[1] = clamp(g);
    out[2] = clamp(b);
    out[3] = clamp(h);
  });
  const rand = rng(seed + 99);
  for (let i = 0; i < 6; i++) {
    drawCrack(s, rand, rand() * N, rand() * N, rand() * Math.PI * 2, P * (0.6 + rand() * 1.6), 1 + rand() * 1.5);
  }
  for (let i = 0; i < 5; i++) drawChunk(s, rand, rand() * N, rand() * N, P * (0.02 + rand() * 0.04));
  // A saw-cut expansion joint across the slab.
  s.cctx.strokeStyle = 'rgba(20,18,16,0.7)';
  s.cctx.lineWidth = 2;
  s.cctx.beginPath();
  s.cctx.moveTo(0, N * 0.36);
  s.cctx.lineTo(N, N * 0.37);
  s.cctx.stroke();
  s.hctx.strokeStyle = 'black';
  s.hctx.lineWidth = 3;
  s.hctx.beginPath();
  s.hctx.moveTo(0, N * 0.36);
  s.hctx.lineTo(N, N * 0.37);
  s.hctx.stroke();
  return s;
}

export function concreteCeiling(size: number, seed: number, pxPerM = 130): Surface {
  const P = pxPerM;
  const N = Math.round(size * P);
  const s = makeSurface(N, N);
  const BOARD = 0.15;
  paintPixels(s, (px, py, out) => {
    const mx = px / P;
    const my = py / P;
    // Board-formed concrete: the plank imprints of the old formwork.
    const board = Math.floor(my / BOARD);
    const by = my - board * BOARD;
    const seam = Math.min(by, BOARD - by);
    const bh = cellHash(board, 0, seed);
    const woodGrain = vnoise(mx * 3, my * 90 + bh * 10, seed + 1) - 0.5;
    const mid = fbm(mx * 8, my * 8, 4, seed + 2) - 0.5;
    const grain = vnoise(mx * 200, my * 200, seed + 3) - 0.5;
    let v = 0.4 + (bh - 0.5) * 0.03 + woodGrain * 0.015 + mid * 0.14 + grain * 0.08;
    let h = 0.5 + (bh - 0.5) * 0.06 + woodGrain * 0.04 + mid * 0.3 + grain * 0.14;
    if (seam < 0.003 && vnoise(mx * 6, board, seed + 6) > 0.35) {
      v *= 0.85;
      h -= 0.08;
    }
    const grime = lerp(0.6, 1.05, fbm(mx * 0.9, my * 0.9, 3, seed + 4));
    v *= grime;
    let r = v,
      g = v * 0.99,
      b = v * 0.95;
    // Water stain rings.
    const ring = fbm(mx * 1.3, my * 1.3, 4, seed + 5);
    const inside = smoothstep(0.62, 0.66, ring);
    const edgeRing = Math.exp(-Math.pow((ring - 0.66) / 0.008, 2));
    r *= 1 - inside * 0.18 - edgeRing * 0.3;
    g *= 1 - inside * 0.2 - edgeRing * 0.34;
    b *= 1 - inside * 0.25 - edgeRing * 0.42;
    // Soot above the bulb (room centre).
    const dc = Math.hypot(mx - size / 2 - 0.2, my - size / 2 + 0.1);
    const soot = Math.exp(-dc * dc * 3) * 0.55;
    r *= 1 - soot;
    g *= 1 - soot;
    b *= 1 - soot;
    out[0] = clamp(r);
    out[1] = clamp(g);
    out[2] = clamp(b);
    out[3] = clamp(h);
  });
  const rand = rng(seed + 5);
  for (let i = 0; i < 4; i++) {
    drawCrack(s, rand, rand() * N, rand() * N, rand() * Math.PI * 2, P * (0.8 + rand() * 1.4), 1 + rand());
  }
  for (let i = 0; i < 3; i++) drawChunk(s, rand, rand() * N, rand() * N, P * (0.04 + rand() * 0.05));
  return s;
}

export interface WoodOptions {
  w: number;
  h: number;
  seed: number;
  /** Base colour (0..1). Old, grey-brown by default. */
  tone?: [number, number, number];
  /** Grain stretch: grain runs along canvas x. */
  planks?: number;
  weather?: number;
}

export function wood(o: WoodOptions): Surface {
  const s = makeSurface(o.w, o.h);
  const tone = o.tone ?? [0.36, 0.27, 0.19];
  const planks = o.planks ?? 1;
  const weather = o.weather ?? 0.5;
  const ph = o.h / planks;
  paintPixels(s, (px, py, out) => {
    const plank = Math.floor(py / ph);
    const ly = py - plank * ph;
    const seed = o.seed + plank * 13;
    const ph2 = cellHash(plank, 0, o.seed);
    const warp = fbm(px * 0.004, py * 0.02, 3, seed) * 30;
    const rings = Math.sin((py + warp + ph2 * 100) * 0.45) * 0.5 + 0.5;
    const fine = vnoise(px * 0.05, py * 0.8, seed + 1);
    const knotN = vnoise(px * 0.012, py * 0.05, seed + 2);
    const knot = smoothstep(0.86, 0.95, knotN);
    let v = 0.82 + rings * 0.18 + (fine - 0.5) * 0.25 - knot * 0.45;
    const variation = 0.85 + ph2 * 0.3;
    v *= variation;
    // Weathering: greys out and darkens in streaks.
    const wth = weather * (0.5 + fbm(px * 0.01, py * 0.01, 3, seed + 3) * 0.7);
    let r = tone[0] * v;
    let g = tone[1] * v;
    let b = tone[2] * v;
    const grey = (r + g + b) / 3;
    r = lerp(r, grey * 1.05, wth * 0.6);
    g = lerp(g, grey, wth * 0.6);
    b = lerp(b, grey * 0.95, wth * 0.6);
    const dirt = smoothstep(0.55, 0.8, fbm(px * 0.006, py * 0.006, 4, seed + 4));
    r *= 1 - dirt * 0.45;
    g *= 1 - dirt * 0.45;
    b *= 1 - dirt * 0.42;
    let h = 0.5 + rings * 0.15 + (fine - 0.5) * 0.3 - knot * 0.2;
    // Plank seams.
    const seam = Math.min(ly, ph - ly);
    if (planks > 1 && seam < 2.5) {
      r *= 0.35;
      g *= 0.35;
      b *= 0.35;
      h = 0.05;
    }
    out[0] = clamp(r);
    out[1] = clamp(g);
    out[2] = clamp(b);
    out[3] = clamp(h);
  });
  return s;
}

export function rustyMetal(w: number, h: number, seed: number, paint: [number, number, number] = [0.16, 0.17, 0.16]): Surface {
  const s = makeSurface(w, h);
  paintPixels(s, (px, py, out) => {
    const n = fbm(px * 0.012, py * 0.012, 5, seed);
    const fine = vnoise(px * 0.3, py * 0.3, seed + 1);
    const rust = smoothstep(0.48, 0.62, n + (fine - 0.5) * 0.12);
    const pitting = smoothstep(0.7, 0.9, vnoise(px * 0.15, py * 0.15, seed + 2));
    const rr = lerp(0.32, 0.45, fine);
    let r = lerp(paint[0], rr, rust);
    let g = lerp(paint[1], rr * 0.5, rust);
    let b = lerp(paint[2], rr * 0.25, rust);
    r *= 1 - pitting * 0.4;
    g *= 1 - pitting * 0.4;
    b *= 1 - pitting * 0.4;
    // Streaks running down.
    const streak = Math.pow(vnoise(px * 0.08, py * 0.004, seed + 3), 4);
    r = lerp(r, 0.3, streak * 0.5);
    g = lerp(g, 0.14, streak * 0.5);
    b = lerp(b, 0.06, streak * 0.5);
    out[0] = clamp(r);
    out[1] = clamp(g);
    out[2] = clamp(b);
    out[3] = clamp(0.6 - rust * 0.15 + (fine - 0.5) * 0.2 * rust - pitting * 0.3);
  });
  return s;
}

/** Aged, stained paper with faint hand-written lines. */
export function paper(seed: number, w = 256, h = 340): Surface {
  const s = makeSurface(w, h);
  paintPixels(s, (px, py, out) => {
    const n = fbm(px * 0.02, py * 0.02, 4, seed);
    const fold = Math.abs(py - h * 0.5) < 1.5 ? 0.85 : 1;
    const v = (0.72 + n * 0.16) * fold;
    const stain = smoothstep(0.62, 0.75, fbm(px * 0.012, py * 0.012, 3, seed + 1));
    out[0] = clamp(v * (1 - stain * 0.25));
    out[1] = clamp(v * 0.94 * (1 - stain * 0.32));
    out[2] = clamp(v * 0.78 * (1 - stain * 0.45));
    out[3] = 0.5 + (n - 0.5) * 0.4 + (fold < 1 ? -0.2 : 0);
  });
  const rand = rng(seed);
  const ctx = s.cctx;
  ctx.strokeStyle = 'rgba(40,40,70,0.45)';
  ctx.lineWidth = 1.2;
  for (let y = 40; y < h - 30; y += 16 + rand() * 4) {
    if (rand() < 0.15) continue;
    ctx.beginPath();
    let x = 24 + rand() * 10;
    ctx.moveTo(x, y);
    const end = w - 24 - rand() * 60;
    while (x < end) {
      x += 3 + rand() * 4;
      ctx.lineTo(x, y + (rand() - 0.5) * 3);
    }
    ctx.stroke();
  }
  // A coffee ring.
  ctx.strokeStyle = 'rgba(90,55,25,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * (0.3 + rand() * 0.4), h * (0.5 + rand() * 0.3), 30 + rand() * 10, 0, Math.PI * 1.7);
  ctx.stroke();
  return s;
}

/** Soft round sprite for dust particles. */
export function softDot(size = 64): HTMLCanvasElement {
  const s = makeSurface(size, size);
  const g = s.cctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  s.cctx.fillStyle = g;
  s.cctx.fillRect(0, 0, size, size);
  return s.color;
}

/** Stain blob helper re-export for prop textures. */
export { blobPath };
