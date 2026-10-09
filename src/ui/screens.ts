import { DICE } from '../config';
import type { Ending, Game } from '../game/game';
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
    <details class="howto"><summary>How to play</summary>
      <p>Your dot never stops walking. Steer with <b>arrow keys / WASD</b> or <b>swipe</b>: the turn is taken at the next corner where it's possible. Push against your direction to turn round. Small arrows mark one-way streets.</p>
      <p>Food, water and sleep drain all the time. If any of them hits zero, your health drops. Walk past a place and tap its button (or press <b>Space</b>) to use it. Fountains are free and work as you pass.</p>
      <p>Watch the streets: <b>spiky thugs</b> hurt you (bigger ones hurt more), <b>beggars</b> take a few euros, <b>tour groups</b> block the way and can sweep you along (tap fast to escape), and <b>dog poop</b> gets you turned away from restaurants and hotels until you wash at a fountain. Benches are free but pickpockets work at night.</p>
      <p>Bad fish and bad company can make you sick: your health drains until you buy medicine at a <b>pharmacy</b> (green cross).</p>
      <p>The green markers are the bridges out. Leave with more than you arrived with to win.</p>
    </details>`);
  const btn = document.getElementById('roll') as HTMLButtonElement;
  const result = document.querySelector<HTMLElement>('.dice-result')!;
  const dice = document.querySelector<HTMLElement>('.dice')!;
  let rolled = false;
  const roll = () => {
    if (rolled) return;
    rolled = true;
    btn.disabled = true;
    dice.classList.add('rolling');
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
    ${clock} on the clock</p>`;
  let head: string;
  if (e.kind === 'death') {
    const [title, line] = DEATHS[e.cause];
    head = `<h1 class="dead">${title}</h1><p>${line}</p>`;
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
