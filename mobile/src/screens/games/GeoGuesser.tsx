import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line as SvgLine,
  LinearGradient as SvgGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Avatar, Chip, Cta, Glass, H, Kicker, P, gradStops } from '../../components/base';
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
  BUILD,
  CLIMATE_LABEL,
  CONTINENTS,
  GUESS_MESSAGE,
  HORIZON,
  MAP_H,
  MAP_W,
  PLANT,
  ROAD,
  ROAD_BOTTOM,
  ROAD_LINE,
  ROAD_TOP,
  ROUNDS,
  SCENE_H,
  SCENE_W,
  SCRIPT_LABEL,
  SIGN_FACE,
  SIGN_INK,
  SIGN_POST,
  SUN,
  TRUNK,
  TRUNK_DARK,
  allIn,
  bestKm,
  botGuess,
  closeRound,
  deal,
  formatKm,
  group,
  guessProblem,
  isLegalGuess,
  matchWinner,
  nextRound,
  roadEdges,
  roundTable,
  sceneFor,
  standings,
  submitGuess,
  toLatLon,
  toXY,
  waitingOn,
  xpFor,
  type GeoState,
  type LatLon,
  type Place,
  type SceneBuilding,
  type ScenePlant,
  type SceneSpec,
} from '../../game/geoGuesser';
import { GRADBOT } from '../../data/people';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * GeoGuesser.
 *
 * You are dropped somewhere on Earth with no imagery to lean on, so the "view"
 * is drawn from the location's own facts: the climate paints the sky and the
 * ground, the terrain cuts the horizon, the vegetation and the skyline are the
 * real ones, and the road sign carries a real word in the real script on the
 * side of the road they really drive on. Read the picture, drop a pin on the
 * world map, and the closest pin takes the round. Three rounds, one winner.
 */

/** Where you are deemed to have guessed if the clock runs out with no pin. */
const MID_ATLANTIC: LatLon = { lat: 0, lon: -25 };

const TERRAIN_WORD = {
  mountains: 'a mountain horizon',
  dunes: 'rolling dunes',
  flat: 'a flat horizon',
  coast: 'a coastline',
} as const;

const PLANT_WORD = {
  palms: 'palms',
  pines: 'conifers',
  scrub: 'dry scrub',
  none: 'no trees at all',
} as const;

const BUILD_WORD = {
  lowrise: 'low-rise blocks',
  pagoda: 'tiered pagoda roofs',
  adobe: 'adobe walls',
  glass: 'glass towers',
} as const;

/** What a sighted player can see, for anyone who cannot see it. */
const describe = (p: Place) =>
  `Generated scene. ${CLIMATE_LABEL[p.climate]} light over ${TERRAIN_WORD[p.terrain]}, ${PLANT_WORD[p.vegetation]}, ` +
  `${BUILD_WORD[p.architecture]}, a road sign reading ${p.sign} in ${SCRIPT_LABEL[p.script]}, traffic on the ${p.drive}.`;

