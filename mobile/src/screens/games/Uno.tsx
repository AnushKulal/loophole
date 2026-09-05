import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { Glass, Glyph, Gradient, H, Kicker, P, Tap, gradStops } from '../../components/base';
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
  pick,
  type BotProfile,
  type GameScreenProps,
  type PlayableGame,
  type Player,
  type Rng,
} from '../../game/contract';
import {
  COLOURS,
  MAX_SEATS,
  MIN_SEATS,
  UC,
  UNAME,
  applyCard,
  bestColour,
  botChoice,
  cardGrad,
  deal,
  drawTo,
  faceOf,
  isValid,
  nextSeat,
  takeStack,
  type Card,
  type CardColour,
  type Colour,
  type UnoState,
} from '../../game/uno';
import { useTheme } from '../../theme/theme';
import { radius as R, bloom } from '../../theme/tokens';

/**
 * UNO.
 *
 * A full 108-card round for the seats the lobby agreed — two to six hands, seat
 * 0 being you. The three things you play from are always on screen at once: the
 * colour in force, the card on the pile, and your hand — where anything you may
 * legally play lifts out of the row and brightens, so a legal move is something
 * you see rather than something you work out. Everything else (the deck, the
 * direction, who is close to going out) sits in the seat strip and the header.
 *
 * The rules live in `src/game/uno.ts` and are pure; this screen owns the state
 * and the clock, and drives the bots off `BOT[difficulty]`.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Deep enough that `drawTo` and `applyCard` can mutate without touching state. */
const clone = (u: UnoState): UnoState => ({
  ...u,
  deck: u.deck.slice(),
  discard: u.discard.slice(),
  hands: u.hands.map((h) => h.slice()),
});

/** How a card reads out loud — "Coral draw two" rather than "R +2". */
const VALUE_NAME: Record<string, string> = {
  skip: 'skip',
  rev: 'reverse',
  '+2': 'draw two',
  wild: 'wild',
  '+4': 'wild draw four',
};
const say = (c: Card) => `${UNAME[c.c]} ${VALUE_NAME[c.v] ?? c.v}`;

/** What the table sees when a card goes down. */
const played = (c: Card, chosen: CardColour | null) =>
  c.c === 'W' ? `${VALUE_NAME[c.v] ?? c.v} → ${UNAME[chosen ?? 'W']}` : say(c);

/** What the table is waiting on you for — a live +2 stack is not just "your move". */
const yourCue = (u: UnoState) => (u.draw > 0 ? `Take ${u.draw} or answer with a +2` : 'Your move');

// ── moves ───────────────────────────────────────────────────────────

/**
 * Seat `seat` plays the card at `idx`. An empty hand ends the round there and
 * then — the card still lands on the pile so you can see what went out on.
 */
function playFrom(
  prev: UnoState,
  seat: number,
  idx: number,
  chosen: CardColour | null,
  who: (i: number) => string,
  rng: Rng,
): UnoState {
  const u = clone(prev);
  const hand = u.hands[seat];
  const card = hand[idx];
  if (!card) return prev;

  hand.splice(idx, 1);
  u.need = false;
  u.pending = null;

  if (!hand.length) {
    u.winner = seat;
    u.discard.push(u.top);
    u.top = card;
    u.colour = card.c === 'W' ? (chosen ?? u.colour) : card.c;
    u.log = seat === 0 ? 'You went out' : `${who(seat)} went out`;
    return u;
  }

  applyCard(u, card, chosen, seat, rng);
  u.log =
    seat === 0
      ? hand.length === 1
        ? 'One card left — say it'
        : 'Waiting on the table'
      : `${who(seat)} played ${played(card, chosen)}`;
  if (u.turn === 0 && seat !== 0) u.log = yourCue(u);
  return u;
}

/**
 * Seat `seat` takes off the deck. A live +2 stack is taken whole and ends the
 * turn; otherwise it is one card, and a drawn card that happens to fit goes
 * straight back down when `playIt` is set — that is the human's draw pile, and
 * the sharper bots do the same rather than sitting on a live card.
 */
