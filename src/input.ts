import { INPUT, TOUCH } from './config';
import type { Dir4 } from './game/player';

const KEYS: Record<string, Dir4> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

/**
 * Arrow keys / WASD, swipes anywhere on the play area, and taps: a tap turns
 * the dot towards the tapped spot (the dominant direction from the dot).
 */
export function bindInput(target: HTMLElement, onDir: (d: Dir4) => void, playerScreenPos: () => { x: number; y: number } | null) {
  window.addEventListener('keydown', (e) => {
    const d = KEYS[e.key];
    if (d) { e.preventDefault(); onDir(d); }
  });

  // Swipe: a direction fires as soon as the finger has travelled far enough,
  // and the origin resets, so one continuous gesture can queue several turns.
  let origin: { x: number; y: number; id: number } | null = null;
  let start: { x: number; y: number; t: number; swiped: boolean } | null = null;
  target.addEventListener('pointerdown', (e) => {
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    start = { x: e.clientX, y: e.clientY, t: performance.now(), swiped: false };
    target.setPointerCapture(e.pointerId);
  });
  target.addEventListener('pointermove', (e) => {
    if (!origin || e.pointerId !== origin.id) return;
    const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    if (Math.hypot(dx, dy) < INPUT.swipeThreshold) return;
    onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (start) start.swiped = true;
  });
  const end = (e: PointerEvent) => {
    if (origin?.id !== e.pointerId) return;
    origin = null;
    const s = start;
    start = null;
    if (!TOUCH.tapToSteer || !s || s.swiped || e.type === 'pointercancel') return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TOUCH.tapMaxMove || performance.now() - s.t > TOUCH.tapMaxTime) return;
    const me = playerScreenPos();
    if (!me) return;
    const dx = e.clientX - me.x, dy = e.clientY - me.y;
    if (Math.hypot(dx, dy) < 10) return; // tapping the dot itself does nothing
    onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}
