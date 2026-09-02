import { CATEGORIES, GAMES, gameByName, type Category } from '../data/games';
import { FROST_TIER, TINTS, inboxId, INBOX } from '../data/progression';
import { MARKS, OTHERS, REPLIES, SEED, grad, type ThreadLine } from '../data/people';
import { botMove, emptyBoard, findWin, lowest, place, type Board, type Outcome } from '../game/connect4';
import {
  applyCard,
  bestColour,
  botChoice,
  deal,
  drawTo,
  isValid,
  nextSeat,
  UNAME,
  type CardColour,
  type UnoState,
} from '../game/uno';

export type Screen =
  | 'splash' | 'login' | 'onboard' | 'home' | 'all' | 'config' | 'lobby'
  | 'quiz' | 'c4' | 'uno' | 'results' | 'profile' | 'player' | 'board'
  | 'friends' | 'dm' | 'settings' | 'inbox' | 'add' | 'season' | 'shop'
  | 'spectate' | 'bracket';

/** Screens that keep the tab bar. Games and modals take the full frame. */
export const TABBED: Screen[] = ['home', 'all', 'config', 'board', 'friends', 'profile', 'inbox', 'season', 'shop', 'bracket'];

export type Theme = 'dark' | 'light';
export type Mode = 'friends' | 'mix' | 'bots';
export type Difficulty = 'Easy' | 'Normal' | 'Sharp';
export type QuizPhase = 'reveal' | 'q' | 'answer' | 'compare' | 'discuss' | 'vote' | 'out';

export interface Options {
  timer: number;
  odd: number;
  discuss: number;
  players: number;
  turn: number;
  lives: number;
  match: number;
  stack: boolean;
  safe: boolean;
  spin: boolean;
}

export type PrefKey = 'sound' | 'haptic' | 'push' | 'fast';

export interface ResultRow {
  n: string;
  d: string;
  s: string;
  win?: boolean;
  mark: string;
  /** The row's avatar fill, resolved when the result is built so your own row
      matches the tint you have equipped rather than an index into the palette. */
  grad: string;
}

export interface GameResult {
  game: string;
  head: string;
  kicker: string;
  xp: string;
  note: string;
  rows: ResultRow[];
}

export interface State {
  scr: Screen;
  theme: Theme;
  myName: string;
  mark: number;
  joinOpen: boolean;
  codeInput: string;
  cat: Category;
  game: string;
  libCat: 'All' | Category;
  mode: Mode;
  diff: Difficulty;
  opt: Options;
  pref: Record<PrefKey, boolean>;
  /** How many human seats have filled in the lobby so far. */
  joined: number;
  copied: boolean;
  toast: string | null;

  qp: QuizPhase;
  myAnswer: string;
  vote: string | null;
  secs: number;

  board: Board;
  turn: 'you' | 'bot';
  winner: Outcome;
  winLine: number[];
  lastIdx: number;

  result: GameResult | null;
  who: string | null;
  scope: 'Global' | 'Friends' | 'Region';

  dmWith: string | null;
  dmInput: string;
  threads: Record<string, ThreadLine[]>;
  typing: boolean;

  uno: UnoState | null;
  chatOpen: boolean;
  chatInput: string;
  emote: string | null;
  chat: [string, string][];

  rulesFor: string | null;
  offline: boolean;
  empty: boolean;

  addQuery: string;
  sent: string[];
  inboxGone: string[];
  claimed: number[];
  tint: number;
}

const initial = (): State => ({
  scr: 'splash',
  theme: 'dark',
  myName: 'Arjun',
  mark: 0,
  joinOpen: false,
  codeInput: '',
  cat: 'Deduction',
  game: 'Imposter Quiz',
  libCat: 'All',
  mode: 'mix',
  diff: 'Normal',
  opt: { timer: 60, odd: 1, discuss: 45, players: 4, turn: 20, lives: 3, match: 5, stack: true, safe: true, spin: false },
  pref: { sound: true, haptic: true, push: true, fast: false },
  joined: 1,
  copied: false,
  toast: null,

  qp: 'reveal',
  myAnswer: 'Apple',
  vote: null,
  secs: 45,

  board: emptyBoard(),
  turn: 'you',
  winner: null,
  winLine: [],
  lastIdx: -1,

  result: null,
  who: null,
  scope: 'Global',

  dmWith: null,
  dmInput: '',
  threads: JSON.parse(JSON.stringify(SEED)),
  typing: false,

  uno: null,
  chatOpen: false,
  chatInput: '',
  emote: null,
  chat: [
    ['Divya', 'nobody pick amber i beg'],
    ['Rohan', 'im picking amber'],
  ],

  rulesFor: null,
  offline: false,
  empty: false,

  addQuery: '',
  sent: [],
  inboxGone: [],
  claimed: [],
  tint: 0,
});

