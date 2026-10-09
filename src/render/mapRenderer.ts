import { MAP_DECOR, PALETTE, RENDER } from '../config';
import { project, pointInPolygon, type Vec } from '../geo';
import type { Edge, Graph } from '../map/graph';
import type { Pt } from '../map/types';
import { mulberry32 } from '../rng';
import type { View } from './view';

const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

/**
 * Draws the static city map once into an offscreen canvas; the game loop
 * blits it every frame and draws moving things on top.
 */
export class MapRenderer {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private dpr = 1;

  constructor(private graph: Graph) {}

  render(view: View, dpr: number) {
    this.dpr = dpr;
    this.canvas.width = Math.round(view.width * dpr);
    this.canvas.height = Math.round(view.height * dpr);
    const ctx = this.ctx;
    const g = this.graph, d = g.data;

    // ---- sheet & sea ------------------------------------------------------
    this.screenSpace();
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(0, 0, view.width, view.height);
    const b = d.bounds;
    const sx0 = view.sx(b.minX), sx1 = view.sx(b.maxX), sy0 = view.sy(b.maxY), sy1 = view.sy(b.minY);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    const grad = ctx.createLinearGradient(0, sy0, 0, sy1);
    grad.addColorStop(0, PALETTE.seaShallow);
    grad.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    ctx.clip();
    this.drawWaves(view, b);

    // ---- land -------------------------------------------------------------
    const lands = [d.island, ...d.otherLand];
    this.worldSpace(view);
    for (const [w, a] of [[34, 0.12], [20, 0.2], [9, 0.35]] as const) {
      ctx.strokeStyle = PALETTE.surf;
      ctx.globalAlpha = a / 0.55;
      ctx.lineWidth = w / view.scale;
      ctx.lineJoin = 'round';
      for (const poly of lands) { this.polyPath(poly); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (const poly of d.otherLand) {
      this.polyPath(poly);
      ctx.fillStyle = PALETTE.mainland;
      ctx.fill();
      this.roofTexture(poly, [PALETTE.mainlandRoof, PALETTE.mainland, '#cdb995'], 0.55, 7);
    }
    this.polyPath(d.island);
    ctx.fillStyle = PALETTE.roofs[0];
    ctx.fill();
    this.roofTexture(d.island, PALETTE.roofs, 0.9, 13);
    // quay wall
    this.polyPath(d.island);
    ctx.strokeStyle = PALETTE.quay;
    ctx.lineWidth = 3 / view.scale;
    ctx.stroke();

    // ---- streets ----------------------------------------------------------
    const streetW = RENDER.streetWidthPx / view.scale;
    const piazzas = MAP_DECOR.piazzas.map((p) => ({ ...p, c: project(p.at) }));
    const streets = g.edges.filter((e) => e.kind === 'street');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // edges (darker outline) first, then fills, so crossings merge cleanly
    ctx.strokeStyle = PALETTE.streetEdge;
    ctx.lineWidth = streetW + 2.4 / view.scale;
    for (const e of streets) { this.edgePath(e); ctx.stroke(); }
    ctx.fillStyle = PALETTE.streetEdge;
    for (const p of piazzas) { this.ellipse(p.c, p.rx + 1.6 / view.scale, p.ry + 1.6 / view.scale); ctx.fill(); }
    ctx.strokeStyle = PALETTE.street;
    ctx.lineWidth = streetW;
    for (const e of streets) { this.edgePath(e); ctx.stroke(); }
    ctx.fillStyle = PALETTE.piazza;
    for (const p of piazzas) { this.ellipse(p.c, p.rx, p.ry); ctx.fill(); }
    // a whisper of paving in the piazzas
    ctx.strokeStyle = 'rgba(160,135,100,0.25)';
    ctx.lineWidth = 0.8 / view.scale;
    for (const p of piazzas) { this.ellipse(p.c, p.rx * 0.55, p.ry * 0.55); ctx.stroke(); }

    // ---- landmarks --------------------------------------------------------
    for (const lm of MAP_DECOR.landmarks) this.landmark(view, lm.kind, project(lm.at));

    // ---- bridges ----------------------------------------------------------
    for (const e of g.edges.filter((x) => x.kind === 'bridge')) {
      this.worldSpace(view);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = PALETTE.bridgeRail;
      ctx.lineWidth = (RENDER.bridgeWidthPx + 3) / view.scale;
      this.edgePath(e); ctx.stroke();
      ctx.strokeStyle = PALETTE.bridge;
      ctx.lineWidth = RENDER.bridgeWidthPx / view.scale;
      this.edgePath(e); ctx.stroke();
    }

    // ---- one-way arrows ---------------------------------------------------
    this.screenSpace();
    ctx.strokeStyle = PALETTE.arrow;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const sz = RENDER.onewayArrowSize;
    for (const e of streets) {
      if (!e.oneway) continue;
      const n = Math.max(1, Math.floor(e.length / RENDER.onewayArrowSpacing));
      for (let i = 0; i < n; i++) {
        const s = (e.length * (i + 0.5)) / n;
        const p = view.toScreen(e.pointAt(s));
        const t = e.tangentAt(s, 1);
        const tx = t.x, ty = -t.y; // screen space
        ctx.beginPath();
        ctx.moveTo(p.x - tx * sz - ty * sz, p.y - ty * sz + tx * sz);
        ctx.lineTo(p.x + tx * sz * 0.6, p.y + ty * sz * 0.6);
        ctx.lineTo(p.x - tx * sz + ty * sz, p.y - ty * sz - tx * sz);
        ctx.stroke();
      }
    }

    // ---- exits ------------------------------------------------------------
    for (const n of g.exits) {
      const p = view.toScreen(n);
      ctx.fillStyle = PALETTE.exit;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 3.5); ctx.lineTo(p.x, p.y - 3.5);
      ctx.moveTo(p.x - 3, p.y - 0.5); ctx.lineTo(p.x, p.y - 3.5); ctx.lineTo(p.x + 3, p.y - 0.5);
      ctx.stroke();
    }

    // ---- labels -----------------------------------------------------------
    for (const n of g.exits) {
      const p = view.toScreen(n);
      this.label(n.exit!, p.x, p.y - 13, 10, PALETTE.labelOnSea, true);
    }
    for (const lm of MAP_DECOR.landmarks) {
      const p = view.toScreen(project(lm.at));
      this.label(lm.name, p.x, p.y + (lm.kind === 'castle' ? 0 : 14), 9.5, PALETTE.label, false);
    }
    const ml = view.toScreen(project(MAP_DECOR.mainlandLabel.at));
    this.label(MAP_DECOR.mainlandLabel.text, ml.x, ml.y, 13, 'rgba(90,70,45,0.7)', false, '600', 4);
    for (const sl of MAP_DECOR.seaLabels) {
      const p = view.toScreen(project(sl.at));
      this.label(sl.text, p.x, p.y, 12, PALETTE.labelOnSea, true, 'italic', 2);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  private screenSpace() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
  private worldSpace(v: View) {
    const k = this.dpr;
    this.ctx.setTransform(k * v.scale, 0, 0, -k * v.scale, k * v.ox, k * v.oy);
  }

  private polyPath(poly: Pt[]) {
    const ctx = this.ctx;
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  private edgePath(e: Edge) {
    const ctx = this.ctx;
    ctx.beginPath();
    e.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  }

  private ellipse(c: Vec, rx: number, ry: number) {
    this.ctx.beginPath();
    this.ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
  }

  /** Terracotta rooftops: jittered tiles of slightly different tones, clipped to the land. */
  private roofTexture(poly: Pt[], tones: readonly string[], alpha: number, cell: number) {
    const ctx = this.ctx;
    const rng = mulberry32(poly.length * 7919 + 17);
    const vs = poly.map(([x, y]) => ({ x, y }));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of vs) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    ctx.save();
    this.polyPath(poly);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (let y = minY; y < maxY; y += cell) {
      for (let x = minX; x < maxX; x += cell) {
        const c = { x: x + cell / 2, y: y + cell / 2 };
        if (!pointInPolygon(c, vs)) continue;
        const w = cell * (0.75 + rng() * 0.5), h = cell * (0.75 + rng() * 0.5);
        ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
        ctx.save();
        ctx.translate(c.x + (rng() - 0.5) * 3, c.y + (rng() - 0.5) * 3);
        ctx.rotate((rng() - 0.5) * 0.25);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        // ridge line
        ctx.fillStyle = 'rgba(80,30,10,0.07)';
        ctx.fillRect(-w / 2, -0.6, w, 1.2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawWaves(view: View, b: { minX: number; minY: number; maxX: number; maxY: number }) {
    const ctx = this.ctx;
    const rng = mulberry32(42);
    ctx.strokeStyle = PALETTE.seaShimmer;
    ctx.lineWidth = 1;
    const n = Math.round(((b.maxX - b.minX) * (b.maxY - b.minY)) / 9000);
    for (let i = 0; i < n; i++) {
      const p = view.toScreen({ x: b.minX + rng() * (b.maxX - b.minX), y: b.minY + rng() * (b.maxY - b.minY) });
      const w = 4 + rng() * 6;
      ctx.beginPath();
      ctx.moveTo(p.x - w, p.y);
      ctx.quadraticCurveTo(p.x - w / 2, p.y - 2, p.x, p.y);
      ctx.quadraticCurveTo(p.x + w / 2, p.y + 2, p.x + w, p.y);
      ctx.stroke();
    }
  }

  private landmark(view: View, kind: string, at: Vec) {
    const ctx = this.ctx;
    this.screenSpace();
    const p = view.toScreen(at);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(90,65,40,0.8)';
    if (kind === 'temple') {
      ctx.fillStyle = '#eadcb8';
      ctx.fillRect(p.x - 9, p.y - 5, 18, 10);
      ctx.strokeRect(p.x - 9, p.y - 5, 18, 10);
      for (let i = -7; i <= 7; i += 3.5) { ctx.beginPath(); ctx.arc(p.x + i, p.y, 0.9, 0, Math.PI * 2); ctx.stroke(); }
    } else if (kind === 'church') {
      ctx.fillStyle = '#efe2c2';
      ctx.fillRect(p.x - 7, p.y - 9, 14, 18);
      ctx.strokeRect(p.x - 7, p.y - 9, 14, 18);
      ctx.beginPath(); ctx.arc(p.x, p.y - 1, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#d6c398'; ctx.fill(); ctx.stroke();
    } else if (kind === 'spring') {
      ctx.fillStyle = '#5fb3cf';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5c8f3a';
      for (const [dx, dy] of [[-4, -1], [-1, 2], [3, -2], [5, 1]]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 1.3, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === 'castle') {
      const s = (MAP_DECOR.castleSize * view.scale) / 2;
      ctx.fillStyle = '#e3d3ab';
      ctx.strokeStyle = 'rgba(90,65,40,0.9)';
      ctx.lineWidth = 1.2;
      ctx.fillRect(p.x - s, p.y - s, 2 * s, 2 * s);
      ctx.strokeRect(p.x - s, p.y - s, 2 * s, 2 * s);
      ctx.fillStyle = '#d4c094';
      for (const [dx, dy] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
        ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, Math.max(2.5, s * 0.28), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.strokeRect(p.x - s * 0.45, p.y - s * 0.45, s * 0.9, s * 0.9);
    }
  }

  private label(text: string, x: number, y: number, size: number, color: string, onSea: boolean, style = 'italic', spacing = 0) {
    const ctx = this.ctx;
    this.screenSpace();
    ctx.font = `${style} ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    // keep labels on screen
    const half = ctx.measureText(text).width / 2 + 4;
    x = Math.max(half, Math.min(this.canvas.width / this.dpr - half, x));
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = onSea ? 'rgba(20,60,90,0.45)' : 'rgba(250,240,220,0.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }
}
