import { SLEEP_KINDS } from '../config';
import type { Game } from '../game/game';
import { isSleep, type Place } from '../game/places';
import { glyphCanvas } from '../render/glyphs';

/** The bottom card: "Eat · €9" while you pass a place, "Wake up" while asleep. */
export class ActionCard {
  private shownKey = '';
  private btn!: HTMLButtonElement;
  private timer!: HTMLElement;

  constructor(private el: HTMLElement, private onAct: () => void, private onWake: () => void) {}

  update(game: Game | null) {
    if (!game || game.ending) return this.hide();
    if (game.sleeping) {
      const { place, cap } = game.sleeping;
      this.show(`sleep:${place.id}`, place, `${place.name}`, `Energy ${Math.floor(game.bars.energy)} / ${cap}`, 'Wake up', null, this.onWake);
      this.timer.style.transform = 'scaleX(1)';
      return;
    }
    const p = game.near;
    if (!p) return this.hide();
    const refusal = game.refusal(p);
    const price = game.priceOf(p);
    this.show(`near:${p.id}:${refusal}:${price}`, p, p.name, describe(p), verb(p, price), refusal, this.onAct);
    this.timer.style.transform = `scaleX(${game.nearWindow})`;
  }

  private show(key: string, p: Place, title: string, sub: string, label: string, refusal: string | null, onClick: () => void) {
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.el.innerHTML = `
        <div class="ac-glyph"></div>
        <div class="ac-info"><b>${title}</b><span>${sub}</span></div>
        <button class="ac-btn" type="button"></button>
        <div class="ac-timer"></div>`;
      this.el.querySelector('.ac-glyph')!.appendChild(glyphCanvas(p.kind));
      this.btn = this.el.querySelector('.ac-btn')!;
      this.timer = this.el.querySelector('.ac-timer')!;
      this.btn.textContent = refusal ?? label;
      this.btn.disabled = !!refusal;
      this.btn.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); if (!this.btn.disabled) onClick(); };
    } else {
      // sleeping text changes every frame; avoid rebuilding the DOM
      const span = this.el.querySelector('.ac-info span');
      if (span && span.textContent !== sub) span.textContent = sub;
    }
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
    const safety = k.safety >= 0.9 ? 'safe' : k.safety >= 0.5 ? 'fairly safe' : 'not safe';
    return `${k.label} · ${comfort} · ${safety}`;
  }
  const fx = [p.hunger && `+${p.hunger} food`, p.thirst && `+${p.thirst} water`].filter(Boolean).join(' ');
  return `${p.detail} · ${fx}`;
}