type Listener = () => void;
type Timer = ReturnType<typeof setTimeout>;

/**
 * The whole app's state, kept outside React so the prototype's timer-driven
 * flows (lobby joins, the discussion countdown, bot turns, DM replies) can read
 * and write current state without stale closures.
 */
class Store {
  state: State = initial();
  private listeners = new Set<Listener>();

  private tick: ReturnType<typeof setInterval> | null = null;
  private joins: Timer[] = [];
  private toastT: Timer | null = null;
  private replyT: Timer | null = null;
  private chatT: Timer | null = null;
  private emoteT: Timer | null = null;
  private unoT: Timer | null = null;
  private botT: Timer | null = null;
  private voteT: Timer | null = null;
  private copyT: Timer | null = null;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  setState(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** Clears every pending timer. Called when the app unmounts. */
  dispose() {
    if (this.tick) clearInterval(this.tick);
    this.joins.forEach(clearTimeout);
    [this.toastT, this.replyT, this.chatT, this.emoteT, this.unoT, this.botT, this.voteT, this.copyT].forEach(
      (t) => t && clearTimeout(t),
    );
  }

  // ── navigation & chrome ──────────────────────────────────────────

  go = (scr: Screen) => this.setState({ scr });

  toHome = () => this.setState({ scr: 'home', joinOpen: false });

  flash = (msg: string) => {
    this.setState({ toast: msg });
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.setState({ toast: null }), 1900);
  };

  setTheme = (theme: Theme) => this.setState({ theme });

  toggleOffline = () => this.setState({ offline: !this.state.offline });
  toggleEmpty = () => this.setState({ empty: !this.state.empty });

  openRules = () => this.setState({ rulesFor: this.state.game });
  closeRules = () => this.setState({ rulesFor: null });

  // ── identity ─────────────────────────────────────────────────────

  setName = (myName: string) => this.setState({ myName });
  pickMark = (mark: number) => this.setState({ mark });

  equipTint = (i: number) => {
    const t = TINTS[i];
    // Frost and Obsidian stay locked until the level-8 season tier is claimed.
    if (t.cost && i > 5 && !this.state.claimed.includes(FROST_TIER)) {
      this.flash(`${t.name} needs ${t.cost} XP`);
      return;
    }
    this.setState({ tint: i });
    this.flash(`${t.name} equipped`);
  };

  claimTier = (lvl: number, name: string, state: 'unlocked' | 'claim' | 'locked') => {
    if (state === 'claim') {
      this.setState({ claimed: this.state.claimed.concat([lvl]) });
      this.flash(`${name} unlocked`);
    } else if (state === 'locked') {
      this.flash(`Reach level ${lvl} first`);
    }
  };

  // ── setup ────────────────────────────────────────────────────────

  setCat = (cat: Category) => this.setState({ cat, game: GAMES.filter((g) => g.cat === cat)[0].name });
  setLibCat = (libCat: 'All' | Category) => this.setState({ libCat });
  setMode = (mode: Mode) => this.setState({ mode });
  setDiff = (diff: Difficulty) => this.setState({ diff });
  setScope = (scope: State['scope']) => this.setState({ scope });

  /** Selecting a game anywhere in the library drops you into setup with it chosen. */
  pickGame = (name: string) => {
    const g = gameByName(name);
    this.setState({ scr: 'config', cat: g.cat, game: g.name });
  };

  step = (key: keyof Options, delta: number, min: number, max: number) => {
    const v = this.state.opt[key] as number;
    this.setState({ opt: { ...this.state.opt, [key]: Math.min(max, Math.max(min, v + delta)) } });
  };

  toggleOpt = (key: keyof Options) =>
    this.setState({ opt: { ...this.state.opt, [key]: !this.state.opt[key] } });

  togglePref = (key: PrefKey) => this.setState({ pref: { ...this.state.pref, [key]: !this.state.pref[key] } });

  openJoin = () => this.setState({ joinOpen: true });
  setCode = (codeInput: string) => this.setState({ codeInput: codeInput.toUpperCase() });

  // ── lobby ────────────────────────────────────────────────────────

