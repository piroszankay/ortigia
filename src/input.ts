import { INPUT } from './config';
import type { Dir4 } from './game/player';

const KEYS: Record<string, Dir4> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

/** Arrow keys / WASD and swipes (anywhere on the play area) → queued directions. */
export function bindInput(target: HTMLElement, onDir: (d: Dir4) => void) {
  window.addEventListener('keydown', (e) => {
    const d = KEYS[e.key];
    if (d) { e.preventDefault(); onDir(d); }
  });

  // Swipe: a direction fires as soon as the finger has travelled far enough,
  // and the origin resets, so one continuous gesture can queue several turns.
  let origin: { x: number; y: number; id: number } | null = null;
  target.addEventListener('pointerdown', (e) => {
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    target.setPointerCapture(e.pointerId);
  });
  target.addEventListener('pointermove', (e) => {
    if (!origin || e.pointerId !== origin.id) return;
    const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    if (Math.hypot(dx, dy) < INPUT.swipeThreshold) return;
    onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  const end = (e: PointerEvent) => { if (origin?.id === e.pointerId) origin = null; };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}
