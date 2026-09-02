import type { PlayableGame } from './contract';

import { game as imposterWord } from '../screens/games/ImposterWord';
import { game as imposterVideo } from '../screens/games/ImposterVideo';
import { game as liarsBar } from '../screens/games/LiarsBar';
import { game as guessWho } from '../screens/games/GuessWho';
import { game as geoGuesser } from '../screens/games/GeoGuesser';

/**
 * Every self-contained playable title.
 *
 * The Imposter Quiz is not here: it is the app's original scripted deduction
 * flow and lives on the store, reached through `scr: 'quiz'`. Everything else
 * owns its own state and is routed through `GameHost`.
 *
 * STILL TO LAND — the remaining modules from the build run that was paused.
 * Add the import and the array entry as each arrives; nothing else changes:
 *   Ludo (engine + tests already landed, screen pending), Snakes & Ladders,
 *   Chess, Carrom, 3D Tank War, Gravity Flip, and the Connect 4 / UNO ports.
 * Until then those titles fall through to the "no playable module yet" state
 * in GameHost rather than breaking the build.
 */
export const REGISTRY: PlayableGame[] = [imposterWord, imposterVideo, liarsBar, guessWho, geoGuesser];

const byName = new Map(REGISTRY.map((g) => [g.name, g]));

export const findGame = (name: string): PlayableGame | undefined => byName.get(name);

/** True when a title has a playable module rather than a library card. */
export const isPlayable = (name: string): boolean => name === 'Imposter Quiz' || byName.has(name);
