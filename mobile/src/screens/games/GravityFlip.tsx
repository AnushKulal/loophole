import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { Bar, Chip, Cta, Glass, Glyph, H, Kicker, gradStops } from '../../components/base';
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
  DT,
  ORB_R,
  RUNNER_R,
  SIGHT,
  botFlip,
  canFlip,
  group,
  lineFor,
  livesFor,
  placeOf,
  scoreOf,
  secondsFor,
  speedRamp,
  standings,
  startMatch,
  step,
  timeLeft,
  xpFor,
  type FlipWorld,
  type Orb,
  type Runner,
  type Slab,
} from '../../game/gravityFlip';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * Gravity Flip.
 *
 * One control: tap, and the runner falls the other way. Everyone at the table
 * runs the same seeded course at the same speed, so the corridor is a race
 * rather than a solo score attack — the ghosts a length behind you are real
 * opponents reading the same track you are.
 *
 * Every rule lives in `src/game/gravityFlip.ts`. This file owns the frame loop,
 * the scene and the chrome, and nothing else. The loop is a fixed-timestep
 * accumulator over `requestAnimationFrame`: a slow frame catches up in whole
 * engine ticks rather than stretching one, so the physics is identical to the
 * one the tests replay, and the handle is cancelled on unmount.
 *
 * The scene's aspect is chosen so the track visible ahead of the runner is at
 * least `SIGHT` — the distance the bots are allowed to project over. That is
 * what makes them beatable: they are quicker and steadier than you, but they
 * cannot see any more of the course than you can.
 */

/**
 * How far into the frame the runner sits, as a fraction of its width. The
 * corridor behind it is where the rivals are stacked, so it has to be deep
 * enough to hold three of them clear of the left edge.
 */
const RUNNER_VIEW_X = 0.2;
/** The scene aspect that puts `SIGHT` of track in front of the runner. */
const ASPECT = SIGHT / (1 - RUNNER_VIEW_X);
/** How far back of the runner each rival is drawn, in track heights. */
const GHOST_BACK = 0.055;
/** Height the telemetry strip under the scene needs. */
const METER_H = 58;

