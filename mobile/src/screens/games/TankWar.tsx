import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View, type PanResponderInstance } from 'react-native';
import Svg, { Circle, Ellipse, G, Line as SvgLine, Polygon, Rect } from 'react-native-svg';
import { Glass, Glyph, Kicker, gradStops } from '../../components/base';
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
  ARENA_H,
  ARENA_W,
  DT,
  FIRE_MESSAGE,
  HP,
  MAX_SEATS,
  SHELL_R,
  TANK_R,
  aimAssist,
  canFire,
  fireProblem,
  lineFor,
  livesFor,
  lockedOn,
  botInput,
  seatsFor,
  startMatch,
  step,
  timeLeft,
  xpFor,
  type Blast,
  type Input,
  type Rect as WallRect,
  type Shell,
  type Tank,
  type TankWorld,
} from '../../game/tankWar';
import { useTheme } from '../../theme/theme';
import { radius as R } from '../../theme/tokens';

/**
 * 3D Tank War.
 *
 * The "3D" is a look, not a renderer: one flat SVG of the engine's own arena,
 * lit from the top left. Every block is drawn three times — a long shadow cast
 * away from the light, the side faces between the footprint and the lid, and a
 * lightened top face lifted up and left — and the whole scene is squashed a few
 * per cent vertically so the floor reads as a table you are leaning over rather
 * than a page you are looking down at. The tanks are built the same way, which
 * is why their gun barrels sweep across their own lit hulls.
 *
 * Nothing here decides anything. The screen samples the stick and the trigger
 * once a frame, asks `botInput` what every other tank wants, and then runs the
 * engine's `step` on a fixed-timestep accumulator until it has caught up with
 * real time — so the arena plays the same on a stuttering phone as on a smooth
 * one, and the same as it does in the engine's tests.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const deg = (rad: number) => (rad * 180) / Math.PI;

/** How much shorter the floor is drawn than it really is. The whole trick. */
const SQUASH = 0.94;
/** How far the lit faces are lifted, in arena widths. */
const LIFT = 0.016;
/** How far the long shadows fall, as a multiple of the lift. */
const SHADOW = 2.4;

const chunk = <T,>(items: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
};

const mmss = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The outline of a rectangle dragged to a second position — a shadow, or a wall's flank. */
function extrude(x: number, y: number, w: number, h: number, dx: number, dy: number): string {
  const pts: [number, number][] = [];
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ] as [number, number][]) {
    pts.push([px, py], [px + dx, py + dy]);
  }
  // Monotone chain: the eight corners of the two rectangles, hulled.
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: [number, number][]) => {
    const k: [number, number][] = [];
    for (const p of list) {
      while (k.length >= 2 && cross(k[k.length - 2], k[k.length - 1], p) <= 0) k.pop();
      k.push(p);
    }
    k.pop();
    return k;
  };
  const hull = build(pts).concat(build(pts.slice().reverse()));
  return hull.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
}

