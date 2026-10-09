import {
  BAD_GUYS, BARS, BEGGARS, DOG_POOP, GAME, ILLNESS, INTERACT, MEDICINE, NPC, SEX_WORKERS, SLEEP, SLEEP_KINDS, SLEEP_THEFT,
  TOURISTS, WATER,
} from '../config';
import { dist, type Vec } from '../geo';
import type { Departure, Edge, Graph } from '../map/graph';
import { npcDistance, spawnNpcs, updateNpc, wander, type Npc } from './npcs';
import { DIR_VEC, Player, type Dir4 } from './player';
import { buildPlaces, isSleep, type Place } from './places';
import { matchDirection, type Rng } from './walker';

export type BarKey = 'hunger' | 'thirst' | 'energy' | 'health';
export type DeathCause = 'hunger' | 'thirst' | 'energy' | 'broke' | 'beaten' | 'poisoning' | 'infection';
export type Ending =
  | { kind: 'death'; cause: DeathCause }
  | { kind: 'win' | 'poorer'; via: string };

export interface Toast { text: string; tone: 'good' | 'bad' | 'info'; at: number }
export interface Poop { id: number; pos: Vec; expires: number }

/** Why a place can't be used right now (null = it can). */
export type Refusal = string | null;

/** All game rules for one run. No DOM, no drawing — main.ts and ui/ handle that. */
export class Game {
  readonly player: Player;
  readonly places: Place[];
  readonly npcs: Npc[];
  poops: Poop[] = [];
  bars: Record<BarKey, number> = { ...BARS.start };
  money: number;
  readonly startMoney: number;
  /** Seconds since entering the island. */
  time = 0;
  sleeping: { place: Place; cap: number } | null = null;
  /** Unlocked later by parties; makes the sofa cheaper. */
  hasFriend = false;
  /** Stepped in dog poop: restaurants, hostel and hotel turn you away. */
  dirty = false;
  /** Paid the infected sex worker; symptoms start after the incubation period. */
  exposedAt: number | null = null;
  /** Symptomatic infection: health drains until you buy medicine. */
  infected = false;
  /** Food poisoning from a bad meal: health drains until you buy medicine. */
  poisoned = false;
  /** Money taken by pickpockets so far (police can recover some later). */
  robbed = 0;
  invulnerableUntil = 0;
  /** Being carried along by a tour group. */
  drag: { npc: Npc; taps: number; lastEdge: Edge } | null = null;
  private dragImmuneUntil = 0;
  /** An open pay / walk-on choice. */
  offer: { npc: Npc; until: number } | null = null;
  /** The place whose action window is open. */
  near: Place | null = null;
  private nearUntil = 0;
  private nearInRange = false;
  /** When each of hunger/thirst/energy hit zero (for the death cause). */
  private emptySince: Partial<Record<BarKey, number>> = {};
  private lastHitAt = -Infinity;
  private nextPoopAt: number;
  private poopIds = 0;
  private choose: ReturnType<typeof wander>;
  ending: Ending | null = null;
  toasts: Toast[] = [];
  stats = { spent: 0, meals: 0, drinks: 0, nights: 0, hits: 0, robbed: 0, cures: 0 };

  constructor(readonly graph: Graph, startMoney: number, startNode: number, private rng: Rng) {
    this.player = new Player(graph, startNode, rng);
    this.places = buildPlaces(graph);
    this.money = this.startMoney = startMoney;
    this.npcs = spawnNpcs(graph, rng, graph.node(startNode));
    this.choose = wander(graph, rng);
    this.nextPoopAt = DOG_POOP.spawnEvery * 0.5;
  }

  /** In-game clock in minutes since midnight of day 1. */
  get clockMinutes() { return GAME.clockStartHour * 60 + this.time * GAME.clockMinutesPerSecond; }
  get invulnerable() { return this.time < this.invulnerableUntil; }

  steer(d: Dir4) {
    if (this.ending) return;
    if (this.sleeping) { this.wake(true); return; }
    if (this.drag) { this.player.queued = d; this.player.queuedAge = 0; this.wriggle(); return; }
    this.player.queue(d);
  }

  toast(text: string, tone: Toast['tone'] = 'info') { this.toasts.push({ text, tone, at: this.time }); }

