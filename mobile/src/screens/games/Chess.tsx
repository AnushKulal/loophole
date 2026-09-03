import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Avatar, Chip, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../../components/base';
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
  PROMOTIONS,
  applyMove,
  bestMove,
  botMove,
  capturedBy,
  findMove,
  inCheck,
  isLightSquare,
  kingSquare,
  materialLead,
  movesFrom,
  nameOf,
  newGame,
  outcome,
  outcomeText,
  resign,
  status,
  xpFor,
  type ChessState,
  type Color,
  type Move,
  type PieceType,
} from '../../game/chess';
import { ChessPiece, TakenPiece } from './ChessPieces';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * Chess.
 *
 * You are White and you move first. Tapping a piece lights every square it may
 * legally reach — a dot on an empty square, a ring around anything it can take
 * — and tapping one of them plays the move, promotion picker and all. The strip
 * above and below the board carries the material each side has taken, so the
 * one number that decides most games is always on screen, and the banner under
 * the board says the only other thing that matters: whether a king is in check.
 *
 * Every rule lives in `src/game/chess.ts`. This file owns nothing but the
 * pixels, the taps and the clock.
 */


/**
 * Both sets have to read against both square tints in both themes, so — like a
 * real set, and unlike anything else on the screen — the men keep a fixed
 * near-white and near-black rather than taking a theme colour.
 */
const MAN = { w: '#f4f8ff', b: '#111725' };

const NAME_OF: Record<PieceType, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

