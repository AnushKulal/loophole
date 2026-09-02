import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Avatar, Bar, Chip, Cta, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../../components/base';
import {
  EmoteBar,
  FadeIn,
  FloatingEmote,
  GameHeader,
  GameOverlay,
  GameShell,
  HudChip,
  OverlayActions,
  TableLog,
} from '../../components/GameChrome';
import { BOT, makeRng, type GameScreenProps, type PlayableGame, type Player, type Rng } from '../../game/contract';
import {
  ask,
  askProblem,
  ASK_MESSAGE,
  beginRound,
  blurb,
  botTurn,
  candidates,
  deal,
  guess,
  guessProblem,
  GUESS_MESSAGE,
  identityOf,
  initials,
  isInformative,
  isOver,
  legalQuestions,
  nameable,
  play,
  QUESTION,
  rankQuestions,
  scoreRound,
  startingCandidates,
  type Axis,
  type GuessState,
} from '../../game/guessWho';
import { grad } from '../../data/people';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * Guess Who I Am.
 *
 * Everyone at the table is holding an identity they cannot see and you can.
 * Your own card sits over the table as a "?" — the only way to read it is to
 * ask the table yes/no questions about yourself and watch your candidate list
 * close. First seat to name itself takes the round; a wrong name is out of it.
 */

const AXES: { key: Axis; label: string }[] = [
  { key: 'time', label: 'WHEN' },
  { key: 'place', label: 'WHERE' },
  { key: 'field', label: 'WHAT FOR' },
  { key: 'doing', label: 'WHAT I DO' },
];

