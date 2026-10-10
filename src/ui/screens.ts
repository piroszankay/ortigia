import { DICE } from '../config';
import type { Ending, Game } from '../game/game';
import { play } from '../sound';
import { drawBadGuy, drawBeggar, drawHeart, drawPolice, drawPoop, drawTouristIcon } from '../render/actors';
import { drawPlaceGlyph, iconCanvas } from '../render/glyphs';
import type { PlaceKind } from '../game/places';
import { formatClock } from './hud';
import { hideOverlay, showOverlay } from './overlay';

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const dieHtml = (n: number) =>
  `<div class="die">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
const randFace = () => 1 + Math.floor(Math.random() * 6);

export function showTitle(onRolled: (money: number) => void, bridge: string) {
  showOverlay(`
    <h1>Ortigia</h1>
    <p>You arrive at the old island town of Siracusa. Survive its labyrinth, and leave with more money than you brought.</p>
    <div class="dice" aria-live="polite">${Array.from({ length: DICE.count }, () => dieHtml(randFace())).join('')}</div>
    <p class="dice-result small">Roll to see what's in your pocket.</p>
    <button id="roll" type="button">Roll the dice</button>
    <button id="howto" class="link" type="button">How to play</button>`);
  const btn = document.getElementById('roll') as HTMLButtonElement;
  const result = document.querySelector<HTMLElement>('.dice-result')!;
  const dice = document.querySelector<HTMLElement>('.dice')!;
  let rolled = false;
  const roll = () => {
    if (rolled) return;
    rolled = true;
    btn.disabled = true;
    dice.classList.add('rolling');
    play('dice');
    const faces = Array.from({ length: DICE.count }, randFace);
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t < DICE.rollTime) {
        dice.innerHTML = Array.from({ length: DICE.count }, () => dieHtml(randFace())).join('');
        setTimeout(tick, 40 + 140 * (t / DICE.rollTime) ** 2); // slows down as it settles
        return;
      }
      dice.classList.remove('rolling');
      dice.innerHTML = faces.map(dieHtml).join('');
      const pips = faces.reduce((a, b) => a + b, 0);
      const money = DICE.base + pips * DICE.perPip;
      result.classList.remove('small');
      result.innerHTML = `<span class="sum">${faces.join(' + ')} = ${pips}</span><b class="purse">€${money}</b><span class="small">€${DICE.base} + ${pips} × €${DICE.perPip}</span>`;
      btn.textContent = `Cross ${bridge}`;
      btn.disabled = false;
      btn.onclick = () => { hideOverlay(); onRolled(money); };
      btn.focus();
    };
    tick();
  };
  btn.onclick = roll;
  btn.focus();
  const how = document.getElementById('howto') as HTMLButtonElement;
  how.onclick = () => showHowTo(() => showTitle(onRolled, bridge));
  const rollWas = roll;
  btn.onclick = () => { how.hidden = true; rollWas(); };
}

const DEATHS: Record<string, [string, string]> = {
  hunger: ['Starved', 'Surrounded by the best street food in Sicily, you ate nothing. The arancini will remember you.'],
  thirst: ['Dried out', 'An island in the sea, a fountain on every other corner, and still. Fonte Aretusa sends its regards.'],
  energy: ['Collapsed', 'You fell asleep standing up and the limestone won. The pigeons have taken your spot.'],
  broke: ['Broke', 'Your wallet died first. You followed it out of solidarity.'],
  poisoning: ['Food poisoning', 'The fish was fresh once. So, briefly, were you.'],
  infection: ['Infection', 'Some souvenirs can’t be declared at customs. This one declared you.'],
  beaten: ['Beaten', 'You met the wrong man in a very picturesque alley. The tourists photographed the alley.'],
};

export function showEnding(game: Game, e: Ending, onAgain: () => void) {
  const diff = Math.round(game.money - game.startMoney);
  const clock = formatClock(game.clockMinutes);
  const stats = `<p class="stats">Arrived with €${game.startMoney} · left with €${Math.round(game.money)}<br>
    ${game.stats.meals} meals · ${game.stats.drinks} drinks · ${game.stats.nights} naps · €${game.stats.spent} spent<br>
    ${game.stats.hits} beatings · €${game.stats.robbed} pickpocketed · ${game.stats.cures} cures<br>
    €${game.stats.jobMoney} from jobs · ${game.stats.fish} fish (€${game.stats.fishMoney}) · ${game.stats.pickpockets} wallets lifted · ${game.stats.trades} trades · caught ${game.stats.caught}×<br>
    ${clock} on the clock</p>`;
  let head: string;
  if (e.kind === 'death') {
    const [title, line] = DEATHS[e.cause];
    head = `<h1 class="dead">${title}</h1><p>${line}</p>`;
  } else if (e.kind === 'arrested') {
    head = `<h1 class="dead">Arrested</h1><p>The Questura has a lovely view of the harbour. You will have plenty of time to enjoy it.</p>`;
  } else if (e.kind === 'win') {
    head = `<h1 class="won">Arrivederci</h1><p>You cross ${e.via} <b>€${diff} richer</b> than you came. Ortigia was good to you.</p>`;
  } else {
    head = `<h1>You left poorer</h1><p>You cross ${e.via} with ${diff === 0 ? 'exactly what you came with' : `<b>€${-diff} less</b> than you came with`}. At least the granita was good.</p>`;
  }
  showOverlay(`${head}${stats}<button id="again" type="button">Roll again</button>`);
  const btn = document.getElementById('again') as HTMLButtonElement;
  btn.onclick = onAgain;
  setTimeout(() => btn.focus(), 50);
}

// ---------------------------------------------------------------------------
// How to play: a visual legend plus the rules in a few lines.
type Draw = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
const place = (k: PlaceKind): Draw => (c, x, y) => drawPlaceGlyph(c, k, x, y, 6.5);
const LEGEND: [Draw, string][] = [
  [(c, x, y) => {
    c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(x, y, 7.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = '#0d1b33'; c.lineWidth = 2.4; c.beginPath(); c.arc(x, y, 5.2, 0, Math.PI * 2); c.fill(); c.stroke();
  }, '<b>You</b>, always walking'],
  [place('water'), '<b>Fountain</b>: free water, washes you'],
  [place('food'), '<b>Restaurant</b>: food & water, €'],
  [place('haven'), '<b>Mikatu</b>: all-inclusive, €12'],
  [place('pharmacy'), '<b>Pharmacy</b>: medicine'],
  [place('bench'), '<b>Bench</b>: free sleep, pickpockets'],
  [place('hostel'), '<b>Hostel</b> · ' + '<b>Hotel</b> · <b>Sofa</b>: beds'],
  [place('fishing'), '<b>Fishing spot</b>: catch & sell'],
  [place('party'), '<b>Party</b>: two drinks, make a friend'],
  [place('dishes'), '<b>Dishes</b>: €2/s, up to €20'],
  [place('busk'), '<b>Busking</b>: play for tips'],
  [(c, x, y) => {
    // a mini market panel: blue "for sale" and green "wanted" tiles on paper
    c.fillStyle = '#f6edd6'; c.strokeStyle = 'rgba(90,65,40,0.8)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x - 9, y - 7, 18, 14, 3); c.fill(); c.stroke();
    c.fillStyle = '#1d5a86'; c.beginPath(); c.roundRect(x - 7, y - 4, 6.5, 8, 1.5); c.fill();
    c.fillStyle = '#2f7a4f'; c.beginPath(); c.roundRect(x + 0.5, y - 4, 6.5, 8, 1.5); c.fill();
  }, '<b>Market</b>: every minute, buy or sell for 10 s'],
  [place('cat'), '<b>Street cat</b>: feed it to clear your record'],
  [(c, x, y) => drawBadGuy(c, x, y, 6, 0), '<b>Thug</b>: hurts; bigger hurts more'],
  [drawBeggar, '<b>Beggar</b>: takes a few euros'],
  [drawHeart, '<b>Stranger</b>: company for a price'],
  [(c, x, y) => drawTouristIcon(c, x, y + 2), '<b>Tour group</b>: blocks, drags, has wallets'],
  [(c, x, y) => drawPolice(c, x, y, false, 0), '<b>Police</b>: avoid them if you stole'],
  [drawPoop, '<b>Dog poop</b>: no restaurants until you wash'],
];

export function showHowTo(onBack: () => void) {
  try { localStorage.setItem('ortigia-howto-seen', '1'); } catch { /* ignore */ }
  showOverlay(`
    <h1>How to play</h1>
    <p class="small">Survive the island and leave by a bridge (green arrows) with more money than you arrived with.</p>
    <div class="howto-controls">
      <p><b>Steer</b>: arrow keys / WASD, swipe, or tap the map on the side you want to go. The turn happens at the next corner where it's possible. Push against your direction to turn round. Arrows on streets mean one-way.</p>
      <p><b>Act</b>: tap the card's button, or press <b>Space</b>. <b>P</b> pickpocket · <b>O</b> offer a drink · <b>1</b>/<b>2</b> buy/sell · <b>Y</b>/<b>N</b> answer · <b>Esc</b> pause.</p>
      <p>Food, water and sleep drain all the time; each one at zero costs health. Bad fish and bad company make you sick until you visit a pharmacy. Pickpocketing makes you a criminal: never share a street with the police (their streets glow red).</p>
    </div>
    <div class="legend"></div>
    <button id="back" type="button">Got it</button>`);
  const legend = document.querySelector('.legend')!;
  for (const [draw, text] of LEGEND) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.appendChild(iconCanvas(draw, 1.25, 28));
    const span = document.createElement('span');
    span.innerHTML = text;
    row.appendChild(span);
    legend.appendChild(row);
  }
  const b = document.getElementById('back') as HTMLButtonElement;
  b.onclick = onBack;
  b.focus();
}

export function howToSeen() {
  try { return localStorage.getItem('ortigia-howto-seen') === '1'; } catch { return true; }
}