function Screen({ config, onFinish, onExit, onRules, onChat, chatCount, onToast }: GameScreenProps) {
  const t = useTheme();
  const bot = BOT[config.difficulty];

  // ── the table ─────────────────────────────────────────────────────
  // Arcade options: respawns each, and the lobby's minutes on the clock. The
  // engine reads those minutes as a round of the arena, so they are handed over
  // as the lobby set them rather than converted here and read a second time.
  const lives = livesFor(config.options.lives);

  // A lobby of one still needs somebody to shoot at.
  const filler: Player = { name: 'Rogue', mark: '◆', grad: `linear-gradient(160deg,${t.acc},${t.acc2})`, bot: true };
  const lobby: Player[] = [config.you, ...config.opponents].slice(0, MAX_SEATS);
  const table: Player[] = lobby.length >= 2 ? lobby : [lobby[0] ?? config.you, filler];
  const seats = seatsFor(table.length);
  const who = (i: number) => table[i]?.name ?? `Tank ${i + 1}`;
  const name = (i: number) => (i === 0 ? 'You' : who(i));

  // One seeded stream draws the arena and drives every bot, so a match replays.
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = makeRng(Math.floor(Math.random() * 0x7fffffff));

  const [w, setW] = useState<TankWorld>(() => startMatch(seats, lives, config.options.match, rng.current as Rng));
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [emote, setEmote] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const wRef = useRef(w);
  wRef.current = w;
  const stickRef = useRef(stick);
  stickRef.current = stick;
  const firing = useRef(false);
  const done = useRef(false);
  const seenFrags = useRef(0);

  const me = w.tanks[0];
  const locked = lockedOn(w, 0);
  const loaded = canFire(w, 0);

  // ── the simulation loop ───────────────────────────────────────────
  // Orders are sampled once a frame, exactly as a thumb produces them; the
  // engine is then stepped at its own fixed DT until it has caught up, so a
  // dropped frame costs nothing and a fast phone gains nothing.
  useEffect(() => {
    if (w.over) return;
    let live = wRef.current;
    let prev = 0;
    let acc = 0;
    let id = 0;
    const tick = (now: number) => {
      if (!prev) prev = now;
      acc += Math.min(now - prev, 120) / 1000;
      prev = now;

      const orders: Record<number, Input> = {
        0: { mx: stickRef.current.x, my: stickRef.current.y, aim: aimAssist(live, 0), fire: firing.current },
      };
      for (let i = 1; i < live.seats; i++) orders[i] = botInput(live, i, bot, rng.current as Rng);

      let guard = 0;
      while (acc >= DT && guard < 6) {
        live = step(live, DT, orders);
        acc -= DT;
        guard++;
        if (live.over) break;
      }
      if (guard >= 6) acc = 0;
      setW(live);
      if (live.over) return;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.over, bot]);

  // ── the kill feed, as toasts ──────────────────────────────────────
  // Keyed on the newest frag's id rather than the feed array, which the engine
  // hands back fresh on every one of sixty ticks a second.
  const lastFragId = w.feed.length ? w.feed[w.feed.length - 1].id : 0;
  useEffect(() => {
    const fresh = wRef.current.feed.filter((f) => f.id > seenFrags.current);
    if (!fresh.length) return;
    seenFrags.current = lastFragId;
    for (const f of fresh) {
      if (f.killer === 0 && f.victim !== 0) onToast(`You wrecked ${who(f.victim)}`);
      else if (f.victim === 0) onToast(f.killer === 0 ? 'You wrecked yourself' : `${who(f.killer)} wrecked you`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFragId]);

  useEffect(() => {
    if (!emote) return;
    const id = setTimeout(() => setEmote(null), 1500);
    return () => clearTimeout(id);
  }, [emote]);

  // ── the stick ─────────────────────────────────────────────────────
  const grab = useRef({ x: 0, y: 0 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          grab.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
          push(grab.current.x, grab.current.y);
        },
        onPanResponderMove: (_e, g) => push(grab.current.x + g.dx, grab.current.y + g.dy),
        onPanResponderRelease: () => setStick({ x: 0, y: 0 }),
        onPanResponderTerminate: () => setStick({ x: 0, y: 0 }),
      }),
    [],
  );

  /** A touch inside the pad becomes a unit vector, clipped to the circle. */
  function push(px: number, py: number) {
    const dx = px - PAD / 2;
    const dy = py - PAD / 2;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return setStick({ x: 0, y: 0 });
    const k = Math.min(1, len / THROW) / len;
    setStick({ x: dx * k, y: dy * k });
  }

  // ── the scoreboard ────────────────────────────────────────────────
  // Three ways a match ends, and the overlay, the log and the scoreboard all
  // say the same one: you took it, somebody else did, or the last two hulls went
  // together and nobody took it. A seat can also be top of the board on the
  // clock with its own lives spent, and "Arena taken" would read as a lie next
  // to the OUT chip in the header.
  const draw = w.winner === null;
  const won = w.winner === 0;
  const headline = draw ? 'Nobody standing' : won ? (me.out ? 'Top of the board' : 'Arena taken') : 'Knocked out';

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const champ = w.winner ?? 0;
    const mine = me;
    const lastOne = w.tanks.filter((x) => !x.out).length === 1;

    onFinish({
      game: '3D Tank War',
      head: headline,
      kicker: draw
        ? 'The last two hulls went together'
        : won
          ? lastOne
            ? 'Last tank rolling'
            : `Top of the board with ${Math.max(0, mine.kills)} kill${mine.kills === 1 ? '' : 's'}`
          : `${who(champ)} took the arena`,
      xp: `+${xpFor(w, 0)}`,
      note: won
        ? `${Math.max(0, mine.kills)} wrecked, ${mine.deaths} lost, ${mine.hits} of ${mine.shots} shells on target.`
        : `You wrecked ${Math.max(0, mine.kills)} and went down ${mine.deaths} time${mine.deaths === 1 ? '' : 's'}.`,
      rows: table
        .slice(0, w.seats)
        .map((p, i) => ({
          n: p.name,
          d: lineFor(w, i),
          s: `+${xpFor(w, i)}`,
          win: w.winner === i,
          mark: p.mark,
          grad: p.grad,
        }))
        .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
    });
  };

  // ── chrome ────────────────────────────────────────────────────────
  const seatInfo: SeatInfo[] = table.slice(1, w.seats).map((p, k) => {
    const q = w.tanks[k + 1];
    return {
      name: p.name,
      mark: p.mark,
      grad: p.grad,
      sub: q ? (q.out ? 'Knocked out' : `${Math.max(0, q.kills)} kills · ${q.lives} left`) : '—',
      active: !!q && q.alive && !q.out,
      out: !!q && q.out,
    };
  });

  // The kill feed only holds the line for a moment; after that it is your job again.
  const recent = w.feed[w.feed.length - 1];
  const last = recent && w.t - recent.at < 2.5 ? recent : null;
  const log = w.over
    ? draw
      ? 'The last two went together — nobody took it'
      : won
        ? me.out
          ? 'Out of lives, but top of the board'
          : 'The arena is yours'
        : `${who(w.winner ?? 0)} took the arena`
    : !me.alive
      ? me.out
        ? 'Out of lives — watching it burn'
        : `Rolling back on in ${Math.max(1, Math.ceil(me.respawn))}…`
      : last
        ? last.killer === last.victim
          ? `${name(last.victim)} wrecked ${last.victim === 0 ? 'yourself' : 'themselves'}`
          : `${name(last.killer)} wrecked ${last.victim === 0 ? 'you' : who(last.victim)}`
        : locked
          ? 'Locked on — pull the trigger'
          : 'Find one, then let it have it';

  // The arena is drawn as tall as the column leaves room for, then squashed.
  // The glass pane draws a hairline rim outside it, so leave that its room.
  const scale =
    box.w > 0 && box.h > 0 ? Math.min((box.w - 4) / ARENA_W, (box.h - 4) / (ARENA_H * SQUASH)) : 0;
  const artW = ARENA_W * scale;
  const artH = ARENA_H * scale * SQUASH;

  return (
    <GameShell>
      <GameHeader
        hud={`${mmss(timeLeft(w))} · ${Math.max(0, me.kills)} WRECKED`}
        extra={
          <HudChip tint={me.out ? t.pink : me.lives <= 1 ? t.gold : t.lime}>
            {me.out ? 'OUT' : `${me.lives} ${me.lives === 1 ? 'LIFE' : 'LIVES'}`}
          </HudChip>
        }
        onRules={onRules}
        onChat={onChat}
        chatCount={chatCount}
        onExit={onExit}
      />

      {chunk(seatInfo, 4).map((row, i) => (
        <SeatStrip key={i} seats={row} />
      ))}

      <View
        style={{ flex: 1, minHeight: 0, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
        onLayout={(e) => {
          const bw = Math.floor(e.nativeEvent.layout.width);
          const bh = Math.floor(e.nativeEvent.layout.height);
          setBox((cur) => (cur.w === bw && cur.h === bh ? cur : { w: bw, h: bh }));
        }}
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
          <FloatingEmote emote={emote} />
        </View>

        {scale > 40 && (
          <FadeIn>
            <Glass radius={R.card}>
              <View
                accessible
                accessibilityLabel={
                  me.out
                    ? 'Arena. Your tank is out of lives.'
                    : `Arena. ${me.hp} of ${HP} plates, ${me.lives} lives, ${Math.max(0, me.kills)} kills. ${
                        locked ? 'A target is locked.' : 'Nothing in your sights.'
                      }`
                }
                style={{ width: artW, height: artH }}
              >
                <Arena w={w} scale={scale} grads={table.map((p) => p.grad)} />
              </View>
            </Glass>
          </FadeIn>
        )}
      </View>

      <View style={{ paddingTop: 8, paddingBottom: 4 }}>
        <TableLog text={log} />
      </View>

      <EmoteBar onEmote={setEmote} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 22,
          paddingTop: 6,
        }}
      >
        <Stick pan={pan} vec={stick} live={me.alive && !w.over} />
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Plates hp={me.hp} alive={me.alive} />
          <FireButton
            locked={locked}
            loaded={loaded}
            live={me.alive && !w.over}
            onDown={() => {
              firing.current = true;
              // Holding the trigger keeps firing as fast as the gun reloads, so
              // only a reason the gun will never go off is worth saying out loud.
              const bad = fireProblem(w, 0);
              if (bad && bad !== 'reloading') onToast(me.out ? 'You are out of lives' : FIRE_MESSAGE[bad]);
            }}
            onUp={() => {
              firing.current = false;
            }}
          />
        </View>
      </View>

      {w.over && (
        <GameOverlay
          title={headline}
          blurb={
            draw
              ? `The last two hulls went together. ${Math.max(0, me.kills)} wrecked, ${me.deaths} lost.`
              : won
                ? `${Math.max(0, me.kills)} wrecked, ${me.deaths} lost, ${me.hits} of ${me.shots} shells on target.`
                : `${who(w.winner ?? 0)} took the arena. You wrecked ${Math.max(0, me.kills)} on the way down.`
          }
          label="Match over"
        >
          <OverlayActions secondary={{ label: 'Leave', onPress: onExit }} primary={{ label: 'Scoreboard', onPress: finish }} />
        </GameOverlay>
      )}
    </GameShell>
  );
}

