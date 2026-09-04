import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, Bar, Chip, Cta, Glass, H, Kicker, P, Tap } from '../../components/base';
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
} from '../../components/GameChrome';
import { useTheme } from '../../theme/theme';
import { radius as R, fade } from '../../theme/tokens';
import {
  BOT,
  makeRng,
  type GameScreenProps,
  type PlayableGame,
  type Player,
  type ResultRow,
  type Rng,
} from '../../game/contract';
import {
  CLUE_FIELDS,
  FIELD_LABEL,
  ROUNDS,
  SPEED,
  blankStats,
  botClues,
  botVote,
  clueOptions,
  describeWith,
  isImposter,
  mutationText,
  newRound,
  paintOf,
  phrase,
  pieces,
  plural,
  resolveRound,
  sceneFor,
  standings,
  starPoints,
  travels,
  type Actor,
  type Clue,
  type Field,
  type Piece,
  type RoundOutcome,
  type RoundSetup,
  type Scene,
  type SeatStat,
} from '../../game/imposterVideo';

/**
 * 15 · Imposter Video — watch, describe, compare, vote, reveal, three times over.
 *
 * The clip is generated, not fetched: the engine hands back a scene spec and this
 * screen draws it as SVG shapes on looping `Animated` transforms. A travelling
 * actor is drawn twice, one frame apart, and the pair is slid by exactly one
 * frame width — so the loop restarts on an identical picture and never pops.
 */

type Phase = 'watch' | 'describe' | 'compare' | 'vote' | 'reveal';

const HUD: Record<Phase, string> = {
  watch: 'WATCH',
  describe: 'DESCRIBE',
  compare: 'COMPARE',
  vote: 'VOTE',
  reveal: 'RESULT',
};

/** Seconds the clip plays before the round asks you to describe it. */
const WATCH_SECS = 8;
const XP_PER_POINT = 45;
/** The clip runs full height while you watch, and shrinks to a reference strip after. */
const STAGE_SHORT = 126;
const STAGE_MINI = 104;

// ── the clip ──────────────────────────────────────────────────────

function shapeFor(p: Piece, fill: string, cx: number, cy: number, r: number, key: string) {
  switch (p.kind) {
    case 'circle':
      return <Circle key={key} cx={cx} cy={cy} r={r} fill={fill} />;
    case 'ring':
      return <Circle key={key} cx={cx} cy={cy} r={r * 0.72} fill="none" stroke={fill} strokeWidth={r * 0.52} />;
    case 'square':
      return <Rect key={key} x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.3} fill={fill} />;
    case 'triangle':
      return (
        <Polygon
          key={key}
          points={`${cx},${cy - r} ${cx + r * 0.94},${cy + r * 0.74} ${cx - r * 0.94},${cy + r * 0.74}`}
          fill={fill}
        />
      );
    case 'diamond':
      return <Polygon key={key} points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={fill} />;
    default:
      return <Polygon key={key} points={starPoints(cx, cy, r)} fill={fill} />;
  }
}

/** One actor's shapes, drawn once. Rendered twice by `ActorLayer` when it travels. */
function ActorArt({ scene, index, w, h, tag }: { scene: Scene; index: number; w: number; h: number; tag: string }) {
  const paint = paintOf(scene.actors[index].colour);
  const id = `iv-${tag}-${index}`;
  const unit = Math.min(w, h) / 100;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={paint.from} />
          <Stop offset="1" stopColor={paint.to} />
        </SvgGradient>
      </Defs>
      {pieces(scene)
        .filter((p) => p.actor === index)
        .map((p) =>
          shapeFor(p, `url(#${id})`, (p.x / 100) * w, (p.y / 100) * h, p.r * unit, `${p.actor}-${p.index}`),
        )}
    </Svg>
  );
}