const coord = (p: LatLon) =>
  `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'}  ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'W'}`;

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  const table: Player[] = [config.you, ...config.opponents];
  const seats = Math.max(2, table.length);
  const seatOf = (i: number): Player =>
    table[i] ?? { name: `Seat ${i + 1}`, mark: 'B', grad: GRADBOT, bot: true };
  const nameOf = (i: number) => (i === 0 ? 'You' : seatOf(i).name);

  // One seeded stream drives the deal and every bot, so a match replays exactly
  // as the engine tests do.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<GeoState>(() => deal(seats, ROUNDS, rng.current as Rng));
  const [pin, setPin] = useState<LatLon | null>(null);
  const [secs, setSecs] = useState(0);
  const [emote, setEmote] = useState<string | null>(null);

  const pinRef = useRef(pin);
  pinRef.current = pin;
  const done = useRef(false);

  const place = st.places[st.round];
  const spec = useMemo(() => sceneFor(place), [place]);
  const youIn = st.guesses[st.round][0] !== null;
  const left = waitingOn(st).length;

  // ── the bots read the scene and pin it, one after another ─────────
  useEffect(() => {
    if (st.phase !== 'guess') return;
    const here = st.places[st.round];
    const ids: ReturnType<typeof setTimeout>[] = [];
    for (let seat = 1; seat < st.seats; seat++) {
      const at = botGuess(here, bot, rng.current as Rng);
      const wait = Math.round(bot.think * (0.9 + seat * 0.6) + (rng.current as Rng)() * 700);
      ids.push(
        setTimeout(() => {
          setSt((cur) => (isLegalGuess(cur, seat, at) ? submitGuess(cur, seat, at) : cur));
        }, wait),
      );
    }
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.round, st.phase]);

  // ── every pin in: score the round ─────────────────────────────────
  useEffect(() => {
    if (st.phase !== 'guess' || !allIn(st)) return;
    const id = setTimeout(() => {
      setSt((cur) => (cur.phase === 'guess' && allIn(cur) ? closeRound(cur) : cur));
    }, 420);
    return () => clearTimeout(id);
  }, [st]);

  // ── the lobby's answer clock ──────────────────────────────────────
  useEffect(() => {
    if (st.phase !== 'guess' || youIn) {
      setSecs(0);
      return;
    }
    let n = Math.max(10, config.options.timer);
    setSecs(n);
    const id = setInterval(() => {
      n -= 1;
      setSecs(n);
      if (n > 0) return;
      clearInterval(id);
      const at = pinRef.current ?? MID_ATLANTIC;
      setSt((cur) => (isLegalGuess(cur, 0, at) ? submitGuess(cur, 0, at) : cur));
      onToast(pinRef.current ? 'Time — your pin is locked in' : 'Time — no pin, so you guessed mid-Atlantic');
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.round, st.phase, youIn]);

  // ── the lobby's discussion clock, over the reveal ─────────────────
  useEffect(() => {
    if (st.phase !== 'reveal') return;
    let n = Math.max(5, config.options.discuss);
    setSecs(n);
    const id = setInterval(() => {
      n -= 1;
      setSecs(n);
      if (n > 0) return;
      clearInterval(id);
      setSt((cur) => (cur.phase === 'reveal' ? nextRound(cur) : cur));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.round, st.phase]);

  useEffect(() => {
    setPin(null);
  }, [st.round]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── actions ───────────────────────────────────────────────────────

  const drop = (at: LatLon) => {
    if (st.phase !== 'guess' || youIn) return;
    setPin(at);
  };

  const confirm = () => {
    if (!pin) return onToast('Tap the map to drop your pin first');
    const bad = guessProblem(st, 0, pin);
    if (bad) return onToast(GUESS_MESSAGE[bad]);
    setSt(submitGuess(st, 0, pin));
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const board = standings(st);
    const won = matchWinner(st);
    const yours = st.winners.filter((w) => w === 0).length;

    onFinish({
      game: 'GeoGuesser',
      head: won === 0 ? 'You won' : `${seatOf(won).name} took it`,
      kicker: `${group(st.totals[0])} points · ${yours} of ${st.rounds} round${yours === 1 ? '' : 's'}`,
      xp: `+${xpFor(st.totals[0])}`,
      note: `You were dropped in ${st.places.map((p) => `${p.name}, ${p.country}`).join(' · ')}.`,
      rows: board.map((r) => ({
        n: nameOf(r.seat) === 'You' ? config.you.name : seatOf(r.seat).name,
        d: `${group(r.total)} pts · closest ${formatKm(r.best)}`,
        s: `+${xpFor(r.total)}`,
        win: r.rank === 1,
        mark: seatOf(r.seat).mark,
        grad: seatOf(r.seat).grad,
      })),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────

  const seatInfo: SeatInfo[] = config.opponents.slice(0, 4).map((p, k) => {
    const i = k + 1;
    const guessed = st.guesses[st.round][i] !== null;
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub:
        st.phase === 'guess'
          ? guessed
            ? 'Pin in'
            : 'Reading…'
          : `${group(st.totals[i])} pts`,
      active: st.phase === 'reveal' && st.winners[st.round] === i,
    };
  });

  const log =
    st.phase === 'over'
      ? 'Three rounds played'
      : st.phase === 'reveal'
        ? `${place.name}, ${place.country}`
        : youIn
          ? left === 0
            ? 'Everyone has pinned'
            : `Pin locked — waiting on ${left} more`
          : 'Where in the world is this?';

  return (
    <GameShell>
      <GameHeader
        hud={`ROUND ${st.round + 1}/${st.rounds}`}
        extra={
          <HudChip tint={st.phase === 'guess' && secs > 0 && secs <= 5 ? t.pink : t.lime}>
            {st.phase === 'over' ? group(st.totals[0]) : `${Math.max(0, secs)}s`}
          </HudChip>
        }
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      {seatInfo.length > 0 && <SeatStrip seats={seatInfo} />}

      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 4 }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          <SceneCard place={place} spec={spec} revealed={st.phase !== 'guess'} />

          <WorldMap
            pin={st.phase === 'guess' ? pin : st.guesses[st.round][0]}
            truth={st.phase === 'guess' ? null : place}
            others={
              st.phase === 'guess'
                ? []
                : st.guesses[st.round]
                    .map((g, i) => ({ at: g, seat: i }))
                    .filter((o) => o.seat > 0 && o.at !== null)
                    .map((o) => ({ at: o.at as LatLon, tint: gradStops(seatOf(o.seat).grad)[0] }))
            }
            locked={st.phase !== 'guess' || youIn}
            onDrop={drop}
          />

          {st.phase !== 'guess' && (
            <FadeIn>
              <RoundCard st={st} place={place} nameOf={nameOf} seatOf={seatOf} />
            </FadeIn>
          )}
        </ScrollView>
      </View>

      <TableLog text={log} />

      {st.phase === 'reveal' ? (
        <View style={{ paddingTop: 10 }}>
          <EmoteBar onEmote={setEmote} />
        </View>
      ) : (
        <Readout pin={pin} committed={st.guesses[st.round][0]} total={st.totals[0]} />
      )}

      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        {st.phase === 'guess' && (
          <Cta
            label={youIn ? 'Pin locked in' : pin ? 'Confirm this guess' : 'Tap the map to drop a pin'}
            onPress={youIn ? () => onToast('Your pin is in — waiting on the table') : confirm}
          />
        )}
        {st.phase === 'reveal' && (
          <Cta
            label={st.round + 1 >= st.rounds ? 'Final scores' : `Round ${st.round + 2} of ${st.rounds}`}
            onPress={() => setSt(nextRound(st))}
          />
        )}
        {st.phase === 'over' && <Cta label="Scoreboard" onPress={finish} />}
      </View>

      {st.phase === 'over' && (
        <MatchOver st={st} nameOf={nameOf} seatOf={seatOf} onExit={onExit} onFinish={finish} />
      )}
    </GameShell>
  );
}

// ── the generated view ────────────────────────────────────────────

function SceneCard({ place, spec, revealed }: { place: Place; spec: SceneSpec; revealed: boolean }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const h = w ? Math.round((w * SCENE_H) / SCENE_W) : 194;

  return (
    <FadeIn>
      <Glass radius={R.xl}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={revealed ? `${place.name}, ${place.country}. ${place.tell}` : describe(place)}
          onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
          style={{ height: h }}
        >
          {w > 0 && <SceneSvg place={place} spec={spec} w={w} h={h} />}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderTopWidth: 1,
            borderTopColor: t.line,
          }}
        >
          <Kicker color={t.dim2}>{revealed ? 'THE ANSWER' : 'THE VIEW'}</Kicker>
          <H size={12.5} weight={700} numberOfLines={1} style={{ marginLeft: 'auto' }}>
            {revealed ? `${place.name}, ${place.country}` : 'No labels, no imagery — just the cues'}
          </H>
        </View>
      </Glass>
    </FadeIn>
  );
}

function SceneSvg({ place, spec, w, h }: { place: Place; spec: SceneSpec; w: number; h: number }) {
  const sky = `sky-${place.id}`;
  const lane = spec.drive === 'left' ? 0.27 : 0.73;
  const carY = 150;
  const [lo, hi] = roadEdges(carY);
  const carX = lo + (hi - lo) * lane;

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <SvgGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={spec.sky[0]} />
          <Stop offset="1" stopColor={spec.sky[1]} />
        </SvgGradient>
      </Defs>

      <Rect x={0} y={0} width={SCENE_W} height={HORIZON + 6} fill={`url(#${sky})`} />
      <Circle cx={spec.sun.x} cy={spec.sun.y} r={spec.sun.r} fill="#ffffff" opacity={0.7} />

      {/* the horizon the terrain cuts */}
      <Path d={spec.ridgeFar} fill={spec.ridgeFarFill} opacity={0.8} />
      <Path d={spec.ridge} fill={spec.ridgeFill} />
      <Rect x={0} y={HORIZON + 4} width={SCENE_W} height={SCENE_H - HORIZON - 4} fill={spec.land} />
      {spec.water && <Path d={spec.water.d} fill={spec.water.fill} />}

      {/* the road, narrowing to the horizon */}
      <Polygon
        points={`${ROAD_TOP[0]},${HORIZON} ${ROAD_TOP[1]},${HORIZON} ${ROAD_BOTTOM[1]},${SCENE_H} ${ROAD_BOTTOM[0]},${SCENE_H}`}
        fill={ROAD}
      />
      {[0, 1, 2, 3].map((k) => {
        const y0 = HORIZON + (SCENE_H - HORIZON) * (k / 4 + 0.07);
        const y1 = HORIZON + (SCENE_H - HORIZON) * (k / 4 + 0.19);
        const [a, b] = roadEdges(y0);
        const [c, d] = roadEdges(y1);
        const c0 = (a + b) / 2;
        const w0 = (b - a) * 0.035;
        const c1 = (c + d) / 2;
        const w1 = (d - c) * 0.035;
        return (
          <Polygon
            key={k}
            points={`${c0 - w0},${y0} ${c0 + w0},${y0} ${c1 + w1},${y1} ${c1 - w1},${y1}`}
            fill={ROAD_LINE}
            opacity={0.8}
          />
        );
      })}

      {spec.buildings.map((b, i) => (
        <BuildingShape key={`b${i}`} b={b} standY={spec.standY} />
      ))}

      {spec.plants.map((p, i) => (
        <PlantShape key={`p${i}`} p={p} />
      ))}

      {/* which side they drive on */}
      <G>
        <Rect x={carX - 8} y={carY - 6} width={16} height={7} rx={2} fill={SIGN_POST} />
        <Rect x={carX - 5} y={carY - 10} width={10} height={5} rx={1.6} fill={ROAD} />
        <Circle cx={carX - 4.5} cy={carY + 1} r={1.8} fill={ROAD} />
        <Circle cx={carX + 4.5} cy={carY + 1} r={1.8} fill={ROAD} />
      </G>

      {/* the road sign, on the side they drive on */}
      <SvgLine
        x1={spec.sign.postX}
        y1={spec.sign.postY}
        x2={spec.sign.postX}
        y2={spec.sign.y + spec.sign.h}
        stroke={SIGN_POST}
        strokeWidth={2.6}
      />
      <Rect
        x={spec.sign.x}
        y={spec.sign.y}
        width={spec.sign.w}
        height={spec.sign.h}
        rx={3}
        fill={SIGN_FACE}
        stroke={SIGN_INK}
        strokeWidth={1.2}
      />
      <SvgText
        x={spec.sign.x + spec.sign.w / 2}
        y={spec.sign.y + spec.sign.h / 2 + 4.4}
        fill={SIGN_INK}
        fontSize={12}
        textAnchor="middle"
      >
        {spec.sign.text}
      </SvgText>
    </Svg>
  );
}

function BuildingShape({ b, standY }: { b: SceneBuilding; standY: number }) {
  const [face, shade] = BUILD[b.kind];
  const top = standY - b.h;
  const cx = b.x + b.w / 2;

  if (b.kind === 'pagoda') {
    const tiers = [0, 1, 2];
    return (
      <G>
        <Rect x={cx - b.w * 0.26} y={top + b.h * 0.28} width={b.w * 0.52} height={b.h * 0.72} fill={shade} />
        {tiers.map((k) => {
          const y = top + (b.h * 0.62 * k) / 2 + 2;
          const rw = (b.w / 2) * (1 - k * 0.16);
          return (
            <Polygon
              key={k}
              points={`${cx - rw},${y + 5} ${cx - rw * 0.7},${y - 1} ${cx + rw * 0.7},${y - 1} ${cx + rw},${y + 5}`}
              fill={face}
            />
          );
        })}
      </G>
    );
  }

  if (b.kind === 'glass') {
    return (
      <G>
        <Rect x={b.x} y={top} width={b.w} height={b.h} fill={face} />
        <Rect x={b.x + b.w * 0.62} y={top} width={b.w * 0.38} height={b.h} fill={shade} />
        {Array.from({ length: Math.max(2, Math.floor(b.h / 9)) }, (_, k) => (
          <Rect
            key={k}
            x={b.x + 1.4}
            y={top + 4 + k * 9}
            width={b.w - 2.8}
            height={1.6}
            fill={shade}
            opacity={0.65}
          />
        ))}
      </G>
    );
  }

  if (b.kind === 'adobe') {
    return (
      <G>
        <Rect x={b.x} y={top} width={b.w} height={b.h} rx={1.5} fill={face} />
        <Rect x={b.x - 1.4} y={top - 2.6} width={b.w + 2.8} height={3.4} rx={1} fill={shade} />
        <Rect x={b.x + b.w * 0.34} y={standY - b.h * 0.42} width={b.w * 0.24} height={b.h * 0.42} fill={shade} />
      </G>
    );
  }

  return (
    <G>
      <Rect x={b.x} y={top} width={b.w} height={b.h} fill={face} />
      <Polygon points={`${b.x - 1.6},${top} ${cx},${top - 5} ${b.x + b.w + 1.6},${top}`} fill={shade} />
      {Array.from({ length: 2 }, (_, k) => (
        <Rect key={k} x={b.x + 3} y={top + 5 + k * 8} width={b.w - 6} height={3} fill={shade} opacity={0.75} />
      ))}
    </G>
  );
}

function PlantShape({ p }: { p: ScenePlant }) {
  const c = PLANT[p.kind];
  const s = p.s;

  if (p.kind === 'palms') {
    const th = 20 * s;
    const tipX = p.x + 3 * s;
    const tipY = p.y - th;
    return (
      <G>
        <Path d={`M${p.x},${p.y} Q${p.x + 4 * s},${p.y - th * 0.6} ${tipX},${tipY}`} stroke="#7d6a49" strokeWidth={1.8 * s} fill="none" />
        {[-1, -0.5, 0.5, 1].map((k, i) => (
          <Path
            key={i}
            d={`M${tipX},${tipY} Q${tipX + 9 * s * k},${tipY - 4 * s} ${tipX + 13 * s * k},${tipY + 3 * s}`}
            stroke={c}
            strokeWidth={2.2 * s}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <Path d={`M${tipX},${tipY} Q${tipX},${tipY - 6 * s} ${tipX + 2 * s},${tipY - 9 * s}`} stroke={c} strokeWidth={2 * s} fill="none" strokeLinecap="round" />
      </G>
    );
  }

  if (p.kind === 'pines') {
    const hgt = 17 * s;
    return (
      <G>
        <Rect x={p.x - 0.8 * s} y={p.y - 3 * s} width={1.6 * s} height={3 * s} fill="#5c4a35" />
        <Polygon points={`${p.x},${p.y - hgt} ${p.x - 5 * s},${p.y - 3 * s} ${p.x + 5 * s},${p.y - 3 * s}`} fill={c} />
        <Polygon
          points={`${p.x},${p.y - hgt - 4 * s} ${p.x - 3.6 * s},${p.y - hgt * 0.55} ${p.x + 3.6 * s},${p.y - hgt * 0.55}`}
          fill={c}
          opacity={0.9}
        />
      </G>
    );
  }

  return (
    <G>
      <Ellipse cx={p.x} cy={p.y - 2 * s} rx={5 * s} ry={3 * s} fill={c} />
      <Ellipse cx={p.x + 3.4 * s} cy={p.y - 1 * s} rx={3 * s} ry={2 * s} fill={c} opacity={0.85} />
    </G>
  );
}

// ── the world map ─────────────────────────────────────────────────

function WorldMap({
  pin,
  truth,
  others,
  locked,
  onDrop,
}: {
  pin: LatLon | null;
  truth: LatLon | null;
  others: { at: LatLon; tint: string }[];
  locked: boolean;
  onDrop: (at: LatLon) => void;
}) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const h = w ? Math.round(w / 2) : Math.round(MAP_H);

  const press = (e: GestureResponderEvent) => {
    if (locked || !w) return;
    const { locationX, locationY } = e.nativeEvent;
    onDrop(toLatLon(locationX, locationY, w, h));
  };

  const label = locked
    ? pin
      ? `World map. Your pin is at ${coord(pin)}.`
      : 'World map.'
    : `World map. ${pin ? `Your pin is at ${coord(pin)}.` : 'No pin dropped yet.'} Tap anywhere to drop your pin.`;

  const px = (p: LatLon) => toXY(p, MAP_W, MAP_H);

  return (
    <Glass radius={R.xl}>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: h }}>
        <Pressable
          onPress={press}
          disabled={locked}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{ width: '100%', height: '100%' }}
        >
          {w > 0 && (
            <Svg width={w} height={h} viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
              <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill={t.track} />
              {CONTINENTS.map((c) => (
                <Path key={c.id} d={c.d} fill={t.g3} opacity={0.9} />
              ))}
              <SvgLine x1={0} y1={90} x2={MAP_W} y2={90} stroke={t.line2} strokeWidth={0.7} />
              <SvgLine x1={180} y1={0} x2={180} y2={MAP_H} stroke={t.line} strokeWidth={0.7} />
              <SvgLine x1={0} y1={66.5} x2={MAP_W} y2={66.5} stroke={t.line} strokeWidth={0.5} />
              <SvgLine x1={0} y1={113.5} x2={MAP_W} y2={113.5} stroke={t.line} strokeWidth={0.5} />

              {truth && pin && (
                <SvgLine
                  x1={px(pin).x}
                  y1={px(pin).y}
                  x2={px(truth).x}
                  y2={px(truth).y}
                  stroke={t.gold}
                  strokeWidth={1.4}
                  strokeDasharray="3 2.5"
                />
              )}

              {others.map((o, i) => (
                <Circle key={i} cx={px(o.at).x} cy={px(o.at).y} r={3.2} fill={o.tint} stroke={t.bg} strokeWidth={1} />
              ))}

              {pin && (
                <G>
                  <Circle cx={px(pin).x} cy={px(pin).y} r={6.5} fill={t.acc} opacity={0.28} />
                  <Circle cx={px(pin).x} cy={px(pin).y} r={3.6} fill={t.acc} stroke={t.ink} strokeWidth={1.1} />
                </G>
              )}

              {truth && (
                <G>
                  <Circle cx={px(truth).x} cy={px(truth).y} r={7} fill="none" stroke={t.gold} strokeWidth={1.6} />
                  <Circle cx={px(truth).x} cy={px(truth).y} r={2.4} fill={t.gold} />
                </G>
              )}
            </Svg>
          )}
        </Pressable>
      </View>
    </Glass>
  );
}

// ── the reveal ────────────────────────────────────────────────────

function RoundCard({
  st,
  place,
  nameOf,
  seatOf,
}: {
  st: GeoState;
  place: Place;
  nameOf: (i: number) => string;
  seatOf: (i: number) => Player;
}) {
  const t = useTheme();
  const rows = roundTable(st, st.round);

  return (
    <Glass radius={R.xl} elevated={false}>
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H size={17} weight={800} numberOfLines={1} style={{ flexShrink: 1 }}>
            {place.name}
          </H>
          <Chip bg={t.tile} border={t.line} color={t.dim}>
            {place.region}
          </Chip>
        </View>
        <P size={11.5} color={t.dim} style={{ lineHeight: 16 }}>
          {place.tell}
        </P>

        <View style={{ gap: 6 }}>
          {rows.map((r) => (
            <View
              key={r.seat}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 11,
                backgroundColor: t.tile,
                borderWidth: 1,
                borderColor: r.win ? t.acc : t.line,
              }}
            >
              <Avatar mark={seatOf(r.seat).mark} grad={seatOf(r.seat).grad} size={22} fontSize={9} />
              <H size={11.5} numberOfLines={1} style={{ flexShrink: 1 }}>
                {nameOf(r.seat)}
              </H>
              <P size={10.5} color={t.dim2} style={{ marginLeft: 'auto' }}>
                {formatKm(r.km)}
              </P>
              <Chip bg={t.tile} border={r.win ? t.acc : t.line} color={r.win ? t.ink : t.dim}>
                {group(r.points)}
              </Chip>
            </View>
          ))}
        </View>
      </View>
    </Glass>
  );
}

