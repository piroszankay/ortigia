import type { Game } from '../game/game';

/**
 * The market: a small panel with one thing for sale and one thing wanted,
 * open for MARKET.window seconds every minute. It also shows your bag.
 */
export class MarketPanel {
  private key = '';
  private buyBtn: HTMLButtonElement | null = null;
  private sellBtn: HTMLButtonElement | null = null;
  private bar: HTMLElement | null = null;

  constructor(private el: HTMLElement, private onBuy: () => void, private onSell: () => void) {}

  update(game: Game | null) {
    if (!game || game.ending) { this.el.hidden = true; this.key = ''; return; }
    const m = game.market;
    const open = m.open && game.time <= m.openUntil;
    if (!open) { this.el.hidden = true; this.key = ''; return; }

    const key = `${m.offer?.item.id}|${m.offer?.price}|${m.demand?.item.id}|${m.demand?.price}`;
    if (key !== this.key) {
      this.key = key;
      const deals = open && m.offer && m.demand ? `
        <div class="mk-head">Market <span class="mk-hint">a seller and a buyer, briefly</span></div>
        <div class="mk-deals">
          <button class="mk-deal buy" type="button"><span class="mk-lbl">For sale</span><b>${m.offer.item.name}</b><span class="mk-price"></span></button>
          <button class="mk-deal sell" type="button"><span class="mk-lbl">Wanted</span><b>${m.demand.item.name}</b><span class="mk-price"></span></button>
        </div>
        <div class="mk-bar"></div>` : '';
      this.el.innerHTML = deals;
      this.buyBtn = this.el.querySelector('.buy');
      this.sellBtn = this.el.querySelector('.sell');
      this.bar = this.el.querySelector('.mk-bar');
      const bind = (b: HTMLButtonElement | null, f: () => void) => {
        if (b) b.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); if (!b.disabled) f(); };
      };
      bind(this.buyBtn, this.onBuy);
      bind(this.sellBtn, this.onSell);
    }
    if (open && m.offer && m.demand) {
      const setPrice = (b: HTMLButtonElement | null, text: string) => {
        const el = b?.querySelector('.mk-price');
        if (el && el.textContent !== text) el.textContent = text;
      };
      if (this.buyBtn) {
        const broke = game.money - m.offer.price <= 0;
        this.buyBtn.disabled = m.offer.done || broke;
        setPrice(this.buyBtn, m.offer.done ? 'Bought' : broke ? `Can't afford €${m.offer.price}` : `Buy · €${m.offer.price}`);
      }
      if (this.sellBtn) {
        this.sellBtn.disabled = !game.canSell;
        setPrice(this.sellBtn, m.demand.done ? 'Sold' : game.canSell ? `Sell · €${m.demand.price}` : `Not in your bag · €${m.demand.price}`);
      }
      if (this.bar) this.bar.style.transform = `scaleX(${m.remaining(game.time)})`;
    }
    this.el.hidden = false;
  }
}
