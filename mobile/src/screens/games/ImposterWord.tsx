import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import {
  Avatar,
  Chip,
  Cta,
  Glass,
  Glyph,
  Gradient,
  H,
  Kicker,
  P,
  Tap,
} from '../../components/base';
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
  CLUE_MESSAGE,
  beginClues,
  botClue,
  botVote,
  castVote,
  clueProblem,
  deal,
  isImposter,
  openVote,
  scoreRound,
  submitClue,
  suggestions,
  toSpeak,
  type ImposterState,
} from '../../game/imposterWord';
import { useTheme } from '../../theme/theme';
import { font, radius as R } from '../../theme/tokens';

/**
 * Imposter Word.
 *
 * You are shown a secret word — but you are never told whether it is the same
 * word the rest of the table is holding. Everyone gives one word of a clue in
 * turn, the table talks, and then it votes. The whole point is that you have to
 * work out from the other clues whether you are the odd one out, so the screen
 * withholds your role until the reveal.
 */

const LOCK = 'M5 11h14v10H5zM8 11V7.5a4 4 0 018 0V11';
const EYE = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM14.4 12a2.4 2.4 0 11-4.8 0 2.4 2.4 0 014.8 0';

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const HUD: Record<ImposterState['phase'], string> = {
  reveal: 'YOUR WORD',
  clues: 'CLUE ROUND',
  discuss: 'DISCUSSION',
  vote: 'VOTE',
  result: 'REVEAL',
};

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  const table: Player[] = [config.you, ...config.opponents];
  const seats = Math.max(2, table.length);
  const name = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  // One seeded stream drives the deal, the bots and the suggestion lists, so a
  // match is reproducible from its seed exactly as the engine tests are.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<ImposterState>(() => deal(seats, config.options.odd, rng.current as Rng));
  const [seen, setSeen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sugg, setSugg] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);
  const [emote, setEmote] = useState<string | null>(null);

  const stRef = useRef(st);
  stRef.current = st;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const done = useRef(false);

  const mine = toSpeak(st) === 0;
  const voted = st.votes[0] !== null;
  const cluesIn = st.clues.filter((c) => c !== null).length;
  const votesIn = st.votes.filter((v) => v !== null).length;

  // ── bots: one clue at a time, on the beat their profile sets ──────
  useEffect(() => {
    if (st.phase !== 'clues') return;
    const seat = toSpeak(st);
    if (seat === null || seat === 0) return;
    const clue = botClue(st, seat, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'clues' && toSpeak(cur) === seat ? submitClue(cur, seat, clue) : cur));
    }, bot.think);
    return () => clearTimeout(id);
  }, [st, bot]);

  // ── bots vote once you have locked yours in ───────────────────────
  useEffect(() => {
    if (st.phase !== 'vote' || st.votes[0] === null) return;
    const next = st.votes.findIndex((v, i) => i > 0 && v === null);
    if (next < 0) return;
    const target = botVote(st, next, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'vote' && cur.votes[next] === null ? castVote(cur, next, target) : cur));
    }, Math.round(bot.think * 0.6));
    return () => clearTimeout(id);
  }, [st, bot]);

  // ── the two clocks the lobby agreed: answer timer, discussion ─────
  useEffect(() => {
    const writing = st.phase === 'clues' && toSpeak(st) === 0;
    const talking = st.phase === 'discuss';
    if (!writing && !talking) {
      setSecs(0);
      return;
    }
    let left = Math.max(5, writing ? config.options.timer : config.options.discuss);
    setSecs(left);
    const id = setInterval(() => {
      left -= 1;
      setSecs(left);
      if (left > 0) return;
      clearInterval(id);
      if (talking) return setSt((cur) => (cur.phase === 'discuss' ? openVote(cur) : cur));

      // Out of time: the table hears whatever was in the box, or a pick for you.
      const cur = stRef.current;
      const fallback = suggestions(cur, 0, rng.current as Rng, 1)[0];
      const word = clueProblem(cur, 0, draftRef.current) === null ? draftRef.current : fallback;
      if (!word) return;
      setSt((s) => (s.phase === 'clues' && toSpeak(s) === 0 ? submitClue(s, 0, word) : s));
      setDraft('');
      onToast(`Time — you said “${cap(word)}”`);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.turn]);

  // A fresh handful of taps each time the turn comes back round to you.
  useEffect(() => {
    if (st.phase === 'clues' && toSpeak(st) === 0) setSugg(suggestions(st, 0, rng.current as Rng, 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.turn]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── actions ───────────────────────────────────────────────────────

  const say = (raw: string) => {
    const bad = clueProblem(st, 0, raw);
    if (bad) return onToast(CLUE_MESSAGE[bad]);
    setSt(submitClue(st, 0, raw));
    setDraft('');
  };

  const vote = (target: number) => {
    if (st.phase !== 'vote' || voted) return;
    setSt(castVote(st, 0, target));
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const sc = scoreRound(st);
    const youOdd = isImposter(st, 0);
    const youWon = sc.winner === (youOdd ? 'imposters' : 'table');
    const odd = st.imposters.map(name).join(' & ');
    const out = sc.ejected === null ? null : name(sc.ejected);
    const top = sc.ejected === null ? 0 : sc.counts[sc.ejected];

    onFinish({
      game: 'Imposter Word',
      head: youOdd ? (youWon ? 'You survived' : 'You were caught') : youWon ? 'You caught them' : 'They got away',
      kicker: out ? `${out} went out on ${top} vote${top === 1 ? '' : 's'}` : 'The vote tied — nobody went out',
      xp: `+${sc.xp[0]}`,
      note: `The word was ${st.pair.civ}. ${odd} had ${st.pair.imp}.`,
      rows: table
        .map((p, i) => ({
          n: p.name,
          d: isImposter(st, i)
            ? `Odd one · ${i === sc.ejected ? 'caught' : 'survived'}`
            : st.votes[i] !== null
              ? `Voted ${name(st.votes[i] as number)}`
              : 'Did not vote',
          s: `+${sc.xp[i]}`,
          win: sc.winner === 'table' ? !isImposter(st, i) : isImposter(st, i),
          mark: p.mark,
          grad: p.grad,
        }))
        .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const chip =
    st.phase === 'discuss' || (st.phase === 'clues' && mine)
      ? `${Math.max(0, secs)}s`
      : st.phase === 'vote'
        ? `${votesIn}/${seats} voted`
        : `${cluesIn}/${seats} clues`;

  const seatInfo: SeatInfo[] = config.opponents.map((p, k) => {
    const i = k + 1;
    const clue = st.clues[i];
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub:
        st.phase === 'reveal'
          ? 'Reading'
          : st.phase === 'vote'
            ? st.votes[i] !== null
              ? 'Voted'
              : 'Deciding'
            : clue
              ? cap(clue)
              : toSpeak(st) === i
                ? 'Thinking…'
                : 'Waiting',
      active: toSpeak(st) === i,
    };
  });

  const log =
    st.phase === 'reveal'
      ? seen
        ? 'Memorise it, then start the clue round'
        : 'Tap the card to see your word'
      : st.phase === 'clues'
        ? mine
          ? 'Your clue — one word'
          : `${name(toSpeak(st) ?? 0)} is thinking of a clue`
        : st.phase === 'discuss'
          ? 'Whose clue does not fit?'
          : st.phase === 'vote'
            ? voted
              ? 'Waiting on the rest of the table'
              : 'Vote for the odd one out'
            : 'Round over';

  return (
    <GameShell>
      <GameHeader
        hud={HUD[st.phase]}
        extra={<HudChip tint={st.phase === 'vote' ? t.pink : t.lime}>{chip}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seatInfo} />

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {st.phase === 'reveal' && (
            <WordCard word={st.words[0]} seen={seen} odd={st.imposters.length} onReveal={() => setSeen(true)} />
          )}

          {st.phase !== 'reveal' && (
            <>
              {/* Your word stays on screen through the vote — it is the only
                  yardstick you have for judging everyone else's clue. */}
              <YourWord word={st.words[0]} />
              {st.phase === 'vote' ? (
                <VoteGrid
                  table={table}
                  clues={st.clues}
                  picked={st.votes[0]}
                  counts={votesIn > 1 ? tallySoFar(st) : null}
                  onVote={vote}
                />
              ) : (
                <ClueList order={st.order} clues={st.clues} table={table} onTurn={toSpeak(st)} />
              )}
            </>
          )}
        </ScrollView>
      </View>

      <TableLog text={log} />

      {(st.phase === 'discuss' || st.phase === 'vote') && (
        <View style={{ paddingTop: 10 }}>
          <EmoteBar onEmote={setEmote} />
        </View>
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        {st.phase === 'reveal' && (
          <Cta
            label={seen ? 'Start the clue round' : 'Reveal your word first'}
            onPress={() => (seen ? setSt(beginClues(st)) : onToast('Tap the card to see your word'))}
          />
        )}

        {st.phase === 'clues' && mine && (
          <ClueBox
            draft={draft}
            suggestions={sugg}
            onDraft={setDraft}
            onPick={(w) => setDraft(w)}
            onSay={() => say(draft)}
          />
        )}

        {st.phase === 'discuss' && <Cta label="Open the vote" onPress={() => setSt(openVote(st))} />}
      </View>

      {st.phase === 'result' && (
        <Reveal st={st} name={name} onExit={onExit} onFinish={finish} youOdd={isImposter(st, 0)} />
      )}
    </GameShell>
  );
}

/** Live vote counts, so the table fills up in front of you. */
function tallySoFar(st: ImposterState): number[] {
  const counts = st.words.map(() => 0);
  st.votes.forEach((v) => {
    if (v !== null) counts[v]++;
  });
  return counts;
}

// ── pieces ────────────────────────────────────────────────────────

function WordCard({ word, seen, odd, onReveal }: { word: string; seen: boolean; odd: number; onReveal: () => void }) {
  const t = useTheme();
  return (
    <FadeIn>
      <Tap onPress={onReveal} label={seen ? `Your secret word is ${word}` : 'Reveal your secret word'}>
        <Glass radius={R.card}>
          <View style={{ padding: 26, alignItems: 'center', gap: 12 }}>
            <Kicker color={t.dim2} tracking={1.5}>
              YOUR SECRET WORD
            </Kicker>
            {seen ? (
              <>
                <H size={38} style={{ letterSpacing: -1, lineHeight: 44 }}>
                  {word}
                </H>
                <Glyph d={EYE} size={18} color={t.acc} />
              </>
            ) : (
              <>
                <View style={{ paddingVertical: 9 }}>
                  <Glyph d={LOCK} size={34} color={t.dim2} width={1.8} />
                </View>
                <H size={15} weight={700} color={t.dim}>
                  Tap to reveal
                </H>
              </>
            )}
            <P size={12} color={t.dim2} style={{ textAlign: 'center', lineHeight: 17, marginTop: 2 }}>
              {odd === 1
                ? 'One player at this table has a different word. It might be you — the clues are how you find out.'
                : `${odd} players at this table have a different word. One of them might be you.`}
            </P>
          </View>
        </Glass>
      </Tap>
    </FadeIn>
  );
}

function YourWord({ word }: { word: string }) {
  const t = useTheme();
  return (
    <Glass radius={14} elevated={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Kicker color={t.dim2} tracking={1.4}>
          YOUR WORD
        </Kicker>
        <H size={15} weight={700} style={{ marginLeft: 'auto' }}>
          {word}
        </H>
      </View>
    </Glass>
  );
}

function ClueList({
  order,
  clues,
  table,
  onTurn,
}: {
  order: number[];
  clues: (string | null)[];
  table: Player[];
  onTurn: number | null;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {order.map((seat, n) => {
        const clue = clues[seat];
        const p = table[seat];
        const live = onTurn === seat;
        if (!p) return null;
        return (
          <FadeIn key={seat} delay={clue ? 0 : n * 40}>
            <Glass radius={14} elevated={false} borderColor={live ? t.acc : undefined}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, opacity: clue || live ? 1 : 0.55 }}
              >
                <H size={10} color={t.dim2} style={{ width: 12 }}>
                  {n + 1}
                </H>
                <Avatar mark={p.mark} grad={p.grad} size={26} fontSize={11} />
                <H size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {seat === 0 ? 'You' : p.name}
                </H>
                <View style={{ marginLeft: 'auto' }}>
                  {clue ? (
                    <Chip bg={t.tile} border={t.line} color={t.ink}>
                      {cap(clue)}
                    </Chip>
                  ) : (
                    <P size={11} color={t.dim2}>
                      {live ? 'thinking…' : 'yet to speak'}
                    </P>
                  )}
                </View>
              </View>
            </Glass>
          </FadeIn>
        );
      })}
    </View>
  );
}

function ClueBox({
  draft,
  suggestions: sugg,
  onDraft,
  onPick,
  onSay,
}: {
  draft: string;
  suggestions: string[];
  onDraft: (v: string) => void;
  onPick: (v: string) => void;
  onSay: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
        {sugg.map((w) => (
          <Tap key={w} onPress={() => onPick(w)} label={`Use the clue ${cap(w)}`}>
            <Glass radius={999} elevated={false} borderColor={draft === w ? t.acc : undefined}>
              <View style={{ paddingHorizontal: 13, paddingVertical: 7 }}>
                <H size={11.5} weight={600} color={draft === w ? t.ink : t.dim}>
                  {cap(w)}
                </H>
              </View>
            </Glass>
          </Tap>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Glass radius={14} elevated={false} style={{ flex: 1 }}>
          <TextInput
            value={draft}
            onChangeText={onDraft}
            onSubmitEditing={onSay}
            placeholder="One word…"
            placeholderTextColor={t.dim2}
            accessibilityLabel="Your one-word clue"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            maxLength={14}
            style={{ fontFamily: font.h6, fontSize: 15, color: t.ink, paddingHorizontal: 14, paddingVertical: 13 }}
          />
        </Glass>
        <Tap onPress={onSay} label="Give this clue">
          <Gradient radius={14}>
            <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
              <H size={13} weight={700} color="#fff">
                Say it
              </H>
            </View>
          </Gradient>
        </Tap>
      </View>
    </View>
  );
}

function VoteGrid({
  table,
  clues,
  picked,
  counts,
  onVote,
}: {
  table: Player[];
  clues: (string | null)[];
  picked: number | null;
  counts: number[] | null;
  onVote: (i: number) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {table.map((p, i) => {
        if (i === 0) return null;
        const on = picked === i;
        const n = counts?.[i] ?? 0;
        return (
          <Tap
            key={i}
            onPress={() => onVote(i)}
            label={`Vote for ${p.name}, who said ${cap(clues[i] ?? 'nothing')}`}
            disabled={picked !== null}
            style={{ width: '47.5%', flexGrow: 1 }}
          >
            <Glass radius={16} elevated={false} borderColor={on ? t.acc : undefined}>
              <View style={{ padding: 12, gap: 8, alignItems: 'center', opacity: picked !== null && !on ? 0.5 : 1 }}>
                <Avatar mark={p.mark} grad={p.grad} size={34} fontSize={14} />
                <H size={12} numberOfLines={1}>
                  {p.name}
                </H>
                <Chip bg={t.tile} border={on ? t.acc : t.line} color={t.ink}>
                  {cap(clues[i] ?? '—')}
                </Chip>
                <P size={10} color={n > 0 ? t.pink : t.dim2}>
                  {n > 0 ? `${n} vote${n === 1 ? '' : 's'}` : on ? 'your vote' : 'no votes'}
                </P>
              </View>
            </Glass>
          </Tap>
        );
      })}
    </View>
  );
}

function Reveal({
  st,
  name,
  youOdd,
  onExit,
  onFinish,
}: {
  st: ImposterState;
  name: (i: number) => string;
  youOdd: boolean;
  onExit: () => void;
  onFinish: () => void;
}) {
  const t = useTheme();
  const sc = scoreRound(st);
  const youWon = sc.winner === (youOdd ? 'imposters' : 'table');
  const out = sc.ejected === null ? null : name(sc.ejected);
  const yourVote = st.votes[0];

  return (
    <GameOverlay
      title={youOdd ? (youWon ? 'You survived' : 'You were caught') : youWon ? 'Caught them' : 'They got away'}
      blurb={
        out
          ? `${out} went out on ${sc.counts[sc.ejected as number]} of ${st.seats} votes.`
          : 'The vote tied, so nobody went out.'
      }
      label="Round reveal"
    >
      <View style={{ gap: 8, marginBottom: 18 }}>
        <Row label="THE TABLE HAD" value={st.pair.civ} tint={t.lime} />
        <Row
          label={st.imposters.length === 1 ? `${name(st.imposters[0]).toUpperCase()} HAD` : 'THE ODD ONES HAD'}
          value={st.pair.imp}
          tint={t.pink}
        />
        <P size={12} color={t.dim} style={{ lineHeight: 17, marginTop: 4 }}>
          {youOdd
            ? `You were the odd one out — your clue was “${cap(st.clues[0] ?? '')}”.`
            : `You voted ${yourVote === null ? 'nobody' : name(yourVote)}. ${sc.winner === 'table' ? 'The table read it right.' : 'The table read it wrong.'}`}
        </P>
      </View>
      <OverlayActions
        secondary={{ label: 'Leave', onPress: onExit }}
        primary={{ label: 'Scoreboard', onPress: onFinish }}
      />
    </GameOverlay>
  );
}

function Row({ label, value, tint }: { label: string; value: string; tint: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: t.tile,
        borderWidth: 1,
        borderColor: t.line,
      }}
    >
      <Kicker color={tint} tracking={1.3}>
        {label}
      </Kicker>
      <H size={14} weight={700} numberOfLines={1} style={{ marginLeft: 'auto' }}>
        {value}
      </H>
    </View>
  );
}

export const game: PlayableGame = {
  name: 'Imposter Word',
  Screen,
  rules: [
    'Everyone gets the same secret word — except the odd one out, who gets a related one. Nobody is told which they are.',
    'In turn, give a one-word clue about your word. Too specific and you expose yourself; too vague and the table turns on you.',
    'Vote for the odd one out. Catch them and the table takes the round; survive the vote and they do.',
  ],
};

export { Screen };
