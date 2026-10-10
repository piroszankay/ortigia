import { BARS, HUD_LOG } from '../config';
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
  private bag: HTMLElement;
  private lastBag = '';
  private news: HTMLElement;
  private last = '';

  constructor(private el: HTMLElement) {
    el.innerHTML = `
      <div class="hud-top">
        <span class="hud-title">Ortigia</span>
        <span class="money"><b class="money-now">€0</b><small class="money-start"></small></span>
        <span class="clock"></span>
        <span class="hud-btns"><button class="hud-btn mute" type="button" aria-label="Sound on/off"></button><button class="hud-btn pause" type="button" aria-label="Pause">❚❚</button></span>
      </div>
      <div class="bars">${BAR_LABELS.map(([k, l]) => `
        <div class="bar bar-${k}"><span class="lbl">${l}</span><div class="track"><div class="fill"></div></div></div>`).join('')}
      </div>
      <div class="bag"><span class="lbl">Bag</span><span class="bag-items"></span></div>
      <div class="status-row"><div class="status"></div><div class="news" aria-live="polite"></div></div>`;
    this.money = el.querySelector('.money-now')!;
    this.start = el.querySelector('.money-start')!;
    this.clock = el.querySelector('.clock')!;
    this.status = el.querySelector('.status')!;
    this.bag = el.querySelector('.bag-items')!;
    this.news = el.querySelector('.news')!;
    for (const [k] of BAR_LABELS) {
      const bar = el.querySelector<HTMLElement>(`.bar-${k}`)!;
      this.bars.set(k, bar);
      this.fills.set(k, bar.querySelector('.fill')!);
    }
  }

  /**
   * Messages live in the HUD, never on the map: phones show the newest one
   * on a single line, the desktop sidebar keeps a short log.
   */
  message(text: string, tone: string) {
    const el = document.createElement('div');
    el.className = `msg ${tone}`;
    el.textContent = text;
    this.news.prepend(el);
    while (this.news.children.length > HUD_LOG.keep) this.news.lastChild!.remove();
    setTimeout(() => el.classList.add('old'), HUD_LOG.fadeAfter * 1000);
  }

  /** Wire the mute and pause buttons. */
  bindButtons(onMute: () => boolean, onPause: () => void, muted: boolean) {
    const mute = this.el.querySelector<HTMLButtonElement>('.mute')!;
    const pause = this.el.querySelector<HTMLButtonElement>('.pause')!;
    const label = (m: boolean) => { mute.textContent = m ? '♪̸' : '♪'; mute.classList.toggle('off', m); };
    label(muted);
    mute.onclick = () => label(onMute());
    pause.onclick = onPause;
  }

  clearMessages() { this.news.innerHTML = ''; }

  update(game: Game | null) {
    if (!game) { this.el.classList.add('idle'); return; }
    this.el.classList.remove('idle');
    for (const [k] of BAR_LABELS) {
      const v = game.bars[k];
      this.fills.get(k)!.style.transform = `scaleX(${Math.max(0, v) / 100})`;
      this.bars.get(k)!.classList.toggle('warn', v <= BARS.warnAt);
    }
    // the bag: every item with what you paid for it
    const bag = game.inventory.map((o) => `<span><span class="full">${o.item.name}</span><span class="short">${o.item.short}</span> <b>€${o.paid}</b></span>`).join('<i> · </i>') || '<span class="empty">empty</span>';
    if (bag !== this.lastBag) { this.bag.innerHTML = bag; this.lastBag = bag; }
    const m = Math.round(game.money);
    const key = `${m}|${Math.floor(game.clockMinutes)}|${game.sleeping ? 1 : 0}|${game.dirty ? 1 : 0}|${game.robbed}|${game.drag ? 1 : 0}|${game.poisoned ? 1 : 0}|${game.infected ? 1 : 0}|${game.criminal ? 1 : 0}|${game.spareDrink ? 1 : 0}|${game.hasFriend ? 1 : 0}`;
    if (key === this.last) return;
    this.last = key;
    this.money.textContent = `€${m}`;
    this.money.className = `money-now ${m > game.startMoney ? 'up' : m < game.startMoney ? 'down' : ''}`;
    this.start.textContent = `arrived with €${game.startMoney}`;
    this.clock.textContent = formatClock(game.clockMinutes);
    const chips: string[] = [];
    if (game.sleeping) chips.push('<span class="chip sleep">asleep</span>');
    if (game.drag) chips.push('<span class="chip dragged">in a tour group</span>');
    if (game.spareDrink) chips.push('<span class="chip drink">spare drink</span>');
    if (game.hasFriend) chips.push('<span class="chip friend">friend</span>');
    if (game.criminal) chips.push('<span class="chip wanted">criminal</span>');
    if (game.dirty) chips.push('<span class="chip dirty">dirty shoes</span>');
    if (game.poisoned) chips.push('<span class="chip sick">food poisoning</span>');
    if (game.infected) chips.push('<span class="chip sick">infected</span>');
    if (game.robbed > 0) chips.push(`<span class="chip robbed">robbed €${game.robbed}</span>`);
    this.status.innerHTML = chips.join('');
  }
}

export function formatClock(min: number) {
  const day = Math.floor(min / 1440) + 1;
  const h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60);
  return `${day > 1 ? `Day ${day} · ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
