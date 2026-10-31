import * as THREE from 'three';

/** A colour + height pair of canvases that a generator paints into. */
export interface Surface {
  w: number;
  h: number;
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
  cctx: CanvasRenderingContext2D;
  hctx: CanvasRenderingContext2D;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

export function makeSurface(w: number, h: number): Surface {
  const [color, cctx] = makeCanvas(w, h);
  const [height, hctx] = makeCanvas(w, h);
  return { w, h, color, height, cctx, hctx };
}

/**
 * Fill both canvases pixel by pixel. `fn` writes rgb (0..1) and height (0..1)
 * into the `out` array: [r, g, b, height].
 */
export function paintPixels(
  s: Surface,
  fn: (x: number, y: number, out: Float32Array) => void,
): void {
  const cimg = s.cctx.createImageData(s.w, s.h);
  const himg = s.hctx.createImageData(s.w, s.h);
  const out = new Float32Array(4);
  let i = 0;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      fn(x, y, out);
      cimg.data[i] = out[0] * 255;
      cimg.data[i + 1] = out[1] * 255;
      cimg.data[i + 2] = out[2] * 255;
      cimg.data[i + 3] = 255;
      const hv = out[3] * 255;
      himg.data[i] = hv;
      himg.data[i + 1] = hv;
      himg.data[i + 2] = hv;
      himg.data[i + 3] = 255;
      i += 4;
    }
  }
  s.cctx.putImageData(cimg, 0, 0);
  s.hctx.putImageData(himg, 0, 0);
}

/** Sobel the height canvas into a tangent-space normal map canvas. */
export function heightToNormal(height: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = height.width;
  const h = height.height;
  const src = height.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const H = (x: number, y: number) => {
    x = (x + w) % w;
    y = (y + h) % h;
    return src[(y * w + x) * 4] / 255;
  };
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1);
      const dy =
        H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1);
      // Canvas y runs down, texture v runs up: flip dy.
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function colorTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function dataTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface PbrMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

export function surfaceToMaps(s: Surface, normalStrength: number, repeat = false): PbrMaps {
  return {
    map: colorTexture(s.color, repeat),
    normalMap: dataTexture(heightToNormal(s.height, normalStrength), repeat),
  };
}

/** Draw a jagged crack (random walk) into both canvases. */
export function drawCrack(
  s: Surface,
  rand: () => number,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  depth = 0,
): void {
  const pts: [number, number][] = [[x, y]];
  let a = angle;
  let px = x;
  let py = y;
  const step = 4;
  for (let d = 0; d < length; d += step) {
    a += (rand() - 0.5) * 0.9;
    a = a * 0.85 + angle * 0.15;
    px += Math.cos(a) * step;
    py += Math.sin(a) * step;
    pts.push([px, py]);
    if (depth < 2 && rand() < 0.025) {
      drawCrack(s, rand, px, py, a + (rand() < 0.5 ? 0.8 : -0.8), length * 0.35, width * 0.6, depth + 1);
    }
  }
  for (const [ctx, style, wMul] of [
    [s.cctx, 'rgba(14,12,10,0.85)', 1],
    [s.hctx, 'rgba(0,0,0,0.9)', 1.6],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const t = i / pts.length;
      ctx.lineWidth = Math.max(0.6, width * wMul * (1 - t * 0.8));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }
  // A faint lighter lip along the crack edge sells the depth.
  s.cctx.strokeStyle = 'rgba(200,190,170,0.08)';
  s.cctx.lineWidth = width * 2.5;
  s.cctx.beginPath();
  s.cctx.moveTo(pts[0][0] + 1, pts[0][1] - 1);
  for (const [qx, qy] of pts) s.cctx.lineTo(qx + 1, qy - 1);
  s.cctx.stroke();
}

/** Irregular blob path, used for missing chunks and stains. */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  cx: number,
  cy: number,
  r: number,
  jag = 0.45,
): void {
  const n = 14 + Math.floor(rand() * 8);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - jag / 2 + rand() * jag);
    const x = cx + Math.cos(a) * rr * 1.25;
    const y = cy + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Paint a missing chunk of concrete: recessed, darker, rough aggregate inside. */
export function drawChunk(s: Surface, rand: () => number, cx: number, cy: number, r: number): void {
  const { cctx, hctx } = s;
  cctx.save();
  blobPath(cctx, rand, cx, cy, r);
  cctx.clip();
  cctx.fillStyle = 'rgb(58,54,49)';
  cctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  for (let i = 0; i < r * r * 0.6; i++) {
    const g = 40 + rand() * 70;
    cctx.fillStyle = `rgba(${g + 8},${g + 4},${g},0.8)`;
    const pr = 0.6 + rand() * 2.4;
    cctx.beginPath();
    cctx.arc(cx + (rand() - 0.5) * r * 2.6, cy + (rand() - 0.5) * r * 1.8, pr, 0, Math.PI * 2);
    cctx.fill();
  }
  // Inner shadow along the top edge (light comes from above).
  const grad = cctx.createLinearGradient(0, cy - r, 0, cy + r * 0.2);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  cctx.fillStyle = grad;
  cctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  cctx.restore();

  hctx.save();
  blobPath(hctx, rand, cx, cy, r);
  hctx.clip();
  hctx.fillStyle = 'rgb(20,20,20)';
  hctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  for (let i = 0; i < r * r * 0.5; i++) {
    const g = 10 + rand() * 60;
    hctx.fillStyle = `rgb(${g},${g},${g})`;
    hctx.beginPath();
    hctx.arc(cx + (rand() - 0.5) * r * 2.6, cy + (rand() - 0.5) * r * 1.8, 0.6 + rand() * 2.4, 0, Math.PI * 2);
    hctx.fill();
  }
  hctx.restore();
}
