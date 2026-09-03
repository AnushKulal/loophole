import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Avatar, Chip, Glass, Gradient, H, P, Tap } from '../../components/base';
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
import {
  BOT,
  makeRng,
  roll as rollDie,
  type GameScreenProps,
  type PlayableGame,
  type Player,
  type Rng,
} from '../../game/contract';
import {
  COLS,
  ROWS,
  SQUARES,
  applyRoll,
  botRoll,
  botThink,
  cellOf,
  hopText,
  jumpList,
  placeOf,
  settle,
  startMatch,
  walkPath,
  xpFor,
  type Jump,
  type SlState,
} from '../../game/snakesLadders';
import { useTheme } from '../../theme/theme';
import { font, radius as R } from '../../theme/tokens';

/**
 * Snakes & Ladders.
 *
 * The board is the screen: ten by ten, numbered up the boustrophedon track,
 * with the ladders drawn as rails and rungs and the snakes as curved bodies
 * with a head on the square that bites. A token walks its roll one square at a
 * time — turning round on 100 when it overshoots — and only then is carried up
 * a ladder or down a snake, so you watch the bounce happen rather than being
 * told about it. The die on the ROLL button is the one that was just thrown.
 */

const LANE = 28;
const MIN_BOARD = 170;
const MAX_BOARD = 336;
/** Milliseconds a token spends crossing one square. */
const STEP_MS = 125;
/** Milliseconds a snake or a ladder takes to carry a token. */
const JUMP_MS = 460;
const JUMP_HOLD = 190;
/** Milliseconds the die tumbles on the ROLL button before the roll is applied. */
const TUMBLE_MS = 460;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Four tokens share a square without hiding one another. */
const NUDGE = [
  { x: -0.16, y: -0.16 },
  { x: 0.16, y: -0.16 },
  { x: -0.16, y: 0.16 },
  { x: 0.16, y: 0.16 },
];

/** The ring drawn around a token: one of padding either side, two of border. */
const TOKEN_RING = 6;

interface Pt {
  x: number;
  y: number;
}

