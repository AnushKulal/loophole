/**
 * A shared match, as React state.
 *
 * Polls the move log, replays it, and posts moves. Everything decided here is
 * derived from the log — there is no local copy of the game to drift out of
 * step, which is the failure this design exists to avoid.
 *
 * Polling rather than a listener: Firestore's real-time transport is not on the
 * REST API, and the alternative is the SDK, a native dependency, and a rebuild
 * to change a query. The poll slows down when nothing is happening and stops
 * altogether once the match is over, which is most of what a listener buys.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Json } from '../net/values';
import { ctx as socialCtx } from '../social/live';
import { playMove, readMoves } from '../net/match';
import { nextIndex, type Move } from './lockstep';
import type { NetInfo } from './contract';

export type { NetInfo };

/**
 * How often to look for the other player's move.
 *
 * A second is about the fastest that still reads as "instant" across a table
 * and does not burn the free tier; after a stretch with nothing new it backs
 * off, because a table where nobody has moved for a minute does not need
 * checking every second.
 */
export const POLL_FAST_MS = 1200;
export const POLL_IDLE_MS = 4000;
const IDLE_AFTER = 8;

export interface NetMatch<S> {
  state: S;
  moves: Move[];
  mySeat: number;
  /** True while a move of ours is in flight. */
  sending: boolean;
  error: string | null;
  play: (move: Json) => void;
}

/**
 * @param net      the shared match, or undefined for a local game
 * @param replay   rebuilds the whole state from the ordered log
 * @param turnOf   whose seat it is, read from that state
 * @param botFor   what a bot at that seat would play, or null
 * @param driver   uid responsible for posting bot moves
 */
export function useNetMatch<S>(
  net: NetInfo | undefined,
  replay: (moves: Move[]) => S,
  turnOf: (state: S) => number,
  botFor?: (state: S, seat: number) => Json | null,
  driver?: string | null,
): NetMatch<S> {
  const [moves, setMoves] = useState<Move[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside callbacks without making them change identity every poll.
  const known = useRef(0);
  const quiet = useRef(0);
  const alive = useRef(true);

  const state = useMemo(() => replay(moves), [replay, moves]);
  const turn = turnOf(state);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ── polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!net) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const c = await socialCtx();
      if (!c || !alive.current) return;
      try {
        const fresh = await readMoves(c, net.id);
        if (!alive.current) return;
        // Only re-render when something actually arrived; replaying on every
        // poll would rebuild the board a second and throw away the animations.
        if (fresh.length !== known.current) {
          known.current = fresh.length;
          quiet.current = 0;
          setMoves(fresh);
        } else {
          quiet.current += 1;
        }
        setError(null);
      } catch {
        // A dropped poll is not worth a message; the next one usually works.
        quiet.current += 1;
      }
      if (alive.current) {
        timer = setTimeout(tick, quiet.current >= IDLE_AFTER ? POLL_IDLE_MS : POLL_FAST_MS);
      }
    };

    void tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [net]);

  // ── posting ────────────────────────────────────────────────────
  const play = useCallback(
    (move: Json) => {
      if (!net) return;
      setSending(true);
      void (async () => {
        const c = await socialCtx();
        if (!c) return setSending(false);
        try {
          // `decide` runs again against whatever the log looks like at the
          // moment of writing, so a move that the opponent has just made
          // illegal is dropped rather than forced through.
          const after = await playMove(c, net.id, net.me, () => move, Date.now());
          if (!alive.current) return;
          known.current = nextIndex(after);
          setMoves(after);
        } catch {
          if (alive.current) setError('That move did not reach the table.');
        } finally {
          if (alive.current) setSending(false);
        }
      })();
    },
    [net],
  );

  // ── bots ───────────────────────────────────────────────────────
  //
  // Every client can work out what a bot would do, so without a rule they would
  // all post it and all but one would lose the race — harmless, but three times
  // the writes and a lot of noise. One client drives; the rest just watch the
  // move arrive.
  useEffect(() => {
    if (!net || !botFor || !driver || driver !== net.me) return;
    const seat = net.seats[turn];
    if (!seat?.bot) return;

    const move = botFor(state, turn);
    if (move === null) return;

    // A beat, so a bot's move does not land in the same frame as yours.
    const id = setTimeout(() => play(move), 650);
    return () => clearTimeout(id);
  }, [net, botFor, driver, turn, state, play]);

  return { state, moves, mySeat: net?.mySeat ?? 0, sending, error, play };
}