// ── the arena ─────────────────────────────────────────────────────

/**
 * The whole floor in one SVG. Everything is drawn in pixels at `scale`, then
 * the group is squashed vertically — that single non-uniform transform is what
 * turns a plan view into a table you are leaning over.
 */
function Arena({ w, scale, grads }: { w: TankWorld; scale: number; grads: string[] }) {
  const t = useTheme();
  const W = ARENA_W * scale;
  const H = ARENA_H * scale;
  const lift = LIFT * scale;
  const drop = lift * SHADOW;

  // The floor and the blocks never move, so they are built once per layout
  // rather than sixty times a second along with everything that does.
  const backdrop = useMemo(() => {
    const grid: number[] = [];
    for (let g = 0.1; g < ARENA_H - 0.01; g += 0.1) grid.push(Math.round(g * 100) / 100);
    return (
      <G>
        <Rect x={0} y={0} width={W} height={H} fill={t.track} />
        {grid.map((g) => (
          <SvgLine key={`h${g}`} x1={0} y1={g * scale} x2={W} y2={g * scale} stroke={t.line} strokeWidth={0.5} />
        ))}
        {grid
          .filter((g) => g < ARENA_W - 0.01)
          .map((g) => (
            <SvgLine key={`v${g}`} x1={g * scale} y1={0} x2={g * scale} y2={H} stroke={t.line} strokeWidth={0.5} />
          ))}
        {/* every shadow before every lid, so none is cast over a neighbour */}
        {w.walls.map((r, i) => (
          <Polygon
            key={`s${i}`}
            points={extrude(r.x * scale, r.y * scale, r.w * scale, r.h * scale, drop, drop)}
            fill={t.shadowColor}
            opacity={0.26}
          />
        ))}
        {w.walls.map((r, i) => (
          <Block key={`b${i}`} r={r} scale={scale} lift={lift} />
        ))}
      </G>
    );
  }, [w.walls, scale, W, H, lift, drop, t]);

  return (
    <Svg width={W} height={H * SQUASH}>
      <G transform={`scale(1, ${SQUASH})`}>
        {backdrop}
        {w.tanks.map((p) =>
          p.alive ? (
            <Ellipse
              key={`ts${p.seat}`}
              cx={p.x * scale + drop * 0.55}
              cy={p.y * scale + drop * 0.55}
              rx={TANK_R * scale * 1.2}
              ry={TANK_R * scale}
              fill={t.shadowColor}
              opacity={0.3}
            />
          ) : null,
        )}
        {w.tanks.map((p) =>
          p.alive ? <TankArt key={p.seat} p={p} scale={scale} lift={lift} grad={grads[p.seat]} you={p.seat === 0} /> : null,
        )}
        {w.shells.map((s) => (
          <ShellArt key={s.id} s={s} scale={scale} lift={lift} />
        ))}
        {w.blasts.map((b) => (
          <BlastArt key={b.id} b={b} scale={scale} />
        ))}
      </G>
    </Svg>
  );
}

