import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Rect } from 'react-native-svg';
import { Bar, Chip, Cta, Glass, Glyph, H, Kicker, P, Tap } from '../../components/base';
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
  BASE_HALF,
  BOARD,
  CENTRE_R,
  DT,
  MAN_R,
  MEN_PER_SIDE,
  POCKETS,
  POCKET_R,
  SHOT_MESSAGE,
  STRIKER_R,
  atRest,
  baselineOf,
  botShot,
  describeShot,
  freeSpots,
  menLeft,
  otherSide,
  radiusOf,
  resolve,
  settle,
  shotProblem,
  sideOfSeat,
  sideOfTeam,
  spotFree,
  standings,
  startMatch,
  step,
  strikerAt,
  takeShot,
  teamOf,
  xpFor,
  type CarromState,
  type Piece,
  type Shot,
  type Side,
} from '../../game/carrom';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * Carrom.
 *
 * The board is one SVG drawn straight out of the engine's own geometry — the
 * same pocket centres, the same base lines, the same radii — so what you see is
 * exactly the surface the physics runs on. Nothing here decides anything: the
 * screen places the striker, hands the engine an angle and a power, then runs
 * `step` on a fixed-timestep accumulator until every disc has stopped and asks
 * `resolve` what that shot meant.
 *
 * The gesture is the one you use on a real board. Drag along your base line to
 * slide the striker; grab it and pull back to aim, further back for more pace;
 * let go to strike.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** How far back the pull can go, in board widths, and the dead zone before it counts. */
const MAX_PULL = 0.34;
const DEAD_PULL = 0.035;
/** Touching within this of the striker grabs it rather than repositioning it. */
const GRAB = 0.09;
/** Half-width of the strip along the base line that slides the striker. */
const BAND = 0.1;

