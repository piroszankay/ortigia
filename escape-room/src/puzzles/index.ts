// Puzzle hook-up point. Everything clickable is in `registry` under a stable
// id; a puzzle claims objects by attaching handlers here.
//
// Ids:
//   door, lock_1 … lock_4                       (group "door")
//   keypad_0 … keypad_9, keypad_star, keypad_hash, keypad_display  (group "keypad")
//   rug, circuit_tile_<row>_<col>               (group "circuit")
//   mirror, hidden_symbol                       (group "mirror")
//   crt                                         (group "lord")
//   window, bucket, shelf_jars, broken_chair    (props)
//
// Example of a real puzzle later:
//   registry.setHandler<LockState>('lock_2', (lock) => openComboUi(lock));

import { registry } from '../interactables';
import type { Game } from '../main';

export function installPuzzleStubs(game: Game): void {
  // Stub behaviour so the prototype feels responsive; real puzzles replace these.
  registry.setHandler('rug', () => game.rug.toggle());

  let entry = '';
  for (const item of registry.byGroup('keypad')) {
    if (item.id === 'keypad_display') continue;
    const key = item.label.replace('Key ', '');
    registry.setHandler(item.id, () => {
      // Placeholder: echo keys to the display, '*' clears, '#' "submits".
      if (key === '*') entry = '';
      else if (key === '#') entry = '';
      else entry = (entry + key).slice(-4);
      game.door.setKeypadDisplay(entry.length ? entry.padEnd(4, '_') : '- - - -');
    });
  }
}
