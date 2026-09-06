import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, Glass, H, Kicker, P, Tap, gradStops } from '../../components/base';
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
import { BOT, makeRng, pick, type BotProfile, type GameScreenProps, type PlayableGame, type Player, type Rng } from '../../game/contract';
import { COLS, ROWS, emptyBoard, findWin, lowest, place, botMove, type Board, type Disc, type Outcome } from '../../game/connect4';
import { botDriver, c4Init, replayC4, type C4State } from '../../game/replay';
import { useNetMatch } from '../../game/useMatch';
import { useTheme } from '../../theme/theme';
import { radius as R, bloom } from '../../theme/tokens';

/**
 * Connect 4.
 *
 * Seven columns, six rows, and the only decision is which column. Tapping one
 * drops your disc to the lowest free slot; four in a line — across, down or on
 * either diagonal — closes the board and lights the four that did it.
 *
 * Every rule lives in `src/game/connect4.ts`: `lowest` finds the slot, `place`
 * returns the new board, `findWin` returns the four indices of a line, and
 * `botMove` picks the opponent's column. This file owns the pixels, the taps
 * and the clock, and scales the opponent by its `BotProfile`.
 */

/**
 * Board geometry. The gap and the rim padding are the web build's numbers.
 * `GUTTER` is the breathing room either side of the board — it is the padding on
 * the very view that gets measured, so the sizing maths has to take it back off
 * the measured width. `BORDER` is the 1px rim `Glass` draws inside whatever
 * width it is given, which RN takes out of the content box.
 */
const GAP = 6;
const PAD = 11;
const GUTTER = 14;
const BORDER = 1;

/** Columns in the order a Connect 4 player considers them: centre outwards. */
const CENTRE = [3, 2, 4, 1, 5, 0, 6];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const legalIn = (b: Board) => CENTRE.filter((c) => lowest(b, c) >= 0);

/** Would dropping `p` into `c` complete a four right now? */
const completes = (b: Board, c: number, p: Disc) => {
  const n = place(b, c, p);
  return !!n && !!findWin(n, p);
};

/** Does playing `c` leave the square above it as a winning slot for `you`? */
const gifts = (b: Board, c: number) => {
  const n = place(b, c, 'bot');
  if (!n) return false;
  const above = place(n, c, 'you');
  return !!above && !!findWin(above, 'you');
};

/**
 * The opponent's column, scaled by its profile.
 *
 * The engine's `botMove` plays one line — take the four, else block yours, else
 * favour the centre. That is the whole of its judgement, so the profile is
 * applied around it rather than inside it:
 *
 *   • It never misses a four it can complete on the spot. That is the floor of
 *     playing at all, and a bot that walks past its own win reads as broken
 *     rather than as easy.
 *   • `blunder` is a deliberate mistake and `skill` is how often it bothered to
 *     look at your side of the board; failing either, it drops somewhere legal.
 *   • `depth` 2 and up also refuses to stack under a square that would hand you
 *     a four — the one-ply-deeper mistake that loses most casual games — unless
 *     the engine's own answer was a forced block.
 */
export function chooseColumn(b: Board, profile: BotProfile, rng: Rng): number | null {
  const legal = legalIn(b);
  if (!legal.length) return null;

  const win = legal.find((c) => completes(b, c, 'bot'));
  if (win !== undefined) return win;

  if (rng() < profile.blunder || rng() >= profile.skill) return pick(legal, rng);

  const line = botMove(b, rng) ?? legal[0];
  if (completes(b, line, 'you')) return line;
  if (profile.depth < 2) return line;

  const safe = legal.filter((c) => !gifts(b, c));
  if (safe.includes(line)) return line;
  return safe.length ? safe[0] : line;
}

/**
 * A move played for you when your clock runs out.
 *
 * `botMove` is written from the opponent's side of the table, so the board is
 * handed over with the two colours swapped and its answer is the column it
 * would take as you.
 */
const swap = (b: Board): Board => b.map((v) => (v === 'you' ? 'bot' : v === 'bot' ? 'you' : null));
const houseColumn = (b: Board, rng: Rng) => botMove(swap(b), rng);