/** Bots re-read the corridor twenty times a second, not sixty. */
const BOT_TICK = 0.05;
/** Engine ticks one frame may swallow before the rest is dropped. */
const CATCH_UP = 6;
/** Samples in the runner's tail. */
const TRAIL = 9;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  const table: Player[] = [config.you, ...config.opponents].slice(0, 4);
  const seats = Math.max(2, table.length);
  const who = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;

  /** Arcade options: respawns per player, and minutes on the clock. */
  const lives = livesFor(config.options.lives);
  const limit = secondsFor(config.options.match);

  // One seeded stream lays the course and drives every bot, so a run replays
  // exactly as the engine tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<FlipWorld>(() => startMatch(seats, lives, config.options.match, rng.current as Rng));
  const [phase, setPhase] = useState<'ready' | 'run' | 'over'>('ready');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [emote, setEmote] = useState<string | null>(null);

  const stRef = useRef(st);
  stRef.current = st;
  const done = useRef(false);
  /** A tap waiting to be spent on the next engine tick. */
  const tapped = useRef(false);
  /** Degrees the runner has rolled through — one half turn per flip. */
  const spin = useRef(0);
  const trail = useRef<{ x: number; y: number }[]>([]);
  const hitsSeen = useRef(0);

  const you = st.runners[0];
  const sceneW = Math.max(0, box.w);
  // Rounded down: a shorter scene shows *more* track, so the glass never ends
  // up showing less of the corridor than the bots are allowed to read.
  const sceneH = Math.max(0, Math.min(box.h - METER_H, Math.floor(sceneW / ASPECT)));
  const scene = sceneW > 80 && sceneH > 90;

  // ── the frame loop ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'run') return;
    let live = stRef.current;
    let raf = 0;
    let prev = 0;
    let acc = 0;
    let botAcc = 0;
    let trailAcc = 0;

    const tick = (now: number) => {
      if (!prev) prev = now;
      acc += Math.min(now - prev, 120) / 1000;
      prev = now;

      let guard = 0;
      while (acc >= DT && guard < CATCH_UP && !live.over) {
        botAcc += DT;
        // Seat zero is whatever you last touched; the rest re-read the corridor
        // on their own, slower beat, and are told how long that beat was.
        const decide = botAcc >= BOT_TICK;
        const flips = range(live.seats).map((i) =>
          i === 0 ? tapped.current : decide && botFlip(live, i, bot, rng.current as Rng, botAcc),
        );
        tapped.current = false;
        if (decide) botAcc = 0;

        live = step(live, DT, flips);
        // Half a turn per flip, eased, so the roll reads as one motion.
        spin.current += (live.runners[0].flips * 180 - spin.current) * Math.min(1, DT * 13);
        acc -= DT;
        guard++;

        trailAcc += DT;
        if (trailAcc >= 0.03) {
          trailAcc = 0;
          trail.current = trail.current.concat({ x: live.x, y: live.runners[0].y }).slice(-TRAIL);
        }
      }
      // A frame long enough to blow the catch-up budget drops its remainder
      // rather than running the corridor in slow motion.
      if (guard >= CATCH_UP) acc = 0;

      setSt(live);
      if (live.over) {
        setPhase('over');
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bot]);

  // A clipped slab is easy to miss when the corridor is moving.
  useEffect(() => {
    if (you.hits === hitsSeen.current) return;
    hitsSeen.current = you.hits;
    if (you.out) onToast('Out of lives — the run plays on without you');
    else onToast(`Clipped it — ${you.lives} ${you.lives === 1 ? 'life' : 'lives'} left`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you.hits, you.out, you.lives]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── your one control ──────────────────────────────────────────────
  const tap = () => {
    if (phase === 'ready') {
      setPhase('run');
      return;
    }
    if (phase !== 'run') return;
    if (!canFlip(stRef.current, 0)) {
      onToast(you.out ? 'You are out — nothing left to flip' : 'The run is over');
      return;
    }
    tapped.current = true;
  };

  // ── the scoreboard ────────────────────────────────────────────────
  const finish = () => {
    if (done.current) return;
    done.current = true;
    const champ = st.winner ?? standings(st)[0] ?? 0;
    const won = champ === 0;

    onFinish({
      game: 'Gravity Flip',
      head: won ? 'You out-ran the table' : you.out ? 'You went into the glass' : 'Out-run',
      kicker: won
        ? `${group(scoreOf(you))} points over ${Math.round(you.dist)} lengths of corridor`
        : `${who(champ)} finished on ${group(scoreOf(st.runners[champ]))}`,
      xp: `+${xpFor(st, 0)}`,
      note: you.out
        ? `Your last life went at ${Math.round(you.dist)} lengths, with ${you.orbs} orb${you.orbs === 1 ? '' : 's'} banked.`
        : `You finished the clock with ${you.lives} ${you.lives === 1 ? 'life' : 'lives'} and ${you.orbs} orb${
            you.orbs === 1 ? '' : 's'
          } in hand.`,
      rows: standings(st).map((i) => ({
        n: table[i]?.name ?? `Seat ${i + 1}`,
        d: lineFor(st, i),
        s: `+${xpFor(st, i)}`,
        win: i === champ,
        mark: table[i]?.mark ?? '◆',
        grad: table[i]?.grad ?? config.you.grad,
      })),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────
  const seatInfo: SeatInfo[] = config.opponents.slice(0, 3).map((p, k) => {
    const i = k + 1;
    const r = st.runners[i];
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: !r ? '—' : r.out ? 'Out of lives' : `${group(scoreOf(r))} · ${r.lives}♥`,
      active: !!r && !r.out && placeOf(st, i) === 1,
      out: !!r && r.out,
    };
  });

  const secs = Math.ceil(timeLeft(st));
  const log =
    phase === 'ready'
      ? 'Tap the corridor to fall the other way'
      : st.over
        ? st.winner === 0
          ? 'You took the corridor'
          : `${who(st.winner ?? 0)} took the corridor`
        : you.out
          ? 'You are out — the corridor runs on'
          : you.invuln > 0
            ? `Shaken — ${you.lives} ${you.lives === 1 ? 'life' : 'lives'} left`
            : placeOf(st, 0) === 1
              ? 'You are in front — keep it clean'
              : `${who(standings(st)[0])} is in front`;

  return (
    <GameShell>
      <GameHeader
        hud={`SCORE ${group(scoreOf(you))}`}
        extra={<HudChip tint={secs <= 10 ? t.gold : t.lime}>{`${secs}s`}</HudChip>}
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seatInfo} />

      <View
        style={{ flex: 1, minHeight: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width) - 40;
          const h = Math.floor(e.nativeEvent.layout.height);
          setBox((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
        }}
      >
        {/* The light pools drift past behind the glass — the parallax the
            corridor is falling through. */}
        {box.w > 0 && box.h > 0 && (
          <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
            pointerEvents="none"
          >
            <Parallax w={box.w} h={box.h} travel={st.x * (sceneH || 200)} />
          </View>
        )}

        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        {scene && (
          <FadeIn>
            <Glass radius={R.card} borderColor={you.invuln > 0 ? t.pink : undefined}>
              <Pressable
                onPressIn={tap}
                accessibilityRole="button"
                accessibilityLabel={
                  phase === 'ready'
                    ? 'Start the run'
                    : `Flip gravity. ${Math.round(you.dist)} lengths run, ${you.orbs} orbs, ${you.lives} lives left.`
                }
                style={{ width: sceneW, height: sceneH }}
              >
                <Corridor
                  w={st}
                  width={sceneW}
                  height={sceneH}
                  spin={spin.current}
                  trail={trail.current}
                  table={table}
                  dim={phase === 'ready'}
                />
              </Pressable>
            </Glass>
          </FadeIn>
        )}

        {scene && <Telemetry w={st} lives={lives} width={sceneW} />}
      </View>

      <TableLog text={log} />

      <View style={{ paddingTop: 10 }}>
        <EmoteBar onEmote={setEmote} />
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Cta
          label={phase === 'ready' ? 'Start the run' : you.out ? 'Watching the corridor' : 'Flip gravity'}
          onPress={tap}
          icon={<Glyph d="M12 4v9M8.6 9.6L12 13l3.4-3.4M5 19h14" size={19} color="#fff" width={2.4} />}
        />
      </View>

      {phase === 'ready' && (
        <GameOverlay
          title="Gravity Flip"
          blurb={`One tap turns gravity over. Dodge the glass, sweep the orbs, and keep ${lives} ${
            lives === 1 ? 'life' : 'lives'
          } alive for ${limit} seconds — everyone is running the same corridor.`}
          label="Ready to run"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Run', onPress: tap }} />
        </GameOverlay>
      )}

      {phase === 'over' && (
        <GameOverlay
          title={st.winner === 0 ? 'Corridor cleared' : 'Out-run'}
          blurb={
            st.winner === 0
              ? `${group(scoreOf(you))} points, ${you.orbs} orb${you.orbs === 1 ? '' : 's'} and ${Math.round(
                  you.dist,
                )} lengths of glass behind you.`
              : `${who(st.winner ?? 0)} finished on ${group(scoreOf(st.runners[st.winner ?? 0]))}. You made ${group(
                  scoreOf(you),
                )}.`
          }
          label="Run over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── the scene ─────────────────────────────────────────────────────

/**
 * The soft light pools of the palette, drifting at three rates behind the
 * corridor. `travel` is the run's distance already in pixels, so every layer
 * moves with the course rather than with the clock.
 */
function Parallax({ w, h, travel }: { w: number; h: number; travel: number }) {
  const t = useTheme();
  const layers = [0.06, 0.14, 0.24];
  return (
    <Svg width={w} height={h}>
      <Defs>
        {t.pools.slice(0, 3).map((p, i) => (
          <SvgGradient key={i} id={`pool${i}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.colors[0]} stopOpacity={0.9} />
            <Stop offset="1" stopColor={p.colors[0]} stopOpacity={0} />
          </SvgGradient>
        ))}
      </Defs>
      {layers.map((f, k) => {
        const period = w * (1.15 + 0.45 * k);
        const shift = (travel * f) % period;
        const ry = h * (0.42 - 0.08 * k);
        const cy = h * (0.26 + 0.28 * k);
        return range(3).map((j) => (
          <Ellipse
            key={`${k}-${j}`}
            cx={j * period - shift + period * 0.25}
            cy={cy}
            rx={period * 0.36}
            ry={ry}
            fill={`url(#pool${k})`}
            opacity={0.85 - 0.18 * k}
          />
        ));
      })}
    </Svg>
  );
}

/** The corridor itself: a side-scrolling strip drawn in world units. */
function Corridor({
  w,
  width,
  height,
  spin,
  trail,
  table,
  dim,
}: {
  w: FlipWorld;
  width: number;
  height: number;
  spin: number;
  trail: { x: number; y: number }[];
  table: Player[];
  dim: boolean;
}) {
  const t = useTheme();
  // One track height is the scene's height, so the corridor always fills it.
  const S = height;
  const camX = w.x - (width * RUNNER_VIEW_X) / S;
  const px = (x: number) => (x - camX) * S;
  const runnerX = width * RUNNER_VIEW_X;
  const you = w.runners[0];
  const flash = you.invuln > 0 && Math.floor(w.t * 9) % 2 === 0;

  // The whole stack of rivals has to fit in the track behind the runner, glow
  // and all, so on a narrow scene the step back closes up rather than pushing
  // the last one off the left edge of the corridor.
  const ghosts = w.runners.slice(1);
  const ghostR = RUNNER_R * S * 0.82;
  const ghostStep = ghosts.length ? Math.min(GHOST_BACK * S, (runnerX - ghostR * 1.7) / ghosts.length) : 0;

  const onScreen = (x: number, wide = 0) => px(x) + wide * S > -12 && px(x) < width + 12;
  const slabs = w.course.slabs.filter((s: Slab) => onScreen(s.x, s.w));
  const orbs = w.course.orbs.filter((o: Orb) => onScreen(o.x) && !o.taken.includes(0));

  // Scrolling rules on the floor and ceiling, to read the speed off.
  const rule = 0.5;
  const first = Math.ceil(camX / rule) * rule;
  const rules = range(Math.ceil(width / (rule * S)) + 2).map((i) => first + i * rule);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="gf-runner" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={t.cyan} stopOpacity={1} />
          <Stop offset="1" stopColor={t.acc} stopOpacity={1} />
        </SvgGradient>
        <SvgGradient id="gf-ground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.bg2} stopOpacity={0.55} />
          <Stop offset="1" stopColor={t.bg} stopOpacity={0.75} />
        </SvgGradient>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#gf-ground)" />

      {rules.map((x) => (
        <Rect key={`r${x}`} x={px(x)} y={0} width={1} height={height} fill={t.line} opacity={0.35} />
      ))}

      {/* the two surfaces gravity can hold you against */}
      <Rect x={0} y={0} width={width} height={3} fill={t.acc} opacity={you.flipped ? 0.85 : 0.3} />
      <Rect x={0} y={height - 3} width={width} height={3} fill={t.acc} opacity={you.flipped ? 0.3 : 0.85} />

      {slabs.map((s) => {
        const x = px(s.x);
        const sw = Math.max(2, s.w * S);
        const sh = Math.max(2, (s.y1 - s.y0) * S);
        // Anything hanging clear of both surfaces is lit differently, because
        // it is the one shape you can pass on either side of.
        const mid = s.kind === 'pillar' || s.kind === 'gate';
        // The rim sits on whichever edge faces the corridor.
        const rimY = s.y0 <= 0.001 ? s.y1 * S - 4 : s.y0 * S + 2;
        return (
          <G key={s.id}>
            <Rect
              x={x}
              y={s.y0 * S}
              width={sw}
              height={sh}
              rx={Math.min(9, sw / 2.4)}
              fill={t.panel2}
              stroke={mid ? t.acc : t.line2}
              strokeWidth={mid ? 1.6 : 1}
              opacity={0.95}
            />
            <Rect x={x + 3} y={rimY} width={Math.max(1, sw - 6)} height={2} rx={1} fill={t.rim} opacity={0.45} />
          </G>
        );
      })}

      {orbs.map((o) => (
        <G key={o.id}>
          <Circle cx={px(o.x)} cy={o.y * S} r={ORB_R * S * 1.9} fill={t.gold} opacity={0.14} />
          <Circle cx={px(o.x)} cy={o.y * S} r={ORB_R * S} fill={t.gold} opacity={0.55} />
          <Circle cx={px(o.x)} cy={o.y * S} r={ORB_R * S * 0.42} fill={t.rim} opacity={0.9} />
        </G>
      ))}

      {/* the rivals, set a touch behind so four runners never stack into one */}
      {ghosts.map((r: Runner, k: number) => (
        <Ghost
          key={r.seat}
          r={r}
          x={runnerX - (k + 1) * ghostStep}
          y={r.y * S}
          rad={ghostR}
          tint={gradStops(table[r.seat]?.grad ?? '')[0]}
        />
      ))}

      {trail.map((p, i) => (
        <Circle
          key={i}
          cx={px(p.x)}
          cy={p.y * S}
          r={RUNNER_R * S * (0.25 + 0.4 * (i / TRAIL))}
          fill={t.cyan}
          opacity={0.06 + 0.16 * (i / TRAIL)}
        />
      ))}

      {!you.out && (
        <G opacity={dim ? 0.55 : flash ? 0.35 : 1}>
          <Circle cx={runnerX} cy={you.y * S} r={RUNNER_R * S * 2.1} fill={t.cyan} opacity={0.14} />
          <G transform={`rotate(${spin} ${runnerX} ${you.y * S})`}>
            <Polygon
              points={diamond(runnerX, you.y * S, RUNNER_R * S)}
              fill="url(#gf-runner)"
              stroke={t.rim}
              strokeWidth={1.2}
            />
            <Circle cx={runnerX} cy={you.y * S - RUNNER_R * S * 0.34} r={RUNNER_R * S * 0.2} fill={t.rim} opacity={0.95} />
          </G>
        </G>
      )}
    </Svg>
  );
}

/** A four-point kite, drawn nose-first so the roll on a flip is readable. */
function diamond(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx + r * 0.78},${cy} ${cx},${cy + r * 1.02} ${cx - r * 0.78},${cy}`;
}

/** A rival: the same runner, in their own tint, a length behind. */
function Ghost({ r, x, y, rad, tint }: { r: Runner; x: number; y: number; rad: number; tint: string }) {
  const t = useTheme();
  if (r.out) return null;
  return (
    <G opacity={r.invuln > 0 ? 0.3 : 0.62}>
      <Circle cx={x} cy={y} r={rad * 1.7} fill={tint} opacity={0.16} />
      <Circle cx={x} cy={y} r={rad} fill={tint} stroke={t.rim} strokeWidth={1} opacity={0.85} />
    </G>
  );
}

/** Speed, distance, orbs and what is left of your lives. */
function Telemetry({ w, lives, width }: { w: FlipWorld; lives: number; width: number }) {
  const t = useTheme();
  const you = w.runners[0];
  const ramp = speedRamp(w.t);
  return (
    <Glass radius={R.xl} elevated={false} style={{ width, marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Kicker color={t.dim2} tracking={1.4}>
              SPEED
            </Kicker>
            <H size={11} weight={700} color={ramp > 0.7 ? t.pink : t.ink}>
              {`×${(1 + ramp * 2).toFixed(1)}`}
            </H>
          </View>
          <Bar pct={ramp} fill={ramp > 0.7 ? t.pink : t.cyan} height={5} />
        </View>

        <View style={{ alignItems: 'center' }}>
          <H size={13} weight={700}>
            {Math.round(you.dist)}
          </H>
          <Kicker color={t.dim2} tracking={1.2}>
            LENGTHS
          </Kicker>
        </View>

        <Chip bg={t.tile} border={t.line} color={t.gold}>
          {`◆ ${you.orbs}`}
        </Chip>

        <View accessible accessibilityLabel={`${you.lives} of ${lives} lives left`} style={{ flexDirection: 'row', gap: 4 }}>
          {range(clamp(lives, 1, 9)).map((i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i < you.lives ? t.lime : t.track,
                borderWidth: 1,
                borderColor: i < you.lives ? 'transparent' : t.line,
              }}
            />
          ))}
        </View>
      </View>
    </Glass>
  );
}

export const game: PlayableGame = {
  name: 'Gravity Flip',
  Screen,
  rules: [
    'One control: tap the corridor and gravity turns over, so your runner falls to the ceiling. Tap again and it falls back to the floor.',
    'Dodge the glass slabs and sweep up the orbs. Your score is the distance you cover plus twenty-five for every orb.',
    'Clipping a slab costs a life, and running out puts you out for good. Everybody runs the same course — highest score when the clock stops takes it.',
  ],
};

export { Screen };
