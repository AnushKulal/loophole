import { CATEGORIES, GAMES, gameByName, type Category } from '../data/games';
import { FROST_TIER, TINTS, inboxId, INBOX } from '../data/progression';
import { MARKS, OTHERS, REPLIES, SEED, grad, type ThreadLine } from '../data/people';

import * as auth from '../auth/auth';
import { AuthFailure, type Account, type AuthError } from '../auth/auth';
import { toAuthError } from '../auth/errors';
import { applyAction, ctx as socialCtx, findPeople, isLive, loadSocial } from '../social/live';
import { CycleError, type Action, type Edge } from '../social/cycle';
import { claimSomeHandle, publishProfile, type Profile } from '../social/service';

/**
 * `unknown` is the launch state: a stored session may or may not be waiting, so
 * the splash holds until restore() answers. Without it the app flashes the
 * sign-in screen at everyone who is already signed in.
 */
export interface AuthState {
  status: 'unknown' | 'signedOut' | 'signedIn';
  user: Account | null;
  busy: boolean;
  error: AuthError | null;
  /** A confirmation, like "reset email sent" — not a failure. */
  notice: string | null;
}

export type Screen =
  | 'splash' | 'login' | 'onboard' | 'home' | 'all' | 'config' | 'lobby'
  | 'quiz' | 'game' | 'results' | 'profile' | 'player' | 'board'
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
  /** Board: seconds before a turn auto-skips. */
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

  result: GameResult | null;
  who: string | null;
  scope: 'Global' | 'Friends' | 'Region';

  dmWith: string | null;
  dmInput: string;
  threads: Record<string, ThreadLine[]>;
  typing: boolean;
chatOpen: boolean;
  chatInput: string;
  emote: string | null;
  chat: [string, string][];

  rulesFor: string | null;
  offline: boolean;
  empty: boolean;

  auth: AuthState;

  addQuery: string;
  sent: string[];
  inboxGone: string[];
  claimed: number[];
  tint: number;

  social: SocialState;
}

/**
 * The social features, when they are real.
 *
 * `live` is false on a device account or an unconfigured build, and every
 * screen falls back to the fixtures rather than pretending — see social/live.ts.
 * `busy` holds the uids with an action in flight so a row can disable its own
 * button without freezing the list.
 */
export interface SocialState {
  live: boolean;
  loading: boolean;
  error: string | null;
  edges: Edge[];
  people: Record<string, Profile>;
  searching: boolean;
  results: Profile[];
  busy: string[];
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

  result: null,
  who: null,
  scope: 'Global',

  dmWith: null,
  dmInput: '',
  threads: JSON.parse(JSON.stringify(SEED)),
  typing: false,

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

  auth: { status: 'unknown', user: null, busy: false, error: null, notice: null },

  addQuery: '',
  sent: [],
  inboxGone: [],
  claimed: [],
  tint: 0,

  social: {
    live: false,
    loading: false,
    error: null,
    edges: [],
    people: {},
    searching: false,
    results: [],
    busy: [],
  },
});