function drawFrom(prev: UnoState, seat: number, playIt: boolean, who: (i: number) => string, rng: Rng): UnoState {
  const u = clone(prev);

  if (u.draw > 0) {
    const owed = u.draw;
    takeStack(u, seat, rng);
    u.log = seat === 0 ? `You took ${owed} cards` : `${who(seat)} took ${owed} cards`;
    if (u.turn === 0 && seat !== 0) u.log = yourCue(u);
    return u;
  }

  drawTo(u, seat, 1, rng);
  const hand = u.hands[seat];
  // Deck and discards can both be dry, in which case nothing was taken at all.
  const drew = hand.length > prev.hands[seat].length;
  const card = drew ? hand[hand.length - 1] : null;

  if (card && playIt && card.c !== 'W' && isValid(card, u, hand)) {
    hand.pop();
    applyCard(u, card, null, seat, rng);
    u.log = seat === 0 ? `Drew ${say(card)} and played it` : `${who(seat)} drew ${say(card)} and played it`;
  } else {
    u.turn = nextSeat(u.dir, seat, false, u.hands.length);
    u.log = !drew
      ? 'Nothing left to draw — the turn passes'
      : seat === 0
        ? 'You drew a card'
        : `${who(seat)} drew a card`;
  }
  if (u.turn === 0 && seat !== 0) u.log = yourCue(u);
  return u;
}

/**
 * The engine's `botChoice` — colour, then value, then a wild — scaled by the
 * profile. `blunder` and anything under full `skill` throw the tidy line away
 * for a random legal card, and from `depth` 2 the bot looks one seat ahead:
 * against a hand that is nearly out it spends a punisher instead.
 */
function botPick(u: UnoState, seat: number, bot: BotProfile, rng: Rng): number {
  const hand = u.hands[seat];
  // `isValid` sees the whole hand, so a +4 held alongside the live colour is
  // never in this list — the bots punish with what the rules allow them.
  const legal = hand.map((c, i) => (isValid(c, u, hand) ? i : -1)).filter((i) => i >= 0);
  if (!legal.length) return -1;
  if (rng() < bot.blunder || rng() > bot.skill) return pick(legal, rng);

  if (bot.depth >= 2) {
    const target = u.hands[nextSeat(u.dir, seat, false, u.hands.length)];
    if (target.length <= 2) {
      const punish = ['+4', '+2', 'skip'].map((v) => legal.find((i) => hand[i].v === v)).find((i) => i !== undefined);
      if (punish !== undefined) return punish;
    }
  }
  return botChoice(hand, u);
}

