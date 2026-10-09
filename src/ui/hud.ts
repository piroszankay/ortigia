import { BARS } from '../config';
import type { BarKey, Game } from '../game/game';

const BAR_LABELS: [BarKey, string][] = [['hunger', 'Food'], ['thirst', 'Water'], ['energy', 'Sleep'], ['health', 'Health']];

/** Money, clock, the four bars and status chips. Built once, updated every frame. */
export class Hud {
  private money: HTMLElement;
  private start: HTMLElement;
  private clock: HTMLElement;
  private fills = new Map<BarKey, HTMLElement>();
  private bars = new Map<BarKey, HTMLElement>();
  private status: HTMLElement;
  private last = '';

  constructor(private el: HTMLElement) {
    el.innerHTML = `
      <div class="hud-top">
        <span class="hud-title">Ortigia</span>
        <span class="money"><b class="money-now">€0</b><small class="money-start"></small></span>
        <span class="clock"></span>
      </div>
      <div class="bars">${BAR_LABELS.map(([k, l]) => `
        <div class="bar bar-${k}"><span class="lbl">${l}</span><div class="track"><div class="fill"></div></div></div>`).join('')}
      </div>
      <div class="status"></div>`;
    this.money = el.querySelector('.money-now')!;
    this.start = el.querySelector('.money-start')!;
    this.clock = el.querySelector('.clock')!;
    this.status = el.querySelector('.status')!;
    for (const [k] of BAR_LABELS) {
      const bar = el.querySelector<HTMLElement>(`.bar-${k}`)!;
      this.bars.set(k, bar);
      this.fills.set(k, bar.querySelector('.fill')!);
    }
  }

  update(game: Game | null) {
    if (!game) { this.el.classList.add('idle'); return; }
    this.el.classList.remove('idle');
    for (const [k] of BAR_LABELS) {
      const v = game.bars[k];
      this.fills.get(k)!.style.transform = `scaleX(${Math.max(0, v) / 100})`;
      this.bars.get(k)!.classList.toggle('warn', v <= BARS.warnAt);
    }
    const m = Math.round(game.money);
    const key = `${m}|${Math.floor(game.clockMinutes)}|${game.sleeping ? 1 : 0}`;
    if (key === this.last) return;
    this.last = key;
    this.money.textContent = `€${m}`;
    this.money.className = `money-now ${m > game.startMoney ? 'up' : m < game.startMoney ? 'down' : ''}`;
    this.start.textContent = `arrived with €${game.startMoney}`;
    this.clock.textContent = formatClock(game.clockMinutes);
    const chips: string[] = [];
    if (game.sleeping) chips.push('<span class="chip sleep">asleep</span>');
    this.status.innerHTML = chips.join('');
  }
}

export function formatClock(min: number) {
  const day = Math.floor(min / 1440) + 1;
  const h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60);
  return `${day > 1 ? `Day ${day} · ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
