import { GAMES } from '../data/games';
import type { PlayableGame } from './contract';

import { game as imposterWord } from '../screens/games/ImposterWord';
import { game as imposterVideo } from '../screens/games/ImposterVideo';
import { game as liarsBar } from '../screens/games/LiarsBar';
import { game as guessWho } from '../screens/games/GuessWho';
import { game as geoGuesser } from '../screens/games/GeoGuesser';
import { game as uno } from '../screens/games/Uno';
import { game as ludo } from '../screens/games/Ludo';
import { game as snakesLadders } from '../screens/games/SnakesLadders';
import { game as chess } from '../screens/games/Chess';
import { game as carrom } from '../screens/games/Carrom';
import { game as connect4 } from '../screens/games/Connect4';
import { game as tankWar } from '../screens/games/TankWar';
import { game as gravityFlip } from '../screens/games/GravityFlip';

/**
 * Every self-contained playable title, in library order.
 *
 * The Imposter Quiz is not here: it is the app's original scripted deduction
 * flow and lives on the store, reached through `scr: 'quiz'`. Everything else
 * owns its own state and is routed through `GameHost`.
 */
export const REGISTRY: PlayableGame[] = [
  imposterWord,
  imposterVideo,
  liarsBar,
  guessWho,
  geoGuesser,
  uno,
  ludo,
  snakesLadders,
  chess,
  carrom,
  connect4,
  tankWar,
  gravityFlip,
];

const byName = new Map(REGISTRY.map((g) => [g.name, g]));

export const findGame = (name: string): PlayableGame | undefined => byName.get(name);

/** True when a title has a playable module rather than a library card. */
export const isPlayable = (name: string): boolean => name === 'Imposter Quiz' || byName.has(name);

/** The library titles with no module yet. Empty means all fourteen play. */
export const unplayable = (): string[] => GAMES.map((g) => g.name).filter((n) => !isPlayable(n));

if (__DEV__) {
  // A registry name that does not match the library is the one mistake that
  // fails silently — the title just never opens. Surface it loudly instead.
  const library = new Set(GAMES.map((g) => g.name));
  const orphans = REGISTRY.map((g) => g.name).filter((n) => !library.has(n));
  if (orphans.length) {
    console.error(`[registry] names not in data/games.ts: ${orphans.join(', ')}`);
  }
  const missing = unplayable();
  if (missing.length) {
    console.warn(`[registry] no playable module: ${missing.join(', ')}`);
  }
}