// ── screen ──────────────────────────────────────────────────────────

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  // Board option: how many seats sit down. Only the lobby's own players are
  // dealt in — a seat nobody filled is a seat that does not exist.
  const roster = [config.you, ...config.opponents];
  const wanted = clamp(Math.round(config.options.players) || roster.length, MIN_SEATS, MAX_SEATS);
  const table: Player[] = roster.slice(0, wanted);
  const seats = Math.max(MIN_SEATS, table.length);
  /** Only reached if a lobby somehow starts one-handed; every seat still gets a name and a row. */
  const seatAt = (i: number): Player =>
    table[i] ?? { name: `Seat ${i + 1}`, mark: '●', grad: cardGrad(COLOURS[i % COLOURS.length]), bot: true };
  const who = (i: number) => seatAt(i).name;

  /** Board option: how long a turn may be held before it plays itself. */
  const clock = clamp(Math.round(config.options.turn) || 20, 5, 90);
  /** UNO's own lobby rule: a +2 may be answered with a +2 instead of drawing. */
  const stacking = config.options.stack !== false;

  // One seeded stream drives the deal, every reshuffle and every bot decision.
  const seed = useRef<Rng | null>(null);
  if (!seed.current) seed.current = makeRng(Math.floor(Math.random() * 0x7fffffff));
  const rng = seed.current;

  const [st, setSt] = useState<UnoState>(() => deal(seats, rng, stacking));
  const [emote, setEmote] = useState<string | null>(null);
  const [secs, setSecs] = useState(clock);
  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);

  const over = st.winner !== null;
  const myTurn = st.turn === 0 && !over;
  const picking = st.need && st.pending !== null;

  // ── the bots, on the beat their profile sets ──────────────────────
  useEffect(() => {
    if (over || st.turn === 0) return;
    const seat = st.turn;
    const id = setTimeout(() => {
      setSt((cur) => {
        if (cur.winner !== null || cur.turn !== seat) return cur;
        const i = botPick(cur, seat, bot, rng);
        if (i < 0) return drawFrom(cur, seat, bot.depth >= 2, who, rng);
        const card = cur.hands[seat][i];
        const rest = cur.hands[seat].filter((_, k) => k !== i);
        return playFrom(cur, seat, i, card.c === 'W' ? bestColour(rest) : null, who, rng);
      });
    }, bot.think);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, bot, over]);

  // ── your clock: the lobby's turn timer, spent on one card ─────────
  useEffect(() => {
    if (!myTurn || picking) {
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
      setSt(drawFrom(cur, 0, true, who, rng));
      onToast(cur.draw > 0 ? `Time — you took ${cur.draw}` : 'Time — you drew');
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, picking, clock, st.turn]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your moves ────────────────────────────────────────────────────

  const tapCard = (i: number) => {
    if (over) return;
    if (!myTurn) return onToast('Wait for your turn');
    const card = st.hands[0][i];
    if (!card) return;
    if (!isValid(card, st, st.hands[0])) {
      if (st.draw > 0) return onToast(`Answer with a +2 or take ${st.draw}`);
      // A +4 is only yours to play when you are out of the colour in force.
      if (card.v === '+4') return onToast(`You still hold ${UNAME[st.colour]}`);
      return onToast('That card does not match');
    }
    // A wild needs a colour before it can resolve — open the picker.
    if (card.c === 'W') return setSt({ ...st, need: true, pending: i });
    setSt(playFrom(st, 0, i, null, who, rng));
  };

  const chooseColour = (c: Colour) => {
    if (st.pending === null) return;
    setSt(playFrom(st, 0, st.pending, c, who, rng));
  };

  const drawOne = () => {
    if (over) return;
    if (!myTurn) return onToast('Wait for your turn');
    setSt(drawFrom(st, 0, true, who, rng));
  };

  const again = () => {
    setSt(deal(seats, rng, stacking));
    setSecs(clock);
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const w = st.winner ?? 0;
    const won = w === 0;
    const mine = st.hands[0].length;

    onFinish({
      game: 'UNO',
      head: won ? 'You went out' : 'You lost',
      kicker: won ? 'Hand emptied first' : `${who(w)} emptied first`,
      xp: won ? '+240' : '+40',
      note: won
        ? 'Hand emptied before anybody could stack a +4 on you.'
        : `${mine} card${mine === 1 ? '' : 's'} still in your hand when it ended.`,
      // One row per seat that was dealt in, so nobody at the table is missing.
      rows: Array.from({ length: seats }, (_, i) => {
        const p = seatAt(i);
        return {
          n: p.name,
          d: i === w ? 'Went out' : `${st.hands[i].length} cards left`,
          s: i === w ? '+240' : '+40',
          win: i === w,
          mark: p.mark,
          grad: p.grad,
        };
      }).sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const strip: SeatInfo[] = Array.from({ length: seats - 1 }, (_, k) => {
    const i = k + 1;
    const p = seatAt(i);
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: `${st.hands[i].length} card${st.hands[i].length === 1 ? '' : 's'}`,
      active: st.turn === i && !over,
      out: st.winner === i,
    };
  });

  return (
    <GameShell>
      <GameHeader
        hud={`UNO · ${st.hands[0].length} CARDS`}
        extra={<HudChip tint={myTurn ? t.gold : t.lime}>{myTurn ? `${Math.max(0, secs)}s` : `${st.deck.length} LEFT`}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={strip} />

      <View style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 20 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <ColourPill colour={st.colour} dir={st.dir} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <DrawPile onPress={drawOne} live={myTurn} left={st.deck.length} owed={st.draw} />
          <TopCard card={st.top} />
        </View>

        <TableLog text={st.log} />
      </View>

      <View style={{ paddingTop: 8 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <Hand hand={st.hands[0]} state={st} live={myTurn} onTap={tapCard} />

      {picking && (
        <GameOverlay title="Pick a colour" blurb="Everyone has to follow it." width={270} label="Pick a colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLOURS.map((c) => (
              <Tap key={c} onPress={() => chooseColour(c)} label={`Pick ${UNAME[c]}`} style={{ width: '47%', flexGrow: 1 }}>
                <Gradient colors={gradStops(cardGrad(c))} radius={14} glow={false}>
                  <View style={{ paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center' }}>
                    <H size={12.5} color="#fff">
                      {UNAME[c]}
                    </H>
                  </View>
                </Gradient>
              </Tap>
            ))}
          </View>
        </GameOverlay>
      )}

      {over && (
        <GameOverlay
          title={st.winner === 0 ? 'You went out' : `${who(st.winner ?? 1)} went out`}
          blurb={
            st.winner === 0
              ? 'Hand emptied. That is the round.'
              : `Hand emptied. You were left holding ${st.hands[0].length} card${st.hands[0].length === 1 ? '' : 's'}.`
          }
          label="Round over"
        >
          <OverlayActions secondary={{ label: 'Again', onPress: again }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── pieces ──────────────────────────────────────────────────────────

/** A card face: its tint, the glyph, and the same glyph small in two corners. */
function CardFace({ card, w, h, radius = 14 }: { card: Card; w: number; h: number; radius?: number }) {
  const face = faceOf(card.v);
  return (
    <Gradient colors={gradStops(cardGrad(card.c))} radius={radius} glow={false} style={{ width: w, height: h }}>
      <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <H size={Math.round(w * 0.42)} color="#fff">
          {face}
        </H>
        <H size={9} color="#fff" style={{ position: 'absolute', top: 6, left: 8, opacity: 0.85 }}>
          {face}
        </H>
        <H size={9} color="#fff" style={{ position: 'absolute', bottom: 6, right: 8, opacity: 0.85 }}>
          {face}
        </H>
      </View>
    </Gradient>
  );
}

/** The pile, and the card that just landed on it — it pops as it arrives. */
function TopCard({ card }: { card: Card }) {
  const t = useTheme();
  const s = useRef(new Animated.Value(1)).current;
  const key = `${card.c}${card.v}`;

  useEffect(() => {
    s.setValue(0.84);
    Animated.spring(s, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true }).start();
  }, [key, s]);

  return (
    <Animated.View
      accessible
      accessibilityLabel={`Top of the pile: ${say(card)}`}
      style={{
        transform: [{ scale: s }],
        borderRadius: 18,
        ...bloom(t.shadowColor, 24, t.shadowOpacity, 12),
      }}
    >
      <CardFace card={card} w={86} h={124} radius={18} />
    </Animated.View>
  );
}

/**
 * The deck. Tapping it takes one card, and plays it if it happens to fit —
 * or takes the whole +2 pile when one is stacked on you.
 */
function DrawPile({ onPress, live, left, owed }: { onPress: () => void; live: boolean; left: number; owed: number }) {
  const t = useTheme();
  return (
    <Tap
      onPress={onPress}
      label={owed > 0 ? `Take ${owed} cards, ${left} left in the deck` : `Draw a card, ${left} left in the deck`}
      style={{ opacity: live ? 1 : 0.55 }}
    >
      <Glass radius={16} borderColor={live ? t.line2 : undefined} style={{ width: 74, height: 106 }}>
        <View style={{ width: 72, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph d="M12 5v14M5 12h14" size={26} width={2.2} glow={live ? t.acc : undefined} />
          <Kicker color={owed > 0 ? t.gold : t.dim2} tracking={0.95} style={{ position: 'absolute', bottom: 9 }}>
            {owed > 0 ? `TAKE ${owed}` : 'DRAW'}
          </Kicker>
        </View>
      </Glass>
    </Tap>
  );
}

/** The colour in force, and which way the table is going round. */
function ColourPill({ colour, dir }: { colour: CardColour; dir: 1 | -1 }) {
  const t = useTheme();
  const dot = colour === 'W' ? t.accLt : UC[colour][0];
  return (
    <FadeIn>
      <Glass radius={R.pill} elevated={false}>
        <View
          accessible
          accessibilityLabel={`Colour in play: ${UNAME[colour]}, playing ${dir === 1 ? 'clockwise' : 'anticlockwise'}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 7 }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 4.5,
              backgroundColor: dot,
              shadowColor: dot,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 6,
              shadowOpacity: 0.9,
              elevation: 4,
            }}
          />
          <H size={11}>{UNAME[colour]}</H>
          <P size={11} color={t.dim2}>
            {dir === 1 ? '↻' : '↺'}
          </P>
        </View>
      </Glass>
    </FadeIn>
  );
}

/** Your hand. Anything you may legally play lifts out of the row and brightens. */
function Hand({ hand, state, live, onTap }: { hand: Card[]; state: UnoState; live: boolean; onTap: (i: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ height: 118, justifyContent: 'flex-end' }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 6,
          alignItems: 'flex-end',
          minWidth: '100%',
        }}
      >
        {hand.map((c, i) => {
          const playable = live && isValid(c, state, hand);
          return (
            <Tap
              key={`${c.c}${c.v}-${i}`}
              onPress={() => onTap(i)}
              label={`${say(c)}, card ${i + 1} of ${hand.length}${playable ? ', playable' : ''}`}
              style={{ transform: [{ translateY: playable ? -10 : 0 }], opacity: playable ? 1 : 0.55 }}
            >
              {/* The ring is drawn on the page, not on glass, so it takes the accent — `rim`
                  is the specular highlight and goes white-on-white in Day. */}
              <View style={{ borderRadius: 16, padding: 2, borderWidth: 2, borderColor: playable ? t.acc : 'transparent' }}>
                <CardFace card={c} w={62} h={92} />
              </View>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const game: PlayableGame = {
  name: 'UNO',
  Screen,
  rules: [
    'Match the top card by colour or number.',
    'Skip, reverse and +2 pass the pain along. A wild picks the colour — a +4 only when you hold none of it.',
    'No playable card means you draw one. First to empty their hand wins.',
  ],
};

export { Screen };
