import type { PlaceKind } from '../game/places';

export const PLACE_COLORS: Record<PlaceKind, string> = {
  water: '#2b86c5',
  food: '#d9822b',
  bench: '#7a5b3a',
  hostel: '#7b5ea7',
  hotel: '#b8902a',
  sofa: '#c0577a',
};

/** A round badge with a simple white symbol, centred on (x, y), radius r (CSS px). */
export function drawPlaceGlyph(ctx: CanvasRenderingContext2D, kind: PlaceKind, x: number, y: number, r: number, dim = false) {
  ctx.save();
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(x + 0.6, y + 1, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PLACE_COLORS[kind];
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  const u = r / 7; // symbol unit
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.3 * u;
  ctx.beginPath();
  switch (kind) {
    case 'water': // droplet
      ctx.moveTo(x, y - 4.2 * u);
      ctx.bezierCurveTo(x + 1.5 * u, y - 1.5 * u, x + 3 * u, y, x + 3 * u, y + 1.4 * u);
      ctx.arc(x, y + 1.4 * u, 3 * u, 0, Math.PI);
      ctx.bezierCurveTo(x - 3 * u, y, x - 1.5 * u, y - 1.5 * u, x, y - 4.2 * u);
      ctx.fill();
      break;
    case 'food': // fork and knife
      ctx.moveTo(x - 2 * u, y - 4 * u); ctx.lineTo(x - 2 * u, y + 4 * u);
      ctx.moveTo(x - 3.2 * u, y - 4 * u); ctx.lineTo(x - 3.2 * u, y - 1.2 * u); ctx.lineTo(x - 0.8 * u, y - 1.2 * u); ctx.lineTo(x - 0.8 * u, y - 4 * u);
      ctx.moveTo(x + 2.2 * u, y + 4 * u); ctx.lineTo(x + 2.2 * u, y - 4 * u); ctx.quadraticCurveTo(x + 3.8 * u, y - 2 * u, x + 2.2 * u, y);
      ctx.stroke();
      break;
    case 'bench':
      ctx.moveTo(x - 4 * u, y - 1 * u); ctx.lineTo(x + 4 * u, y - 1 * u);
      ctx.moveTo(x - 4 * u, y + 1.2 * u); ctx.lineTo(x + 4 * u, y + 1.2 * u);
      ctx.moveTo(x - 3 * u, y + 1.2 * u); ctx.lineTo(x - 3 * u, y + 3.6 * u);
      ctx.moveTo(x + 3 * u, y + 1.2 * u); ctx.lineTo(x + 3 * u, y + 3.6 * u);
      ctx.moveTo(x - 4 * u, y - 3 * u); ctx.lineTo(x + 4 * u, y - 3 * u);
      ctx.stroke();
      break;
    case 'hostel': // bunk bed
      ctx.moveTo(x - 4 * u, y - 4 * u); ctx.lineTo(x - 4 * u, y + 4 * u);
      ctx.moveTo(x + 4 * u, y - 4 * u); ctx.lineTo(x + 4 * u, y + 4 * u);
      ctx.moveTo(x - 4 * u, y - 1.2 * u); ctx.lineTo(x + 4 * u, y - 1.2 * u);
      ctx.moveTo(x - 4 * u, y + 2.6 * u); ctx.lineTo(x + 4 * u, y + 2.6 * u);
      ctx.stroke();
      break;
    case 'hotel': { // star
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 1.9 * u : 4.4 * u;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'sofa':
      ctx.moveTo(x - 4.2 * u, y - 0.5 * u); ctx.lineTo(x - 4.2 * u, y + 3 * u);
      ctx.moveTo(x + 4.2 * u, y - 0.5 * u); ctx.lineTo(x + 4.2 * u, y + 3 * u);
      ctx.moveTo(x - 4.2 * u, y + 1.6 * u); ctx.lineTo(x + 4.2 * u, y + 1.6 * u);
      ctx.moveTo(x - 2.8 * u, y - 0.4 * u); ctx.lineTo(x - 2.8 * u, y - 2.8 * u); ctx.lineTo(x + 2.8 * u, y - 2.8 * u); ctx.lineTo(x + 2.8 * u, y - 0.4 * u);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** A small standalone canvas with one glyph, for DOM panels. */
export function glyphCanvas(kind: PlaceKind, size = 34): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawPlaceGlyph(ctx, kind, size / 2, size / 2, size / 2 - 3);
  return c;
}