function Readout({ pin, committed, total }: { pin: LatLon | null; committed: LatLon | null; total: number }) {
  const t = useTheme();
  const at = committed ?? pin;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingTop: 10 }}>
      <Kicker color={t.dim2}>{committed ? 'LOCKED' : 'YOUR PIN'}</Kicker>
      <H size={12.5} weight={700} color={at ? t.ink : t.dim2}>
        {at ? coord(at) : 'nowhere yet'}
      </H>
      <Chip bg={t.tile} border={t.line} color={t.dim} style={{ marginLeft: 'auto' }}>
        {`${group(total)} pts`}
      </Chip>
    </View>
  );
}

function MatchOver({
  st,
  nameOf,
  seatOf,
  onExit,
  onFinish,
}: {
  st: GeoState;
  nameOf: (i: number) => string;
  seatOf: (i: number) => Player;
  onExit: () => void;
  onFinish: () => void;
}) {
  const t = useTheme();
  const board = standings(st);
  const won = board[0].seat;
  const yours = st.winners.filter((w) => w === 0).length;

  return (
    <GameOverlay
      title={won === 0 ? 'You won' : `${seatOf(won).name} won`}
      blurb={`${group(st.totals[0])} points over ${st.rounds} rounds — you took ${yours} of them, closest pin ${formatKm(bestKm(st, 0))}.`}
      label="Match over"
    >
      <View style={{ gap: 6, marginBottom: 18 }}>
        {board.map((r) => (
          <View
            key={r.seat}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              paddingHorizontal: 11,
              paddingVertical: 8,
              borderRadius: 11,
              backgroundColor: t.tile,
              borderWidth: 1,
              borderColor: r.rank === 1 ? t.acc : t.line,
            }}
          >
            <H size={10} color={t.dim2} style={{ width: 12 }}>
              {r.rank}
            </H>
            <Avatar mark={seatOf(r.seat).mark} grad={seatOf(r.seat).grad} size={22} fontSize={9} />
            <H size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
              {nameOf(r.seat)}
            </H>
            <H size={12} weight={700} color={r.rank === 1 ? t.ink : t.dim} style={{ marginLeft: 'auto' }}>
              {group(r.total)}
            </H>
          </View>
        ))}
      </View>
      <OverlayActions
        secondary={{ label: 'Leave', onPress: onExit }}
        primary={{ label: 'Scoreboard', onPress: onFinish }}
      />
    </GameOverlay>
  );
}

export const game: PlayableGame = {
  name: 'GeoGuesser',
  Screen,
  rules: [
    'You are dropped somewhere on Earth. There is no imagery — the view is drawn from the place itself: climate, terrain, plants, buildings, and a road sign in the local script on the local side of the road.',
    'Read the cues, tap the world map to drop a pin, then confirm before the clock runs out.',
    'Closest pin takes the round and 5,000 points shade away to nothing by 5,000 km. Three rounds, most points wins.',
  ],
};

export { Screen };