/** What each friend action says once it has landed. */
const DONE: Record<Action, string> = {
  request: 'Request sent',
  accept: 'Added',
  decline: 'Request declined',
  cancel: 'Request withdrawn',
  remove: 'Removed',
  block: 'Blocked',
  unblock: 'Unblocked',
};

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
    [this.toastT, this.replyT, this.chatT, this.emoteT, this.voteT, this.copyT].forEach(
      (t) => t && clearTimeout(t),
    );
  }

  // ── navigation & chrome ──────────────────────────────────────────

  /** Screens whose contents come off the network rather than out of state. */
  private static SOCIAL: Screen[] = ['friends', 'add', 'inbox'];

  go = (scr: Screen) => {
    this.setState({ scr });
    // Refreshed on arrival rather than on a timer: a friends list that polls is
    // one that drains a battery to report something that changes twice a day.
    if (Store.SOCIAL.includes(scr)) void this.refreshSocial();
  };

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

  /**
   * Every title except the Imposter Quiz flow is a self-contained module in the
   * game registry, so starting one is just switching to the host screen — the
   * game reads which title from `s.game`.
   */
  startGame = () => {
    const { game } = this.state;
    if (game === 'Imposter Quiz') {
      this.setState({ scr: 'quiz', qp: 'reveal', vote: null, secs: this.state.opt.discuss });
      return;
    }
    this.setState({ scr: 'game' });
  };

  /** A registry game finished. Hand its scoreboard to the results screen. */
  finishMatch = (result: GameResult) => this.setState({ scr: 'results', result });

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

  // ── the real friend system ───────────────────────────────────────
  //
  // Everything below is inert on a device account or an unconfigured build:
  // `isLive()` is false, the screens render fixtures, and none of these fire.

  private setSocial = (patch: Partial<SocialState>) =>
    this.setState({ social: { ...this.state.social, ...patch } });

  private myUid = () => auth.currentAccount()?.uid ?? '';

  /**
   * Load relationships and the profiles they point at.
   *
   * Called on entering Friends or the inbox rather than on a timer: a friends
   * list that polls is a friends list that drains a battery to tell you
   * something that changes twice a day.
   */
  refreshSocial = async () => {
    const live = isLive();
    this.setSocial({ live });
    if (!live) return;

    const c = await socialCtx();
    const me = this.myUid();
    if (!c || !me) return this.setSocial({ live: false });

    this.setSocial({ loading: true, error: null });
    try {
      const { edges, people } = await loadSocial(c, me);
      this.setSocial({ edges, people, loading: false });
    } catch {
      // Deliberately vague: the causes — offline, rules not deployed, index
      // missing — are all "try again" from where the player is sitting.
      this.setSocial({ loading: false, error: 'Could not reach your friends list.' });
    }
  };

  setAddQuery = (addQuery: string) => {
    this.setState({ addQuery });
    if (isLive()) void this.searchPeople(addQuery);
  };

  /**
   * Search the directory.
   *
   * The query is re-checked after the round trip and the results dropped if it
   * has moved on, so a slow reply for "an" cannot overwrite the results for
   * "anush" that the player is already looking at.
   */
  searchPeople = async (query: string) => {
    const c = await socialCtx();
    const me = this.myUid();
    if (!c || !me) return;

    if (query.trim().length < 2) return this.setSocial({ results: [], searching: false });

    this.setSocial({ searching: true });
    try {
      const results = await findPeople(c, me, query, this.state.social.edges);
      if (this.state.addQuery !== query) return;
      this.setSocial({ results, searching: false });
    } catch {
      if (this.state.addQuery !== query) return;
      this.setSocial({ results: [], searching: false, error: 'Search is unavailable right now.' });
    }
  };

  /**
   * Send, accept, decline, cancel, remove or block.
   *
   * The edge is replaced locally from what the server reported rather than from
   * what was asked for — they differ whenever the far side moved first, and the
   * server's answer is the one both phones agree on.
   */
  friendAction = async (them: string, action: Action) => {
    const c = await socialCtx();
    const me = this.myUid();
    if (!c || !me || !them) return;

    this.setSocial({ busy: this.state.social.busy.concat([them]) });
    try {
      await applyAction(c, me, them, action, Date.now());
      await this.refreshSocial();
      this.flash(DONE[action]);
    } catch (e) {
      // A refused transition is worth reading — "that account is not
      // available" is the whole of what a blocked player should learn.
      this.flash(e instanceof CycleError ? e.message : 'That did not go through.');
    } finally {
      this.setSocial({ busy: this.state.social.busy.filter((u) => u !== them) });
    }
  };

  /** The fixture path, kept so an unconfigured build still demonstrates itself. */
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
    const { live, edges } = this.state.social;
    if (!live) return INBOX.filter((x) => !this.state.inboxGone.includes(inboxId(x))).length;
    const me = this.myUid();
    return edges.filter((e) => e.state === 'pending' && e.by !== me).length;
  }

  // ── accounts ─────────────────────────────────────────────────────

  private setAuth = (patch: Partial<AuthState>) =>
    this.setState({ auth: { ...this.state.auth, ...patch } });

  /** Clears whatever the last attempt left on screen. */
  clearAuthMessage = () => this.setAuth({ error: null, notice: null });

  /**
   * Runs one auth call with the busy flag and error handling every one of them
   * needs, so the four actions below stay three lines each.
   */
  private attempt = async (run: () => Promise<Account | null>, onDone?: () => void) => {
    if (this.state.auth.busy) return;
    this.setAuth({ busy: true, error: null, notice: null });
    try {
      const user = await run();
      if (user) {
        this.setAuth({ status: 'signedIn', user, busy: false });
        this.setState({ myName: user.name || user.email.split('@')[0] });
        void this.publishMe(user);
      } else {
        this.setAuth({ busy: false });
      }
      onDone?.();
    } catch (e) {
      this.setAuth({ busy: false, error: e instanceof AuthFailure ? e.detail : toAuthError(undefined) });
    }
  };

  /**
   * Put yourself in the directory, and say you are here.
   *
   * Without this nobody can find you: search reads `users`, and an account that
   * has never published has no row there. It runs on every sign-in and every
   * restored session, which doubles as the presence heartbeat — the write is
   * one document and the alternative is a separate timer.
   *
   * Failures are swallowed on purpose. Not being searchable is worth a retry
   * next launch; it is not worth an error over the home screen of someone who
   * only wanted to play against bots.
   */
  private publishMe = async (user: Account) => {
    if (!isLive()) return;
    const c = await socialCtx();
    if (!c) return;
    try {
      const handle = await claimSomeHandle(c, user.uid, user.email || user.name || user.uid);
      await publishProfile(c, {
        uid: user.uid,
        handle,
        name: user.name || user.email.split('@')[0],
        mark: MARKS[this.state.mark] ?? MARKS[0],
        gi: this.state.tint,
        level: 24,
        lastSeen: Date.now(),
      });
      this.setSocial({ live: true });
    } catch {
      // Next launch tries again.
    }
  };

  /**
   * True when someone tapped through the splash before the session check
   * finished. Kept off State because nothing renders it — it only decides
   * where restoreSession lands.
   */
  private enterWaiting = false;

  /** Called once on launch: adopt a stored session, or fall through to login. */
  restoreSession = async () => {
    const user = await auth.restore();
    if (user) {
      this.setAuth({ status: 'signedIn', user });
      this.setState({ myName: user.name || user.email.split('@')[0] });
      void this.publishMe(user);
    } else {
      this.setAuth({ status: 'signedOut' });
    }
    if (this.enterWaiting) {
      this.enterWaiting = false;
      this.setState({ scr: user ? 'home' : 'login' });
    }
  };

  /**
   * The splash's only action. Signed-in players skip the sign-in screen
   * entirely; if the session check is still in flight, this waits for it rather
   * than showing a sign-in form that is about to be replaced.
   */
  enter = () => {
    const { status } = this.state.auth;
    if (status === 'unknown') {
      this.enterWaiting = true;
      return;
    }
    this.setState({ scr: status === 'signedIn' ? 'home' : 'login' });
  };

  /**
   * The way out of a build with no Firebase project behind it. Without this the
   * sign-in screen is a dead end and the whole app is unreachable — every game
   * here runs locally and needs no account at all.
   */
  playAnyway = () => this.setState({ scr: 'onboard' });

  signIn = (email: string, password: string) =>
    this.attempt(() => auth.signIn(email, password), () => this.setState({ scr: 'home' }));

  /** A new account has nothing set up yet, so it goes through onboarding. */
  signUp = (email: string, password: string, name: string) =>
    this.attempt(() => auth.signUp(email, password, name), () => this.setState({ scr: 'onboard' }));

  /**
   * Firebase mails a link; a device account has no mail to send to, so the
   * screen supplies the new password and this changes it in place. The notice
   * says which of the two actually happened.
   */
  resetPassword = (email: string, nextPassword?: string) =>
    this.attempt(async () => {
      await auth.sendPasswordReset(email, nextPassword);
      this.setAuth({
        notice:
          auth.backend() === 'device'
            ? 'Password changed. Sign in with the new one.'
            : `Password reset sent to ${email.trim()}. Check your inbox.`,
      });
      return null;
    });

  // ── sign out ─────────────────────────────────────────────────────

  signOut = () => {
    void auth.signOut();
    this.dispose();
    this.state = { ...initial(), theme: this.state.theme, scr: 'login', auth: { status: 'signedOut', user: null, busy: false, error: null, notice: null } };
    this.listeners.forEach((fn) => fn());
  };
}

export const store = new Store();

/** Seat count for the lobby: deduction always seats five, board/arcade follow the stepper. */
export function seatCount(s: State): number {
  return s.cat === 'Deduction' ? 5 : Math.max(2, s.opt.players);
}

export { CATEGORIES };
