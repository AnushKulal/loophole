import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Glass, Gradient, H, P, Tap } from '../../components/base';
import {
  EmoteBar,
  FadeIn,
  FloatingEmote,
  GameHeader,
  GameOverlay,
  GameShell,
  HudChip,
  OverlayActions,
  SeatStrip,
  TableLog,
  type SeatInfo,
} from '../../components/GameChrome';
import { BOT, makeRng, type GameScreenProps, type PlayableGame, type Player, type Rng } from '../../game/contract';
import {
  COLUMN_CELLS,
  ENTRY,
  GRID,
  HOME,
  MAX_SEATS,
  MOVE_MESSAGE,
  RING_CELLS,
  SAFE,
  TOKENS,
  YARD_RECT,
  YARD_SLOTS,
  applyMove,
  botMove,
  cellOf,
  describe,
  moveProblem,
  placeOf,
  playToken,
  rollDice,
  startMatch,
  tokensHome,
  tokensOut,
  tokensYard,
  whereIs,
  xpFor,
  type Cell,
  type LudoState,
} from '../../game/ludo';
import { useTheme } from '../../theme/theme';
import { font, radius as R } from '../../theme/tokens';

/**
 * Ludo.
 *
 * Four tokens each around a fifteen-by-fifteen cross. The board is one SVG laid
 * out straight from the engine's cell tables — `RING_CELLS`, `COLUMN_CELLS` and
 * `YARD_SLOTS` — so the drawing and the rules can never drift apart. The tokens
 * themselves are not in the SVG: they are pressable discs floating over it, so
 * every one carries a real accessibility label and animates between squares.
 *
 * The screen owns nothing but the presentation. Every legality question —
 * whether a six is needed, whether a pair is holding a square, whether the goal
 * will take this roll — is asked of `src/game/ludo.ts`.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Pips on a die face, on a 0–1 square. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.5, 0.5],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
};

/** Where a token is drawn, and how big, once the stack on its square is known. */
interface Spot {
  x: number;
  y: number;
  s: number;
}

/**
 * Lay every token out in pixels.
 *
 * Tokens sharing a square fan out rather than hiding one another, and a fanned
 * stack shrinks so it still reads as one square's worth of pieces. Tokens home
 * fan along their triangle's base — up the side for the left and right seats,
 * across it for the top and bottom.
 */