/** Where a seat's token sits for a given square, in board coordinates. */
function centreOf(sq: number, seat: number, cell: number): Pt {
  const n = NUDGE[seat % NUDGE.length];
  if (sq <= 0) return { x: cell * 0.6 + seat * cell * 0.74, y: ROWS * cell + LANE / 2 };
  const { col, row } = cellOf(sq);
  return {
    x: col * cell + cell / 2 + n.x * cell,
    y: (ROWS - 1 - row) * cell + cell / 2 + n.y * cell,
  };
}

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  // Board options: how many seats sit down, and how long a turn may be held.
  const wanted = clamp(Math.round(config.options.players) || 4, 2, 4);
  const table: Player[] = [config.you, ...config.opponents].slice(0, wanted);
  const seats = Math.max(2, table.length);
  const clock = clamp(Math.round(config.options.turn), 5, 90);

  const name = (i: number) => (i === 0 ? 'You' : (table[i]?.name ?? `Seat ${i + 1}`));
  const who = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  // One seeded stream drives every die in the match, exactly as the tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<SlState>(() => startMatch(seats));
  const [tracks, setTracks] = useState<number[][]>(() => range(seats).map(() => [0]));
  const [box, setBox] = useState({ w: 320, h: 360 });
  const [secs, setSecs] = useState(clock);
  const [emote, setEmote] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);
  /** Set while the button's die is tumbling towards the roll it already knows. */
  const rollT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prog = useRef(range(4).map(() => new Animated.Value(0))).current;
  const spin = useRef(new Animated.Value(0)).current;

  const size = clamp(Math.min(box.w, box.h - LANE), MIN_BOARD, MAX_BOARD);
  const cell = size / COLS;
  const yours = st.phase === 'roll' && st.turn === 0;

  // ── the token walks, then the board carries it ────────────────────
  useEffect(() => {
    const h = st.last;
    if (st.phase !== 'move' || !h) return;

    const walk = walkPath(h.from, h.die);
    const stops = h.jumps.map((j) => j.to);
    setTracks((cur) => {
      const next = cur.slice();
      next[h.seat] = [h.from, ...walk, ...stops];
      return next;
    });

    const v = prog[h.seat];
    v.setValue(0);
    const steps: Animated.CompositeAnimation[] = [
      Animated.timing(v, {
        toValue: walk.length,
        duration: walk.length * STEP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ];
    stops.forEach((_, k) => {
      steps.push(Animated.delay(JUMP_HOLD));
      steps.push(
        Animated.timing(v, {
          toValue: walk.length + k + 1,
          duration: JUMP_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      );
    });
    const anim = Animated.sequence(steps);
    anim.start();

    const total = walk.length * STEP_MS + stops.length * (JUMP_MS + JUMP_HOLD) + 280;
    const id = setTimeout(() => setSt((cur) => (cur.phase === 'move' ? settle(cur) : cur)), total);
    return () => {
      anim.stop();
      clearTimeout(id);
    };
  }, [st.phase, st.rolls, prog]);

  // ── the die tumbles on the button, and only then does it land ─────
  // The throw waits on the tumble rather than the other way round: applying the
  // roll puts the seat in `move` and swaps the ROLL button for the muted pill,
  // so a spin started after that would be turning a view nobody can see. See
  // `throwIt`; this effect only makes sure the tumble dies with the screen.
  useEffect(
    () => () => {
      if (rollT.current) clearTimeout(rollT.current);
      spin.stopAnimation();
    },
    [spin],
  );

  // ── the bots take their turn on the beat their profile sets ───────
  useEffect(() => {
    if (st.phase !== 'roll' || st.turn === 0) return;
    const seat = st.turn;
    const die = botRoll(st, seat, rng.current as Rng);
    if (die === null) return;
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'roll' && cur.turn === seat ? applyRoll(cur, seat, die) : cur));
    }, botThink(bot, st.last));
    return () => clearTimeout(id);
  }, [st, bot]);

  // ── your turn clock: the lobby's turn timer, then the die throws itself ──
  useEffect(() => {
    if (!yours) {
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
      // A throw already in the air lands on its own; the clock keeps out of it.
      if (rollT.current) return;
      const cur = stRef.current;
      if (cur.phase !== 'roll' || cur.turn !== 0) return;
      setSt(applyRoll(cur, 0, rollDie(rng.current as Rng)));
      onToast('Time — the die threw itself');
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yours, st.rolls, clock]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your move ─────────────────────────────────────────────────────

  const throwIt = () => {
    if (!yours) return onToast(st.phase === 'over' ? 'The race is over' : 'Wait for your turn');
    if (rollT.current) return;
    const die = rollDie(rng.current as Rng);
    setRolling(true);
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: TUMBLE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    rollT.current = setTimeout(() => {
      rollT.current = null;
      setRolling(false);
      setSt((cur) => (cur.phase === 'roll' && cur.turn === 0 ? applyRoll(cur, 0, die) : cur));
    }, TUMBLE_MS);
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const won = st.winner === 0;
    const champ = st.winner ?? 0;

    onFinish({
      game: 'Snakes & Ladders',
      head: won ? 'You got home first' : 'Pipped to the finish',
      kicker: won
        ? `Square 100 in ${plural(st.rolls, 'roll')} around the table`
        : `${who(champ)} reached 100 first`,
      xp: `+${xpFor(st, 0)}`,
      note: won
        ? `You found ${plural(st.climbs[0], 'ladder')} and took ${plural(st.bites[0], 'snake')} getting there.`
        : `You finished ${ordinal(placeOf(st, 0))} on square ${st.pos[0]}, ${plural(SQUARES - st.pos[0], 'square')} short.`,
      rows: table
        .map((p, i) => ({
          n: p.name,
          d:
            st.winner === i
              ? `Home on 100 · ${plural(st.climbs[i], 'ladder')}`
              : `Square ${st.pos[i]} · ${ordinal(placeOf(st, i))} · ${plural(st.bites[i], 'snake')}`,
          s: `+${xpFor(st, i)}`,
          win: st.winner === i,
          mark: p.mark,
          grad: p.grad,
        }))
        .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const seatInfo: SeatInfo[] = table.slice(1).map((p, k) => {
    const i = k + 1;
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: st.pos[i] === SQUARES ? 'Home on 100' : `Square ${st.pos[i]}`,
      active: st.turn === i && st.phase !== 'over',
      out: st.winner !== null && st.winner !== i,
    };
  });

  const log =
    st.phase === 'over'
      ? st.winner === 0
        ? 'You are home — the race is yours'
        : `${who(st.winner ?? 0)} is home on 100`
      : st.phase === 'move' && st.last
        ? hopText(st.last, name(st.last.seat), st.last.seat === 0)
        : yours
          ? 'Your roll — first to exactly 100'
          : `${who(st.turn)} is rolling`;

  const face = st.last?.die ?? 0;

  return (
    <GameShell>
      <GameHeader
        hud={`SQUARE ${st.pos[0]} · ${SQUARES - st.pos[0]} TO GO`}
        extra={<HudChip tint={yours ? t.gold : t.lime}>{yours ? `${Math.max(0, secs)}s` : `${st.rolls} rolls`}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seatInfo} />

      <View
        style={{
          flex: 1,
          minHeight: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          paddingVertical: 6,
        }}
        // The pane is the board plus the start lane plus the glass padding, so
        // the measured box is trimmed by both before the board is sized.
        onLayout={(e: LayoutChangeEvent) =>
          setBox({ w: e.nativeEvent.layout.width - 56, h: e.nativeEvent.layout.height - 20 })
        }
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <FadeIn>
          <Glass radius={R.card}>
            <View style={{ padding: 8 }}>
              <View
                accessible
                accessibilityLabel={`Board. ${table
                  .map((p, i) => `${i === 0 ? 'You' : p.name} on square ${st.pos[i]}`)
                  .join(', ')}.`}
                style={{ width: size, height: size + LANE }}
              >
                <BoardArt size={size} />
                {table.map((p, i) => (
                  <TokenPiece
                    key={p.name + i}
                    track={tracks[i] ?? [st.pos[i]]}
                    v={prog[i]}
                    seat={i}
                    cell={cell}
                    player={p}
                    active={st.turn === i && st.phase !== 'over'}
                    home={st.pos[i] === SQUARES}
                  />
                ))}
              </View>
            </View>
          </Glass>
        </FadeIn>
      </View>

      <TableLog text={log} />

      <View style={{ paddingTop: 8 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {yours ? (
          <Tap onPress={throwIt} label={face ? `Roll the die, last roll ${face}` : 'Roll the die'}>
            <Gradient radius={R.pill}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 }}>
                <Animated.View
                  style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}
                >
                  <DieFace n={face} size={42} />
                </Animated.View>
                <View style={{ marginRight: 'auto' }}>
                  <H size={16.5} weight={700} color="#fff">
                    ROLL
                  </H>
                  <P size={11} color="#fff" style={{ opacity: 0.8 }}>
                    {rolling ? 'Rolling…' : face ? `Last roll ${face}` : 'One d6, first to exactly 100'}
                  </P>
                </View>
                <Chip bg="rgba(255,255,255,0.18)" color="#fff">
                  {`${SQUARES - st.pos[0]} to go`}
                </Chip>
              </View>
            </Gradient>
          </Tap>
        ) : (
          <Glass radius={R.pill} elevated={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 }}>
              <DieFace n={face} size={42} muted />
              <View style={{ marginRight: 'auto', minWidth: 0 }}>
                <H size={13.5} weight={700} color={t.dim} numberOfLines={1}>
                  {st.phase === 'over' ? 'Race over' : `${who(st.turn)}’s roll`}
                </H>
                <P size={11} color={t.dim2} numberOfLines={1}>
                  {st.phase === 'over'
                    ? `You finished ${ordinal(placeOf(st, 0))} of ${seats}`
                    : `Square ${st.pos[st.turn]} · ${SQUARES - st.pos[st.turn]} to go`}
                </P>
              </View>
            </View>
          </Glass>
        )}
      </View>

      {st.phase === 'over' && (
        <GameOverlay
          title={st.winner === 0 ? 'Home first' : 'Beaten to 100'}
          blurb={
            st.winner === 0
              ? `You landed exactly on 100 after ${plural(st.rolls, 'roll')}, past ${plural(st.bites[0], 'snake')} and up ${plural(st.climbs[0], 'ladder')}.`
              : `${who(st.winner ?? 0)} landed on 100 first. You stopped on square ${st.pos[0]}, ${ordinal(placeOf(st, 0))} of ${seats}.`
          }
          label="Race over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── the board ─────────────────────────────────────────────────────

/**
 * The board itself: a hundred numbered squares, the ladders as rails and rungs,
 * the snakes as curved bodies with a head on the square that bites, and the
 * start lane below square 1 where the tokens wait.
 */
function BoardArt({ size }: { size: number }) {
  const t = useTheme();
  const cell = size / COLS;
  const jumps = useMemo(() => jumpList(), []);
  const num = Math.max(6, cell * 0.24);

  const centre = (sq: number): Pt => {
    const { col, row } = cellOf(sq);
    return { x: col * cell + cell / 2, y: (ROWS - 1 - row) * cell + cell / 2 };
  };

  return (
    <Svg width={size} height={size + LANE} style={{ position: 'absolute', top: 0, left: 0 }}>
      {/* the squares */}
      {range(SQUARES).map((k) => {
        const sq = k + 1;
        const { col, row } = cellOf(sq);
        const x = col * cell;
        const y = (ROWS - 1 - row) * cell;
        const home = sq === SQUARES;
        return (
          <Rect
            key={sq}
            x={x}
            y={y}
            width={cell}
            height={cell}
            fill={home ? t.gold : t.tile}
            fillOpacity={home ? 0.3 : (col + row) % 2 === 0 ? 1 : 0.28}
            stroke={t.line}
            strokeWidth={0.6}
          />
        );
      })}

      {/* the numbers, tucked into the top-left of each square */}
      {range(SQUARES).map((k) => {
        const sq = k + 1;
        const { col, row } = cellOf(sq);
        return (
          <SvgText
            key={`n${sq}`}
            x={col * cell + 2.5}
            y={(ROWS - 1 - row) * cell + num + 1.5}
            fill={sq === SQUARES ? t.gold : t.dim2}
            fontSize={num}
            fontFamily={font.h}
          >
            {String(sq)}
          </SvgText>
        );
      })}

      {/* ladders under the snakes, so a crossing reads head-first */}
      {jumps
        .filter((j) => j.kind === 'ladder')
        .map((j) => (
          <Ladder key={`l${j.from}`} j={j} cell={cell} centre={centre} colour={t.lime} />
        ))}

      {jumps
        .filter((j) => j.kind === 'snake')
        .map((j, i) => (
          <Snake key={`s${j.from}`} j={j} i={i} cell={cell} centre={centre} colour={t.pink} belly={t.panel2} eye={t.onPink} />
        ))}

      {/* the start lane */}
      <Rect
        x={0}
        y={size + 3}
        width={size}
        height={LANE - 6}
        rx={(LANE - 6) / 2}
        fill={t.tile}
        stroke={t.line}
        strokeWidth={0.8}
      />
      <SvgText x={size - 8} y={size + LANE / 2 + 3.2} fill={t.dim2} fontSize={9} fontFamily={font.h} textAnchor="end">
        START
      </SvgText>
    </Svg>
  );
}

/** Two rails and a run of rungs, drawn straight up the board. */
function Ladder({ j, cell, centre, colour }: { j: Jump; cell: number; centre: (sq: number) => Pt; colour: string }) {
  const a = centre(j.from);
  const b = centre(j.to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * cell * 0.24;
  const py = (dx / len) * cell * 0.24;
  const rungs = Math.max(2, Math.round(len / (cell * 0.62)));

  return (
    <G>
      <SvgLine x1={a.x + px} y1={a.y + py} x2={b.x + px} y2={b.y + py} stroke={colour} strokeWidth={2} strokeOpacity={0.9} strokeLinecap="round" />
      <SvgLine x1={a.x - px} y1={a.y - py} x2={b.x - px} y2={b.y - py} stroke={colour} strokeWidth={2} strokeOpacity={0.9} strokeLinecap="round" />
      {range(rungs - 1).map((k) => {
        const f = (k + 1) / rungs;
        const cx = a.x + dx * f;
        const cy = a.y + dy * f;
        return (
          <SvgLine
            key={k}
            x1={cx + px}
            y1={cy + py}
            x2={cx - px}
            y2={cy - py}
            stroke={colour}
            strokeWidth={1.5}
            strokeOpacity={0.62}
            strokeLinecap="round"
          />
        );
      })}
    </G>
  );
}

/** A curved body from the head down to the tail, with the eyes on the head. */
function Snake({
  j,
  i,
  cell,
  centre,
  colour,
  belly,
  eye,
}: {
  j: Jump;
  i: number;
  cell: number;
  centre: (sq: number) => Pt;
  colour: string;
  belly: string;
  eye: string;
}) {
  const a = centre(j.from);
  const b = centre(j.to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const amp = Math.min(cell * 1.15, len * 0.24) * (i % 2 === 0 ? 1 : -1);
  const px = (-dy / len) * amp;
  const py = (dx / len) * amp;
  const c1 = { x: a.x + dx * 0.28 + px, y: a.y + dy * 0.28 + py };
  const c2 = { x: a.x + dx * 0.72 - px, y: a.y + dy * 0.72 - py };
  const d = `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
  const head = cell * 0.24;
  const ex = (-dy / len) * head * 0.42;
  const ey = (dx / len) * head * 0.42;
  const fx = (dx / len) * head * 0.18;
  const fy = (dy / len) * head * 0.18;

  return (
    <G>
      <Path d={d} stroke={colour} strokeWidth={cell * 0.2} strokeOpacity={0.8} fill="none" strokeLinecap="round" />
      <Path
        d={d}
        stroke={belly}
        strokeWidth={cell * 0.075}
        strokeOpacity={0.75}
        strokeDasharray={[cell * 0.16, cell * 0.2]}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={a.x} cy={a.y} r={head} fill={colour} />
      <Circle cx={a.x + ex + fx} cy={a.y + ey + fy} r={head * 0.22} fill={eye} />
      <Circle cx={a.x - ex + fx} cy={a.y - ey + fy} r={head * 0.22} fill={eye} />
    </G>
  );
}

/**
 * A player's token, riding the squares of its last move.
 *
 * The track is the list of squares the token touches — the walk, the bounce and
 * then each snake or ladder it was carried by — so a single `Animated.Value`
 * counting through that list drives the whole move on the native driver.
 */
function TokenPiece({
  track,
  v,
  seat,
  cell,
  player,
  active,
  home,
}: {
  track: number[];
  v: Animated.Value;
  seat: number;
  cell: number;
  player: Player;
  active: boolean;
  home: boolean;
}) {
  const t = useTheme();
  const size = Math.max(12, cell * 0.5);
  // An interpolation needs two stops, so a token that has not moved yet is
  // pinned by repeating its square rather than by a bare number. The disc is
  // offset by half the ring as well as half itself, so it sits on the centre.
  const half = (size + TOKEN_RING) / 2;
  const path = track.length > 1 ? track : [track[0] ?? 0, track[0] ?? 0];
  const pts = path.map((sq) => centreOf(sq, seat, cell));
  const input = pts.map((_, i) => i);
  const shift = (axis: 'x' | 'y') =>
    v.interpolate({ inputRange: input, outputRange: pts.map((p) => p[axis] - half) });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: [{ translateX: shift('x') }, { translateY: shift('y') }],
      }}
    >
      <View
        style={{
          padding: 1,
          borderRadius: half,
          borderWidth: 2,
          borderColor: home ? t.gold : active ? t.acc : 'transparent',
          backgroundColor: active || home ? t.panel2 : 'transparent',
        }}
      >
        <Avatar mark={player.mark} grad={player.grad} size={size} fontSize={Math.max(8, Math.round(size * 0.5))} />
      </View>
    </Animated.View>
  );
}

/** Pip positions for each face, on a six-by-six grid. */
const PIPS: Record<number, [number, number][]> = {
  1: [[3, 3]],
  2: [
    [1.9, 1.9],
    [4.1, 4.1],
  ],
  3: [
    [1.9, 1.9],
    [3, 3],
    [4.1, 4.1],
  ],
  4: [
    [1.9, 1.9],
    [4.1, 1.9],
    [1.9, 4.1],
    [4.1, 4.1],
  ],
  5: [
    [1.9, 1.9],
    [4.1, 1.9],
    [3, 3],
    [1.9, 4.1],
    [4.1, 4.1],
  ],
  6: [
    [1.9, 1.75],
    [4.1, 1.75],
    [1.9, 3],
    [4.1, 3],
    [1.9, 4.25],
    [4.1, 4.25],
  ],
};

/** The die on the ROLL button — the face that was actually thrown. */
function DieFace({ n, size = 42, muted }: { n: number; size?: number; muted?: boolean }) {
  const t = useTheme();
  const body = muted ? t.panel2 : '#ffffff';
  const pip = muted ? t.dim : t.acc2;
  const u = size / 6;

  return (
    <Svg width={size} height={size} accessibilityLabel={n ? `Die showing ${n}` : 'Die not yet thrown'}>
      <Rect x={1} y={1} width={size - 2} height={size - 2} rx={size * 0.24} fill={body} stroke={t.line} strokeWidth={1} />
      {PIPS[n] ? (
        PIPS[n].map(([cx, cy], i) => <Circle key={i} cx={cx * u} cy={cy * u} r={u * 0.42} fill={pip} />)
      ) : (
        <SvgText x={size / 2} y={size * 0.66} fill={pip} fontSize={size * 0.44} fontFamily={font.h} textAnchor="middle">
          ?
        </SvgText>
      )}
    </Svg>
  );
}

export const game: PlayableGame = {
  name: 'Snakes & Ladders',
  Screen,
  rules: [
    'A ten by ten board numbered 1 to 100, snaking left to right and back again. Every seat starts off the board and rolls one d6 a turn.',
    'Land on the foot of a ladder and climb it; land on the head of a snake and slide all the way down to its tail.',
    'You must land on 100 exactly — a roll that overshoots walks up to 100 and back down again. First token home takes the race.',
  ],
};

export { Screen };
