import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Avatar, Chip, Cta, Glass, Glyph, Gradient, H, Kicker, P, Tap, gradStops } from '../../components/base';
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
import { cardGrad } from '../../game/uno';
import {
  CHAMBERS,
  MAX_PLAY,
  PLAY_MESSAGE,
  RANK_FACE,
  RANK_NAME,
  accept,
  botChallenge,
  botPlay,
  callLiar,
  claimText,
  clicksOf,
  isTruth,
  nextRound,
  placeOf,
  playCards,
  playProblem,
  pullTrigger,
  startMatch,
  xpFor,
  type Card,
  type LiarState,
  type Rank,
  type TableRank,
} from '../../game/liarsBar';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * Liar's Bar.
 *
 * Five cards, one table card and a revolver each. You push cards forward face
 * down and say they are all Kings; the next seat decides whether to believe
 * you. Whoever is wrong when the cards flip picks up the gun. The screen keeps
 * the two things you actually reason from in front of you at all times — the
 * table card, and how many of it you are holding — and hides everything else.
 */

const CARD_GRAD: Record<Rank, string> = {
  K: cardGrad('B'),
  Q: cardGrad('R'),
  A: cardGrad('Y'),
  J: cardGrad('W'),
};

const GUN = 'M4 9h11l4 3h1v3h-6l-1 4H8l-1-4H4zM7 12h5';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  const table: Player[] = [config.you, ...config.opponents].slice(0, 6);
  const seats = Math.max(2, table.length);
  const name = (i: number) => (i === 0 ? 'You' : (table[i]?.name ?? `Seat ${i + 1}`));
  const who = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  /** Deduction options: the turn clock, and how long the flipped cards stay up. */
  const clock = clamp(Math.round(config.options.timer), 8, 90);
  const hold = clamp(config.options.discuss * 40, 900, 2600);

  // One seeded stream drives the deal, the revolvers and every bot, so a match
  // replays exactly as the engine tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<LiarState>(() => startMatch(seats, rng.current as Rng));
  const [sel, setSel] = useState<number[]>([]);
  const [secs, setSecs] = useState(clock);
  const [emote, setEmote] = useState<string | null>(null);

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);

  const you = st.players[0];
  const mine = st.phase === 'play' && st.turn === 0;
  const judging = st.phase === 'challenge' && st.decider === 0;
  const shooting = st.phase === 'showdown' && st.showdown?.shooter === 0;
  const held = you.hand.filter((c) => isTruth(c, st.rank)).length;
  // Once you are out the table plays itself out, so it runs at a brisker pace.
  const pace = you.alive ? bot.think : Math.round(bot.think * 0.45);

  const flip = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  // ── bots: one claim at a time, on the beat their profile sets ─────
  useEffect(() => {
    if (st.phase !== 'play' || st.turn === 0) return;
    const seat = st.turn;
    const idx = botPlay(st, seat, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'play' && cur.turn === seat ? playCards(cur, seat, idx) : cur));
    }, pace);
    return () => clearTimeout(id);
  }, [st, bot, pace]);

  // ── bots: believe it or call it ───────────────────────────────────
  useEffect(() => {
    if (st.phase !== 'challenge' || st.decider === null || st.decider === 0) return;
    const seat = st.decider;
    const call = botChallenge(st, seat, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'challenge' && cur.decider === seat ? (call ? callLiar(cur, seat) : accept(cur, seat)) : cur));
    }, Math.round(pace * 0.8));
    return () => clearTimeout(id);
  }, [st, bot, pace]);

  // ── the flip, then the hammer ─────────────────────────────────────
  useEffect(() => {
    if (st.phase !== 'showdown') return;
    flip.setValue(0);
    Animated.timing(flip, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
    // You get to pull your own trigger, but the table never stalls on it.
    const wait = st.showdown?.shooter === 0 ? hold + 5200 : hold + 620;
    const id = setTimeout(() => setSt((cur) => (cur.phase === 'showdown' ? pullTrigger(cur) : cur)), wait);
    return () => clearTimeout(id);
  }, [st.phase, st.round, st.showdown?.shooter, flip, hold]);

  // ── the cylinder turns, then the next deal ────────────────────────
  useEffect(() => {
    if (st.phase !== 'shot' && st.phase !== 'exhausted') return;
    if (st.phase === 'shot') {
      spin.setValue(0);
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
    const id = setTimeout(
      () => setSt((cur) => (cur.phase === 'shot' || cur.phase === 'exhausted' ? nextRound(cur, rng.current as Rng) : cur)),
      st.phase === 'shot' ? 2100 : 1300,
    );
    return () => clearTimeout(id);
  }, [st.phase, st.round, spin]);

  // ── your clock: the lobby's answer timer, spent on one decision ───
  useEffect(() => {
    if (!mine && !judging) {
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
      if (cur.phase === 'challenge' && cur.decider === 0) {
        setSt(accept(cur, 0));
        onToast('Time — you let it stand');
      } else if (cur.phase === 'play' && cur.turn === 0) {
        const idx = botPlay(cur, 0, bot, rng.current as Rng);
        setSt(playCards(cur, 0, idx));
        setSel([]);
        onToast(`Time — you claimed ${claimText(cur.rank, idx.length)}`);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, judging, st.round, st.turn, clock]);

  // A new deal clears whatever was picked up in the last one.
  useEffect(() => setSel([]), [st.round, st.turn]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your moves ────────────────────────────────────────────────────

  const toggle = (i: number) => {
    if (!mine) return onToast('Wait for your turn');
    setSel((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i);
      if (cur.length >= MAX_PLAY) {
        onToast('Three cards at most');
        return cur;
      }
      return cur.concat(i).sort((a, b) => a - b);
    });
  };

  const claim = () => {
    const bad = playProblem(st, 0, sel);
    if (bad) return onToast(PLAY_MESSAGE[bad]);
    setSt(playCards(st, 0, sel));
    setSel([]);
  };

  const decide = (call: boolean) => {
    if (!judging) return;
    setSt(call ? callLiar(st, 0) : accept(st, 0));
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const won = st.winner === 0;
    const champ = st.winner === null ? 0 : st.winner;

    onFinish({
      game: "Liar's Bar",
      head: won ? 'You took the bar' : 'You were shot',
      kicker: won
        ? `Last one standing after ${st.round} round${st.round === 1 ? '' : 's'}`
        : `${who(champ)} was the last one standing`,
      xp: `+${xpFor(st, 0)}`,
      note: won
        ? `You survived ${clicksOf(st, 0)} pull${clicksOf(st, 0) === 1 ? '' : 's'} of the trigger.`
        : `You went out ${ordinal(placeOf(st, 0))} on chamber ${st.players[0].revolver.spent} of ${CHAMBERS}.`,
      rows: table
        .map((p, i) => ({
          n: p.name,
          d: st.players[i].alive
            ? `Last one standing · ${clicksOf(st, i)} click${clicksOf(st, i) === 1 ? '' : 's'}`
            : `Shot on chamber ${st.players[i].revolver.spent} · ${ordinal(placeOf(st, i))}`,
          s: `+${xpFor(st, i)}`,
          win: st.winner === i,
          mark: p.mark,
          grad: p.grad,
        }))
        .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const seatInfo: SeatInfo[] = config.opponents.slice(0, 5).map((p, k) => {
    const i = k + 1;
    const q = st.players[i];
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: !q || !q.alive ? 'Out of the bar' : `${q.hand.length} left · ${q.revolver.spent}/${CHAMBERS}`,
      active: (st.phase === 'play' && st.turn === i) || (st.phase === 'challenge' && st.decider === i),
      out: !!q && !q.alive,
    };
  });

  const log = !you.alive
    ? 'You are out — watching it play itself out'
    : st.phase === 'over'
      ? 'The bar is closed'
      : st.phase === 'exhausted'
        ? 'Every hand is empty — dealing again'
        : st.phase === 'shot'
          ? st.showdown?.fired
            ? `${name(st.showdown.shooter)} ${st.showdown.shooter === 0 ? 'are' : 'is'} out`
            : `${name(st.showdown?.shooter ?? 0)} lived`
          : st.phase === 'showdown'
            ? st.showdown?.honest
              ? `They were ${claimText(st.rank, st.showdown.cards.length)} — ${name(st.showdown.shooter)} pull${st.showdown.shooter === 0 ? '' : 's'}`
              : `A lie — ${name(st.showdown?.shooter ?? 0)} pull${st.showdown?.shooter === 0 ? '' : 's'}`
            : judging
              ? 'Believe it, or call it'
              : mine
                ? 'Push up to three cards forward'
                : st.phase === 'challenge'
                  ? `${who(st.decider ?? 0)} is deciding`
                  : `${who(st.turn)} is choosing cards`;

  const hudChip = mine || judging ? `${Math.max(0, secs)}s` : !you.alive ? 'SPECTATING' : `${st.players.filter((p) => p.alive).length} alive`;

  return (
    <GameShell>
      <GameHeader
        hud={`ROUND ${st.round} · ${RANK_NAME[st.rank].toUpperCase()}S`}
        extra={<HudChip tint={mine || judging ? t.gold : t.lime}>{hudChip}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      {chunk(seatInfo, 3).map((row, i) => (
        <SeatStrip key={i} seats={row} />
      ))}

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          <FadeIn>
            <TableCardPanel rank={st.rank} held={held} cards={you.hand.length} alive={you.alive} />
          </FadeIn>
          <Pile st={st} flip={flip} label={(i) => name(i)} />
        </ScrollView>
      </View>

      <TableLog text={log} />

      <View style={{ paddingTop: 10 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <YourSeat player={config.you} state={st} />

      <Hand hand={you.hand} sel={sel} live={mine} rank={st.rank} onTap={toggle} />

      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        {mine && (
          <Cta
            label={sel.length ? `Claim ${claimText(st.rank, sel.length)}` : `Pick up to three cards`}
            onPress={claim}
          />
        )}

        {judging && <Verdict onAccept={() => decide(false)} onCall={() => decide(true)} rank={st.rank} count={st.claim?.cards.length ?? 0} />}

        {shooting && (
          <Cta label="Pull the trigger" onPress={() => setSt(pullTrigger(st))} icon={<Glyph d={GUN} size={19} color="#fff" width={2} />} />
        )}

        {!mine && !judging && !shooting && <Waiting text={log} />}
      </View>

      {st.phase === 'shot' && st.showdown && (
        <ShotOverlay
          shooter={st.showdown.shooter}
          fired={!!st.showdown.fired}
          spent={st.players[st.showdown.shooter].revolver.spent}
          who={name(st.showdown.shooter)}
          spin={spin}
        />
      )}

      {st.phase === 'over' && (
        <GameOverlay
          title={st.winner === 0 ? 'You took the bar' : 'Last call'}
          blurb={
            st.winner === 0
              ? `Everybody else is on the floor. ${st.round} rounds, ${clicksOf(st, 0)} pulls survived.`
              : `${who(st.winner ?? 0)} was the last one standing. You went out ${ordinal(placeOf(st, 0))}.`
          }
          label="Match over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

const chunk = <T,>(items: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
};

// ── pieces ────────────────────────────────────────────────────────

/** A card face: the rank's tint, its letter, and a pip in each corner. */
function CardFace({ r, w, h }: { r: Rank; w: number; h: number }) {
  return (
    <Gradient colors={gradStops(CARD_GRAD[r])} radius={11} glow={false} style={{ width: w, height: h }}>
      <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <H size={Math.round(w * 0.44)} color="#fff">
          {RANK_FACE[r]}
        </H>
        <H size={8} color="#fff" style={{ position: 'absolute', top: 6, left: 7, opacity: 0.85 }}>
          {RANK_FACE[r]}
        </H>
        <H size={8} color="#fff" style={{ position: 'absolute', bottom: 6, right: 7, opacity: 0.85 }}>
          {RANK_FACE[r]}
        </H>
      </View>
    </Gradient>
  );
}

/** The back of a card — everything anybody else can see of a claim. */
function CardBack({ w, h }: { w: number; h: number }) {
  const t = useTheme();
  return (
    <Glass radius={11} elevated={false} style={{ width: w, height: h }}>
      <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <H size={Math.round(w * 0.3)} color={t.dim2}>
          ◆
        </H>
      </View>
    </Glass>
  );
}

/** Back to face on a single axis, the way a dealer turns a card over. */
function FlipCard({ r, w, h, v }: { r: Rank; w: number; h: number; v: Animated.Value }) {
  const back = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const front = v.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  return (
    <View style={{ width: w, height: h }}>
      <Animated.View style={{ backfaceVisibility: 'hidden', transform: [{ perspective: 700 }, { rotateY: back }] }}>
        <CardBack w={w} h={h} />
      </Animated.View>
      <Animated.View
        style={{ position: 'absolute', top: 0, left: 0, backfaceVisibility: 'hidden', transform: [{ perspective: 700 }, { rotateY: front }] }}
      >
        <CardFace r={r} w={w} h={h} />
      </Animated.View>
    </View>
  );
}

/** The round's table card, and the only fact you know for certain: your own. */
function TableCardPanel({ rank, held, cards, alive }: { rank: TableRank; held: number; cards: number; alive: boolean }) {
  const t = useTheme();
  return (
    <Glass radius={R.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
        <CardFace r={rank} w={52} h={72} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Kicker color={t.dim2} tracking={1.5}>
            TABLE CARD
          </Kicker>
          <H size={22} style={{ letterSpacing: -0.4 }}>
            {RANK_NAME[rank]}s
          </H>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip bg={t.tile} border={t.line} color={held > 0 ? t.lime : t.pink}>
              {alive ? `You hold ${held}` : 'Out'}
            </Chip>
            <Chip bg={t.tile} border={t.line} color={t.dim}>
              {`${cards} in hand`}
            </Chip>
          </View>
        </View>
      </View>
    </Glass>
  );
}

/** Whatever is face down in the middle — and, on a call, what it really was. */
function Pile({ st, flip, label }: { st: LiarState; flip: Animated.Value; label: (i: number) => string }) {
  const t = useTheme();
  const shown: Card[] = st.showdown ? st.showdown.cards : (st.claim?.cards ?? []);
  const seat = st.showdown ? st.showdown.seat : (st.claim?.seat ?? 0);
  const open = st.phase === 'showdown' || st.phase === 'shot';

  if (!shown.length) {
    return (
      <Glass radius={R.card} elevated={false}>
        <View style={{ padding: 22, alignItems: 'center', gap: 8 }}>
          <H size={13} weight={700} color={t.dim2}>
            Nothing on the table
          </H>
          <P size={11.5} color={t.dim2} style={{ textAlign: 'center', lineHeight: 16 }}>
            One to three cards, face down, all claimed as the table card. Jokers count as anything.
          </P>
        </View>
      </Glass>
    );
  }

  const verdict = st.showdown ? (st.showdown.honest ? 'THE CLAIM WAS GOOD' : 'THE CLAIM WAS A LIE') : 'FACE DOWN';

  return (
    <FadeIn>
      <Glass radius={R.card} borderColor={open ? (st.showdown?.honest ? t.lime : t.pink) : undefined}>
        <View style={{ padding: 16, alignItems: 'center', gap: 12 }}>
          <Kicker color={st.showdown ? (st.showdown.honest ? t.lime : t.pink) : t.dim2} tracking={1.5}>
            {verdict}
          </Kicker>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {shown.map((c) =>
              open ? (
                <FlipCard key={c.id} r={c.r} w={44} h={62} v={flip} />
              ) : (
                <CardBack key={c.id} w={44} h={62} />
              ),
            )}
          </View>
          <H size={13.5} weight={700} color={t.ink} numberOfLines={1}>
            {`${label(seat)} ${seat === 0 ? 'claim' : 'claims'} ${claimText(st.rank, shown.length)}`}
          </H>
        </View>
      </Glass>
    </FadeIn>
  );
}

/** Your name, your cards left, and how much of your cylinder is gone. */
function YourSeat({ player, state }: { player: Player; state: LiarState }) {
  const t = useTheme();
  const me = state.players[0];
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      <Glass radius={14} elevated={false} borderColor={state.turn === 0 && state.phase === 'play' ? t.acc : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Avatar mark={player.mark} grad={player.grad} size={26} fontSize={11} />
          <H size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
            {player.name}
          </H>
          <P size={10.5} color={t.dim2}>
            {me.alive ? `${me.hand.length} left` : 'out'}
          </P>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Kicker color={t.dim2} tracking={1.2}>
              CHAMBERS
            </Kicker>
            <Chambers spent={me.revolver.spent} dead={!me.alive} />
          </View>
        </View>
      </Glass>
    </View>
  );
}

/** Six pips: the ones behind the hammer, the one it is about to fall on. */
function Chambers({ spent, dead, size = 8 }: { spent: number; dead?: boolean; size?: number }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`${spent} of ${CHAMBERS} chambers spent`} style={{ flexDirection: 'row', gap: 4 }}>
      {range(CHAMBERS).map((i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: i === spent && !dead ? t.gold : 'transparent',
            backgroundColor: i < spent ? (dead && i === spent - 1 ? t.pink : t.dim2) : t.track,
          }}
        />
      ))}
    </View>
  );
}

/** Your hand. Tap up to three; they lift out of the row when picked. */
function Hand({
  hand,
  sel,
  live,
  rank,
  onTap,
}: {
  hand: Card[];
  sel: number[];
  live: boolean;
  rank: TableRank;
  onTap: (i: number) => void;
}) {
  const t = useTheme();
  const w = hand.length > 4 ? 58 : 64;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 10, height: 90, justifyContent: 'flex-end' }}>
      {hand.length === 0 ? (
        <View style={{ height: 78, alignItems: 'center', justifyContent: 'center' }}>
          <P size={12} color={t.dim2}>
            No cards left this round
          </P>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {hand.map((c, i) => {
            const on = sel.includes(i);
            return (
              <Tap
                key={c.id}
                onPress={() => onTap(i)}
                label={`${RANK_NAME[c.r]}${c.r === 'J' ? ' (wild)' : ''}, card ${i + 1} of ${hand.length}${on ? ', picked' : ''}${
                  isTruth(c, rank) ? `, a real ${RANK_NAME[rank]}` : ''
                }`}
                style={{ transform: [{ translateY: on ? -10 : 0 }], opacity: live ? 1 : 0.75 }}
              >
                <View
                  style={{
                    borderRadius: 13,
                    padding: 2,
                    borderWidth: 2,
                    borderColor: on ? t.acc : 'transparent',
                  }}
                >
                  <CardFace r={c.r} w={w} h={76} />
                </View>
              </Tap>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** The two answers to a claim. */
function Verdict({
  onAccept,
  onCall,
  rank,
  count,
}: {
  onAccept: () => void;
  onCall: () => void;
  rank: TableRank;
  count: number;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Tap onPress={onAccept} label={`Believe the claim of ${claimText(rank, count)}`} style={{ flex: 1 }}>
        <Glass radius={R.pill} elevated={false}>
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <H size={13.5} weight={700}>
              Let it stand
            </H>
          </View>
        </Glass>
      </Tap>
      <Tap onPress={onCall} label={`Call liar on ${claimText(rank, count)}`} style={{ flex: 1 }}>
        <Gradient colors={[t.pink, t.acc2]} radius={R.pill}>
          <View style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <H size={13.5} weight={700} color="#fff">
              Call liar
            </H>
            <Glyph d={GUN} size={17} color="#fff" width={2} />
          </View>
        </Gradient>
      </Tap>
    </View>
  );
}

/** The dead space while somebody else decides — same height as the buttons. */
function Waiting({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Glass radius={R.pill} elevated={false}>
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <H size={12.5} weight={700} color={t.dim2} numberOfLines={1}>
          {text}
        </H>
      </View>
    </Glass>
  );
}

/** The cylinder, mid-turn. */
function Cylinder({ spent, fired, spin }: { spent: number; fired: boolean; spin: Animated.Value }) {
  const t = useTheme();
  const size = 120;
  const c = size / 2;
  const ring = 38;
  const pulled = spent - 1;
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: size }}>
      <Animated.View style={{ transform: [{ rotate: rot }] }}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c - 4} stroke={t.line2} strokeWidth={2} fill="none" />
          <Circle cx={c} cy={c} r={11} stroke={t.line} strokeWidth={2} fill="none" />
          {range(CHAMBERS).map((i) => {
            const a = (i / CHAMBERS) * Math.PI * 2 - Math.PI / 2;
            const x = c + ring * Math.cos(a);
            const y = c + ring * Math.sin(a);
            const isPulled = i === pulled;
            return (
              <Circle
                key={i}
                cx={x}
                cy={y}
                r={12}
                fill={isPulled ? (fired ? t.pink : t.lime) : i < spent ? t.track : 'transparent'}
                stroke={isPulled ? (fired ? t.pink : t.lime) : t.line2}
                strokeWidth={2}
              />
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** The revolver, after the hammer falls. */
function ShotOverlay({
  shooter,
  fired,
  spent,
  who,
  spin,
}: {
  shooter: number;
  fired: boolean;
  spent: number;
  who: string;
  spin: Animated.Value;
}) {
  const t = useTheme();
  const left = CHAMBERS - spent;
  return (
    <GameOverlay
      title={fired ? 'Bang' : 'Click'}
      blurb={
        fired
          ? `${who} found the live round on chamber ${spent}. ${shooter === 0 ? 'Your night is over.' : 'Their night is over.'}`
          : `${who} walked it. ${left} chamber${left === 1 ? '' : 's'} left, and one of them is loaded.`
      }
      label={fired ? 'The revolver fired' : 'The revolver clicked'}
      width={296}
    >
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Cylinder spent={spent} fired={fired} spin={spin} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Glyph d={GUN} size={18} color={fired ? t.pink : t.lime} width={2} />
          <H size={14} weight={700} color={fired ? t.pink : t.lime}>
            {fired ? `${shooter === 0 ? 'You are' : `${who} is`} out` : `${shooter === 0 ? 'You live' : `${who} lives`}`}
          </H>
        </View>
      </View>
    </GameOverlay>
  );
}

export const game: PlayableGame = {
  name: "Liar's Bar",
  Screen,
  rules: [
    'Every round names a table card and deals five each from six Kings, six Queens, six Aces and two wild Jokers.',
    'On your turn push one to three cards forward face down and claim they are all the table card. The next player believes you, or calls liar.',
    'The cards flip: a lie shoots the liar, a true claim shoots the caller. One live round in six chambers, and the last one standing takes the bar.',
  ],
};

export { Screen };