function layout(st: LudoState, c: number): Record<string, Spot> {
  const groups = new Map<string, { p: number; t: number }[]>();
  for (let p = 0; p < st.seats; p++) {
    for (let t = 0; t < TOKENS; t++) {
      const [gx, gy] = cellOf(p, st.tokens[p][t], t);
      const k = `${gx},${gy}`;
      const list = groups.get(k);
      if (list) list.push({ p, t });
      else groups.set(k, [{ p, t }]);
    }
  }

  const out: Record<string, Spot> = {};
  for (const [k, members] of groups) {
    const [gx, gy] = k.split(',').map(Number);
    const cx = (gx + 0.5) * c;
    const cy = (gy + 0.5) * c;
    const n = members.length;
    const home = st.tokens[members[0].p][members[0].t] === HOME;
    // A home fan has to stay inside its own wedge: the goal cell sits at the
    // middle of the triangle's outer face, and the wedge narrows to a point at
    // the centre, so a wide fan would push the outer discs across the diagonal
    // edges into a neighbouring seat's colour. At 0.3 the four outer centres
    // are 0.45c from the goal centre, which keeps every disc's rim clear of
    // both diagonals.
    const spread = n === 1 ? 0 : home ? c * 0.3 : c * 0.24;
    // The left and right goals are reached across a vertical face, so their
    // tokens stack up and down; the top and bottom goals stack side to side.
    const vertical = home && members[0].p % 2 === 0;
    const s = n === 1 ? 1 : home ? 0.74 : n === 2 ? 0.84 : 0.7;
    members.forEach((m, i) => {
      const off = (i - (n - 1) / 2) * spread;
      out[`${m.p}-${m.t}`] = { x: cx + (vertical ? 0 : off), y: cy + (vertical ? off : 0), s };
    });
  }
  return out;
}

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  // ── the table ─────────────────────────────────────────────────────
  // The lobby's seat count is what built `opponents`, so the two agree; the
  // clamp is only a guard against a table that never reached this screen intact.
  const seats = clamp(1 + config.opponents.length, 2, MAX_SEATS);
  const filler = (i: number): Player => ({
    name: `Seat ${i + 1}`,
    mark: '●',
    grad: `linear-gradient(160deg,${t.acc},${t.acc2})`,
    bot: true,
  });
  const lobby: Player[] = [config.you, ...config.opponents];
  const table: Player[] = Array.from({ length: seats }, (_, i) => lobby[i] ?? filler(i));
  const name = (i: number) => (i === 0 ? 'You' : (table[i]?.name ?? `Seat ${i + 1}`));
  const who = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  /** The four board colours. Bots all share one avatar tint, so seats are told
   *  apart on the board by colour and by the owner's mark, not by gradient. */
  const seatColor = [t.acc, t.pink, t.gold, t.lime];
  /** Legible on a solid fill of any of those, in either theme. */
  const onSeat = t.isDark ? t.bg : '#fff';

  /** Board option: seconds before a turn auto-plays itself. */
  const clock = clamp(Math.round(config.options.turn) || 20, 8, 120);

  // One seeded stream drives the opening seat, every die and every bot, so a
  // match replays exactly the way the engine tests replay one.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<LudoState>(() => startMatch(seats, rng.current as Rng));
  const [rolling, setRolling] = useState(false);
  const [ghost, setGhost] = useState(6);
  const [emote, setEmote] = useState<string | null>(null);
  const [secs, setSecs] = useState(clock);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);

  const mine = st.turn === 0 && st.winner === null;
  const toRoll = mine && st.dice === null && !rolling;
  const toMove = mine && st.dice !== null && !rolling;

  const size = Math.max(0, Math.min(box.w, box.h) - 6);
  const cell = size / GRID;

  // ── bots ──────────────────────────────────────────────────────────
  // One decision per state, on the beat this difficulty's profile sets.
  useEffect(() => {
    if (st.winner !== null || st.turn === 0 || rolling) return;
    const seat = st.turn;
    if (st.dice === null) {
      const id = setTimeout(() => beginRoll(), Math.round(bot.think * 0.5));
      return () => clearTimeout(id);
    }
    const i = botMove(st, seat, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur === st ? (i < 0 ? cur : applyMove(cur, i)) : cur));
    }, Math.round(bot.think * 0.8));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, rolling, bot]);

  // ── your clock ────────────────────────────────────────────────────
  // The lobby's turn timer, spent on one decision. It plays for you rather than
  // skipping, so a distracted seat never falls out of the race entirely.
  useEffect(() => {
    if (!mine) {
      setSecs(clock);
      return;
    }
    let left = clock;
    setSecs(left);
    const id = setInterval(() => {
      left -= 1;
      setSecs(left);
      if (left > 0) return;
      clearInterval(id);
      const cur = stRef.current;
      if (cur.winner !== null || cur.turn !== 0) return;
      if (cur.dice === null) {
        beginRoll();
        onToast('Time — rolling for you');
      } else {
        const i = botMove(cur, 0, bot, rng.current as Rng);
        if (i >= 0) {
          setSt(applyMove(cur, i));
          onToast('Time — the table played your token');
        }
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, st.dice, st.rolls, clock]);

  // ── the die tumbling ──────────────────────────────────────────────
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setGhost(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(id);
  }, [rolling]);

  const rollT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (rollT.current) clearTimeout(rollT.current); }, []);

  /** The die tumbles for a beat, then the engine says what it landed on. */
  function beginRoll() {
    if (stRef.current.winner !== null || stRef.current.dice !== null) return;
    setRolling(true);
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (rollT.current) clearTimeout(rollT.current);
    rollT.current = setTimeout(() => {
      rollT.current = null;
      setRolling(false);
      setSt((cur) => (cur.winner === null && cur.dice === null ? rollDice(cur, rng.current as Rng) : cur));
    }, 420);
  }

  // ── the pieces sliding ────────────────────────────────────────────
  const spots = useMemo(() => (cell > 0 ? layout(st, cell) : {}), [st, cell]);
  const anim = useRef<Record<string, { xy: Animated.ValueXY; s: Animated.Value }>>({}).current;
  const placed = useRef(0);

  // A node is born where its token already stands, so the first render that has
  // a board size commits every disc on its own square rather than stacked on
  // the board's top-left corner until the effect below runs.
  const nodeFor = (key: string) => {
    if (!anim[key]) {
      const at = spots[key];
      anim[key] = {
        xy: new Animated.ValueXY({ x: at?.x ?? 0, y: at?.y ?? 0 }),
        s: new Animated.Value(at?.s ?? 1),
      };
    }
    return anim[key];
  };

  useEffect(() => {
    if (!cell) return;
    // A fresh board, or a resize, snaps into place; a played token slides.
    const jump = placed.current !== cell;
    const runs: Animated.CompositeAnimation[] = [];
    for (const [key, spot] of Object.entries(spots)) {
      const node = nodeFor(key);
      if (jump) {
        node.xy.setValue({ x: spot.x, y: spot.y });
        node.s.setValue(spot.s);
        continue;
      }
      runs.push(
        Animated.timing(node.xy, {
          toValue: { x: spot.x, y: spot.y },
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(node.s, { toValue: spot.s, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      );
    }
    placed.current = cell;
    if (runs.length) Animated.parallel(runs).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, cell]);

  // ── the halo under a token you can play ───────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // A roll of yours that went nowhere is easy to miss on the board alone.
  useEffect(() => {
    const ev = st.last;
    if (!ev || ev.p !== 0) return;
    if (ev.kind === 'stuck') onToast(`No move with a ${ev.dice}`);
    else if (ev.kind === 'forfeit') onToast('Three sixes — the turn is forfeit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.last]);

  // ── your move ─────────────────────────────────────────────────────
  const movable = new Set(st.turn === 0 && st.dice !== null ? st.moves.map((m) => m.token) : []);

  const tapToken = (token: number) => {
    if (rolling) return;
    const bad = moveProblem(st, 0, token);
    if (bad) return onToast(MOVE_MESSAGE[bad]);
    setSt(playToken(st, token));
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const won = st.winner === 0;
    const champ = st.winner ?? 0;
    const place = placeOf(st, 0);

    onFinish({
      game: 'Ludo',
      head: won ? 'All four home' : 'Beaten home',
      kicker: won ? `You got every token in over ${st.rolls} rolls` : `${who(champ)} got all four home first`,
      xp: `+${xpFor(st, 0)}`,
      note: won
        ? `You sent ${st.caps[0]} token${st.caps[0] === 1 ? '' : 's'} back to the yard on the way round.`
        : `You finished ${ordinal(place)} with ${tokensHome(st, 0)} of four home.`,
      rows: table.map((p, i) => ({
        n: p.name,
        d:
          st.winner === i
            ? `All four home · ${st.caps[i]} sent back`
            : `${tokensHome(st, i)} home · ${ordinal(placeOf(st, i))}`,
        s: `+${xpFor(st, i)}`,
        win: st.winner === i,
        mark: p.mark,
        grad: p.grad,
      })),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────
  const seatInfo: SeatInfo[] = table.map((p, i) => ({
    name: p.name,
    mark: p.mark,
    grad: p.grad,
    sub: `${tokensHome(st, i)} home · ${tokensOut(st, i)} out`,
    active: st.turn === i && st.winner === null,
    out: st.winner !== null && st.winner !== i,
  }));

  const log =
    st.winner !== null
      ? `${name(st.winner)} got all four tokens home`
      : rolling
        ? `${name(st.turn)} ${st.turn === 0 ? 'are' : 'is'} rolling…`
        : toMove
          ? `You rolled a ${st.dice} — tap a lit token`
          : mine
            ? 'Your roll'
            : `${who(st.turn)} is playing`;

  const yourColor = seatColor[0];

  return (
    <GameShell>
      <GameHeader
        hud={`${seats}-HANDED · ${st.rolls} ROLL${st.rolls === 1 ? '' : 'S'}`}
        extra={
          <HudChip tint={mine && st.winner === null ? t.gold : yourColor}>
            {mine && st.winner === null ? `${Math.max(0, secs)}s` : `${tokensHome(st, 0)}/${TOKENS} HOME`}
          </HudChip>
        }
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seatInfo} />

      <View
        style={{ flex: 1, minHeight: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
        // `layout` is this view's border box, which still holds the screen's
        // 20px rail on either side, so the measured box is trimmed by both
        // before the board is sized — otherwise the glass spills into the rail.
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width - 40);
          const h = Math.round(e.nativeEvent.layout.height);
          setBox((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
        }}
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        {size > 40 && (
          <FadeIn>
            <Glass radius={R.card}>
              <View style={{ width: size, height: size }}>
                <BoardArt
                  size={size}
                  seats={st.seats}
                  colors={seatColor}
                  marks={table.map((p) => p.mark)}
                  label={`Ludo board. You have ${tokensHome(st, 0)} of ${TOKENS} tokens home and ${tokensYard(st, 0)} in the yard.`}
                />

                {/* where each lit token would land */}
                {toMove &&
                  st.moves.map((m) => {
                    const [gx, gy] = cellOf(0, m.to, m.token);
                    const d = cell * 0.6;
                    return (
                      <View
                        key={`hint-${m.token}`}
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: (gx + 0.5) * cell - d / 2,
                          top: (gy + 0.5) * cell - d / 2,
                          width: d,
                          height: d,
                          borderRadius: d / 2,
                          borderWidth: 2,
                          borderColor: t.gold,
                          opacity: 0.85,
                        }}
                      />
                    );
                  })}

                {/* the tokens, lit ones last so they sit on top */}
                {tokenList(st)
                  .sort((a, b) => Number(a.p === 0 && movable.has(a.t)) - Number(b.p === 0 && movable.has(b.t)))
                  .map(({ p, t: ti }) => {
                    const node = nodeFor(`${p}-${ti}`);
                    const pos = st.tokens[p][ti];
                    const lit = p === 0 && movable.has(ti);
                    const d = Math.round(cell * 0.78);
                    // The disc is one square wide; the touch target around it is
                    // wider, because a bare 18px disc is not a button.
                    const hit = d + 12;
                    const label = `${p === 0 ? 'Your' : `${who(p)}'s`} token ${ti + 1}, ${whereIs(pos)}${
                      lit ? `, tap to move to ${whereIs(st.moves.find((m) => m.token === ti)?.to ?? pos)}` : ''
                    }`;
                    return (
                      <Animated.View
                        key={`tok-${p}-${ti}`}
                        style={{
                          position: 'absolute',
                          left: -hit / 2,
                          top: -hit / 2,
                          width: hit,
                          height: hit,
                          transform: [...node.xy.getTranslateTransform(), { scale: node.s }],
                        }}
                      >
                        <Pressable
                          accessibilityRole={p === 0 ? 'button' : 'image'}
                          accessibilityLabel={label}
                          disabled={p !== 0}
                          onPress={() => tapToken(ti)}
                          style={({ pressed }) => ({
                            width: hit,
                            height: hit,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          {lit && (
                            <Animated.View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                width: d + 8,
                                height: d + 8,
                                borderRadius: (d + 8) / 2,
                                borderWidth: 2,
                                borderColor: t.gold,
                                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                                transform: [
                                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.14] }) },
                                ],
                              }}
                            />
                          )}
                          <View
                            style={{
                              width: d,
                              height: d,
                              borderRadius: d / 2,
                              backgroundColor: colorFor(seatColor, p),
                              borderWidth: 1.5,
                              borderColor: lit ? t.gold : onSeat,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <H size={Math.max(7, Math.round(d * 0.44))} color={onSeat}>
                              {table[p]?.mark ?? '●'}
                            </H>
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
              </View>
            </Glass>
          </FadeIn>
        )}
      </View>

      <View style={{ paddingTop: 8, paddingBottom: 8 }}>
        <TableLog text={log} />
      </View>

      <EmoteBar onEmote={setEmote} />

      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <DiceBar
          face={rolling ? ghost : (st.dice ?? st.last?.dice ?? 6)}
          spin={spin}
          rolling={rolling}
          canRoll={toRoll && st.winner === null}
          onRoll={beginRoll}
          // The headline reads off the same die the face below it shows: the
          // roll on the table while one is waiting to be spent, and only then
          // the roll just spent — which is a *last* roll, and says so.
          title={
            st.winner !== null
              ? st.winner === 0
                ? 'You are home'
                : `${who(st.winner)} is home`
              : toRoll
                ? 'Roll the dice'
                : rolling
                  ? 'Rolling…'
                  : toMove
                    ? `You rolled a ${st.dice}`
                    : st.dice !== null
                      ? `Rolled a ${st.dice}`
                      : st.last?.dice
                        ? `Last roll ${st.last.dice}`
                        : 'Waiting for the table'
          }
          hint={
            st.winner !== null
              ? describe(st.last, name)
              : toRoll
                ? tokensYard(st, 0) === TOKENS
                  ? 'A six lifts a token out of the yard'
                  : 'Tap to roll'
                : toMove
                  ? `${st.moves.length} token${st.moves.length === 1 ? '' : 's'} can take this ${st.dice}`
                  : describe(st.last, name)
          }
        />
      </View>

      {st.winner !== null && (
        <GameOverlay
          title={st.winner === 0 ? 'Home free' : 'Beaten home'}
          blurb={
            st.winner === 0
              ? `All four of your tokens are in, after ${st.rolls} rolls and ${st.caps[0]} knock-back${st.caps[0] === 1 ? '' : 's'}.`
              : `${who(st.winner)} got all four home. You finished ${ordinal(placeOf(st, 0))} with ${tokensHome(st, 0)} of four in.`
          }
          label="Match over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

const colorFor = (colors: string[], p: number) => colors[p % colors.length];

function tokenList(st: LudoState): { p: number; t: number }[] {
  const out: { p: number; t: number }[] = [];
  for (let p = 0; p < st.seats; p++) for (let t = 0; t < TOKENS; t++) out.push({ p, t });
  return out;
}

// ── the board ─────────────────────────────────────────────────────

/**
 * The outer face of each seat's triangle in the middle, in grid units, ordered
 * to match `COLUMN_CELLS`: seat 0 comes in from the left, then top, right and
 * bottom.
 */
const GOAL_FACES: [Cell, Cell][] = [
  [
    [6, 6],
    [6, 9],
  ],
  [
    [6, 6],
    [9, 6],
  ],
  [
    [9, 6],
    [9, 9],
  ],
  [
    [6, 9],
    [9, 9],
  ],
];

/**
 * The cross, drawn straight from the engine's cell tables so a square can never
 * be painted somewhere a token would not stand. Nothing here is interactive —
 * the pieces live above it.
 */
function BoardArt({
  size,
  seats,
  colors,
  marks,
  label,
}: {
  size: number;
  seats: number;
  colors: string[];
  marks: string[];
  label: string;
}) {
  const t = useTheme();
  const c = size / GRID;
  const mid = (cell: Cell): [number, number] => [(cell[0] + 0.5) * c, (cell[1] + 0.5) * c];
  const live = (p: number) => p < seats;
  const tint = (p: number) => (live(p) ? colors[p % colors.length] : t.dim2);

  const entrySeat = new Map<number, number>();
  for (let p = 0; p < MAX_SEATS; p++) entrySeat.set(ENTRY[p], p);

  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r}L${cx + r * 0.32} ${cy - r * 0.32}L${cx + r} ${cy}L${cx + r * 0.32} ${cy + r * 0.32}` +
    `L${cx} ${cy + r}L${cx - r * 0.32} ${cy + r * 0.32}L${cx - r} ${cy}L${cx - r * 0.32} ${cy - r * 0.32}Z`;

  return (
    <Svg width={size} height={size} accessibilityLabel={label}>
      <Rect x={0} y={0} width={size} height={size} rx={c * 0.6} fill={t.tile} />

      {/* the four yards */}
      {YARD_RECT.map(([x, y], p) => (
        <Rect
          key={`yard-${p}`}
          x={x * c + c * 0.12}
          y={y * c + c * 0.12}
          width={c * 6 - c * 0.24}
          height={c * 6 - c * 0.24}
          rx={c * 0.9}
          fill={tint(p)}
          fillOpacity={live(p) ? 0.2 : 0.06}
          stroke={tint(p)}
          strokeOpacity={live(p) ? (p === 0 ? 0.85 : 0.5) : 0.16}
          strokeWidth={p === 0 && live(p) ? 2 : 1.2}
        />
      ))}
      {YARD_RECT.map(([x, y], p) => (
        <Rect
          key={`pen-${p}`}
          x={(x + 1) * c}
          y={(y + 1) * c}
          width={c * 4}
          height={c * 4}
          rx={c * 0.6}
          fill={t.panel}
          stroke={t.line}
          strokeWidth={1}
        />
      ))}
      {YARD_SLOTS.map((slots, p) =>
        slots.map((s, i) => {
          const [cx, cy] = mid(s);
          return (
            <Circle
              key={`slot-${p}-${i}`}
              cx={cx}
              cy={cy}
              r={c * 0.44}
              fill="none"
              stroke={tint(p)}
              strokeOpacity={live(p) ? 0.55 : 0.16}
              strokeWidth={1.4}
            />
          );
        }),
      )}
      {/* the owner's mark in the outside corner of their yard */}
      {YARD_RECT.map(([x, y], p) => {
        if (!live(p)) return null;
        const cx = (x === 0 ? 0.5 : 14.5) * c;
        const cy = (y === 0 ? 0.5 : 14.5) * c;
        const fs = c * 0.8;
        return (
          <SvgText
            key={`mark-${p}`}
            x={cx}
            y={cy + fs * 0.35}
            fill={tint(p)}
            fontSize={fs}
            fontFamily={font.h}
            textAnchor="middle"
          >
            {marks[p] ?? '●'}
          </SvgText>
        );
      })}

      {/* the shared ring */}
      {RING_CELLS.map(([x, y], r) => {
        const owner = entrySeat.get(r);
        const isEntry = owner !== undefined && live(owner);
        return (
          <Rect
            key={`ring-${r}`}
            x={x * c + 0.6}
            y={y * c + 0.6}
            width={c - 1.2}
            height={c - 1.2}
            rx={c * 0.24}
            fill={isEntry ? colors[(owner as number) % colors.length] : t.panel}
            fillOpacity={isEntry ? 0.42 : 1}
            stroke={t.line}
            strokeWidth={1}
          />
        );
      })}

      {/* the eight sheltered squares — the four starts and the four stars */}
      {SAFE.map((r) => {
        const [cx, cy] = mid(RING_CELLS[r]);
        return <Path key={`safe-${r}`} d={star(cx, cy, c * 0.3)} fill={t.ink} fillOpacity={0.38} />;
      })}

      {/* the private home columns, goal cell excluded — it lives in the middle */}
      {COLUMN_CELLS.map((cells, p) =>
        cells.slice(0, cells.length - 1).map(([x, y], i) => (
          <Rect
            key={`col-${p}-${i}`}
            x={x * c + 0.6}
            y={y * c + 0.6}
            width={c - 1.2}
            height={c - 1.2}
            rx={c * 0.24}
            fill={tint(p)}
            fillOpacity={live(p) ? 0.34 : 0.08}
            stroke={t.line}
            strokeWidth={1}
          />
        )),
      )}

      {/* the middle: one triangle per seat, its tip on the shared centre.
          Each seat's goal cell is the mid-point of that triangle's outer face,
          so a token that gets home lands inside its own colour. */}
      {GOAL_FACES.map(([a, b], p) => (
        <Polygon
          key={`goal-${p}`}
          points={`${a[0] * c},${a[1] * c} ${b[0] * c},${b[1] * c} ${7.5 * c},${7.5 * c}`}
          fill={tint(p)}
          fillOpacity={live(p) ? 0.5 : 0.08}
          stroke={t.line}
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

// ── the die ───────────────────────────────────────────────────────

function DieFace({ face, size, color, ink }: { face: number; size: number; color: string; ink: string }) {
  const f = clamp(Math.round(face) || 1, 1, 6);
  return (
    <Svg width={size} height={size}>
      <Rect x={1} y={1} width={size - 2} height={size - 2} rx={size * 0.26} fill={color} />
      {PIPS[f].map(([x, y], i) => (
        <Circle key={i} cx={x * size} cy={y * size} r={size * 0.085} fill={ink} />
      ))}
    </Svg>
  );
}

/** The roll button when it is yours to take, and the readout when it is not. */
function DiceBar({
  face,
  spin,
  rolling,
  canRoll,
  onRoll,
  title,
  hint,
}: {
  face: number;
  spin: Animated.Value;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  title: string;
  hint: string;
}) {
  const t = useTheme();
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });

  const die = (
    <Animated.View style={{ transform: [{ rotate: rot }] }}>
      <DieFace face={face} size={38} color={canRoll ? '#fff' : t.panel2} ink={canRoll ? t.acc2 : t.ink} />
    </Animated.View>
  );

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 12 }}>
      {die}
      <View style={{ flex: 1, minWidth: 0 }}>
        <H size={14.5} weight={700} color={canRoll ? '#fff' : t.ink} numberOfLines={1}>
          {title}
        </H>
        <P size={11} color={canRoll ? '#fff' : t.dim2} numberOfLines={1} style={{ opacity: canRoll ? 0.85 : 1 }}>
          {hint}
        </P>
      </View>
    </View>
  );

  if (!canRoll) {
    return (
      <Glass radius={R.pill} elevated={false}>
        {body}
      </Glass>
    );
  }
  return (
    <Tap onPress={onRoll} label="Roll the dice">
      <Gradient radius={R.pill}>{body}</Gradient>
    </Tap>
  );
}

export const game: PlayableGame = {
  name: 'Ludo',
  rules: [
    'Roll a six to lift a token out of your yard onto your start square, then walk it clockwise round the fifty-two shared squares.',
    'Landing on a lone enemy sends it back to its yard and buys another roll. The eight starred squares shelter whoever stands on them, and two of one colour elsewhere is a wall.',
    'After the ring a token turns into its own six-cell column; the goal takes an exact roll only. First to bring all four home wins.',
  ],
  Screen,
};

export { Screen };