const FLAG = 'M5 21V4M5 4h11l-2 3.5L16 11H5';
const CROWN = 'M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13z';

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The colour you play. White, so you always open. */
const YOU: Color = 'w';

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  /** You take White and move first; the seat opposite plays Black. */
  const you = config.you;
  const foe: Player = config.opponents[0] ?? { ...config.you, name: 'Opponent', bot: true };

  /**
   * Board options. Chess seats exactly two, so `players` has nothing to say
   * here; `turn` is the clock on your move, after which the house plays one for
   * you, since a chess turn cannot simply be skipped.
   */
  const clock = clamp(Math.round(config.options.turn) || 30, 10, 180);

  // One seeded stream drives every decision the opponent makes, so a match
  // replays exactly the way the engine tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<ChessState>(newGame);
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [secs, setSecs] = useState(clock);
  const [emote, setEmote] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);

  const o = useMemo(() => outcome(st), [st]);
  const mine = !o.over && st.turn === YOU;
  const checked = useMemo(() => (inCheck(st) ? kingSquare(st.board, st.turn) : -1), [st]);

  /** Destination square to the move that lands on it — what a tap resolves to. */
  const targets = useMemo(() => {
    const map = new Map<number, Move>();
    if (sel === null || !mine) return map;
    for (const m of movesFrom(st, sel)) if (!map.has(m.to)) map.set(m.to, m);
    return map;
  }, [st, sel, mine]);

  // The board is square and sized to whatever the middle of the frame leaves,
  // so it fits a short phone without ever pushing the controls off the bottom.
  const measured = box.w > 0 && box.h > 0;
  const side = clamp(Math.floor(Math.min(box.w, box.h) / 8), 26, 46);

  // ── the opponent thinks, then moves ───────────────────────────────
  useEffect(() => {
    if (o.over || st.turn === YOU) return;
    setThinking(true);
    const id = setTimeout(() => {
      // The search is bounded by a node budget rather than a clock, so this is
      // a short burst rather than an open-ended stall.
      const m = botMove(st, bot, rng.current as Rng);
      setThinking(false);
      if (m) setSt((cur) => (cur === st ? applyMove(cur, m) : cur));
    }, bot.think);
    return () => {
      clearTimeout(id);
      setThinking(false);
    };
  }, [st, o.over, bot]);

  // ── your clock: the lobby's turn timer, spent on one move ─────────
  useEffect(() => {
    // The clock stops while the promotion picker is up — that is still your
    // move, and it would be unfair to play it for you mid-choice.
    if (!mine || promo) {
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
      if (cur.turn !== YOU || outcome(cur).over) return;
      // Out of time: the house plays a sound move rather than skipping a turn,
      // because a chess position cannot simply be passed.
      const m = bestMove(cur, 1, rng.current as Rng);
      if (!m) return;
      setSel(null);
      setSt(applyMove(cur, m));
      onToast(`Time — the house played ${nameOf(m.from)}–${nameOf(m.to)}`);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, promo, st.full, st.turn, clock]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your moves ────────────────────────────────────────────────────

  const onSquare = (i: number) => {
    if (o.over) return;
    if (!mine) return onToast(`${foe.name} is thinking`);

    const target = targets.get(i);
    if (target) {
      if (target.promo) {
        setPromo({ from: target.from, to: target.to });
        setSel(null);
        return;
      }
      setSt(applyMove(st, target));
      setSel(null);
      return;
    }

    const p = st.board[i];
    if (p && p.c === YOU) {
      setSel(i === sel ? null : i);
      return;
    }
    if (sel !== null) onToast('That piece cannot go there');
    setSel(null);
  };

  const choose = (type: PieceType) => {
    if (!promo) return;
    const m = findMove(st, promo.from, promo.to, type);
    setPromo(null);
    if (m) setSt(applyMove(st, m));
  };

  const giveUp = () => {
    if (o.over) return;
    setSel(null);
    setSt(resign(st, YOU));
    onToast('You resigned');
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const how = status(st);
    const won = o.winner === YOU;
    const gap = materialLead(st, YOU);
    const played = Math.max(1, st.full - (st.turn === 'w' ? 1 : 0));
    const drawn = how === 'stalemate' ? 'stalemate' : how === 'fifty' ? 'the fifty-move rule' : 'no mating material';

    const row = (p: Player, c: Color) => ({
      n: p.name,
      d: o.draw
        ? `Drawn by ${drawn}`
        : o.winner === c
          ? `Won by ${how === 'checkmate' ? 'checkmate' : 'resignation'}`
          : how === 'resigned'
            ? 'Resigned'
            : 'Checkmated',
      s: `+${xpFor(st, c, o)}`,
      win: o.winner === c,
      mark: p.mark,
      grad: p.grad,
    });

    onFinish({
      game: 'Chess',
      head: o.draw ? 'A draw' : won ? 'You won' : 'You lost',
      kicker: outcomeText(o, (c) => (c === YOU ? 'You' : foe.name)),
      xp: `+${xpFor(st, YOU, o)}`,
      note: o.draw
        ? `${played} moves, and neither king could be caught.`
        : `${played} moves, and you finished ${gap === 0 ? 'level' : gap > 0 ? `${gap} up` : `${-gap} down`} on material.`,
      rows: [row(you, 'w'), row(foe, 'b')].sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const seats: SeatInfo[] = [
    {
      name: foe.name,
      mark: foe.mark,
      grad: foe.grad,
      sub: o.over ? 'Game over' : thinking ? 'Thinking…' : `Black · ${st.turn === 'b' ? 'to move' : 'waiting'}`,
      active: !o.over && st.turn === 'b',
    },
  ];

  const log = o.over
    ? outcomeText(o, (c) => (c === YOU ? 'You' : foe.name))
    : checked >= 0
      ? st.turn === YOU
        ? 'You are in check — you must answer it'
        : `${foe.name} is in check`
      : promo
        ? 'Choose what the pawn becomes'
        : mine
          ? sel === null
            ? 'Tap a piece to see where it can go'
            : `${targets.size} legal ${targets.size === 1 ? 'square' : 'squares'} from ${nameOf(sel)}`
          : `${foe.name} is choosing a move`;

  const lead = materialLead(st, YOU);
  const hud = o.over ? 'FINISHED' : mine ? `${Math.max(0, secs)}s` : 'THINKING';

  return (
    <GameShell>
      <GameHeader
        hud={`MOVE ${st.full} · ${config.difficulty.toUpperCase()}`}
        extra={<HudChip tint={o.over ? t.dim : mine ? (secs <= 10 ? t.pink : t.gold) : t.cyan}>{hud}</HudChip>}
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

        <Taken who={foe.name} pieces={capturedBy(st, 'b')} lead={-lead} victims="w" />

        <View
          style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
          onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {measured && (
            <FadeIn>
              <Board
                st={st}
                side={side}
                sel={sel}
                targets={targets}
                checked={checked}
                live={mine}
                onSquare={onSquare}
              />
            </FadeIn>
          )}
        </View>

        <Taken who="You" pieces={capturedBy(st, 'w')} lead={lead} victims="b" />
      </View>

      <View style={{ paddingTop: 8 }}>
        <TableLog text={log} />
      </View>

      <View style={{ paddingTop: 8 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <YourSeat player={you} lead={lead} live={mine} />

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 }}>
        <Glass radius={R.pill} elevated={false} style={{ flex: 1 }}>
          <View style={{ paddingVertical: 15, alignItems: 'center' }}>
            <H size={12.5} weight={700} color={mine ? t.ink : t.dim2} numberOfLines={1}>
              {o.over ? 'The game is over' : mine ? 'Your move' : `${foe.name} to move`}
            </H>
          </View>
        </Glass>
        <Tap onPress={giveUp} label="Resign the game" disabled={o.over}>
          <Glass radius={R.pill} elevated={false} style={{ opacity: o.over ? 0.45 : 1 }}>
            <View style={{ paddingVertical: 15, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Glyph d={FLAG} size={15} color={t.pink} width={2} />
              <H size={12.5} weight={700} color={t.pink}>
                Resign
              </H>
            </View>
          </Glass>
        </Tap>
      </View>

      {promo && <PromotionPicker onPick={choose} onCancel={() => setPromo(null)} square={nameOf(promo.to)} />}

      {o.over && (
        <GameOverlay
          title={o.draw ? 'A draw' : o.winner === YOU ? 'You won' : 'You lost'}
          blurb={`${outcomeText(o, (c) => (c === YOU ? 'You' : foe.name))}. ${
            lead === 0 ? 'Material was level.' : lead > 0 ? `You were ${lead} up on material.` : `You were ${-lead} down on material.`
          }`}
          label="Game over"
          width={296}
        >
          <View style={{ alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Glyph d={CROWN} size={30} color={o.draw ? t.dim : o.winner === YOU ? t.gold : t.pink} width={1.9} glow={o.winner === YOU ? t.gold : undefined} />
            <P size={11.5} color={t.dim2} style={{ textAlign: 'center', lineHeight: 16 }}>
              {st.moves.slice(-6).join('  ') || 'No moves were played.'}
            </P>
          </View>
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── the board ─────────────────────────────────────────────────────

/** One man: a vector piece filled in its own colour, contoured in the other. */
function Man({ c, type, size }: { c: Color; type: PieceType; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <ChessPiece
        type={type}
        size={Math.round(size * 0.86)}
        fill={c === 'w' ? MAN.w : MAN.b}
        edge={c === 'w' ? MAN.b : MAN.w}
      />
    </View>
  );
}

/** Eight ranks of eight squares, with everything a tap needs to know drawn on. */
function Board({
  st,
  side,
  sel,
  targets,
  checked,
  live,
  onSquare,
}: {
  st: ChessState;
  side: number;
  sel: number | null;
  targets: Map<number, Move>;
  checked: number;
  live: boolean;
  onSquare: (i: number) => void;
}) {
  const t = useTheme();
  const last = st.last;

  return (
    // The shadow and the clip are separate nodes: a node that clips its
    // children on iOS clips its own shadow too.
    <View
      style={{
        borderRadius: R.lg,
        shadowColor: t.shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
        shadowOpacity: t.shadowOpacity,
        elevation: 8,
      }}
    >
      <View style={{ borderRadius: R.lg, overflow: 'hidden', borderWidth: 1, borderColor: t.line2 }}>
        {ROWS.map((row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {ROWS.map((col) => {
            const i = row * 8 + col;
            const p = st.board[i];
            const move = targets.get(i);
            const label = `${nameOf(i)}${p ? `, ${p.c === 'w' ? 'white' : 'black'} ${NAME_OF[p.t]}` : ', empty'}${
              move ? (move.cap ? ', can be taken' : ', can move here') : ''
            }${sel === i ? ', selected' : ''}${checked === i ? ', in check' : ''}`;

            return (
              <Tap key={i} onPress={() => onSquare(i)} label={label}>
                <View
                  style={{
                    width: side,
                    height: side,
                    backgroundColor: isLightSquare(i) ? t.g2 : t.g3,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: live ? 1 : 0.92,
                  }}
                >
                  {last && (i === last.from || i === last.to) && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.gold, opacity: 0.26 }} />
                  )}
                  {checked === i && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.pink, opacity: 0.42 }} />
                  )}
                  {sel === i && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.acc, opacity: 0.5 }} />
                  )}

                  {p && <Man c={p.c} type={p.t} size={side} />}

                  {move && !move.cap && (
                    <View
                      style={{
                        position: 'absolute',
                        width: Math.round(side * 0.3),
                        height: Math.round(side * 0.3),
                        borderRadius: side,
                        backgroundColor: t.acc,
                        opacity: 0.85,
                      }}
                    />
                  )}
                  {move && !!move.cap && (
                    <View
                      style={{
                        position: 'absolute',
                        width: Math.round(side * 0.86),
                        height: Math.round(side * 0.86),
                        borderRadius: side,
                        borderWidth: 3,
                        borderColor: t.pink,
                      }}
                    />
                  )}

                  {/* File letters along the bottom rank, ranks down the left. */}
                  {row === 7 && (
                    <Text
                      style={{
                        position: 'absolute',
                        right: 2,
                        bottom: 1,
                        fontSize: 8,
                        lineHeight: 10,
                        color: isLightSquare(i) ? t.g3 : t.g2,
                      }}
                    >
                      {nameOf(i)[0]}
                    </Text>
                  )}
                  {col === 0 && (
                    <Text
                      style={{
                        position: 'absolute',
                        left: 2,
                        top: 1,
                        fontSize: 8,
                        lineHeight: 10,
                        color: isLightSquare(i) ? t.g3 : t.g2,
                      }}
                    >
                      {nameOf(i)[1]}
                    </Text>
                  )}
                </View>
              </Tap>
            );
          })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── the strips ────────────────────────────────────────────────────

/**
 * What one side has taken off the board, and by how much it is ahead.
 *
 * These glyphs sit on the page rather than on a square, so they take the
 * theme's dim ink; the two sets are told apart by the face of the glyph —
 * outlines for the White men, solids for the Black — the way a scoresheet does.
 */
function Taken({ who, pieces, lead, victims }: { who: string; pieces: PieceType[]; lead: number; victims: Color }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8, height: 28 }}>
      <Kicker color={t.dim2} tracking={1.3}>
        {who.toUpperCase()}
      </Kicker>
      <View
        accessible
        accessibilityLabel={
          pieces.length ? `${who} has taken ${pieces.map((p) => NAME_OF[p]).join(', ')}` : `${who} has taken nothing`
        }
        style={{ flexDirection: 'row', flex: 1, minWidth: 0, alignItems: 'center' }}
      >
        {pieces.slice(0, 15).map((p, k) => (
          <TakenPiece key={k} type={p} size={16} ink={t.dim} victims={victims} />
        ))}
      </View>
      {lead > 0 && (
        <Chip bg={t.tile} border={t.line} color={t.lime}>
          {`+${lead}`}
        </Chip>
      )}
    </View>
  );
}

/** Your name, your colour and where the material stands from your chair. */
function YourSeat({ player, lead, live }: { player: Player; lead: number; live: boolean }) {
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
            White
          </P>
          <View style={{ marginLeft: 'auto' }}>
            <Chip bg={t.tile} border={t.line} color={lead > 0 ? t.lime : lead < 0 ? t.pink : t.dim}>
              {lead === 0 ? 'Material level' : lead > 0 ? `${lead} up` : `${-lead} down`}
            </Chip>
          </View>
        </View>
      </Glass>
    </View>
  );
}

/** The four pieces a pawn on the eighth rank may become. */
function PromotionPicker({
  onPick,
  onCancel,
  square,
}: {
  onPick: (type: PieceType) => void;
  onCancel: () => void;
  square: string;
}) {
  const t = useTheme();
  return (
    <GameOverlay
      title="Promote"
      blurb={`Your pawn reached ${square}. Choose what it becomes — a queen unless you have a reason.`}
      label="Choose a promotion piece"
      width={296}
    >
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {PROMOTIONS.map((type) => (
          <Tap key={type} onPress={() => onPick(type)} label={`Promote to a ${NAME_OF[type]}`} style={{ flex: 1 }}>
            <Gradient radius={14} glow={false}>
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 4 }}>
                <Man c="w" type={type} size={34} />
                <H size={10} weight={700} color="#fff">
                  {NAME_OF[type].toUpperCase()}
                </H>
              </View>
            </Gradient>
          </Tap>
        ))}
      </View>
      <Tap onPress={onCancel} label="Pick a different move instead">
        <View style={{ padding: 13, borderRadius: 12, backgroundColor: t.panel2, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
          <H size={13}>Pick another move</H>
        </View>
      </Tap>
    </GameOverlay>
  );
}

export const game: PlayableGame = {
  name: 'Chess',
  Screen,
  rules: [
    'You play White and move first. Tap a piece to light every square it may legally reach, then tap one of them to move there.',
    'The whole rulebook is in: castling both ways, capturing en passant, and a picker when a pawn reaches the eighth rank. A king may never be left in check.',
    'Trap the king with no legal answer and it is checkmate. No legal move without check is stalemate — a draw, as are bare kings and fifty moves with no capture and no pawn moved.',
  ],
};

export { Screen };
