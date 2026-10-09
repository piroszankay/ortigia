// Headless sanity check of the street graph and movement rules.
//   npm run test:sim
import { readFileSync } from 'node:fs';
import { Graph } from '../src/map/graph';
import type { MapData } from '../src/map/types';
import { Player, type Dir4 } from '../src/game/player';
import { mulberry32 } from '../src/rng';

const graph = new Graph(JSON.parse(readFileSync('src/map/ortigia-map.json', 'utf8')) as MapData);
let failures = 0;
const fail = (m: string) => { failures++; console.error('FAIL', m); };

// 1. every node can reach an exit and be reached from the arrival node (strong connectivity)
const reach = (from: number, rev: boolean) => {
  const seen = new Set([from]), st = [from];
  while (st.length) {
    const v = st.pop()!;
    for (const e of graph.edges) {
      const steps: [number, number][] = [];
      if (e.canTravel(1)) steps.push(rev ? [e.b, e.a] : [e.a, e.b]);
      if (e.canTravel(-1)) steps.push(rev ? [e.a, e.b] : [e.b, e.a]);
      for (const [x, y] of steps) if (x === v && !seen.has(y)) { seen.add(y); st.push(y); }
    }
  }
  return seen;
};
const fwd = reach(0, false), back = reach(0, true);
if (fwd.size !== graph.nodes.length || back.size !== graph.nodes.length) fail(`graph not strongly connected (${fwd.size}/${back.size}/${graph.nodes.length})`);
else console.log(`ok: strongly connected, ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.exits.length} exits`);

// 2. random play: never travel a one-way the wrong way; dot never stops before an exit
const dirs: Dir4[] = ['up', 'down', 'left', 'right'];
const visited = new Set<number>();
let exits = 0;
const step = 1 / 60;
for (let seed = 1; seed <= 40; seed++) {
  const rng = mulberry32(seed);
  const start = graph.edges.find((e) => e.kind === 'bridge')!;
  const startNode = graph.node(start.a).exit ? start.b : start.a;
  const p = new Player(graph, startNode, rng);
  for (let t = 0; t < 600 / step; t++) {
    if (rng() < 0.01) p.queue(dirs[Math.floor(rng() * 4)]);
    const before = p.walker.pos;
    p.update(step);
    const w = p.walker;
    visited.add(w.edge.id);
    if (!w.edge.canTravel(w.dir)) { fail(`seed ${seed}: travelling one-way ${w.edge.id} backwards`); break; }
    if (p.exitedVia) { exits++; break; }
    const moved = Math.hypot(w.pos.x - before.x, w.pos.y - before.y);
    if (!w.moving || moved < 1e-6) { fail(`seed ${seed}: player stopped at t=${(t * step).toFixed(1)}`); break; }
  }
}
console.log(`ok: ${exits}/40 random walks reached an exit within 10 min; ${visited.size}/${graph.edges.length} streets visited`);
if (failures) process.exit(1);