  /** Enter the lobby; friends trickle in over the next few seconds. */
  enterLobby = () => {
    this.setState({ scr: 'lobby', joined: 1, copied: false });
    this.joins.forEach(clearTimeout);
    this.joins = [
      setTimeout(() => this.setState({ joined: 2 }), 900),
      setTimeout(() => this.setState({ joined: 4 }), 2000),
      setTimeout(() => this.setState({ joined: 5 }), 3400),
    ];
  };

  /**
   * Where copied text goes. Injected at start-up so the store stays free of
   * platform imports and remains testable in plain node.
   */
  private writeClipboard: (text: string) => void = () => {};

  setClipboard(fn: (text: string) => void) {
    this.writeClipboard = fn;
  }

  copyCode = (code: string) => {
    this.writeClipboard(code);
    this.setState({ copied: true });
    if (this.copyT) clearTimeout(this.copyT);
    this.copyT = setTimeout(() => this.setState({ copied: false }), 1600);
  };

  startGame = () => {
    const { game, cat } = this.state;
    if (game === 'UNO') return this.unoStart();
    if (game === 'Connect 4' || cat !== 'Deduction') {
      this.setState({ scr: 'c4', board: emptyBoard(), turn: 'you', winner: null, winLine: [], lastIdx: -1 });
    } else {
      this.setState({ scr: 'quiz', qp: 'reveal', vote: null, secs: this.state.opt.discuss });
    }
  };

  // ── imposter quiz ────────────────────────────────────────────────

  setQp = (qp: QuizPhase) => {
    if (this.tick) clearInterval(this.tick);
    this.setState({ qp });
    if (qp !== 'discuss') return;

    this.setState({ secs: this.state.opt.discuss });
    this.tick = setInterval(() => {
      const s = this.state.secs - 1;
      if (s <= 0) {
        if (this.tick) clearInterval(this.tick);
        this.setState({ secs: 0, qp: 'vote' });
      } else {
        this.setState({ secs: s });
      }
    }, 1000);
  };

  castVote = (name: string) => {
    this.setState({ vote: name });
    if (this.voteT) clearTimeout(this.voteT);
    this.voteT = setTimeout(() => this.setState({ qp: 'out' }), 1100);
  };

  finishQuiz = () => {
    const me = this.state.myName;
    const myGrad = TINTS[this.state.tint].grad;
    this.setState({
      scr: 'results',
      result: {
        game: 'Imposter Quiz',
        head: 'You survived',
        kicker: 'You were the odd one out',
        xp: '+320',
        note: 'Karthik said tomato. The table voted him out 3–2.',
        rows: [
          { n: me, d: 'Odd one · survived', s: '+320', win: true, mark: MARKS[this.state.mark], grad: myGrad },
          { n: 'Divya', d: 'Voted Karthik', s: '+40', mark: '▲', grad: grad(1) },
          { n: 'Rohan', d: 'Voted Karthik', s: '+40', mark: '■', grad: grad(2) },
          { n: 'Meera', d: `Voted ${me}`, s: '+10', mark: '●', grad: grad(3) },
          { n: 'Karthik', d: 'Voted out', s: '+0', mark: '◐', grad: grad(4) },
        ],
      },
    });
  };

  setAnswer = (myAnswer: string) => this.setState({ myAnswer });

  // ── connect 4 ────────────────────────────────────────────────────

  drop = (col: number) => {
    const s = this.state;
    if (s.winner || s.turn !== 'you') return;
    const r = lowest(s.board, col);
    if (r < 0) return;

    const n = place(s.board, col, 'you')!;
    const idx = r * 7 + col;
    const w = findWin(n, 'you');
    if (w) return this.setState({ board: n, winner: 'you', winLine: w, lastIdx: idx });
    if (!n.includes(null)) return this.setState({ board: n, winner: 'draw', lastIdx: idx });

    this.setState({ board: n, turn: 'bot', lastIdx: idx });
    if (this.botT) clearTimeout(this.botT);
    this.botT = setTimeout(this.botTurn, 640);
  };

  private botTurn = () => {
    const b = this.state.board;
    const pick = botMove(b);
    if (pick === null) return this.setState({ winner: 'draw' });

    const idx = lowest(b, pick) * 7 + pick;
    const n = place(b, pick, 'bot')!;
    const w = findWin(n, 'bot');
    if (w) return this.setState({ board: n, winner: 'bot', winLine: w, lastIdx: idx });

    this.setState({ board: n, turn: 'you', lastIdx: idx, winner: n.includes(null) ? null : 'draw' });
  };