  // ---------------------------------------------------------------------------
  update(dt: number) {
    if (this.ending) return;
    this.time += dt;

    this.updateBars(dt);
    for (const n of this.npcs) updateNpc(n, dt, this.choose);
    this.updatePoop();

    // movement
    if (this.drag) this.followGroup();
    else this.player.update(dt);
    if (this.player.exitedVia) {
      this.end({ kind: this.money > this.startMoney ? 'win' : 'poorer', via: this.player.exitedVia });
      return;
    }

    if (!this.sleeping) {
      this.contacts();
      this.stepInPoop();
      if (!this.drag) this.updateNearby();
    }
    if (this.offer && this.time > this.offer.until) { this.offer = null; this.toast('You walk on'); }

    if (this.bars.health <= 0) {
      const empty = (Object.entries(this.emptySince) as [DeathCause, number][]).sort((a, b) => a[1] - b[1]);
      const cause: DeathCause = this.time - this.lastHitAt < 1 ? 'beaten'
        : empty.length ? empty[0][0]
        : this.poisoned ? 'poisoning'
        : this.infected ? 'infection'
        : 'beaten';
      this.end({ kind: 'death', cause });
      return;
    }
    if (this.money <= 0) this.end({ kind: 'death', cause: 'broke' });
  }

  private updateBars(dt: number) {
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
    const vitals: BarKey[] = ['hunger', 'thirst', 'energy'];
    let empty = 0;
    for (const v of vitals) {
      if (this.bars[v] <= 0) { empty++; this.emptySince[v] ??= this.time; }
      else delete this.emptySince[v];
    }
    // illness
    if (this.exposedAt !== null && !this.infected && this.time - this.exposedAt >= ILLNESS.infectionIncubation) {
      this.infected = true;
      this.toast('You feel feverish. Some souvenirs you didn’t ask for. Find a pharmacy.', 'bad');
    }
    let drain = BARS.healthLossPerEmptyBar * empty;
    if (this.poisoned) drain += ILLNESS.poisoningDrain;
    if (this.infected) drain += ILLNESS.infectionDrain;
    if (drain) this.bars.health = clamp(this.bars.health - drain * dt);
    else if (vitals.every((v) => this.bars[v] >= BARS.healthyThreshold)) this.bars.health = clamp(this.bars.health + BARS.healthRegen * dt);
  }

  get sick() { return this.poisoned || this.infected; }

  /** What one visit to the pharmacy costs right now. */
  get medicinePrice() {
    if (!this.sick) return MEDICINE.tonicPrice;
    return (this.poisoned ? MEDICINE.poisoningCure : 0) + (this.infected ? MEDICINE.infectionCure : 0);
  }

  // ---------------------------------------------------------------------------
  // characters
  private contacts() {
    const pos = this.player.walker.pos;
    for (const n of this.npcs) {
      if (this.time < n.cooldownUntil) continue;
      if (this.drag?.npc === n) continue;
      if (npcDistance(n, pos) > n.radius) continue;
      switch (n.kind) {
        case 'beggar': {
          const toll = Math.min(BEGGARS.toll, this.money);
          this.money -= toll;
          this.stats.spent += toll;
          n.cooldownUntil = this.time + NPC.contactCooldown;
          this.toast(`A beggar holds out a cup. −€${toll}`, 'bad');
          break;
        }
        case 'sexworker':
          if (this.offer) break;
          this.offer = { npc: n, until: this.time + SEX_WORKERS.offerWindow };
          n.cooldownUntil = this.time + SEX_WORKERS.offerWindow + NPC.contactCooldown;
          break;
        case 'bad': {
          if (this.invulnerable) break;
          const def = BAD_GUYS.sizes[n.size!];
          this.bars.health = clamp(this.bars.health - def.damage);
          this.bars.energy = clamp(this.bars.energy - def.energyDrain);
          this.invulnerableUntil = this.time + BAD_GUYS.invulnerable;
          this.lastHitAt = this.time;
          this.stats.hits++;
          n.cooldownUntil = this.time + NPC.contactCooldown;
          const who = n.size === 'large' ? 'A huge thug flattens you' : n.size === 'medium' ? 'A thug shoves you hard' : 'A small-time crook elbows you';
          this.toast(`${who}. −${def.damage} health`, 'bad');
          break;
        }
        case 'tourists':
          if (this.time < this.dragImmuneUntil) break;
          n.cooldownUntil = this.time + 1;
          if (this.rng() < TOURISTS.dragChance || !this.player.walker.reverse()) this.startDrag(n);
          else { this.player.queued = null; this.toast('A tour group blocks the street'); }
          break;
      }
    }
  }