const HUD_ICON = 'M9.5 9.5a2.5 2.5 0 114 2V13M12 17v.01';

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  const table: Player[] = [config.you, ...config.opponents];
  const seats = Math.max(2, Math.min(8, table.length));
  const nameOf = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  // One seeded stream drives the deal and every bot, so a match is reproducible
  // from its seed exactly as the engine tests are.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<GuessState>(() => deal(seats, rng.current as Rng));
  const [tab, setTab] = useState<'ask' | 'log'>('ask');
  const [picking, setPicking] = useState(false);
  const [secs, setSecs] = useState(0);
  const [emote, setEmote] = useState<string | null>(null);

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);

  const you = 0;
  const mine = st.phase === 'play' && st.turn === you && !st.out[you];
  const live = candidates(st, you);
  const start = startingCandidates(st);
  const spent = st.asked.filter((a) => a.seat === you);
  const last = st.asked.length ? st.asked[st.asked.length - 1] : null;

  // ── the bots take their turns on the beat their profile sets ──────
  useEffect(() => {
    if (st.phase !== 'play' || isOver(st)) return;
    const seat = st.turn;
    if (seat === you || st.out[seat]) return;
    const move = botTurn(st, seat, bot, rng.current as Rng);
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'play' && cur.turn === seat && !cur.out[seat] ? play(cur, seat, move) : cur));
    }, bot.think);
    return () => clearTimeout(id);
  }, [st, bot]);

  // ── the study clock the lobby agreed ──────────────────────────────
  useEffect(() => {
    if (st.phase !== 'study') return;
    let left = Math.max(5, Math.min(Math.round(config.options.discuss) || 20, 60));
    setSecs(left);
    const id = setInterval(() => {
      left -= 1;
      setSecs(left);
      if (left > 0) return;
      clearInterval(id);
      setSt((cur) => beginRound(cur));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase]);

  // ── your turn clock: run out of it and the table asks for you ─────
  useEffect(() => {
    if (st.phase !== 'play' || st.turn !== you || st.out[you]) {
      // The study clock owns the counter until the round opens.
      if (st.phase !== 'study') setSecs(0);
      return;
    }
    let left = Math.max(8, Math.round(config.options.timer) || 30);
    setSecs(left);
    const id = setInterval(() => {
      left -= 1;
      setSecs(left);
      if (left > 0) return;
      clearInterval(id);

      const cur = stRef.current;
      if (cur.phase !== 'play' || cur.turn !== you || cur.out[you]) return;
      const best = rankQuestions(cur, you).find((q) => isInformative(cur, you, q)) ?? legalQuestions(cur, you)[0];
      if (best) {
        setSt(ask(cur, you, best));
        setPicking(false);
        onToast(`Time — the table answered “${QUESTION[best].tag}” for you`);
        return;
      }
      const only = candidates(cur, you);
      setSt(guess(cur, you, only[0]));
      setPicking(false);
      onToast('Time — you had to name yourself');
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.turn, st.out[you]]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── actions ───────────────────────────────────────────────────────

  const askIt = (qid: string) => {
    const bad = askProblem(st, you, qid);
    if (bad) return onToast(ASK_MESSAGE[bad]);
    setSt(ask(st, you, qid));
  };

  const nameIt = (at: number) => {
    const bad = guessProblem(st, you, at);
    if (bad) return onToast(GUESS_MESSAGE[bad]);
    setPicking(false);
    setSt(guess(st, you, at));
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const sc = scoreRound(st);
    const me = identityOf(st, you);
    const champ = st.winner;

    onFinish({
      game: 'Guess Who I Am',
      head:
        champ === you
          ? 'You worked it out'
          : st.out[you]
            ? 'You named the wrong card'
            : champ === null
              ? 'Nobody got there'
              : 'Beaten to it',
      kicker:
        champ === null
          ? 'Every seat guessed wrong'
          : `${champ === you ? 'You' : nameOf(champ)} named ${identityOf(st, champ).name}`,
      xp: `+${sc.xp[you]}`,
      note: `You were ${me.name} — ${blurb(me)}. ${spent.length} question${spent.length === 1 ? '' : 's'} asked.`,
      rows: table
        .slice(0, st.seats)
        .map((p, i) => ({
          n: p.name,
          d:
            st.winner === i
              ? `Named ${identityOf(st, i).name}`
              : st.out[i]
                ? `Wrong guess · was ${identityOf(st, i).name}`
                : `${sc.left[i]} card${sc.left[i] === 1 ? '' : 's'} left · was ${identityOf(st, i).name}`,
          s: `+${sc.xp[i]}`,
          win: st.winner === i,
          mark: p.mark,
          grad: p.grad,
        }))
        .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const hud =
    st.phase === 'study' ? 'STUDY THE TABLE' : isOver(st) ? 'ROUND OVER' : mine ? 'YOUR TURN' : 'AT THE TABLE';

  const chip =
    st.phase === 'study' || mine ? `${Math.max(0, secs)}s` : isOver(st) ? 'done' : `${st.asked.length} asked`;

  const log = (() => {
    if (st.phase === 'study') return 'Everyone can see your card except you';
    if (isOver(st)) return 'Round over';
    if (st.out[you]) return `You are out — ${nameOf(st.turn)} is still going`;
    if (mine) return live.length === 1 ? 'Only one card fits — name it' : 'Ask the table, or name yourself';
    if (last && last.seat === st.turn) return `${nameOf(st.turn)} is thinking`;
    if (last) return `${nameOf(last.seat)} asked “${QUESTION[last.q].tag}” — ${last.yes ? 'yes' : 'no'}`;
    return `${nameOf(st.turn)} is thinking`;
  })();

  return (
    <GameShell>
      <GameHeader
        hud={hud}
        extra={<HudChip tint={mine && secs <= 10 ? t.pink : t.lime}>{chip}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <OpponentRail st={st} table={table} />

      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <YourCard left={live.length} start={start} asked={spent.length} out={st.out[you]} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 }}>
        <TabBtn label="Ask a question" text="ASK" on={tab === 'ask'} onPress={() => setTab('ask')} />
        <TabBtn
          label="Your answers so far"
          text={`ANSWERS · ${spent.length}`}
          on={tab === 'log'}
          onPress={() => setTab('log')}
        />
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {tab === 'ask' ? (
            <QuestionList st={st} enabled={mine} onAsk={askIt} />
          ) : (
            <AnswerLog st={st} nameOf={nameOf} />
          )}
        </ScrollView>
      </View>

      <TableLog text={log} />

      <View style={{ paddingTop: 10 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
        {st.phase === 'study' ? (
          <Cta label="Start the round" onPress={() => setSt(beginRound(st))} />
        ) : (
          <Tap
            onPress={() => (mine ? setPicking(true) : onToast(st.out[you] ? 'You are out of this round' : 'Wait for your turn'))}
            label="Name who I am"
            disabled={isOver(st)}
          >
            <Gradient radius={R.pill} glow={mine}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, paddingHorizontal: 22, opacity: mine ? 1 : 0.45 }}>
                <Glyph d={HUD_ICON} size={17} color="#fff" width={2.3} />
                <H size={14.5} weight={700} color="#fff">
                  Name who I am
                </H>
                <H size={11.5} weight={700} color="#fff" style={{ marginLeft: 'auto', opacity: 0.85 }}>
                  {live.length} left
                </H>
              </View>
            </Gradient>
          </Tap>
        )}
      </View>

      {picking && !isOver(st) && (
        <Picker st={st} onPick={nameIt} onCancel={() => setPicking(false)} />
      )}

      {isOver(st) && <Result st={st} nameOf={nameOf} onExit={onExit} onFinish={finish} />}
    </GameShell>
  );
}

// ── pieces ────────────────────────────────────────────────────────

/** The other seats, cards face up. Scrolls sideways so eight seats still fit. */
function OpponentRail({ st, table }: { st: GuessState; table: Player[] }) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, paddingBottom: 12 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {table.slice(1, st.seats).map((p, k) => {
        const seat = k + 1;
        const id = identityOf(st, seat);
        const active = st.phase === 'play' && st.turn === seat && !st.out[seat];
        return (
          <Glass
            key={p.name + seat}
            radius={14}
            elevated={false}
            borderColor={active ? t.acc : undefined}
            style={{ width: 148, opacity: st.out[seat] ? 0.45 : 1 }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, paddingVertical: 8 }}
              accessible
              accessibilityLabel={`${p.name} is holding ${id.name}${st.out[seat] ? ', out of the round' : ''}`}
            >
              <Avatar mark={p.mark} grad={p.grad} size={28} fontSize={11} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <H size={10.5} numberOfLines={1}>
                  {p.name}
                </H>
                <H size={11.5} weight={700} color={st.out[seat] ? t.dim2 : t.accLt} numberOfLines={1}>
                  {id.name}
                </H>
              </View>
            </View>
          </Glass>
        );
      })}
    </ScrollView>
  );
}

/** Your own card: a question mark, and how far you have narrowed it down. */
function YourCard({ left, start, asked, out }: { left: number; start: number; asked: number; out: boolean }) {
  const t = useTheme();
  const pct = start > 1 ? (start - left) / (start - 1) : 1;
  return (
    <FadeIn>
      <Glass radius={R.card}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 12 }}
          accessible
          accessibilityLabel={`Your hidden card. ${left} of ${start} identities still fit, after ${asked} questions.`}
        >
          <Gradient radius={13} glow={false}>
            <View style={{ width: 52, height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <H size={30} color="#fff">
                ?
              </H>
            </View>
          </Gradient>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Kicker color={t.dim2} tracking={1.5}>
              {out ? 'OUT OF THE ROUND — YOU WERE ONE OF' : 'YOU ARE ONE OF'}
            </Kicker>
            <H size={22} style={{ letterSpacing: -0.4, lineHeight: 25 }}>
              {`${left} ${left === 1 ? 'identity' : 'identities'}`}
            </H>
            <Bar pct={pct} fill={left === 1 ? t.lime : t.acc} height={4} />
            <P size={10.5} color={t.dim2} numberOfLines={1}>
              {asked === 0
                ? `${start} on the board you cannot see in front of anyone else`
                : `${asked} question${asked === 1 ? '' : 's'} asked · ${start - left} ruled out`}
            </P>
          </View>
        </View>
      </Glass>
    </FadeIn>
  );
}

function TabBtn({ text, label, on, onPress }: { text: string; label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Tap onPress={onPress} label={label} style={{ flex: 1 }}>
      <Glass radius={11} elevated={false} borderColor={on ? t.acc : undefined}>
        <View style={{ paddingVertical: 8, alignItems: 'center' }}>
          <H size={10.5} weight={700} color={on ? t.ink : t.dim2} style={{ letterSpacing: 1.1 }}>
            {text}
          </H>
        </View>
      </Glass>
    </Tap>
  );
}

/** Everything you have not spent yet, grouped by what it probes. */
function QuestionList({ st, enabled, onAsk }: { st: GuessState; enabled: boolean; onAsk: (id: string) => void }) {
  const t = useTheme();
  const open = legalQuestions(st, 0);

  if (!open.length) {
    return (
      <Glass radius={14} elevated={false}>
        <View style={{ padding: 16 }}>
          <P size={12.5} color={t.dim} style={{ lineHeight: 18 }}>
            You have asked everything there is to ask. Name yourself and hope.
          </P>
        </View>
      </Glass>
    );
  }

  return (
    <>
      {AXES.map(({ key, label }) => {
        const ids = open.filter((id) => QUESTION[id].axis === key);
        if (!ids.length) return null;
        return (
          <View key={key} style={{ gap: 8 }}>
            <Kicker color={t.dim2} tracking={1.5} style={{ paddingTop: 4, paddingLeft: 2 }}>
              {label}
            </Kicker>
            {ids.map((id) => (
              <Tap
                key={id}
                onPress={() => onAsk(id)}
                label={QUESTION[id].text}
                disabled={!enabled}
                style={{ opacity: enabled ? 1 : 0.5 }}
              >
                <Glass radius={13} elevated={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11 }}>
                    <H size={12.5} weight={600} color={t.ink} style={{ flex: 1, lineHeight: 17 }}>
                      {QUESTION[id].text}
                    </H>
                    <Glyph d="M9 5l7 7-7 7" size={14} color={t.dim2} width={2.4} />
                  </View>
                </Glass>
              </Tap>
            ))}
          </View>
        );
      })}
    </>
  );
}

/** What the table has told you, and what it has told everyone else. */
function AnswerLog({ st, nameOf }: { st: GuessState; nameOf: (i: number) => string }) {
  const t = useTheme();
  const mine = st.asked.filter((a) => a.seat === 0);
  const theirs = st.asked.filter((a) => a.seat !== 0).slice(-8).reverse();

  return (
    <>
      <Kicker color={t.dim2} tracking={1.5} style={{ paddingTop: 4, paddingLeft: 2 }}>
        WHAT THE TABLE TOLD YOU
      </Kicker>
      {mine.length === 0 ? (
        <Glass radius={13} elevated={false}>
          <View style={{ padding: 14 }}>
            <P size={12} color={t.dim2} style={{ lineHeight: 17 }}>
              Nothing yet. Ask a question and every card that disagrees with the answer is gone.
            </P>
          </View>
        </Glass>
      ) : (
        mine.map((a, n) => (
          <FadeIn key={`${a.q}-${n}`}>
            <Glass radius={13} elevated={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10 }}>
                <H size={10} color={t.dim2} style={{ width: 14 }}>
                  {n + 1}
                </H>
                <H size={12.5} weight={600} numberOfLines={2} style={{ flex: 1, lineHeight: 16 }}>
                  {QUESTION[a.q].text}
                </H>
                <Chip bg={t.tile} border={a.yes ? t.lime : t.pink} color={a.yes ? t.lime : t.pink}>
                  {a.yes ? 'YES' : 'NO'}
                </Chip>
              </View>
            </Glass>
          </FadeIn>
        ))
      )}

      {theirs.length > 0 && (
        <>
          <Kicker color={t.dim2} tracking={1.5} style={{ paddingTop: 10, paddingLeft: 2 }}>
            AROUND THE TABLE
          </Kicker>
          {theirs.map((a, n) => (
            <View
              key={`t-${n}-${a.seat}-${a.q}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 5 }}
            >
              <H size={11.5} weight={700} color={t.dim} numberOfLines={1} style={{ maxWidth: 88 }}>
                {nameOf(a.seat)}
              </H>
              <P size={11} color={t.dim2} numberOfLines={1} style={{ flex: 1 }}>
                {QUESTION[a.q].tag}
              </P>
              <H size={10.5} weight={700} color={a.yes ? t.lime : t.pink}>
                {a.yes ? 'YES' : 'NO'}
              </H>
            </View>
          ))}
        </>
      )}
    </>
  );
}

/** The board, with everything your answers have ruled out greyed back. */
function Picker({ st, onPick, onCancel }: { st: GuessState; onPick: (i: number) => void; onCancel: () => void }) {
  const t = useTheme();
  const options = nameable(st, 0);
  const alive = candidates(st, 0);

  return (
    <GameOverlay
      title="Who am I?"
      blurb="Name your card. Right takes the round; wrong puts you out of it."
      width={330}
      label="Name who you are"
    >
      <ScrollView style={{ maxHeight: 300, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((i) => {
            const id = st.board[i];
            const on = alive.includes(i);
            return (
              <Tap
                key={i}
                onPress={() => onPick(i)}
                label={`Say I am ${id.name}, ${blurb(id)}${on ? '' : ' — already ruled out'}`}
                style={{ width: '31%' }}
              >
                <Glass radius={13} elevated={false} borderColor={on ? t.acc : undefined}>
                  <View style={{ alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 4, opacity: on ? 1 : 0.34 }}>
                    <Avatar mark={initials(id.name)} grad={grad(i)} size={32} radius={10} fontSize={12} />
                    <H size={10} numberOfLines={2} style={{ textAlign: 'center', lineHeight: 12 }}>
                      {id.name}
                    </H>
                  </View>
                </Glass>
              </Tap>
            );
          })}
        </View>
      </ScrollView>

      <Tap onPress={onCancel} label="Keep asking instead">
        <View style={{ padding: 13, borderRadius: 12, backgroundColor: t.panel2, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
          <H size={13}>Keep asking</H>
        </View>
      </Tap>
    </GameOverlay>
  );
}

function Result({
  st,
  nameOf,
  onExit,
  onFinish,
}: {
  st: GuessState;
  nameOf: (i: number) => string;
  onExit: () => void;
  onFinish: () => void;
}) {
  const t = useTheme();
  const me = identityOf(st, 0);
  const champ = st.winner;
  const sc = scoreRound(st);

  return (
    <GameOverlay
      title={champ === 0 ? 'That was you' : st.out[0] ? 'Wrong card' : champ === null ? 'Nobody got there' : 'Beaten to it'}
      blurb={
        champ === null
          ? 'Every seat named the wrong card. The board keeps its secret.'
          : champ === 0
            ? `You closed it down to one in ${sc.asks[0]} question${sc.asks[0] === 1 ? '' : 's'}.`
            : `${nameOf(champ)} named ${identityOf(st, champ).name} first.`
      }
      width={300}
      label="Round over"
    >
      <View style={{ gap: 9, marginBottom: 18 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            padding: 11,
            borderRadius: 13,
            backgroundColor: t.tile,
            borderWidth: 1,
            borderColor: t.line,
          }}
        >
          <Avatar mark={initials(me.name)} grad={grad(st.secret[0])} size={38} radius={11} fontSize={14} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Kicker color={t.dim2} tracking={1.3}>
              YOU WERE
            </Kicker>
            <H size={16} weight={700} numberOfLines={1}>
              {me.name}
            </H>
            <P size={10.5} color={t.dim2} numberOfLines={1}>
              {blurb(me)}
            </P>
          </View>
        </View>
        <P size={12} color={t.dim} style={{ lineHeight: 17 }}>
          {st.out[0]
            ? `You named the wrong card with ${sc.left[0]} still in play.`
            : `You had it down to ${sc.left[0]} card${sc.left[0] === 1 ? '' : 's'} from ${startingCandidates(st)}.`}
        </P>
      </View>
      <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: onFinish }} />
    </GameOverlay>
  );
}

export const game: PlayableGame = {
  name: 'Guess Who I Am',
  Screen,
  rules: [
    'Everyone is dealt a hidden identity. You can read every card at the table except your own, and they can all read yours.',
    'On your turn ask the table one yes/no question about yourself. The answer is true, so every card that disagrees with it is ruled out.',
    'Name yourself the moment only one card fits. Right takes the round; wrong puts you out of it and the rest play on.',
  ],
};

export { Screen };