/** A block: its flanks between the floor and its lid, then the lit lid itself. */
function Block({ r, scale, lift }: { r: WallRect; scale: number; lift: number }) {
  const t = useTheme();
  const x = r.x * scale;
  const y = r.y * scale;
  const bw = r.w * scale;
  const bh = r.h * scale;
  return (
    <G>
      <Polygon points={extrude(x, y, bw, bh, -lift, -lift)} fill={t.g3} opacity={0.85} />
      <Rect x={x - lift} y={y - lift} width={bw} height={bh} rx={3} fill={t.g2} />
      <Rect
        x={x - lift}
        y={y - lift}
        width={bw}
        height={bh}
        rx={3}
        fill="none"
        stroke={t.rimLow}
        strokeWidth={1}
      />
    </G>
  );
}

/**
 * A tank: tracks and flanks on the floor, then the lit deck lifted toward the
 * light with the turret and barrel riding on top of it.
 */
function TankArt({ p, scale, lift, grad, you }: { p: Tank; scale: number; lift: number; grad: string; you: boolean }) {
  const t = useTheme();
  const [top, side] = gradStops(grad);
  const x = p.x * scale;
  const y = p.y * scale;
  const r = TANK_R * scale;
  const hull = deg(p.hull);
  const turret = deg(p.turret);
  const ghost = p.invuln > 0 ? 0.55 : 1;

  return (
    <G opacity={ghost}>
      {/* tracks and flanks, on the floor */}
      <G transform={`translate(${x}, ${y}) rotate(${hull})`}>
        <Rect x={-r} y={-r * 1.02} width={r * 2} height={r * 0.44} rx={r * 0.18} fill={t.g3} />
        <Rect x={-r} y={r * 0.58} width={r * 2} height={r * 0.44} rx={r * 0.18} fill={t.g3} />
        <Rect x={-r * 0.84} y={-r * 0.74} width={r * 1.68} height={r * 1.48} rx={r * 0.24} fill={side} />
      </G>

      {/* the lit deck */}
      <G transform={`translate(${x - lift}, ${y - lift}) rotate(${hull})`}>
        <Rect x={-r * 0.84} y={-r * 0.74} width={r * 1.68} height={r * 1.48} rx={r * 0.24} fill={top} />
        <Rect x={-r * 0.84} y={-r * 0.74} width={r * 1.68} height={r * 0.3} rx={r * 0.18} fill={t.rimLow} />
      </G>

      {/* the gun */}
      <G transform={`translate(${x - lift}, ${y - lift}) rotate(${turret})`}>
        <Rect x={r * 0.18} y={-r * 0.15} width={r * 1.5} height={r * 0.3} rx={r * 0.1} fill={t.g2} />
        <Circle cx={0} cy={0} r={r * 0.46} fill={top} stroke={t.rimLow} strokeWidth={1} />
      </G>

      {you && <Circle cx={x} cy={y} r={r * 1.55} fill="none" stroke={t.lime} strokeWidth={1.4} opacity={0.75} />}
    </G>
  );
}