  private startDrag(n: Npc) {
    this.drag = { npc: n, taps: 0, lastEdge: n.walker.edge };
    this.player.queued = null;
    this.near = null;
    this.toast('Swept up by a tour group! Tap to wriggle free', 'bad');
  }

  private followGroup() {
    const d = this.drag!, gw = d.npc.walker, w = this.player.walker;
    if (gw.edge !== d.lastEdge) {
      // the group just passed an intersection: a queued turn may get you out
      const node = gw.edge.startNode(gw.dir);
      const q = this.player.queued;
      if (q) {
        const m = matchDirection(this.graph, node, d.lastEdge, DIR_VEC[q]);
        if (m && m.edge !== gw.edge && m.edge.kind !== 'bridge') {
          if (this.rng() < TOURISTS.turnEscapeChance) { this.escape(m); return; }
          this.toast('The crowd won’t let you through');
        }
      }
      d.lastEdge = gw.edge;
    }
    w.edge = gw.edge;
    w.s = gw.s;
    w.dir = gw.dir;
  }

  private wriggle() {
    if (!this.drag) return;
    if (++this.drag.taps >= TOURISTS.tapsToEscape) this.escape(null);
  }

  private escape(dep: Departure | null) {
    this.drag = null;
    this.dragImmuneUntil = this.time + TOURISTS.escapeImmunity;
    const w = this.player.walker;
    if (dep) {
      w.edge = dep.edge;
      w.dir = dep.dir;
      w.s = dep.dir === 1 ? 0 : dep.edge.length;
      this.player.queued = null;
    }
    this.toast('You slip out of the crowd', 'good');
  }

  get dragProgress() { return this.drag ? this.drag.taps / TOURISTS.tapsToEscape : 0; }

  acceptOffer() {
    if (!this.offer) return;
    const { npc } = this.offer;
    this.offer = null;
    if (this.money - SEX_WORKERS.price <= 0) { this.toast('You can’t afford it', 'bad'); return; }
    this.money -= SEX_WORKERS.price;
    this.stats.spent += SEX_WORKERS.price;
    this.bars.health = clamp(this.bars.health + SEX_WORKERS.healthBoost);
    if (npc.infected && this.exposedAt === null && !this.infected) this.exposedAt = this.time;
    this.toast(`A pleasant hour. −€${SEX_WORKERS.price}`, 'good');
  }

  declineOffer() {
    if (!this.offer) return;
    this.offer = null;
    this.toast('You walk on');
  }

  // ---------------------------------------------------------------------------
  // dog poop
  private updatePoop() {
    this.poops = this.poops.filter((p) => p.expires > this.time);
    if (this.time < this.nextPoopAt) return;
    this.nextPoopAt = this.time + DOG_POOP.spawnEvery;
    if (this.poops.length >= DOG_POOP.maxActive) return;
    const streets = this.graph.edges.filter((e) => e.kind === 'street');
    const me = this.player.walker.pos;
    for (let tries = 0; tries < 30; tries++) {
      const e = streets[Math.floor(this.rng() * streets.length)];
      const pos = e.pointAt(e.length * (0.15 + 0.7 * this.rng()));
      if (dist(pos, me) < DOG_POOP.minDistanceFromPlayer) continue;
      if (this.places.some((p) => dist(p.pos, pos) < 15)) continue;
      this.poops.push({ id: this.poopIds++, pos, expires: this.time + DOG_POOP.lifetime });
      return;
    }
  }