// 3. survival rules
import { Game } from '../src/game/game';
import { BAD_GUYS, BEGGARS, CATS, FISHING, ILLNESS, MARKET, MEDICINE, MIKATU, POLICE, SEX_WORKERS, SLEEP_KINDS, TOURISTS } from '../src/config';
{
  const start = graph.edges.find((e) => e.kind === 'bridge')!;
  const startNode = graph.node(start.a).exit ? start.b : start.a;
  const mk = (money: number, seed = 7) => new Game(graph, money, startNode, mulberry32(seed));

  // eating
  let g = mk(80);
  const food = g.places.find((p) => p.kind === 'food')!;
  g.bars.hunger = 10;
  g.near = food; g.act();
  if (g.money !== 80 - food.price || g.bars.hunger !== 10 + food.hunger) fail('eating did not charge / feed');
  // can't spend your last euro
  g = mk(food.price);
  g.bars.hunger = 10; g.near = food;
  if (!g.refusal(food)) fail('should refuse when the meal would take money to 0');
  // sleeping: dot stops, energy fills to cap, then you wake
  g = mk(200);
  const hotel = g.places.find((p) => p.kind === 'hotel')!;
  g.bars.energy = 20; g.near = hotel; g.act();
  if (!g.sleeping || g.player.walker.moving) fail('hotel did not put you to sleep');
  const before = g.player.walker.pos;
  let after = before;
  for (let i = 0; i < 60 * 30 && g.sleeping; i++) { after = g.player.walker.pos; g.update(step); }
  if (g.sleeping || Math.abs(g.bars.energy - SLEEP_KINDS.hotel.maxEnergy) > 1e-6) fail(`did not wake at full energy (${g.bars.energy})`);
  if (before.x !== after.x || before.y !== after.y) fail('moved while asleep');
  // neglect kills: no input for a long time
  const causes: Record<string, number> = {};
  for (let seed = 1; seed <= 20; seed++) {
    g = mk(60, seed);
    for (let i = 0; i < 60 * 60 * 30 && !g.ending; i++) g.update(step);
    const k = g.ending ? (g.ending.kind === 'death' ? g.ending.cause : g.ending.kind) : 'alive';
    causes[k] = (causes[k] ?? 0) + 1;
  }
  console.log('ok: survival rules; hands-off outcomes over 20 runs:', JSON.stringify(causes));

  // 4. characters & hazards (Milestone 3)
  const at = (g: Game, kind: string) => g.npcs.find((n) => n.kind === kind)!;
  const moveTo = (g: Game, n: { walker: { edge: any; s: number; dir: 1 | -1 } }) => {
    const w = g.player.walker; w.edge = n.walker.edge; w.s = n.walker.s; w.dir = n.walker.dir;
  };
  const freeze = (g: Game) => { for (const n of g.npcs) n.walker.speed = 0; };
  // beggar takes the toll once, then cools down
  g = mk(50); freeze(g);
  moveTo(g, at(g, 'beggar')); g.player.walker.speed = 0;
  g.update(step); g.update(step);
  if (g.money !== 50 - BEGGARS.toll) fail(`beggar toll wrong: ${g.money}`);
  // beggar can bankrupt you
  g = mk(2); freeze(g); moveTo(g, at(g, 'beggar')); g.player.walker.speed = 0;
  g.update(step);
  if (g.ending?.kind !== 'death' || g.ending.cause !== 'broke') fail('beggar should be able to break you');
  // bad guy hurts, then you're invulnerable
  g = mk(50); freeze(g);
  const thug = g.npcs.find((n) => n.kind === 'bad' && n.size === 'large')!;
  moveTo(g, thug); g.player.walker.speed = 0;
  g.update(step);
  const h1 = g.bars.health;
  if (h1 > 100 - BAD_GUYS.sizes.large.damage + 1) fail('large thug did no damage');
  thug.cooldownUntil = 0; g.update(step);
  if (g.bars.health < h1 - 0.1) fail('hit again while invulnerable');
  // sex worker offer; paying the infected one exposes you
  g = mk(100); freeze(g);
  const sw = g.npcs.find((n) => n.kind === 'sexworker' && n.infected)!;
  moveTo(g, sw); g.player.walker.speed = 0; g.update(step);
  if (!g.offer) fail('no offer from sex worker');
  g.acceptOffer();
  if (g.exposedAt === null || g.money !== 100 - SEX_WORKERS.price) fail('accepting the offer did not charge/expose');
  // tourists: forced drag, wriggle free with taps
  g = mk(100, 3); freeze(g);
  const grp = at(g, 'tourists');
  (g as any).startDrag(grp);
  for (let i = 0; i < TOURISTS.tapsToEscape; i++) g.act();
  if (g.drag) fail('tapping did not free you from the tour group');
  // dog poop: dirty → refused → wash
  g = mk(100); freeze(g);
  g.poops.push({ id: 99, pos: g.player.walker.pos, expires: 1e9 });
  g.update(step);
  if (!g.dirty) fail('poop did not make you dirty');
  if (g.refusal(g.places.find((p) => p.kind === 'food')!) !== 'Too dirty') fail('restaurant let a dirty traveller in');
  const fountain = g.places.find((p) => p.kind === 'water')!;
  g.near = fountain; (g as any).use(fountain);
  if (g.dirty) fail('fountain did not wash you');
  // bench pickpocket with a rigged dice
  g = new Game(graph, 100, startNode, () => 0);
  const bench = g.places.find((p) => p.kind === 'bench')!;
  g.bars.energy = 10; g.near = bench; g.act(); g.wake(true);
  if (!(g.robbed > 0 && g.money < 100)) fail('bench theft did not happen with a rigged roll');
  // tourists never leave via bridges; characters respect one-ways
  g = mk(100, 11);
  for (let i = 0; i < 60 * 300; i++) {
    g.update(step);
    if (g.ending) break;
    for (const n of g.npcs) {
      if (!n.walker.edge.canTravel(n.walker.dir)) { fail(`${n.kind} going the wrong way down a one-way`); break; }
      if (n.walker.edge.kind === 'bridge') { fail(`${n.kind} on a bridge`); break; }
    }
  }
  console.log('ok: characters & hazards');

  // 5. health events (Milestone 4)
  const quiet = (g: Game) => { g.npcs.length = 0; g.player.walker.speed = 0; };
  // bad fish with a rigged roll → poisoned → health drains → pharmacy cures
  g = new Game(graph, 100, startNode, () => 0.001); quiet(g);
  const fish = g.places.find((p) => p.kind === 'food')!;
  g.bars.hunger = 20; g.near = fish; g.act();
  if (!g.poisoned) fail('rigged bad fish did not poison');
  const hp0 = g.bars.health;
  for (let i = 0; i < 60 * 5; i++) g.update(step);
  if (!(g.bars.health < hp0 - ILLNESS.poisoningDrain * 4)) fail('poisoning did not drain health');
  const pharmacy = g.places.find((p) => p.kind === 'pharmacy')!;
  const before4 = g.money;
  g.near = pharmacy; g.act();
  if (g.poisoned || g.money !== before4 - MEDICINE.poisoningCure) fail('pharmacy did not cure poisoning at the right price');
  // infection: silent during incubation, then drains; medicine price includes both cures
  g = mk(200); quiet(g);
  g.offer = { npc: { infected: true } as any, until: 1e9 };
  g.acceptOffer();
  for (let i = 0; i < 60 * (ILLNESS.infectionIncubation - 1); i++) g.update(step);
  if (g.infected) fail('infection showed before incubation ended');
  for (let i = 0; i < 60 * 2; i++) g.update(step);
  if (!g.infected) fail('infection never showed');
  g.poisoned = true;
  if (g.medicinePrice !== MEDICINE.poisoningCure + MEDICINE.infectionCure) fail('medicine price wrong');
  // left untreated, poisoning kills with the right cause
  g = mk(500); quiet(g); g.poisoned = true;
  g.bars.hunger = g.bars.thirst = g.bars.energy = 100;
  for (let i = 0; i < 60 * 600 && !g.ending; i++) { g.bars.hunger = g.bars.thirst = 100; g.bars.energy = 100; g.update(step); }
  if (g.ending?.kind !== 'death' || g.ending.cause !== 'poisoning') fail(`untreated poisoning ending: ${JSON.stringify(g.ending)}`);
  console.log('ok: health events');

  // Mikatu: everything to 100, health up to the floor (never down), €12
  g = mk(100); quiet(g);
  const mikatu = g.places.find((p) => p.kind === 'haven')!;
  g.bars = { hunger: 10, thirst: 5, energy: 20, health: 30 };
  g.near = mikatu; g.act();
  if (g.money !== 100 - MIKATU.price || g.bars.hunger !== 100 || g.bars.thirst !== 100 || g.bars.energy !== 100 || g.bars.health !== MIKATU.healthFloor)
    fail(`Mikatu wrong: ${JSON.stringify(g.bars)} €${g.money}`);
  g = mk(100); quiet(g); g.bars.health = 80; g.bars.hunger = 10;
  g.near = mikatu; g.act();
  if (g.bars.health < 80) fail('Mikatu lowered health');
  console.log('ok: Mikatu');

  // 6. economy (Milestone 5)
  // fishing: dot stops, a fish is sold after the wait, the spot then needs a rest
  g = mk(50); quiet(g);
  const spot = g.places.find((p) => p.kind === 'fishing')!;
  g.near = spot; g.act();
  if (!g.fishing || g.player.walker.moving) fail('casting did not stop you');
  for (let i = 0; i < 60 * (FISHING.waitMax + 0.5) && g.fishing; i++) g.update(step);
  if (g.fishing || g.money <= 50 || g.stats.fish !== 1) fail(`no fish sold (money ${g.money})`);
  if (g.refusal(spot) !== 'Fish need a rest') fail('fishing spot did not need a rest');
  // pickpocketing → criminal; police on your street segment → fined and cleared
  g = mk(100); quiet(g);
  g.npcs.push(...new Game(graph, 100, startNode, mulberry32(5)).npcs);
  for (const n of g.npcs) n.walker.speed = 0;
  const tg = at(g, 'tourists');
  moveTo(g, tg);
  if (!g.pickable) fail('tour group next to you should be pickable');
  g.pickpocket();
  if (!g.criminal || g.money <= 100) fail('pickpocketing did not pay / make you a criminal');
  const cop = at(g, 'police');
  const loot = g.money;
  moveTo(g, cop); cop.walker.s = (cop.walker.s + cop.walker.edge.length / 2) % cop.walker.edge.length; // same segment, not touching
  g.update(step);
  if (g.criminal || g.money !== loot - Math.floor(loot * POLICE.caughtFineShare)) fail(`police did not fine you (money ${g.money})`);
  // game-over variant
  (POLICE as any).caughtGameOver = true;
  g.criminal = true; g.update(step);
  if (g.ending?.kind !== 'arrested') fail('caughtGameOver did not end the game');
  (POLICE as any).caughtGameOver = false;
  // police recover part of what was stolen in your sleep
  g = mk(100); quiet(g);
  g.npcs.push(...new Game(graph, 100, startNode, mulberry32(5)).npcs.filter((n) => n.kind === 'police'));
  for (const n of g.npcs) n.walker.speed = 0;
  g.robbed = 40;
  moveTo(g, at(g, 'police')); g.update(step);
  if (g.robbed !== 0 || g.money !== 100 + Math.round(40 * POLICE.recoverShare)) fail('police did not recover stolen money');
  // a fed cat clears your record
  g = mk(100); quiet(g); g.criminal = true;
  const cat = g.cats[0];
  g.near = cat; g.act();
  if (g.criminal || g.money !== 100 - CATS.feedPrice) fail('feeding the cat did not clear the record');
  // market: buy, then sell to a buyer who wants it
  g = mk(200); quiet(g);
  for (let i = 0; i < 60 * (MARKET.firstAt + 0.1); i++) g.update(step);
  if (!g.market.open) fail('market did not open');
  const offer = g.market.offer!;
  g.buy();
  if (g.inventory.length !== 1 || g.money !== 200 - offer.price) fail('buying failed');
  g.market.demand = { item: offer.item, price: offer.price + 10, done: false };
  if (!g.canSell) fail('should be able to sell what you own');
  g.sell();
  if (g.inventory.length !== 0 || g.money !== 200 + 10) fail(`selling failed (money ${g.money})`);
  // window closes
  for (let i = 0; i < 60 * (MARKET.window + 0.5); i++) g.update(step);
  if (g.market.open) fail('market window did not close');
  console.log('ok: economy');
}
if (failures) process.exit(1);
