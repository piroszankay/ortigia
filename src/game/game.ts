import { BARS, GAME, INTERACT, SLEEP, SLEEP_KINDS, WATER } from '../config';
import { dist } from '../geo';
import type { Graph } from '../map/graph';
import { Player, type Dir4 } from './player';
import { buildPlaces, isSleep, type Place } from './places';

export type BarKey = 'hunger' | 'thirst' | 'energy' | 'health';
export type DeathCause = 'hunger' | 'thirst' | 'energy' | 'broke';
export type Ending =
  | { kind: 'death'; cause: DeathCause }
  | { kind: 'win' | 'poorer'; via: string };

export interface Toast { text: string; tone: 'good' | 'bad' | 'info'; at: number }

/** Why a place can't be used right now (null = it can). */
export type Refusal = string | null;

/** All game rules for one run. No DOM, no drawing — main.ts and ui/ handle that. */
export class Game {
  readonly player: Player;
  readonly places: Place[];
  bars: Record<BarKey, number> = { ...BARS.start };
  money: number;
  readonly startMoney: number;
  /** Seconds since entering the island. */
  time = 0;
  sleeping: { place: Place; cap: number } | null = null;
  /** Unlocked later by parties; makes the sofa cheaper. */
  hasFriend = false;
  /** The place whose action window is open. */
  near: Place | null = null;
  private nearUntil = 0;
  private nearInRange = false;
  /** When each of hunger/thirst/energy hit zero (for the death cause). */
  private emptySince: Partial<Record<BarKey, number>> = {};
  ending: Ending | null = null;
  toasts: Toast[] = [];
  stats = { spent: 0, meals: 0, drinks: 0, nights: 0 };

  constructor(readonly graph: Graph, startMoney: number, startNode: number, rng: () => number) {
    this.player = new Player(graph, startNode, rng);
    this.places = buildPlaces(graph);
    this.money = this.startMoney = startMoney;
  }

  /** In-game clock in minutes since midnight of day 1. */
  get clockMinutes() { return GAME.clockStartHour * 60 + this.time * GAME.clockMinutesPerSecond; }

  steer(d: Dir4) {
    if (this.ending) return;
    if (this.sleeping) { this.wake(true); return; }
    this.player.queue(d);
  }

  toast(text: string, tone: Toast['tone'] = 'info') { this.toasts.push({ text, tone, at: this.time }); }