function ActorLayer({
  actor,
  index,
  scene,
  w,
  h,
  tag,
}: {
  actor: Actor;
  index: number;
  scene: Scene;
  w: number;
  h: number;
  tag: string;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const moving = travels(actor.dir);
  const horizontal = actor.dir === 'left' || actor.dir === 'right';

  useEffect(() => {
    v.setValue(0);
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: Math.round((actor.dir === 'bounce' ? 2400 : 5200) / SPEED[actor.speed]),
        easing: actor.dir === 'bounce' ? Easing.inOut(Easing.quad) : Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, actor.dir, actor.speed, w, h]);

  const span = horizontal ? w : h;
  const backwards = actor.dir === 'left' || actor.dir === 'up';
  const track = v.interpolate({ inputRange: [0, 1], outputRange: backwards ? [0, -span] : [-span, 0] });
  const spin = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const bob = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -h * 0.17, 0] });

  const motion =
    moving && horizontal
      ? { transform: [{ translateX: track }] }
      : moving
        ? { transform: [{ translateY: track }] }
        : actor.dir === 'orbit'
          ? { transform: [{ rotate: spin }] }
          : { transform: [{ translateY: bob }] };

  const art = <ActorArt scene={scene} index={index} w={w} h={h} tag={tag} />;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h }, motion]}>
      {art}
      {moving && (
        <View style={{ position: 'absolute', left: horizontal ? w : 0, top: horizontal ? 0 : h, width: w, height: h }}>
          {art}
        </View>
      )}
    </Animated.View>
  );
}

/** A one-line reading of the clip, so it is not invisible to a screen reader. */
function narrate(scene: Scene): string {
  return scene.actors
    .map((_, i) => `${phrase(scene, { actor: i, field: 'count' })} that ${phrase(scene, { actor: i, field: 'dir' })}`)
    .join(', ');
}

/**
 * The stage. It measures its own box rather than taking a size, so `grow` can
 * hand it whatever vertical slack the phase has left and the shapes still get
 * laid out against real pixels.
 */
function Clip({ scene, height, tag, grow }: { scene: Scene; height?: number; tag: string; grow?: boolean }) {
  const t = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { w, h } = box;
  const wash = paintOf(scene.bg);
  return (
    <View
      onLayout={(e) =>
        setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })
      }
      accessible
      accessibilityLabel={`The clip: ${narrate(scene)}`}
      style={[
        {
          borderRadius: R.pane,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.panel,
        },
        grow ? { flex: 1, minHeight: 120 } : { height },
      ]}
    >
      <LinearGradient
        colors={[wash.from, wash.to]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
      />
      {w > 0 &&
        h > 0 &&
        scene.actors.map((a, i) => (
          <ActorLayer
            key={`${tag}-${i}-${a.kind}-${a.colour}-${a.count}-${a.dir}-${a.speed}`}
            actor={a}
            index={i}
            scene={scene}
            w={w}
            h={h}
            tag={tag}
          />
        ))}
      <LinearGradient
        colors={[t.rim, fade(t.rim)]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.6 }}
        pointerEvents="none"
      />
    </View>
  );
}

// ── small pieces of furniture ─────────────────────────────────────

/** The opponents, as a rail that copes with the eight-seat lobby. */
function Roster({ people, note }: { people: Player[]; note: string }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 }}>
        {people.map((p, i) => (
          <Glass key={i} radius={14} elevated={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
              <Avatar mark={p.mark} grad={p.grad} size={26} fontSize={11} />
              <View>
                <H size={10.5}>{p.name}</H>
                <P size={9} color={t.dim2}>
                  {note}
                </P>
              </View>
            </View>
          </Glass>
        ))}
      </View>
    </ScrollView>
  );
}

