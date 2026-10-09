import { RENDER } from '../config';
import type { Vec } from '../geo';
import type { Graph } from '../map/graph';

/** World (metres, y north) ↔ screen (CSS px, y down). */
export class View {
  scale = 1;
  ox = 0;
  oy = 0;
  width = 0;
  height = 0;

  /** Fit the island (plus bridges) into the screen area below `top` CSS px. */
  fit(graph: Graph, width: number, height: number, top: number, bottom: number) {
    this.width = width;
    this.height = height;
    const xs: number[] = [], ys: number[] = [];
    for (const [x, y] of graph.data.island) { xs.push(x); ys.push(y); }
    for (const n of graph.exits) { xs.push(n.x); ys.push(n.y); }
    const margin = 30;
    const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin, maxY = Math.max(...ys) + margin;
    const pad = RENDER.padding;
    const availW = width - 2 * pad, availH = height - top - bottom - 2 * pad;
    this.scale = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    this.ox = pad + (availW - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.oy = top + pad + (availH - (maxY - minY) * this.scale) / 2 + maxY * this.scale;
  }

  toScreen(p: Vec): Vec { return { x: this.ox + p.x * this.scale, y: this.oy - p.y * this.scale }; }
  sx(x: number) { return this.ox + x * this.scale; }
  sy(y: number) { return this.oy - y * this.scale; }
}