/** A shell: a bright core with the ghost of its own flight behind it. */
function ShellArt({ s, scale, lift }: { s: Shell; scale: number; lift: number }) {
  const t = useTheme();
  const x = s.x * scale;
  const y = s.y * scale;
  const len = TANK_R * scale * 0.9;
  const sp = Math.hypot(s.vx, s.vy) || 1;
  return (
    <G>
      <Ellipse cx={x + lift} cy={y + lift} rx={SHELL_R * scale} ry={SHELL_R * scale * 0.8} fill={t.shadowColor} opacity={0.35} />
      <SvgLine
        x1={x - (s.vx / sp) * len}
        y1={y - (s.vy / sp) * len}
        x2={x}
        y2={y}
        stroke={s.bumps > 0 ? t.pink : t.gold}
        strokeWidth={SHELL_R * scale}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Circle cx={x - lift * 0.6} cy={y - lift * 0.6} r={SHELL_R * scale} fill={s.bumps > 0 ? t.pink : t.gold} />
    </G>
  );
}

/** A hit, or a wreck: one ring opening out and fading. */
function BlastArt({ b, scale }: { b: Blast; scale: number }) {
  const t = useTheme();
  const k = clamp(b.age / b.ttl, 0, 1);
  const r = (b.big ? TANK_R * 2.6 : TANK_R * 1.1) * scale * (0.35 + k);
  return (
    <G opacity={1 - k}>
      <Circle cx={b.x * scale} cy={b.y * scale} r={r} fill="none" stroke={b.big ? t.pink : t.gold} strokeWidth={b.big ? 3 : 2} />
      {b.big && <Circle cx={b.x * scale} cy={b.y * scale} r={r * 0.5} fill={t.pink} opacity={0.35} />}
    </G>
  );
}

// ── the controls ──────────────────────────────────────────────────

