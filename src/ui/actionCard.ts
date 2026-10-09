import { SEX_WORKERS, SLEEP_KINDS, SLEEP_THEFT } from '../config';
import type { Game } from '../game/game';
import { isSleep, type Place } from '../game/places';
import { drawHeart, drawTouristIcon } from '../render/actors';
import { glyphCanvas, iconCanvas } from '../render/glyphs';

export interface CardActions {
  act: () => void;
  wake: () => void;
  accept: () => void;
  decline: () => void;
}
interface Btn { label: string; onClick: () => void; disabled?: boolean; quiet?: boolean }

/**
 * The bottom card. In priority order: a pay/walk-on offer, being dragged by
 * tourists, sleeping, then the place you are passing.
 */
export class ActionCard {
  private shownKey = '';
  private timer: HTMLElement | null = null;
  private sub: HTMLElement | null = null;

  constructor(private el: HTMLElement, private a: CardActions) {}

  update(game: Game | null) {
    if (!game || game.ending) return this.hide();
    if (game.offer) {
      const left = Math.max(0, (game.offer.until - game.time) / SEX_WORKERS.offerWindow);
      this.show('offer', () => iconCanvas(drawHeart), 'A friendly stranger', 'Some company for an hour?', [
        { label: `Pay €${SEX_WORKERS.price}`, onClick: this.a.accept, disabled: game.money - SEX_WORKERS.price <= 0 },
        { label: 'Walk on', onClick: this.a.decline, quiet: true },
      ], left);
      return;
    }
    if (game.drag) {
      this.show('drag', () => iconCanvas((c) => drawTouristIcon(c, 0, 3), 1.15), 'Stuck in a tour group', 'Tap fast, or steer at a corner',
        [{ label: 'Wriggle!', onClick: this.a.act }], 1 - game.dragProgress);
      return;
    }
    if (game.sleeping) {
      const { place, cap } = game.sleeping;
      this.show(`sleep:${place.id}`, () => glyphCanvas(place.kind), place.name, `Energy ${Math.floor(game.bars.energy)} / ${cap}`,
        [{ label: 'Wake up', onClick: this.a.wake }], 1);
      return;
    }
    const p = game.near;
    if (!p) return this.hide();
    const refusal = game.refusal(p);
    const price = game.priceOf(p);
    this.show(`near:${p.id}:${refusal}:${price}`, () => glyphCanvas(p.kind), p.name, describe(p),
      [{ label: refusal ?? verb(p, price), onClick: this.a.act, disabled: !!refusal }], game.nearWindow);
  }

  private show(key: string, icon: () => HTMLCanvasElement, title: string, sub: string, btns: Btn[], timer: number) {
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.el.classList.toggle('two', btns.length > 1);
      this.el.innerHTML = `
        <div class="ac-glyph"></div>
        <div class="ac-info"><b></b><span></span></div>
        <div class="ac-btns"></div>
        <div class="ac-timer"></div>`;
      this.el.querySelector('.ac-glyph')!.appendChild(icon());
      this.el.querySelector('.ac-info b')!.textContent = title;
      this.sub = this.el.querySelector('.ac-info span');
      this.timer = this.el.querySelector('.ac-timer');
      const box = this.el.querySelector('.ac-btns')!;
      for (const b of btns) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `ac-btn${b.quiet ? ' quiet' : ''}`;
        el.textContent = b.label;
        el.disabled = !!b.disabled;
        // pointerdown, not click: the dot is moving and every frame counts
        el.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); if (!el.disabled) b.onClick(); };
        box.appendChild(el);
      }
    }
    if (this.sub && this.sub.textContent !== sub) this.sub.textContent = sub;
    if (this.timer) this.timer.style.transform = `scaleX(${timer})`;
    this.el.hidden = false;
  }

  private hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.shownKey = '';
  }
}

function verb(p: Place, price: number) {
  const cost = price > 0 ? ` · €${price}` : '';
  if (p.kind === 'water') return `Drink${cost}`;
  if (p.kind === 'food') return `Eat${cost}`;
  return `Sleep${cost || ' · free'}`;
}

function describe(p: Place) {
  if (isSleep(p.kind)) {
    const k = SLEEP_KINDS[p.kind];
    const comfort = k.comfort >= 14 ? 'deep sleep' : k.comfort >= 9 ? 'decent sleep' : 'poor sleep';
    const risk = SLEEP_THEFT.chance[p.kind] ?? 0;
    const safety = risk === 0 ? 'safe' : risk < 0.15 ? 'fairly safe' : 'pickpockets about';
    return `${k.label} · ${comfort} · ${safety}`;
  }
  const fx = [p.hunger && `+${p.hunger} food`, p.thirst && `+${p.thirst} water`].filter(Boolean).join(' ');
  return `${p.detail} · ${fx}`;
}