  resetC4 = () =>
    this.setState({ board: emptyBoard(), turn: 'you', winner: null, winLine: [], lastIdx: -1 });

  startC4 = () => this.setState({ scr: 'c4', ...this.c4Fresh() });

  private c4Fresh = () =>
    ({ board: emptyBoard(), turn: 'you' as const, winner: null, winLine: [], lastIdx: -1 });

  finishC4 = () => {
    const { winner: w, myName: me, mode, mark, tint } = this.state;
    const opp = mode === 'friends' ? 'Divya' : 'Bot';
    this.setState({
      scr: 'results',
      result: {
        game: 'Connect 4',
        head: w === 'you' ? 'You won' : w === 'bot' ? 'You lost' : 'A draw',
        kicker:
          w === 'you' ? 'Four in a row' : w === 'bot' ? `${opp} got there first` : 'Board full, nobody lined up',
        xp: w === 'you' ? '+180' : '+30',
        note: w === 'you' ? 'Rematch before they change their mind.' : 'Rematch and take it back.',
        rows: [
          { n: me, d: 'Violet', s: w === 'you' ? '+180' : '+30', win: w === 'you', mark: MARKS[mark], grad: TINTS[tint].grad },
          { n: opp, d: 'Cyan', s: w === 'bot' ? '+180' : '+30', win: w === 'bot', mark: opp === 'Bot' ? 'B' : '▲', grad: grad(2) },
        ],
      },
    });
  };

  // ── uno ──────────────────────────────────────────────────────────

  unoStart = () => this.setState({ scr: 'uno', game: 'UNO', cat: 'Board', uno: deal() });

  unoPlay = (idx: number, chosen?: CardColour) => {
    const prev = this.state.uno;
    if (!prev || prev.winner !== null || prev.turn !== 0) return;

    const u: UnoState = { ...prev };
    const card = u.hands[0][idx];
    if (!card) return;
    if (!isValid(card, u)) return this.flash('That card does not match');
    // A wild needs a colour before it can resolve — open the picker.
    if (card.c === 'W' && !chosen) return this.setState({ uno: { ...u, need: true, pending: idx } });

    u.hands = u.hands.map((h) => h.slice());
    u.hands[0].splice(idx, 1);
    u.need = false;
    u.pending = null;

    if (!u.hands[0].length) {
      u.winner = 0;
      u.log = 'You went out';
      return this.setState({ uno: u });
    }

    applyCard(u, card, chosen ?? null, 0);
    u.log = u.hands[0].length === 1 ? 'One card left — say it' : 'Waiting on the table';
    this.setState({ uno: u });
    this.queueBot();
  };

  unoDraw = () => {
    const prev = this.state.uno;
    if (!prev || prev.winner !== null || prev.turn !== 0) return;

    const u: UnoState = { ...prev, hands: prev.hands.map((h) => h.slice()) };
    drawTo(u, 0, 1);
    const card = u.hands[0][u.hands[0].length - 1];

    // A drawn card that happens to be playable goes straight down.
    if (isValid(card, u) && card.c !== 'W') {
      u.hands[0].pop();
      applyCard(u, card, null, 0);
      u.log = `Drew ${UNAME[card.c]} ${card.v} and played it`;
    } else {
      u.turn = nextSeat(u.dir, 0, false);
      u.log = 'You drew a card';
    }
    this.setState({ uno: u });
    this.queueBot();
  };

  private queueBot() {
    if (this.unoT) clearTimeout(this.unoT);
    this.unoT = setTimeout(this.unoBot, 800);
  }

  private unoBot = () => {
    const prev = this.state.uno;
    if (!prev || prev.winner !== null || prev.turn === 0) return;

    const u: UnoState = { ...prev, hands: prev.hands.map((h) => h.slice()) };
    const p = u.turn;
    const hand = u.hands[p];
    const name = OTHERS[p - 1].name;
    const i = botChoice(hand, u);

    if (i < 0) {
      drawTo(u, p, 1);
      u.turn = nextSeat(u.dir, p, false);
      u.log = `${name} drew a card`;
    } else {
      const card = hand.splice(i, 1)[0];
      if (!hand.length) {
        u.winner = p;
        u.log = `${name} went out`;
        return this.setState({ uno: u });
      }
      const chosen = bestColour(hand);
      applyCard(u, card, chosen, p);
      u.log = `${name} played ${card.c === 'W' ? `${card.v} → ${UNAME[chosen]}` : `${UNAME[card.c]} ${card.v}`}`;
    }

    if (u.turn === 0) u.log = 'Your move';
    this.setState({ uno: u });
    if (u.turn !== 0 && u.winner === null) this.queueBot();
  };