interface Aim {
  u: number;
  angle: number;
  power: number;
}

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  // ── the table ─────────────────────────────────────────────────────
  // Carrom is played two- or four-handed, partners opposite, so an odd lobby
  // rounds up to doubles and the spare seat is filled the way Ludo fills one.
  const asked = Math.max(Math.round(config.options.players) || 0, 1 + config.opponents.length);
  const seats = clamp(asked, 2, 4) >= 3 ? 4 : 2;
  const filler = (i: number): Player => ({
    name: `Seat ${i + 1}`,
    mark: '●',
    grad: `linear-gradient(160deg,${t.acc},${t.acc2})`,
    bot: true,
  });
  const lobby: Player[] = [config.you, ...config.opponents];
  const table: Player[] = Array.from({ length: seats }, (_, i) => lobby[i] ?? filler(i));
  const name = (i: number) => (i === 0 ? 'You' : (table[i]?.name ?? `Seat ${i + 1}`));
  const who = (i: number) => table[i]?.name ?? `Seat ${i + 1}`;
  /** A side is a team, not a seat: in doubles it is a pair of names. */
  const teamName = (team: number) =>
    seats <= 2 ? who(team) : `${who(team)} & ${who(team + 2)}`;

  /** Board option: seconds before a turn plays itself. */
  const clock = clamp(Math.round(config.options.turn) || 25, 10, 120);

  // One seeded stream drives who breaks and every bot, so a board replays.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [st, setSt] = useState<CarromState>(() => startMatch(seats, rng.current as Rng));
  // Your aim, and yours alone: every angle is measured off your own base line,
  // so another seat's line can never be written into it.
  const [aim, setAim] = useState<Aim>(() => ({ u: 0.5, angle: -Math.PI / 2, power: 0.65 }));
  /** Where the seat on strike put its striker, when that seat is not you. */
  const [theirU, setTheirU] = useState(0.5);
  const [pull, setPull] = useState<{ x: number; y: number } | null>(null);
  const [emote, setEmote] = useState<string | null>(null);
  const [secs, setSecs] = useState(clock);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stRef = useRef(st);
  stRef.current = st;
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const done = useRef(false);

  const mine = st.phase === 'aim' && st.turn === 0 && st.winner === null;
  // The glass pane draws a hairline rim outside the board, so leave it room.
  const size = Math.max(0, Math.min(box.w, box.h) - 4);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const mySide: Side = sideOfSeat(0);
  const theirSide = otherSide(mySide);

  const strikerSpot = strikerAt(st.seats, st.turn, st.turn === 0 ? aim.u : theirU);

  // ── the simulation loop ───────────────────────────────────────────
  // One fixed timestep, the engine's own DT, accumulated against real frame
  // time so a slow frame catches up instead of slowing the board down. The
  // handle is cancelled on unmount and whenever the shot finishes.
  useEffect(() => {
    if (st.phase !== 'moving') return;
    let live = st;
    let prev = 0;
    let acc = 0;
    let ticks = 0;
    let id = 0;
    const tick = (now: number) => {
      if (!prev) prev = now;
      acc += Math.min(now - prev, 80) / 1000;
      prev = now;
      let guard = 0;
      while (acc >= DT && guard < 10) {
        live = step(live, DT);
        acc -= DT;
        guard++;
        ticks++;
      }
      // The engine caps a shot too, but a dropped frame must never strand the board.
      if (atRest(live) || ticks > 1400) {
        setSt(resolve(settle(live)));
        return;
      }
      setSt(live);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.shots]);

  // ── the bots ──────────────────────────────────────────────────────
  useEffect(() => {
    if (st.phase !== 'aim' || st.winner !== null || st.turn === 0) return;
    const seat = st.turn;
    const id = setTimeout(() => {
      const cur = stRef.current;
      if (cur.phase !== 'aim' || cur.turn !== seat || cur.winner !== null) return;
      const shot = botShot(cur, seat, bot, rng.current as Rng);
      if (shotProblem(cur, seat, shot)) return;
      // Only the spot on their own line is worth showing; their angle and pace
      // belong to that line, not to yours.
      setTheirU(shot.u);
      setSt(takeShot(cur, seat, shot));
    }, bot.think);
    return () => clearTimeout(id);
  }, [st.phase, st.turn, st.shots, st.winner, bot]);

  // ── your clock ────────────────────────────────────────────────────
  // The lobby's turn timer, spent on one strike. It plays for you rather than
  // skipping, so a distracted seat still gets a shot at the board.
  useEffect(() => {
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
      const cur = stRef.current;
      if (cur.phase !== 'aim' || cur.turn !== 0 || cur.winner !== null) return;
      const shot = botShot(cur, 0, bot, rng.current as Rng);
      if (shotProblem(cur, 0, shot)) return;
      setAim({ u: shot.u, angle: shot.angle, power: shot.power });
      setSt(takeShot(cur, 0, shot));
      onToast('Time — the table played your strike');
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, st.shots, clock]);

  // A fresh strike starts from a spot that is actually free.
  useEffect(() => {
    if (!mine) return;
    setAim((cur) => {
      if (spotFree(stRef.current, 0, cur.u)) return cur;
      const free = freeSpots(stRef.current, 0, 33);
      if (!free.length) return cur;
      let best = free[0];
      for (const u of free) if (Math.abs(u - cur.u) < Math.abs(best - cur.u)) best = u;
      return { ...cur, u: best };
    });
  }, [mine, st.shots]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // A foul is easy to miss when the discs are still settling.
  useEffect(() => {
    const o = st.last;
    if (!o || o.seat !== 0) return;
    if (o.strikerSunk) onToast('Striker down — a man goes back');
    else if (o.missed) onToast('You touched nothing — a man goes back');
    else if (o.queenReturned) onToast('The queen went back uncovered');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.last]);

  // ── the gesture ───────────────────────────────────────────────────
  const gesture = useRef({ mode: 'none' as 'none' | 'place' | 'aim', x: 0, y: 0 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const cur = stRef.current;
          const s = sizeRef.current;
          if (s <= 0 || cur.phase !== 'aim' || cur.turn !== 0 || cur.winner !== null) {
            gesture.current.mode = 'none';
            return;
          }
          const x = e.nativeEvent.locationX / s;
          const y = e.nativeEvent.locationY / s;
          gesture.current.x = x;
          gesture.current.y = y;
          const spot = strikerAt(cur.seats, 0, aimRef.current.u);
          const grabbed = Math.hypot(x - spot.x, y - spot.y) <= GRAB;
          const b = baselineOf(cur.seats, 0);
          const off = Math.abs((x - b.cx) * b.nx + (y - b.cy) * b.ny);
          // The striker and its own line are the only handles; a tap out on the
          // cloth is a look, not a shot, so it never launches one by accident.
          gesture.current.mode = grabbed ? 'aim' : off <= BAND ? 'place' : 'none';
          if (gesture.current.mode === 'place') slide(x, y);
          else if (gesture.current.mode === 'aim') drag(x, y);
        },
        onPanResponderMove: (_e, g) => {
          if (gesture.current.mode === 'none') return;
          const s = sizeRef.current;
          if (s <= 0) return;
          const x = gesture.current.x + g.dx / s;
          const y = gesture.current.y + g.dy / s;
          if (gesture.current.mode === 'place') slide(x, y);
          else drag(x, y);
        },
        onPanResponderRelease: () => {
          const mode = gesture.current.mode;
          gesture.current.mode = 'none';
          setPull(null);
          if (mode === 'aim') fire();
        },
        onPanResponderTerminate: () => {
          gesture.current.mode = 'none';
          setPull(null);
        },
      }),
    // The responder reads live values through refs, so it is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Slide the striker along the base line to wherever the finger is. */
  function slide(x: number, y: number) {
    const cur = stRef.current;
    const b = baselineOf(cur.seats, 0);
    const along = (x - b.cx) * b.tx + (y - b.cy) * b.ty;
    const u = clamp(0.5 + along / (2 * BASE_HALF), 0, 1);
    setAim((a) => ({ ...a, u }));
    setPull(null);
  }

  /** Pull back from the striker: the further back, the harder the strike. */
  function drag(x: number, y: number) {
    const cur = stRef.current;
    const spot = strikerAt(cur.seats, 0, aimRef.current.u);
    const dx = spot.x - x;
    const dy = spot.y - y;
    const len = Math.hypot(dx, dy);
    setPull({ x, y });
    if (len < 1e-4) return;
    setAim((a) => ({
      ...a,
      angle: Math.atan2(dy, dx),
      power: clamp((len - DEAD_PULL) / (MAX_PULL - DEAD_PULL), 0, 1),
    }));
  }

  /** Let it go. */
  function fire() {
    const cur = stRef.current;
    const shot: Shot = { ...aimRef.current };
    const bad = shotProblem(cur, 0, shot);
    if (bad) return onToast(SHOT_MESSAGE[bad]);
    setSt(takeShot(cur, 0, shot));
  }

  const nudge = (d: number) => {
    const cur = stRef.current;
    const free = freeSpots(cur, 0, 41);
    if (!free.length) return;
    const want = clamp(aimRef.current.u + d, 0, 1);
    let best = free[0];
    for (const u of free) if (Math.abs(u - want) < Math.abs(best - want)) best = u;
    setAim((a) => ({ ...a, u: best }));
  };

  // ── the scoreboard ────────────────────────────────────────────────
  const finish = () => {
    if (done.current) return;
    done.current = true;
    const winTeam = st.winner ?? 0;
    const won = winTeam === teamOf(0);
    const left = menLeft(st, otherSide(sideOfTeam(winTeam)));
    const points = left + (st.queenOff && st.queenCovered && st.queenTeam === winTeam ? 3 : 0);

    onFinish({
      game: 'Carrom',
      head: won ? 'You took the board' : 'Beaten on the board',
      kicker: won
        ? `${sideOfTeam(winTeam) === 'white' ? 'White' : 'Black'} cleared in ${st.shots} strikes`
        : `${teamName(winTeam)} cleared the board first`,
      xp: `+${xpFor(st, 0)}`,
      note: won
        ? `Nine men and ${points} point${points === 1 ? '' : 's'} on the board.`
        : `You left ${menLeft(st, mySide)} of your nine still on the cloth.`,
      // The scoreboard prints a row's position as its placing, and teams are
      // seat parities, so the seats are handed over winner-first rather than
      // in seat order — otherwise doubles reads 1,2,3,4 straight down the
      // board with the losing side on top.
      rows: standings(st).map((i) => {
        const p = table[i];
        const side = sideOfTeam(teamOf(i));
        const isWin = st.winner === teamOf(i);
        return {
          n: p.name,
          d: isWin
            ? `${side === 'white' ? 'White' : 'Black'} · cleared · ${points} pt${points === 1 ? '' : 's'}`
            : `${side === 'white' ? 'White' : 'Black'} · ${st.pocketed[side]} of ${MEN_PER_SIDE} potted`,
          s: `+${xpFor(st, i)}`,
          win: isWin,
          mark: p.mark,
          grad: p.grad,
        };
      }),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────
  const seatInfo: SeatInfo[] = table.map((p, i) => {
    const side = sideOfTeam(teamOf(i));
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: `${side === 'white' ? 'White' : 'Black'} · ${st.pocketed[side]}/${MEN_PER_SIDE}`,
      active: st.turn === i && st.winner === null,
      out: st.winner !== null && st.winner !== teamOf(i),
    };
  });

  const log =
    st.winner !== null
      ? st.winner === teamOf(0)
        ? 'You cleared the board'
        : `${teamName(st.winner)} cleared the board`
      : st.phase === 'moving'
        ? 'The board is live…'
        : mine
          ? st.queenOff && !st.queenCovered && st.queenTeam === teamOf(0)
            ? 'Cover the queen — pot one of yours'
            : 'Pull back from the striker and let go'
          : `${who(st.turn)} is on the strike`;

  const yours = mySide === 'white' ? 'WHITE' : 'BLACK';

  return (
    <GameShell>
      <GameHeader
        hud={`${yours} · ${st.pocketed[mySide]}/${MEN_PER_SIDE}`}
        extra={
          <HudChip tint={mine ? t.gold : st.queenOff && st.queenTeam === teamOf(0) ? t.pink : t.cyan}>
            {mine ? `${Math.max(0, secs)}s` : st.queenOff ? (st.queenCovered ? 'QUEEN SET' : 'QUEEN LOOSE') : `STRIKE ${st.shots}`}
          </HudChip>
        }
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      <SeatStrip seats={seatInfo} />

      <View
        style={{ flex: 1, minHeight: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
        // `layout` is this view's border box, which still holds the screen's
        // 20px rail on either side, so the measured box is trimmed by both
        // before the board is sized — otherwise the glass spills into the rail.
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width - 40);
          const h = Math.floor(e.nativeEvent.layout.height);
          setBox((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
        }}
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        {size > 60 && (
          <FadeIn>
            <Glass radius={R.card}>
              <View
                {...pan.panHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={
                  mine
                    ? `Carrom board. Your striker sits ${Math.round(aim.u * 100)} percent along the base line at ${Math.round(
                        aim.power * 100,
                      )} percent power. Drag along the line to move it, pull back from it to aim.`
                    : `Carrom board. ${menLeft(st, mySide)} of your men and ${menLeft(st, theirSide)} of theirs are still on the cloth.`
                }
                style={{ width: size, height: size }}
              >
                <BoardArt
                  size={size}
                  st={st}
                  mine={mine}
                  mySide={mySide}
                  aim={aim}
                  pull={pull}
                  striker={strikerSpot}
                />
              </View>
            </Glass>
          </FadeIn>
        )}
      </View>

      <View style={{ paddingTop: 8, paddingBottom: 6 }}>
        <TableLog text={log} />
      </View>

      <EmoteBar onEmote={setEmote} />

      <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 9 }}>
        <PowerRow
          power={aim.power}
          live={mine}
          hint={st.last ? describeShot(st.last, name) : 'Break the rosette'}
          onLeft={() => nudge(-0.07)}
          onRight={() => nudge(0.07)}
        />
        {mine ? (
          <Cta
            label={`Strike at ${Math.round(aim.power * 100)}%`}
            onPress={fire}
            icon={<Glyph d="M12 20V5M7 10l5-5 5 5" size={19} color="#fff" width={2.4} />}
          />
        ) : (
          <Glass radius={R.pill} elevated={false}>
            <View style={{ paddingVertical: 17, alignItems: 'center' }}>
              <H size={13} weight={700} color={t.dim2} numberOfLines={1}>
                {st.phase === 'moving' ? 'Discs are still running' : `${who(st.turn)} is lining one up`}
              </H>
            </View>
          </Glass>
        )}
      </View>

      {st.winner !== null && (
        <GameOverlay
          title={st.winner === teamOf(0) ? 'Board cleared' : 'Board lost'}
          blurb={
            st.winner === teamOf(0)
              ? `All nine of your men are down, the queen settled, after ${st.shots} strikes.`
              : `${teamName(st.winner)} got their nine down first. You left ${menLeft(st, mySide)} on the cloth.`
          }
          label="Board over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── the board ─────────────────────────────────────────────────────

/** Where the aim line meets the first cushion in front of the striker. */
function rayEnd(sx: number, sy: number, angle: number): { x: number; y: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const r = STRIKER_R;
  const tx = dx > 1e-6 ? (BOARD - r - sx) / dx : dx < -1e-6 ? (r - sx) / dx : Infinity;
  const ty = dy > 1e-6 ? (BOARD - r - sy) / dy : dy < -1e-6 ? (r - sy) / dy : Infinity;
  const k = Math.max(0, Math.min(tx, ty));
  return { x: sx + dx * k, y: sy + dy * k };
}

/** The first disc the aim line would run into, so the shot can be read before it is taken. */
function firstHit(pieces: Piece[], sx: number, sy: number, angle: number): Piece | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best: Piece | null = null;
  let bestT = Infinity;
  for (const p of pieces) {
    if (p.kind === 'striker') continue;
    const k = (p.x - sx) * dx + (p.y - sy) * dy;
    if (k <= 0) continue;
    const px = sx + dx * k;
    const py = sy + dy * k;
    const reach = STRIKER_R + radiusOf(p.kind);
    if (Math.hypot(px - p.x, py - p.y) > reach) continue;
    if (k < bestT) {
      bestT = k;
      best = p;
    }
  }
  return best;
}

/**
 * The board itself. Every number comes from the engine's constants, so a
 * pocket drawn here is the pocket the physics tests against.
 */
function BoardArt({
  size,
  st,
  mine,
  mySide,
  aim,
  pull,
  striker,
}: {
  size: number;
  st: CarromState;
  mine: boolean;
  mySide: Side;
  aim: { u: number; angle: number; power: number };
  pull: { x: number; y: number } | null;
  striker: { x: number; y: number };
}) {
  const t = useTheme();
  const S = (v: number) => v * size;

  // Two discs that read as white and black in either theme.
  const whiteFill = t.blurTint === 'dark' ? t.ink : t.bg2;
  const blackFill = t.blurTint === 'dark' ? t.bg : t.ink;
  const fillOf = (k: Piece['kind']) =>
    k === 'white' ? whiteFill : k === 'black' ? blackFill : k === 'queen' ? t.pink : t.cyan;

  const live = st.pieces.find((p) => p.kind === 'striker');
  const showAim = mine && !live;
  const end = showAim ? rayEnd(striker.x, striker.y, aim.angle) : null;
  const target = showAim ? firstHit(st.pieces, striker.x, striker.y, aim.angle) : null;

  return (
    <Svg width={size} height={size} pointerEvents="none">
      {/* the cloth */}
      <Rect x={0} y={0} width={size} height={size} rx={S(0.05)} fill={t.tile} />
      <Rect
        x={S(0.018)}
        y={S(0.018)}
        width={S(0.964)}
        height={S(0.964)}
        rx={S(0.035)}
        fill="none"
        stroke={t.line2}
        strokeWidth={1.4}
      />

      {/* the centre circle the rosette is racked in */}
      <Circle cx={S(0.5)} cy={S(0.5)} r={S(CENTRE_R)} fill="none" stroke={t.line2} strokeWidth={1.2} />
      <Circle cx={S(0.5)} cy={S(0.5)} r={S(MAN_R * 1.5)} fill="none" stroke={t.line} strokeWidth={1} />

      {/* the four base lines, the shooter's own picked out */}
      {Array.from({ length: st.seats }, (_, seat) => {
        const b = baselineOf(st.seats, seat);
        const own = seat === 0;
        const on = st.turn === seat;
        const half = BASE_HALF;
        const gap = 0.026;
        return (
          <G key={`base-${seat}`}>
            {[-1, 1].map((k) => (
              <SvgLine
                key={k}
                x1={S(b.cx + b.tx * -half + b.nx * gap * k)}
                y1={S(b.cy + b.ty * -half + b.ny * gap * k)}
                x2={S(b.cx + b.tx * half + b.nx * gap * k)}
                y2={S(b.cy + b.ty * half + b.ny * gap * k)}
                stroke={on ? t.acc : own ? t.line2 : t.line}
                strokeWidth={on ? 2 : 1.2}
              />
            ))}
            {[-1, 1].map((k) => (
              <Circle
                key={`dot${k}`}
                cx={S(b.cx + b.tx * half * k)}
                cy={S(b.cy + b.ty * half * k)}
                r={S(0.017)}
                fill="none"
                stroke={on ? t.acc : t.line}
                strokeWidth={1.4}
              />
            ))}
          </G>
        );
      })}

      {/* the pockets */}
      {POCKETS.map(([px, py], i) => (
        <G key={`pocket-${i}`}>
          <Circle cx={S(px)} cy={S(py)} r={S(POCKET_R)} fill={t.bg} opacity={0.92} />
          <Circle cx={S(px)} cy={S(py)} r={S(POCKET_R)} fill="none" stroke={t.line2} strokeWidth={1.4} />
        </G>
      ))}

      {/* the aim line, and a ring on whatever it runs into first */}
      {showAim && end && (
        <G>
          <SvgLine
            x1={S(striker.x)}
            y1={S(striker.y)}
            x2={S(end.x)}
            y2={S(end.y)}
            stroke={t.gold}
            strokeWidth={2}
            strokeDasharray="6 6"
            opacity={0.9}
          />
          {target && (
            <Circle
              cx={S(target.x)}
              cy={S(target.y)}
              r={S(radiusOf(target.kind) + 0.012)}
              fill="none"
              stroke={t.gold}
              strokeWidth={2}
            />
          )}
          {pull && (
            <G>
              <SvgLine
                x1={S(striker.x)}
                y1={S(striker.y)}
                x2={S(pull.x)}
                y2={S(pull.y)}
                stroke={t.pink}
                strokeWidth={2.4}
              />
              <Circle cx={S(pull.x)} cy={S(pull.y)} r={S(0.016)} fill={t.pink} />
            </G>
          )}
        </G>
      )}

      {/* the men, the queen, and the striker while it is running */}
      {st.pieces.map((p) => (
        <G key={p.id}>
          <Circle
            cx={S(p.x)}
            cy={S(p.y)}
            r={S(radiusOf(p.kind))}
            fill={fillOf(p.kind)}
            stroke={p.kind === mySide ? t.acc : t.line2}
            strokeWidth={p.kind === mySide ? 2 : 1.1}
          />
          <Circle cx={S(p.x)} cy={S(p.y)} r={S(radiusOf(p.kind) * 0.44)} fill="none" stroke={t.line} strokeWidth={1} />
        </G>
      ))}

      {/* the striker on the base line, waiting to be sent */}
      {!live && st.winner === null && (
        <G opacity={mine ? 1 : 0.45}>
          <Circle
            cx={S(striker.x)}
            cy={S(striker.y)}
            r={S(STRIKER_R)}
            fill={t.cyan}
            stroke={t.ink}
            strokeWidth={1.4}
          />
          <Circle cx={S(striker.x)} cy={S(striker.y)} r={S(STRIKER_R * 0.42)} fill="none" stroke={t.bg} strokeWidth={1.4} />
        </G>
      )}
    </Svg>
  );
}

// ── the controls ──────────────────────────────────────────────────

/** The pace bar, with a nudge either way for the striker's spot. */
function PowerRow({
  power,
  live,
  hint,
  onLeft,
  onRight,
}: {
  power: number;
  live: boolean;
  hint: string;
  onLeft: () => void;
  onRight: () => void;
}) {
  const t = useTheme();
  const arrow = (dir: 'left' | 'right', onPress: () => void) => (
    <Tap onPress={onPress} label={`Slide the striker ${dir}`} disabled={!live}>
      <Glass radius={11} elevated={false} style={{ width: 34, height: 34, opacity: live ? 1 : 0.4 }}>
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} size={15} width={2.4} />
        </View>
      </Glass>
    </Tap>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {arrow('left', onLeft)}
      <Glass radius={12} elevated={false} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 7, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Kicker color={t.dim2} tracking={1.4}>
              PACE
            </Kicker>
            <Chip bg={t.tile} border={t.line} color={live ? t.gold : t.dim2} style={{ paddingVertical: 2 }}>
              {`${Math.round(power * 100)}%`}
            </Chip>
            <P size={10.5} color={t.dim2} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
              {hint}
            </P>
          </View>
          <View accessible accessibilityLabel={`Pace ${Math.round(power * 100)} percent`}>
            <Bar pct={power} fill={live ? t.gold : t.dim2} height={4} />
          </View>
        </View>
      </Glass>
      {arrow('right', onRight)}
    </View>
  );
}

export const game: PlayableGame = {
  name: 'Carrom',
  rules: [
    'Nine white men, nine black and the red queen are racked in the centre. Your side owns one colour; partners sit opposite.',
    'Slide the striker along your base line, pull back from it to set the line and the pace, and let go. Pot one of your own and you strike again.',
    'Pocket the striker, or touch nothing, and a man goes back to the middle. The queen has to be covered by one of yours on the same strike or the next, and nobody can pot their last man until she is settled.',
  ],
  Screen,
};

export { Screen };
