import { ITEMS, MARKET } from '../config';
import type { Rng } from './walker';

export type Item = (typeof ITEMS)[number];
export interface Owned { item: Item; paid: number }
export interface Deal { item: Item; price: number; done: boolean }

/**
 * Every MARKET.interval seconds someone sells a random object and someone
 * else wants one. Both deals stay open for MARKET.window seconds.
 */
export class Market {
  offer: Deal | null = null;
  demand: Deal | null = null;
  openUntil = 0;
  private nextAt = MARKET.firstAt;

  constructor(private rng: Rng) {}

  get open() { return this.offer !== null; }

  /** Seconds left in the current window, as a 0–1 fraction. */
  remaining(time: number) { return this.open ? Math.max(0, (this.openUntil - time) / MARKET.window) : 0; }

  update(time: number, inventory: Owned[]) {
    if (this.open && time > this.openUntil) { this.offer = this.demand = null; }
    if (time < this.nextAt) return;
    this.nextAt = time + MARKET.interval;
    const pick = () => ITEMS[Math.floor(this.rng() * ITEMS.length)];
    const price = (base: number, lo: number, hi: number) => Math.max(1, Math.round(base * (lo + this.rng() * (hi - lo))));
    const offerItem = pick();
    // the buyer sometimes wants exactly what you carry, so selling is possible
    const wanted = inventory.length && this.rng() < MARKET.wantsOwnedChance
      ? inventory[Math.floor(this.rng() * inventory.length)].item
      : pick();
    this.offer = { item: offerItem, price: price(offerItem.base, MARKET.buyMin, MARKET.buyMax), done: false };
    this.demand = { item: wanted, price: price(wanted.base, MARKET.sellMin, MARKET.sellMax), done: false };
    this.openUntil = time + MARKET.window;
  }
}