  finishUno = () => {
    const u = this.state.uno;
    if (!u) return;
    const { myName: me, mark, tint } = this.state;
    const won = u.winner === 0;
    this.setState({
      scr: 'results',
      result: {
        game: 'UNO',
        head: won ? 'You went out' : 'You lost',
        kicker: won ? 'Hand emptied first' : `${OTHERS[(u.winner || 1) - 1].name} emptied first`,
        xp: won ? '+240' : '+40',
        note: won ? 'Nobody stacked a +4 on you. Rare.' : 'The amber run got you.',
        rows: [0, 1, 2, 3]
          .map((p) => ({
            n: p === 0 ? me : OTHERS[p - 1].name,
            d: p === u.winner ? 'Went out' : `${u.hands[p].length} cards left`,
            s: p === u.winner ? '+240' : '+40',
            win: p === u.winner,
            mark: p === 0 ? MARKS[mark] : OTHERS[p - 1].mark,
            grad: p === 0 ? TINTS[tint].grad : grad(OTHERS[p - 1].gi),
          }))
          .sort((a, b) => (b.win ? 1 : 0) - (a.win ? 1 : 0)),
      },
    });
  };

  // ── table chat, emotes ───────────────────────────────────────────

  openChat = () => this.setState({ chatOpen: true });
  closeChat = () => this.setState({ chatOpen: false });
  setChatInput = (chatInput: string) => this.setState({ chatInput });

  sendChat = (text: string) => {
    if (!text) return;
    this.setState({ chat: this.state.chat.concat([['You', text]]), chatInput: '' });
    if (this.chatT) clearTimeout(this.chatT);
    this.chatT = setTimeout(() => {
      const who = OTHERS[Math.floor(Math.random() * OTHERS.length)].name;
      const line = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      this.setState({ chat: this.state.chat.concat([[who, line]]) });
    }, 1300);
  };

  react = (e: string) => {
    this.setState({ emote: e });
    if (this.emoteT) clearTimeout(this.emoteT);
    this.emoteT = setTimeout(() => this.setState({ emote: null }), 1500);
  };

  // ── friends & messages ───────────────────────────────────────────

  openDm = (name: string) => this.setState({ scr: 'dm', dmWith: name, dmInput: '' });
  openPlayer = (name: string) => this.setState({ scr: 'player', who: name });
  setDmInput = (dmInput: string) => this.setState({ dmInput });

  sendDm = (text: string) => {
    const who = this.state.dmWith;
    if (!who || !text) return;

    const threads = { ...this.state.threads, [who]: (this.state.threads[who] || []).concat([['me', text]]) };
    this.setState({ threads, dmInput: '', typing: true });

    if (this.replyT) clearTimeout(this.replyT);
    this.replyT = setTimeout(() => {
      const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      const next = { ...this.state.threads, [who]: (this.state.threads[who] || []).concat([['them', reply] as ThreadLine]) };
      this.setState({ threads: next, typing: false });
    }, 1400);
  };

  setAddQuery = (addQuery: string) => this.setState({ addQuery });

  sendRequest = (name: string) => {
    this.setState({ sent: this.state.sent.concat([name]) });
    this.flash(`Request sent to ${name}`);
  };

  // ── inbox ────────────────────────────────────────────────────────

  dismissInbox = (id: string) => this.setState({ inboxGone: this.state.inboxGone.concat([id]) });

  acceptInbox = (id: string, kind: 'inv' | 'req' | 'res', who: string) => {
    if (kind === 'inv') return this.enterLobby();
    this.dismissInbox(id);
    this.flash(kind === 'req' ? `${who} added` : `Opening ${who}'s record`);
  };

  get inboxCount() {
    return INBOX.filter((x) => !this.state.inboxGone.includes(inboxId(x))).length;
  }

  // ── sign out ─────────────────────────────────────────────────────

  signOut = () => {
    this.dispose();
    this.state = { ...initial(), theme: this.state.theme };
    this.listeners.forEach((fn) => fn());
  };
}

export const store = new Store();

/** Seat count for the lobby: deduction always seats five, board/arcade follow the stepper. */
export function seatCount(s: State): number {
  return s.cat === 'Deduction' ? 5 : Math.max(2, s.opt.players);
}

export { CATEGORIES };