  // ---------------------------------------------------------------------------
  update(dt: number) {
    if (this.ending) return;
    this.time += dt;

    // bars
    const k = this.sleeping ? BARS.sleepDrainFactor : 1;
    this.bars.hunger = clamp(this.bars.hunger - BARS.drain.hunger * k * dt);
    this.bars.thirst = clamp(this.bars.thirst - BARS.drain.thirst * k * dt);
    if (this.sleeping) {
      const comfort = SLEEP_KINDS[this.sleeping.place.kind as keyof typeof SLEEP_KINDS].comfort;
      this.bars.energy = Math.min(this.sleeping.cap, this.bars.energy + comfort * dt);
      if (this.bars.energy >= this.sleeping.cap) this.wake(false);
    } else {
      this.bars.energy = clamp(this.bars.energy - BARS.drain.energy * dt);
    }

    // health
    const vitals: BarKey[] = ['hunger', 'thirst', 'energy'];
    let empty = 0;
    for (const v of vitals) {
      if (this.bars[v] <= 0) { empty++; this.emptySince[v] ??= this.time; }
      else delete this.emptySince[v];
    }
    if (empty) this.bars.health = clamp(this.bars.health - BARS.healthLossPerEmptyBar * empty * dt);
    else if (vitals.every((v) => this.bars[v] >= BARS.healthyThreshold)) this.bars.health = clamp(this.bars.health + BARS.healthRegen * dt);

    if (this.bars.health <= 0) {
      const cause = (Object.entries(this.emptySince) as [DeathCause, number][]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'hunger';
      this.end({ kind: 'death', cause });
      return;
    }
    if (this.money <= 0) { this.end({ kind: 'death', cause: 'broke' }); return; }

    // movement
    this.player.update(dt);
    if (this.player.exitedVia) {
      this.end({ kind: this.money > this.startMoney ? 'win' : 'poorer', via: this.player.exitedVia });
      return;
    }

    // places
    if (!this.sleeping) this.updateNearby();
  }

  private updateNearby() {
    const pos = this.player.walker.pos;
    let best: Place | null = null, bd: number = INTERACT.radius;
    for (const p of this.places) {
      const d = dist(pos, p.pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      if (best.kind === 'water' && best.price === 0 && WATER.autoUseWhenFree && !this.refusal(best) && this.bars.thirst < 95) {
        this.use(best);
        return;
      }
      this.near = best;
      this.nearInRange = true;
      this.nearUntil = this.time + INTERACT.grace;
    } else {
      this.nearInRange = false;
      if (this.time > this.nearUntil) this.near = null;
    }
  }

  /** 1 while in range, then counts down to 0 over the grace period. */
  get nearWindow() {
    return this.nearInRange ? 1 : Math.max(0, (this.nearUntil - this.time) / INTERACT.grace);
  }

  /** Current price of a place (the sofa is cheaper once you have a friend). */
  priceOf(p: Place) {
    return p.kind === 'sofa' && this.hasFriend ? SLEEP_KINDS.sofa.friendPrice : p.price;
  }

  refusal(p: Place): Refusal {
    if (this.time - p.lastUsed < INTERACT.cooldown) return 'Just been here';
    const price = this.priceOf(p);
    if (price > 0 && this.money - price <= 0) return 'Not enough money';
    if (p.kind === 'water' && this.bars.thirst >= 100) return 'Not thirsty';
    if (p.kind === 'food' && this.bars.hunger >= 100 && this.bars.thirst >= 100) return 'Not hungry';
    if (isSleep(p.kind) && this.bars.energy >= SLEEP.minEnergyToSleep) return 'Not tired';
    return null;
  }

  /** Use the place whose action window is open. */
  act() {
    if (this.ending || this.sleeping || !this.near) return;
    if (this.refusal(this.near)) return;
    this.use(this.near);
  }

  private use(p: Place) {
    const price = this.priceOf(p);
    this.money -= price;
    this.stats.spent += price;
    p.lastUsed = this.time;
    const cost = price ? ` −€${price}` : '';
    if (p.kind === 'water') {
      this.bars.thirst = clamp(this.bars.thirst + p.thirst);
      this.stats.drinks++;
      this.toast(`Drank at ${p.name}${cost}`, 'good');
    } else if (p.kind === 'food') {
      this.bars.hunger = clamp(this.bars.hunger + p.hunger);
      this.bars.thirst = clamp(this.bars.thirst + p.thirst);
      this.stats.meals++;
      this.toast(`${cap(p.detail)} at ${p.name}${cost}`, 'good');
    } else {
      this.sleeping = { place: p, cap: SLEEP_KINDS[p.kind].maxEnergy };
      const w = this.player.walker;
      w.moving = false;
      // lie down exactly on the bench/bed
      w.edge = p.edge;
      w.s = p.s;
      if (!w.edge.canTravel(w.dir)) w.dir = w.dir === 1 ? -1 : 1;
      this.player.queued = null;
      this.stats.nights++;
      this.toast(`Lying down: ${p.name}${cost}`, 'info');
    }
    this.near = null;
  }

  wake(early: boolean) {
    if (!this.sleeping) return;
    this.sleeping = null;
    this.player.walker.moving = true;
    this.toast(early ? 'You get up, still yawning' : 'You wake up rested', 'info');
  }

  private end(e: Ending) {
    this.ending = e;
    this.sleeping = null;
    this.near = null;
  }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