const PAD = 118;
/** How far from the centre counts as full stick. */
const THROW = 40;
const KNOB = 46;
const FIRE = 78;

/** The drive stick: drag anywhere in the pad, let go and the tank stops. */
function Stick({ pan, vec, live }: { pan: PanResponderInstance; vec: { x: number; y: number }; live: boolean }) {
  const t = useTheme();
  const mag = Math.hypot(vec.x, vec.y);
  const dir =
    mag < 0.12
      ? 'centred'
      : `${Math.abs(vec.y) > Math.abs(vec.x) ? (vec.y < 0 ? 'north' : 'south') : ''}${
          Math.abs(vec.x) > 0.35 ? (vec.x > 0 ? 'east' : 'west') : ''
        }` || 'centred';
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Drive stick, ${dir}. Drag to drive your tank.`}
      style={{ width: PAD, height: PAD, opacity: live ? 1 : 0.45 }}
    >
      <Glass radius={PAD / 2} style={{ width: PAD, height: PAD }}>
        <View style={{ width: PAD - 2, height: PAD - 2, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: THROW * 2,
              height: THROW * 2,
              borderRadius: THROW,
              borderWidth: 1,
              borderColor: t.line,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: mag > 0.12 ? t.acc : t.panel2,
              borderWidth: 1,
              borderColor: t.line2,
              transform: [{ translateX: vec.x * THROW }, { translateY: vec.y * THROW }],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Glyph
              d="M12 4v16M12 4l-4 4M12 4l4 4M12 20l-4-4M12 20l4-4"
              size={20}
              width={1.8}
              color={mag > 0.12 ? t.onAcc : t.dim2}
            />
          </View>
        </View>
      </Glass>
    </View>
  );
}

/** Your remaining plates, so the hull damage is readable without squinting. */
function Plates({ hp, alive }: { hp: number; alive: boolean }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={alive ? `${hp} of ${HP} plates left` : 'Wrecked'}
      style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
    >
      {Array.from({ length: HP }, (_, i) => (
        <View
          key={i}
          style={{
            width: 16,
            height: 6,
            borderRadius: 3,
            backgroundColor: !alive ? t.track : i < hp ? (hp === 1 ? t.pink : t.lime) : t.track,
          }}
        />
      ))}
    </View>
  );
}

/** The trigger. It lights when the gun is loaded and something is in the sights. */
function FireButton({
  locked,
  loaded,
  live,
  onDown,
  onUp,
}: {
  locked: boolean;
  loaded: boolean;
  live: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  const t = useTheme();
  const hot = locked && loaded && live;
  return (
    <Pressable
      onPressIn={onDown}
      onPressOut={onUp}
      accessibilityRole="button"
      accessibilityLabel={hot ? 'Fire, target locked' : loaded ? 'Fire' : 'Reloading'}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : live ? 1 : 0.45 })}
    >
      <View
        style={{
          width: FIRE,
          height: FIRE,
          borderRadius: FIRE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hot ? t.pink : loaded ? t.panel2 : t.track,
          borderWidth: 2,
          borderColor: hot ? t.pink : loaded ? t.line2 : t.line,
          shadowColor: hot ? t.pink : t.shadowColor,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: hot ? 18 : 10,
          shadowOpacity: hot ? 0.55 : 0.3,
          elevation: 6,
        }}
      >
        <Glyph
          d="M4 12h9M13 9l4 3-4 3M18 7v10"
          size={26}
          width={2.4}
          color={hot ? t.onPink : loaded ? t.ink : t.dim2}
          glow={hot ? t.onPink : undefined}
        />
        <Kicker color={hot ? t.onPink : t.dim2} tracking={1.4}>
          {loaded ? 'FIRE' : 'LOAD'}
        </Kicker>
      </View>
    </Pressable>
  );
}

export const game: PlayableGame = {
  name: '3D Tank War',
  Screen,
  rules: [
    'Drive with the stick on the left. Your gun locks itself onto the nearest tank you have a clear line to and leads the shot, so the trigger on the right is the only timing you own.',
    'Shells bounce once off the blocks and the arena walls, and a shell that has bounced will take your own plates off. Three hits wrecks a hull; a wreck costs one of your lives.',
    'Hulls shove each other, so you can body-block as well as shoot. Run a tank out of lives and it is out for good: last tank rolling takes the arena, or, if the clock beats you to it, whoever has wrecked the most. Wreck each other on the same tick and nobody takes it.',
  ],
};

export { Screen };