const mmss = (s: number) => {
  const n = Math.max(0, s);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

// ── the screen ────────────────────────────────────────────────────

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const table = useMemo<Player[]>(() => [config.you, ...config.opponents], [config.you, config.opponents]);
  const n = table.length;
  const profile = BOT[config.difficulty];

  const describeSecs = Math.max(8, Math.round(config.options.timer));
  const compareSecs = Math.max(8, Math.round(config.options.discuss));

  const rngRef = useRef<Rng | null>(null);
  if (!rngRef.current) rngRef.current = makeRng(Date.now() % 2147483647);
  const rng = rngRef.current;

  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('watch');
  const [setup, setSetup] = useState<RoundSetup>(() => newRound(n, config.options.odd, rng));
  const [picked, setPicked] = useState<Field[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [ballot, setBallot] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [stats, setStats] = useState<SeatStat[]>(() => blankStats(n));
  const [secs, setSecs] = useState(WATCH_SECS);
  const [emote, setEmote] = useState<string | null>(null);
  const sent = useRef(false);

  const seen = useMemo(() => sceneFor(setup, 0), [setup]);
  const focusName = plural(setup.scene.actors[setup.focus].kind, 2);
  const options = useMemo(() => clueOptions(seen, setup.focus), [seen, setup.focus]);

  // ── the clock ───────────────────────────────────────────────────
  const timed = phase === 'watch' || phase === 'describe' || phase === 'compare';
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [timed, phase, round]);

  // ── transitions ─────────────────────────────────────────────────
  const toDescribe = useCallback(() => {
    setPhase('describe');
    setSecs(describeSecs);
  }, [describeSecs]);

  const lockIn = useCallback(() => {
    const fields: Field[] = [...picked];
    for (const o of options) if (fields.length < CLUE_FIELDS && !fields.includes(o.field)) fields.push(o.field);
    const said: Clue[] = describeWith(0, seen, setup.focus, fields);
    for (let s = 1; s < n; s++) said.push(...botClues(s, setup, profile, rng));
    setPicked(fields);
    setClues(said);
    setPhase('compare');
    setSecs(compareSecs);
  }, [picked, options, seen, setup, n, profile, rng, compareSecs]);

  const toVote = useCallback(() => {
    setPhase('vote');
    setSecs(0);
  }, []);

  const cast = useCallback(
    (target: number) => {
      const votes = new Array<number>(n).fill(0);
      votes[0] = target;
      for (let s = 1; s < n; s++) votes[s] = botVote(s, clues, setup, n, profile, rng);
      const out = resolveRound(votes, setup.imposters, n);
      setBallot(target);
      setConfirming(null);
      setOutcome(out);
      setStats((prev) =>
        prev.map((st, i) => ({
          seat: st.seat,
          score: st.score + out.gains[i],
          correct: st.correct + (out.correct[i] ? 1 : 0),
          imposter: st.imposter + (isImposter(setup, i) ? 1 : 0),
          survived: st.survived + (isImposter(setup, i) && !out.caught ? 1 : 0),
        })),
      );
      setPhase('reveal');
    },
    [clues, setup, n, profile, rng],
  );

  const finish = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    const ranked = standings(stats);
    const champion = ranked[0].seat;
    const mine = stats[0];
    const rows: ResultRow[] = ranked.map((st) => ({
      n: table[st.seat].name,
      d: `${st.correct} caught${st.imposter ? ` · survived ${st.survived}/${st.imposter}` : ''}`,
      s: `+${st.score * XP_PER_POINT}`,
      win: st.seat === champion,
      mark: table[st.seat].mark,
      grad: table[st.seat].grad,
    }));
    onFinish({
      game: config.game,
      head: champion === 0 ? 'You won' : mine.score > 0 ? 'You held your own' : 'You lost',
      kicker: `${ROUNDS} clips · ${config.difficulty} table`,
      xp: `+${mine.score * XP_PER_POINT}`,
      note:
        mine.imposter > 0
          ? `You had the doctored cut ${mine.imposter} time${mine.imposter === 1 ? '' : 's'} and got away with ${mine.survived}.`
          : `You watched every clip straight and named ${mine.correct} imposter${mine.correct === 1 ? '' : 's'}.`,
      rows,
    });
  }, [stats, table, config.game, config.difficulty, onFinish]);

  const nextRound = useCallback(() => {
    if (round + 1 >= ROUNDS) {
      finish();
      return;
    }
    setSetup(newRound(n, config.options.odd, rng, setup.imposters));
    setRound((r) => r + 1);
    setPicked([]);
    setClues([]);
    setBallot(null);
    setOutcome(null);
    setPhase('watch');
    setSecs(WATCH_SECS);
  }, [round, finish, n, config.options.odd, rng, setup.imposters]);

  // the clock running out moves the round along on its own
  useEffect(() => {
    if (secs > 0) return;
    if (phase === 'watch') toDescribe();
    else if (phase === 'describe') lockIn();
    else if (phase === 'compare') toVote();
  }, [secs, phase, toDescribe, lockIn, toVote]);

  const toggle = useCallback(
    (f: Field) => {
      if (!picked.includes(f) && picked.length >= CLUE_FIELDS) {
        onToast('Two things only — drop one first.');
        return;
      }
      setPicked((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
    },
    [picked, onToast],
  );

  const emoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (emoteTimer.current) clearTimeout(emoteTimer.current);
  }, []);
  const react = useCallback((e: string) => {
    setEmote(e);
    if (emoteTimer.current) clearTimeout(emoteTimer.current);
    emoteTimer.current = setTimeout(() => setEmote(null), 1400);
  }, []);

  // ── phase bodies ────────────────────────────────────────────────

  const body = () => {
    if (phase === 'watch')
      return (
        <FadeIn key="watch" style={{ flex: 1, minHeight: 0 }}>
          <Kicker color={t.dim2}>ROLL THE CLIP</Kicker>
          <H size={25} style={{ letterSpacing: -0.4, marginTop: 8, marginBottom: 12 }}>
            Clip {round + 1} of {ROUNDS}
          </H>
          <Clip scene={seen} grow tag={`w${round}`} />
          <Bar pct={secs / WATCH_SECS} fill={t.acc} style={{ marginTop: 12 }} />
          <P size={12} color={t.dim} style={{ marginTop: 12, lineHeight: 17 }}>
            One of you is watching a different cut — one colour, one count or one direction has been changed. It might be
            you.
          </P>
        </FadeIn>
      );

    if (phase === 'describe')
      return (
        <FadeIn key="describe" style={{ flex: 1, minHeight: 0 }}>
          <Clip scene={seen} height={STAGE_SHORT} tag={`d${round}`} />
          <Kicker color={t.dim2} style={{ marginTop: 14 }}>
            SAY TWO THINGS ABOUT THE {focusName.toUpperCase()}
          </Kicker>
          <ScrollView style={{ flex: 1, minHeight: 0, marginTop: 10 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8, paddingBottom: 4 }}>
              {options.map((o) => {
                const on = picked.includes(o.field);
                return (
                  <Tap
                    key={o.field}
                    onPress={() => toggle(o.field)}
                    label={`${on ? 'Drop' : 'Say'}: ${phrase(seen, o)}`}
                  >
                    <Glass radius={16} elevated={false} borderColor={on ? t.acc : undefined}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Kicker color={on ? t.accLt : t.dim2}>{FIELD_LABEL[o.field]}</Kicker>
                          <H size={15.5} style={{ marginTop: 4 }} numberOfLines={1}>
                            {phrase(seen, o)}
                          </H>
                        </View>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: on ? t.acc : t.line2,
                            backgroundColor: on ? t.acc : 'transparent',
                          }}
                        />
                      </View>
                    </Glass>
                  </Tap>
                );
              })}
            </View>
          </ScrollView>
          <P size={11} color={t.dim2} style={{ marginTop: 6 }}>
            {picked.length}/{CLUE_FIELDS} chosen · the third stays unsaid
          </P>
        </FadeIn>
      );

    if (phase === 'compare')
      return (
        <FadeIn key="compare" style={{ flex: 1, minHeight: 0 }}>
          <Kicker color={t.dim2}>EVERYONE ON THE {focusName.toUpperCase()}</Kicker>
          <ScrollView style={{ flex: 1, minHeight: 0, marginTop: 10 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8, paddingBottom: 4 }}>
              {table.map((p, seat) => (
                <Glass key={seat} radius={16} elevated={false} borderColor={seat === 0 ? t.acc : undefined}>
                  <View style={{ flexDirection: 'row', gap: 11, padding: 11 }}>
                    <Avatar mark={p.mark} grad={p.grad} size={34} fontSize={13} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <P size={10} color={t.dim2}>
                        {seat === 0 ? `${p.name} (you)` : p.name}
                      </P>
                      <View style={{ gap: 2, marginTop: 2 }}>
                        {clues
                          .filter((c) => c.seat === seat)
                          .map((c) => (
                            <H key={c.ref.field} size={13} numberOfLines={1}>
                              “{c.text}”
                            </H>
                          ))}
                      </View>
                    </View>
                  </View>
                </Glass>
              ))}
            </View>
          </ScrollView>
          <View style={{ marginTop: 8 }}>
            <TableLog text="One of these people watched another cut. Look for two seats saying the same thing differently." />
          </View>
        </FadeIn>
      );

    if (phase === 'vote')
      return (
        <FadeIn key="vote" style={{ flex: 1, minHeight: 0 }}>
          <Kicker color={t.pink}>VOTE</Kicker>
          <H size={24} style={{ letterSpacing: -0.4, marginTop: 8, marginBottom: 12, lineHeight: 27 }}>
            Who watched the{'\n'}other cut?
          </H>
          <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 }}>
              {table.slice(1).map((p, i) => {
                const seat = i + 1;
                const said = clues.filter((c) => c.seat === seat).map((c) => c.text);
                return (
                  <Tap
                    key={seat}
                    onPress={() => setConfirming(seat)}
                    label={`Vote ${p.name}`}
                    style={{ width: '47.5%', flexGrow: 1 }}
                  >
                    <Glass radius={18} elevated={false} borderColor={ballot === seat ? t.acc : undefined}>
                      <View style={{ padding: 13, gap: 9 }}>
                        <Avatar mark={p.mark} grad={p.grad} size={40} fontSize={16} />
                        <H size={13.5} numberOfLines={1}>
                          {p.name}
                        </H>
                        <P size={10} color={t.dim2} numberOfLines={2}>
                          {said.join(' · ')}
                        </P>
                      </View>
                    </Glass>
                  </Tap>
                );
              })}
            </View>
          </ScrollView>
        </FadeIn>
      );

    // reveal
    if (!outcome) return null;
    const out = outcome;
    const ejected = table[out.ejected];
    const oddOnes = setup.imposters.map((i) => table[i].name).join(' and ');
    const mineGain = out.gains[0];
    const yoursWasTheCut = isImposter(setup, 0);
    const verdict = yoursWasTheCut
      ? out.caught
        ? 'You had the doctored cut — and they got you.'
        : `You had the doctored cut and walked — +${mineGain}`
      : mineGain > 0
        ? `You named the odd one out — +${mineGain}`
        : `You voted ${table[ballot ?? 0].name}. No points.`;
    return (
      <FadeIn key="reveal" style={{ flex: 1, minHeight: 0 }}>
        <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
          <Glass radius={R.card} borderColor={out.caught ? t.acc : t.line}>
            <View style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar mark={ejected.mark} grad={ejected.grad} size={46} fontSize={18} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Kicker color={out.caught ? t.lime : t.pink}>{out.caught ? 'CAUGHT' : 'WRONG CALL'}</Kicker>
                  <H size={21} style={{ marginTop: 4, letterSpacing: -0.3 }} numberOfLines={1}>
                    {ejected.name} voted out
                  </H>
                </View>
                <Chip bg="rgba(150,180,255,0.14)" border={t.line2} color={t.accLt}>
                  {`${out.tally[out.ejected]} votes`}
                </Chip>
              </View>
              <P size={12.5} color={t.dim} style={{ marginTop: 12, lineHeight: 18 }}>
                {oddOnes} had the doctored cut — {mutationText(setup.scene, setup.diff)}.
              </P>
            </View>
          </Glass>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Kicker color={t.dim2}>THE REAL CLIP</Kicker>
              <View style={{ marginTop: 6 }}>
                <Clip scene={setup.scene} height={STAGE_MINI} tag={`truth${round}`} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Kicker color={t.pink}>THE ODD CUT</Kicker>
              <View style={{ marginTop: 6 }}>
                <Clip scene={setup.shown} height={STAGE_MINI} tag={`cut${round}`} />
              </View>
            </View>
          </View>

          <View style={{ marginTop: 12, gap: 6, paddingBottom: 4 }}>
            {standings(stats).map((st) => (
              <View
                key={st.seat}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}
              >
                <Avatar mark={table[st.seat].mark} grad={table[st.seat].grad} size={22} fontSize={9} />
                <H size={12} style={{ marginRight: 'auto' }} numberOfLines={1}>
                  {st.seat === 0 ? 'You' : table[st.seat].name}
                </H>
                {out.gains[st.seat] > 0 && (
                  <P size={11} color={t.lime}>
                    +{out.gains[st.seat]}
                  </P>
                )}
                <H size={12.5} color={t.accLt}>
                  {st.score}
                </H>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={{ marginTop: 8 }}>
          <TableLog text={verdict} />
        </View>
      </FadeIn>
    );
  };

  const cta =
    phase === 'watch'
      ? { label: 'I’ve seen enough', onPress: toDescribe }
      : phase === 'describe'
        ? { label: picked.length === CLUE_FIELDS ? 'Lock it in' : 'Lock in the obvious two', onPress: lockIn }
        : phase === 'compare'
          ? { label: 'Open the vote', onPress: toVote }
          : phase === 'reveal'
            ? { label: round + 1 >= ROUNDS ? 'Scoreboard' : 'Next clip', onPress: nextRound }
            : null;

  return (
    <GameShell>
      <GameHeader
        hud={`CLIP ${round + 1}/${ROUNDS} · ${HUD[phase]}`}
        extra={timed ? <HudChip tint={secs <= 5 ? t.pink : t.lime}>{mmss(secs)}</HudChip> : undefined}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      {phase === 'watch' &&
        (config.opponents.length <= 4 ? (
          <SeatStrip seats={config.opponents.map((p) => ({ name: p.name, mark: p.mark, grad: p.grad, sub: 'watching…' }))} />
        ) : (
          <Roster people={config.opponents} note="watching…" />
        ))}

      <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 20 }}>{body()}</View>

      {phase === 'compare' && <EmoteBar onEmote={react} />}

      {cta && (
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Cta label={cta.label} onPress={cta.onPress} />
        </View>
      )}

      <FloatingEmote emote={emote} />

      {confirming !== null && (
        <GameOverlay
          title={`Vote ${table[confirming].name}?`}
          blurb="One tap, no takebacks. The table ejects whoever collects the most votes."
          label="Confirm your vote"
        >
          <OverlayActions
            secondary={{ label: 'Back', onPress: () => setConfirming(null) }}
            primary={{ label: 'Lock it in', onPress: () => cast(confirming) }}
          />
        </GameOverlay>
      )}
    </GameShell>
  );
}

export const game: PlayableGame = {
  name: 'Imposter Video',
  Screen,
  rules: [
    'Everyone watches the same short clip — except one player, whose cut has a single colour, count or direction changed.',
    'The round names one shape. Say two of the three things about it: its colour, how many there were, how it moved.',
    'Compare the descriptions and vote. The table scores by catching the odd one out; they score by surviving.',
  ],
};