type Turn = Disc;

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const profile = BOT[config.difficulty];

  /** You drop first; the seat opposite takes the other colour. */
  const you = config.you;
  const foe: Player = config.opponents[0] ?? { ...config.you, name: 'Opponent', bot: true };

  /**
   * Board options. Connect 4 seats exactly two, so `players` has nothing to say
   * here; `turn` is the clock on your move, after which the house drops one for
   * you, since a Connect 4 turn cannot simply be passed.
   */
  const clock = clamp(Math.round(config.options.turn) || 30, 8, 120);

  // One seeded stream drives every column the opponent picks, so a match
  // replays exactly the way the engine tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [lBoard, setBoard] = useState<Board>(emptyBoard);
  const [lTurn, setTurn] = useState<Turn>('you');
  const [lWinner, setWinner] = useState<Outcome>(null);
  const [lWinLine, setWinLine] = useState<number[]>([]);
  const [lLastIdx, setLastIdx] = useState(-1);
  const [tally, setTally] = useState({ you: 0, bot: 0, drawn: 0 });
  const [over, setOver] = useState(false);
  const [secs, setSecs] = useState(clock);
  const [emote, setEmote] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  /**
   * The shared match, when there is one.
   *
   * Everything below reads `board` / `turn` / `winner`, and those are the
   * *local* state for a bot game and the replayed log for a shared one. The
   * screen does not branch beyond this block.
   */
  const net = config.net;
  const mySeat = net?.mySeat ?? 0;

  const c4Bot = useCallback(
    (st: C4State) => {
      const col = chooseColumn(st.board, profile, rng.current as Rng);
      return col === null ? null : ({ col } as never);
    },
    [profile],
  );

  const nm = useNetMatch<C4State>(
    net,
    replayC4,
    (st) => st.turn,
    c4Bot,
    net ? botDriver(net.seats, net.host) : null,
  );

  /**
   * The engine names its two sides 'you' and 'bot' — really "seat 0" and
   * "seat 1". Seat 1's player is told the opposite way round, so that from
   * either phone your own discs are the ones the whole screen already calls
   * 'you'. Without this, the second player would watch their own moves land in
   * the opponent's colour under the opponent's name.
   */
  const flip = !!net && mySeat === 1;
  const asMine = (d: Disc | null): Disc | null => (!d || !flip ? d : d === 'you' ? 'bot' : 'you');

  const netState = nm.state ?? c4Init();
  const board = net ? netState.board.map(asMine) : lBoard;
  const winLine = net ? netState.line : lWinLine;
  const lastIdx = net ? netState.last : lLastIdx;
  const winner: Outcome = net
    ? netState.winner === 'draw' || netState.winner === null
      ? netState.winner
      : asMine(netState.winner)
    : lWinner;
  const turn: Turn = net ? (netState.turn === mySeat ? 'you' : 'bot') : lTurn;

  const now = useRef({ board, turn, winner });
  now.current = { board, turn, winner };
  const done = useRef(false);

  const mine = !winner && turn === 'you';
  const played = tally.you + tally.bot + tally.drawn;

  // The board is sized to whatever the middle of the frame leaves, so it fits a
  // short phone without ever pushing the controls off the bottom.
  const measured = box.w > 0 && box.h > 0;
  // `box` is the measured view's border box, so its own gutter comes off first;
  // then the Glass rim, then the rim padding, then the gaps between the holes.
  const cell = clamp(
    Math.floor(
      Math.min(
        (box.w - GUTTER * 2 - BORDER * 2 - PAD * 2 - GAP * (COLS - 1)) / COLS,
        (box.h - BORDER * 2 - PAD * 2 - GAP * (ROWS - 1)) / ROWS,
      ),
    ),
    22,
    46,
  );

  /** Commit a drop, then close the board or pass the turn. */
  const settle = (next: Board, p: Disc, idx: number) => {
    setBoard(next);
    setLastIdx(idx);
    const w = findWin(next, p);
    if (w) {
      setWinLine(w);
      setWinner(p);
      setTally((g) => (p === 'you' ? { ...g, you: g.you + 1 } : { ...g, bot: g.bot + 1 }));
      return;
    }
    if (!next.includes(null)) {
      setWinner('draw');
      setTally((g) => ({ ...g, drawn: g.drawn + 1 }));
      return;
    }
    setTurn(p === 'you' ? 'bot' : 'you');
  };

  // ── the opponent thinks, then drops ───────────────────────────────
  useEffect(() => {
    // A shared match drives its bots through the move log, from one client.
    if (net) return;
    if (winner || turn !== 'bot') return;
    const b = board;
    const col = chooseColumn(b, profile, rng.current as Rng);
    const id = setTimeout(() => {
      if (col === null) return setWinner('draw');
      const r = lowest(b, col);
      const n = place(b, col, 'bot');
      if (r < 0 || !n) return;
      settle(n, 'bot', r * COLS + col);
    }, profile.think);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, turn, winner, profile]);

  // ── your clock: the lobby's turn timer, spent on one column ───────
  useEffect(() => {
    // No house move in a shared match: dropping a disc for somebody means
    // posting it as them, and a clock that fires on two phones a second apart
    // would post it twice.
    if (net) return;
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
      const cur = now.current;
      if (cur.winner || cur.turn !== 'you') return;
      const col = houseColumn(cur.board, rng.current as Rng);
      if (col === null) return;
      const r = lowest(cur.board, col);
      const n = place(cur.board, col, 'you');
      if (r < 0 || !n) return;
      settle(n, 'you', r * COLS + col);
      onToast(`Time — the house dropped in column ${col + 1}`);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, lastIdx, clock]);

  // The winning four gets a beat in the clear before the card covers the board.
  useEffect(() => {
    if (!winner) return;
    const id = setTimeout(() => setOver(true), winner === 'draw' ? 700 : 1400);
    return () => clearTimeout(id);
  }, [winner]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your move ─────────────────────────────────────────────────────

  const drop = (col: number) => {
    if (winner) return onToast('The board is closed — rematch, or take the scoreboard');
    if (turn !== 'you') return onToast(`${foe.name} is thinking`);
    if (lowest(board, col) < 0) return onToast(`Column ${col + 1} is full`);

    if (net) {
      // Nothing is applied here — the move goes to the log and comes back as
      // everyone else's does, which is the only way both boards stay equal.
      if (nm.sending) return;
      return nm.play({ col } as never);
    }

    const r = lowest(board, col);
    const n = place(board, col, 'you');
    if (!n) return;
    settle(n, 'you', r * COLS + col);
  };

  /** A fresh board. Whoever lost the last one opens the next. */
  const rematch = () => {
    // A rematch is a new seed and a new log, which is a new table — offering it
    // here would silently restart only this phone.
    if (net) return onToast('Open a new room for a rematch');
    const opener: Turn = winner === 'you' ? 'bot' : 'you';
    setBoard(emptyBoard());
    setWinner(null);
    setWinLine([]);
    setLastIdx(-1);
    setOver(false);
    setSecs(clock);
    setTurn(opener);
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;

    const w = winner;
    const total = Math.max(1, played);
    const xpOf = (wins: number) => 180 * wins + 30 * (total - wins);
    const discs = (p: Disc) => board.filter((v) => v === p).length;

    const line = (p: Player, side: Disc, wins: number) => ({
      n: p.name,
      d:
        w === side
          ? `Four in a row · ${discs(side)} discs`
          : w === 'draw'
            ? `Board full · ${discs(side)} discs`
            : `${discs(side)} discs, no line`,
      s: `+${xpOf(wins)}`,
      win: w === side,
      mark: p.mark,
      grad: p.grad,
    });

    const ahead = tally.you - tally.bot;
    const series = total > 1 ? ` · ${tally.you}–${tally.bot} on the night` : '';

    onFinish({
      game: 'Connect 4',
      head:
        total > 1
          ? ahead > 0
            ? 'You took the night'
            : ahead < 0
              ? 'You lost the night'
              : 'All square'
          : w === 'you'
            ? 'You won'
            : w === 'bot'
              ? 'You lost'
              : 'A draw',
      kicker:
        (w === 'you' ? 'Four in a row' : w === 'bot' ? `${foe.name} got there first` : 'Board full, nobody lined up') + series,
      xp: `+${xpOf(tally.you)}`,
      note:
        w === 'you'
          ? 'Rematch before they change their mind.'
          : w === 'bot'
            ? 'It saw the line first. Rematch and take it back.'
            : 'Forty-two slots and not one four. Run it again.',
      rows: [line(you, 'you', tally.you), line(foe, 'bot', tally.bot)].sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const seats: SeatInfo[] = [
    {
      name: foe.name,
      mark: foe.mark,
      grad: foe.grad,
      sub: winner ? 'Board closed' : turn === 'bot' ? 'Thinking…' : `${board.filter((v) => v === 'bot').length} discs`,
      active: !winner && turn === 'bot',
    },
  ];

  const log = winner
    ? winner === 'you'
      ? 'Four in a row — the board is yours'
      : winner === 'bot'
        ? `${foe.name} lined up four`
        : 'Board full — nobody lined up'
    : mine
      ? 'Your move — tap a column to drop'
      : `${foe.name} is choosing a column`;

  const hud = winner ? 'CLOSED' : mine ? `${Math.max(0, secs)}s` : 'THINKING';
  const dot = winner ? t.dim2 : mine ? t.acc : t.cyan;

  return (
    <GameShell>
      <GameHeader
        hud={`CONNECT 4 · ${tally.you}–${tally.bot}`}
        extra={<HudChip tint={winner ? t.dim : mine ? (secs <= 10 ? t.pink : t.gold) : t.cyan}>{hud}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seats} />

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 4 }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <View
          style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER }}
          onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {measured && (
            <FadeIn>
              <BoardView
                board={board}
                cell={cell}
                lastIdx={lastIdx}
                winLine={winLine}
                live={mine}
                you={you}
                foe={foe}
                onDrop={drop}
              />
            </FadeIn>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingTop: 8 }}>
        <Pulse color={dot} />
        <View style={{ flexShrink: 1 }}>
          <TableLog text={log} />
        </View>
      </View>

      <View style={{ paddingTop: 8 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <YourSeat player={you} discs={board.filter((v) => v === 'you').length} live={mine} wins={tally.you} />

      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        <Glass radius={R.pill} elevated={false}>
          <View style={{ paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center' }}>
            <P size={11.5} color={t.dim2} numberOfLines={1}>
              {winner
                ? played > 1
                  ? `${played} boards played · ${tally.you}–${tally.bot}`
                  : 'Rematch, or take the scoreboard'
                : 'Four in a line wins — across, down or diagonal.'}
            </P>
          </View>
        </Glass>
      </View>

      {over && (
        <GameOverlay
          title={winner === 'you' ? 'Four in a row' : winner === 'bot' ? 'They got four' : 'Draw'}
          blurb={
            winner === 'you'
              ? `Clean. ${played > 1 ? `That is ${tally.you}–${tally.bot} on the night.` : 'Take the scoreboard.'}`
              : winner === 'bot'
                ? `${foe.name} saw the line first.${played > 1 ? ` ${tally.you}–${tally.bot} on the night.` : ''}`
                : 'Forty-two slots and not one four.'
          }
          label="Board closed"
          width={296}
        >
          <OverlayActions
            secondary={{ label: 'Rematch', onPress: rematch }}
            primary={{ label: 'Scoreboard', onPress: finish }}
          />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── pieces ────────────────────────────────────────────────────────

/**
 * The grid. Each column is one tap target the full height of the board, which
 * is how the physical game works and how a thumb expects it to behave.
 */
function BoardView({
  board,
  cell,
  lastIdx,
  winLine,
  live,
  you,
  foe,
  onDrop,
}: {
  board: Board;
  cell: number;
  lastIdx: number;
  winLine: number[];
  live: boolean;
  you: Player;
  foe: Player;
  onDrop: (col: number) => void;
}) {
  const t = useTheme();
  // Glass draws its rim inside this width, so the holes only get what is left.
  const width = cell * COLS + GAP * (COLS - 1) + PAD * 2 + BORDER * 2;

  return (
    <Glass radius={24} borderColor={t.line2} style={{ width }}>
      <View style={{ flexDirection: 'row', gap: GAP, padding: PAD }}>
        {Array.from({ length: COLS }, (_, c) => {
          const free = lowest(board, c);
          const filled = ROWS - 1 - free;
          return (
            <Tap
              key={c}
              onPress={() => onDrop(c)}
              label={
                free < 0
                  ? `Column ${c + 1} is full`
                  : `Drop in column ${c + 1}, ${filled === 0 ? 'empty' : `${filled} of ${ROWS} filled`}${live ? '' : ', not your turn'}`
              }
              style={{ gap: GAP }}
            >
              {Array.from({ length: ROWS }, (_, r) => {
                const i = r * COLS + c;
                const wi = winLine.indexOf(i);
                return (
                  <Slot
                    key={r}
                    value={board[i]}
                    size={cell}
                    row={r}
                    dropping={i === lastIdx}
                    winOrder={wi}
                    grad={board[i] === 'you' ? you.grad : foe.grad}
                  />
                );
              })}
            </Tap>
          );
        })}
      </View>
    </Glass>
  );
}

/**
 * One hole in the grid.
 *
 * A newly played disc falls in from above its column — the `vDrop` keyframe as
 * a `translateY` — and the four that won pulse in sequence, which is `vWave`.
 * Both run on the native driver, and both stop when the slot stops needing them.
 */
function Slot({
  value,
  size,
  row,
  dropping,
  winOrder,
  grad,
}: {
  value: Disc | null;
  size: number;
  row: number;
  dropping: boolean;
  /** Position in the winning four, or -1. */
  winOrder: number;
  grad: string;
}) {
  const t = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  const s = useRef(new Animated.Value(1)).current;
  const won = winOrder >= 0;

  useEffect(() => {
    // A fall that is interrupted — you drop into another column before this one
    // has landed — stops where it stands, so the slot has to be put back on its
    // hole rather than left hanging over the board.
    if (!dropping || !value) {
      y.setValue(0);
      return;
    }
    y.setValue(-(row + 1) * (size + GAP));
    const a = Animated.timing(y, {
      toValue: 0,
      duration: 400,
      easing: Easing.bezier(0.3, 1.35, 0.5, 1),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [dropping, value, row, size, y]);

  useEffect(() => {
    if (!won) {
      s.setValue(1);
      return;
    }
    const a = Animated.sequence([
      Animated.delay(winOrder * 110),
      Animated.loop(
        Animated.sequence([
          Animated.timing(s, { toValue: 1.14, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ]);
    a.start();
    return () => a.stop();
  }, [won, winOrder, s]);

  if (!value) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.track,
          borderWidth: 1,
          borderColor: t.line,
        }}
      />
    );
  }

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // A disc has no fill of its own — the gradient inside paints it — so its
        // shadow goes through `bloom`; `elevation` would square it off.
        ...(won ? bloom(t.acc, 14, 0.9) : bloom(t.shadowColor, 8, t.shadowOpacity, 4)),
        transform: [{ translateY: y }, { scale: s }],
      }}
    >
      <LinearGradient
        colors={gradStops(grad)}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: won ? 2.5 : 0,
          borderColor: t.ink,
        }}
      />
    </Animated.View>
  );
}

/** Your name, your colour and how the night is going. */
function YourSeat({ player, discs, live, wins }: { player: Player; discs: number; live: boolean; wins: number }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      <Glass radius={14} elevated={false} borderColor={live ? t.acc : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Avatar mark={player.mark} grad={player.grad} size={26} fontSize={11} />
          <H size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
            {player.name}
          </H>
          <P size={10.5} color={t.dim2}>
            {live ? 'Your turn' : `${discs} discs`}
          </P>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Kicker color={t.dim2} tracking={1.2}>
              BOARDS WON
            </Kicker>
            <H size={12.5} color={wins > 0 ? t.lime : t.dim2}>
              {wins}
            </H>
          </View>
        </View>
      </Glass>
    </View>
  );
}

/** The breathing dot beside the status line — the design's `vPulse`. */
function Pulse({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [v]);
  return (
    <Animated.View
      style={{
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
      }}
    />
  );
}

export const game: PlayableGame = {
  name: 'Connect 4',
  rules: [
    'Take turns dropping a disc into a column.',
    'Discs stack from the bottom up.',
    'Four in a line — across, down or diagonal — wins.',
  ],
  Screen,
};

export { Screen };