  private stepInPoop() {
    const me = this.player.walker.pos;
    const hit = this.poops.find((p) => dist(p.pos, me) < DOG_POOP.radius);
    if (!hit) return;
    this.poops = this.poops.filter((p) => p !== hit);
    if (!this.dirty) this.toast('You stepped in it. No restaurant or hotel will let you in until you wash.', 'bad');
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // places
  private updateNearby() {
    const pos = this.player.walker.pos;
    let best: Place | null = null, bd: number = INTERACT.radius;
    for (const p of this.places) {
      const d = dist(pos, p.pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      const freeWater = best.kind === 'water' && best.price === 0 && WATER.autoUseWhenFree;
      if (freeWater && !this.refusal(best) && (this.dirty || this.bars.thirst < 95)) {
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
    if (p.kind === 'pharmacy') return this.medicinePrice;
    return p.kind === 'sofa' && this.hasFriend ? SLEEP_KINDS.sofa.friendPrice : p.price;
  }

  refusal(p: Place): Refusal {
    if (this.time - p.lastUsed < INTERACT.cooldown) return 'Just been here';
    if (this.dirty && (p.kind === 'food' || p.kind === 'hostel' || p.kind === 'hotel')) return 'Too dirty';
    const price = this.priceOf(p);
    if (price > 0 && this.money - price <= 0) return 'Not enough money';
    if (p.kind === 'water' && this.bars.thirst >= 100 && !this.dirty) return 'Not thirsty';
    if (p.kind === 'food' && this.bars.hunger >= 100 && this.bars.thirst >= 100) return 'Not hungry';
    if (p.kind === 'pharmacy' && !this.sick && this.bars.health >= 100) return 'Feeling fine';
    if (isSleep(p.kind) && this.bars.energy >= SLEEP.minEnergyToSleep) return 'Not tired';
    return null;
  }

  /** The action button / Space: use the place in reach, or wriggle when dragged. */
  act() {
    if (this.ending || this.sleeping) return;
    if (this.drag) { this.wriggle(); return; }
    if (!this.near || this.refusal(this.near)) return;
    this.use(this.near);
  }

  private use(p: Place) {
    const price = this.priceOf(p);
    this.money -= price;
    this.stats.spent += price;
    p.lastUsed = this.time;
    const cost = price ? ` −€${price}` : '';
    if (p.kind === 'water') {
      if (this.dirty) {
        this.dirty = false;
        this.toast(`Washed off at ${p.name}`, 'good');
      }
      if (this.bars.thirst < 100) {
        this.bars.thirst = clamp(this.bars.thirst + p.thirst);
        this.stats.drinks++;
        this.toast(`Drank at ${p.name}${cost}`, 'good');
      }
    } else if (p.kind === 'food') {
      this.bars.hunger = clamp(this.bars.hunger + p.hunger);
      this.bars.thirst = clamp(this.bars.thirst + p.thirst);
      this.stats.meals++;
      this.toast(`${cap(p.detail)} at ${p.name}${cost}`, 'good');
      if (!this.poisoned && this.rng() < p.risk) {
        this.poisoned = true;
        this.toast('Your stomach turns. That fish was not fresh. Find a pharmacy.', 'bad');
      }
    } else if (p.kind === 'pharmacy') {
      if (this.sick) {
        const what = [this.poisoned && 'food poisoning', this.infected && 'infection'].filter(Boolean).join(' and ');
        this.poisoned = this.infected = false;
        this.exposedAt = null;
        this.stats.cures++;
        this.toast(`Medicine for ${what}${cost}. Already feeling better.`, 'good');
      } else {
        this.bars.health = clamp(this.bars.health + MEDICINE.tonicHealth);
        this.toast(`A bitter tonic${cost}. +${MEDICINE.tonicHealth} health`, 'good');
      }
    } else {
      this.sleeping = { place: p, cap: SLEEP_KINDS[p.kind].maxEnergy };
      const w = this.player.walker;
      w.moving = false;
      // lie down exactly on the bench/bed
      w.edge = p.edge;
      w.s = p.s;
      if (!w.edge.canTravel(w.dir)) w.dir = w.dir === 1 ? -1 : 1;
      this.player.queued = null;
      this.offer = null;
      this.stats.nights++;
      this.toast(`Lying down: ${p.name}${cost}`, 'info');
    }
    this.near = null;
  }

  wake(early: boolean) {
    if (!this.sleeping) return;
    const kind = this.sleeping.place.kind;
    this.sleeping = null;
    this.player.walker.moving = true;
    this.toast(early ? 'You get up, still yawning' : 'You wake up rested', 'info');
    if (this.rng() < (SLEEP_THEFT.chance[kind] ?? 0)) {
      const share = SLEEP_THEFT.shareMin + this.rng() * (SLEEP_THEFT.shareMax - SLEEP_THEFT.shareMin);
      const lost = Math.floor(this.money * share);
      if (lost > 0) {
        this.money -= lost;
        this.robbed += lost;
        this.stats.robbed += lost;
        this.toast(`Your pockets feel lighter. Pickpocketed: −€${lost}`, 'bad');
      }
    }
  }

  private end(e: Ending) {
    this.ending = e;
    this.sleeping = null;
    this.near = null;
    this.offer = null;
    this.drag = null;
  }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
