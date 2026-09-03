/**
 * Chess — the whole game, not a subset.
 *
 * Legal move generation covers castling (including the rule that the king may
 * neither start, pass through, nor land on an attacked square), en passant and
 * promotion. A position is terminal on checkmate, stalemate, insufficient
 * material or the fifty-move rule, and either side may resign.
 *
 * The opponent is a negamax search with alpha-beta pruning over material values
 * plus piece-square tables, extended by a capture-only quiescence search so it
 * does not hang a piece on the horizon. It searches `BotProfile.depth` plies,
 * widens its choice by `skill`, and throws a `blunder` fraction of its moves
 * away on purpose.
 *
 * Pure data and pure transitions — no React, no clock, no `Math.random`. Every
 * decision that needs chance takes an `Rng`, so a whole game replays from a
 * seed. The search is bounded by a node budget rather than a wall clock, which
 * keeps it both quick and reproducible.
 */

import { pick, shuffle, type BotProfile, type Rng } from './contract';

// ── the pieces ────────────────────────────────────────────────────

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  readonly c: Color;
  readonly t: PieceType;
}

export const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
/** What a pawn may become. Never a king, never another pawn. */
export const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n'];

const make = (c: Color, t: PieceType): Piece => Object.freeze({ c, t });
const TABLE: Record<Color, Record<PieceType, Piece>> = {
  w: { p: make('w', 'p'), n: make('w', 'n'), b: make('w', 'b'), r: make('w', 'r'), q: make('w', 'q'), k: make('w', 'k') },
  b: { p: make('b', 'p'), n: make('b', 'n'), b: make('b', 'b'), r: make('b', 'r'), q: make('b', 'q'), k: make('b', 'k') },
};

/** The interned piece for a colour and type — there are only twelve of them. */
export const piece = (c: Color, t: PieceType): Piece => TABLE[c][t];
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Centipawns. The king's value only ever matters for move ordering. */
export const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// ── the board ─────────────────────────────────────────────────────

/**
 * Squares are 0–63 with a8 = 0 and h1 = 63, so the array is already in reading
 * order and the screen can render it straight out with no transform.
 */
export type Board = (Piece | null)[];

export const FILES = 'abcdefgh';
export const rowOf = (sq: number) => sq >> 3;
export const colOf = (sq: number) => sq & 7;
export const sqAt = (row: number, col: number) => row * 8 + col;
export const inside = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8;

/** "e4". */
export const nameOf = (sq: number) => `${FILES[colOf(sq)]}${8 - rowOf(sq)}`;

/** "e4" back to 28, or -1 if it is not a square. */
export function squareOf(name: string): number {
  const f = FILES.indexOf(name[0]);
  const r = Number(name[1]);
  if (f < 0 || !Number.isInteger(r) || r < 1 || r > 8) return -1;
  return sqAt(8 - r, f);
}

/** a8 is light, and the colours alternate from there. */
export const isLightSquare = (sq: number) => (rowOf(sq) + colOf(sq)) % 2 === 0;

// ── state ─────────────────────────────────────────────────────────

export interface Castling {
  /** White may still castle kingside. */
  wk: boolean;
  wq: boolean;
  bk: boolean;
  bq: boolean;
}

export interface Move {
  from: number;
  to: number;
  /** The moving piece. */
  t: PieceType;
  /** What it takes, if anything. For en passant this is a pawn. */
  cap?: PieceType;
  /** What a pawn becomes on the last rank. */
  promo?: PieceType;
  /** This capture is en passant — the taken pawn is not on `to`. */
  ep?: boolean;
  /** A castle, and which side of the board. */
  castle?: 'k' | 'q';
  /** A pawn's two-square opening, which opens an en-passant window. */
  dbl?: boolean;
}

export interface ChessState {
  board: Board;
  turn: Color;
  castling: Castling;
  /** The square a pawn could be captured on by en passant, or null. */
  ep: number | null;
  /** Half-moves since the last capture or pawn move — the fifty-move clock. */
  half: number;
  /** Starts at 1, increments after Black moves. */
  full: number;
  /** Algebraic notation of every move played, in order. */
  moves: string[];
  /** The move just played, so the screen can light both of its squares. */
  last: Move | null;
  /** Whoever resigned, if anybody did. */
  resigned: Color | null;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The opening position. */
export const newGame = (): ChessState => fromFen(START_FEN);

// ── FEN ───────────────────────────────────────────────────────────

const FEN_CHAR: Record<string, PieceType> = { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k' };

/** Reads a position. Tests build their own boards with this. */
export function fromFen(fen: string): ChessState {
  const [place, turn = 'w', rights = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const board: Board = new Array(64).fill(null);
  let sq = 0;
  for (const ch of place) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') {
      sq += Number(ch);
      continue;
    }
    const t = FEN_CHAR[ch.toLowerCase()];
    if (!t) throw new Error(`Bad FEN piece "${ch}"`);
    if (sq > 63) throw new Error('FEN describes more than 64 squares');
    board[sq++] = piece(ch === ch.toUpperCase() ? 'w' : 'b', t);
  }
  if (sq !== 64) throw new Error('FEN does not describe 64 squares');
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wk: rights.includes('K'),
      wq: rights.includes('Q'),
      bk: rights.includes('k'),
      bq: rights.includes('q'),
    },
    ep: ep === '-' ? null : squareOf(ep),
    half: Number(half) || 0,
    full: Number(full) || 1,
    moves: [],
    last: null,
    resigned: null,
  };
}

/** Writes the position back out, so a test can compare two states by string. */
export function toFen(s: ChessState): string {
  let place = '';
  for (let row = 0; row < 8; row++) {
    let gap = 0;
    for (let col = 0; col < 8; col++) {
      const p = s.board[sqAt(row, col)];
      if (!p) {
        gap++;
        continue;
      }
      if (gap) place += gap;
      gap = 0;
      place += p.c === 'w' ? p.t.toUpperCase() : p.t;
    }
    if (gap) place += gap;
    if (row < 7) place += '/';
  }
  const r = `${s.castling.wk ? 'K' : ''}${s.castling.wq ? 'Q' : ''}${s.castling.bk ? 'k' : ''}${s.castling.bq ? 'q' : ''}`;
  return `${place} ${s.turn} ${r || '-'} ${s.ep === null ? '-' : nameOf(s.ep)} ${s.half} ${s.full}`;
}

// ── attacks ───────────────────────────────────────────────────────

const KNIGHT_HOPS: [number, number][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const DIAGONALS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHOGONALS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const KING_STEPS: [number, number][] = [...DIAGONALS, ...ORTHOGONALS];

/** White pawns walk toward rank 8, which is toward row 0. */
const forwardOf = (c: Color) => (c === 'w' ? -1 : 1);
const homeRowOf = (c: Color) => (c === 'w' ? 6 : 1);
const lastRowOf = (c: Color) => (c === 'w' ? 0 : 7);

/** Where the given colour's king stands, or -1 if it has been removed. */
export function kingSquare(board: Board, c: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.c === c && p.t === 'k') return i;
  }
  return -1;
}

/** Whether `by` attacks `sq` — the one primitive every legality rule leans on. */
export function attacked(board: Board, sq: number, by: Color): boolean {
  if (sq < 0) return false;
  const row = rowOf(sq);
  const col = colOf(sq);

  // A pawn of `by` sits one rank *behind* the square, diagonally.
  const back = -forwardOf(by);
  for (const dc of [-1, 1]) {
    const r = row + back;
    const c = col + dc;
    if (!inside(r, c)) continue;
    const p = board[sqAt(r, c)];
    if (p && p.c === by && p.t === 'p') return true;
  }

  for (const [dr, dc] of KNIGHT_HOPS) {
    const r = row + dr;
    const c = col + dc;
    if (!inside(r, c)) continue;
    const p = board[sqAt(r, c)];
    if (p && p.c === by && p.t === 'n') return true;
  }

  for (const [dr, dc] of KING_STEPS) {
    const r = row + dr;
    const c = col + dc;
    if (!inside(r, c)) continue;
    const p = board[sqAt(r, c)];
    if (p && p.c === by && p.t === 'k') return true;
  }

  for (const [dr, dc] of DIAGONALS) {
    for (let k = 1; ; k++) {
      const r = row + dr * k;
      const c = col + dc * k;
      if (!inside(r, c)) break;
      const p = board[sqAt(r, c)];
      if (!p) continue;
      if (p.c === by && (p.t === 'b' || p.t === 'q')) return true;
      break;
    }
  }

  for (const [dr, dc] of ORTHOGONALS) {
    for (let k = 1; ; k++) {
      const r = row + dr * k;
      const c = col + dc * k;
      if (!inside(r, c)) break;
      const p = board[sqAt(r, c)];
      if (!p) continue;
      if (p.c === by && (p.t === 'r' || p.t === 'q')) return true;
      break;
    }
  }

  return false;
}

/** Is `c` in check right now? */
export const inCheck = (s: ChessState, c: Color = s.turn) => attacked(s.board, kingSquare(s.board, c), other(c));

// ── move generation ───────────────────────────────────────────────

/**
 * Everything the pieces could do, before asking whether it leaves the king en
 * prise. Castles are the exception: the empty-squares and through-check rules
 * are checked here, because they are not about the king's final square.
 */
export function pseudoMoves(s: ChessState, c: Color = s.turn): Move[] {
  const out: Move[] = [];
  const board = s.board;

  const slide = (from: number, t: PieceType, dirs: [number, number][]) => {
    const row = rowOf(from);
    const col = colOf(from);
    for (const [dr, dc] of dirs) {
      for (let k = 1; ; k++) {
        const r = row + dr * k;
        const cc = col + dc * k;
        if (!inside(r, cc)) break;
        const to = sqAt(r, cc);
        const p = board[to];
        if (!p) {
          out.push({ from, to, t });
          continue;
        }
        if (p.c !== c) out.push({ from, to, t, cap: p.t });
        break;
      }
    }
  };

  const step = (from: number, t: PieceType, steps: [number, number][]) => {
    const row = rowOf(from);
    const col = colOf(from);
    for (const [dr, dc] of steps) {
      const r = row + dr;
      const cc = col + dc;
      if (!inside(r, cc)) continue;
      const to = sqAt(r, cc);
      const p = board[to];
      if (!p) out.push({ from, to, t });
      else if (p.c !== c) out.push({ from, to, t, cap: p.t });
    }
  };

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.c !== c) continue;

    if (p.t === 'p') {
      const dir = forwardOf(c);
      const row = rowOf(from);
      const col = colOf(from);
      const last = lastRowOf(c);

      const one = sqAt(row + dir, col);
      if (inside(row + dir, col) && !board[one]) {
        if (row + dir === last) for (const promo of PROMOTIONS) out.push({ from, to: one, t: 'p', promo });
        else out.push({ from, to: one, t: 'p' });

        const two = sqAt(row + dir * 2, col);
        if (row === homeRowOf(c) && !board[two]) out.push({ from, to: two, t: 'p', dbl: true });
      }

      for (const dc of [-1, 1]) {
        const r = row + dir;
        const cc = col + dc;
        if (!inside(r, cc)) continue;
        const to = sqAt(r, cc);
        const target = board[to];
        if (target && target.c !== c) {
          if (r === last) for (const promo of PROMOTIONS) out.push({ from, to, t: 'p', cap: target.t, promo });
          else out.push({ from, to, t: 'p', cap: target.t });
        } else if (!target && s.ep !== null && to === s.ep) {
          out.push({ from, to, t: 'p', cap: 'p', ep: true });
        }
      }
      continue;
    }

    if (p.t === 'n') step(from, 'n', KNIGHT_HOPS);
    else if (p.t === 'b') slide(from, 'b', DIAGONALS);
    else if (p.t === 'r') slide(from, 'r', ORTHOGONALS);
    else if (p.t === 'q') slide(from, 'q', KING_STEPS);
    else if (p.t === 'k') {
      step(from, 'k', KING_STEPS);
      for (const m of castles(s, c)) out.push(m);
    }
  }

  return out;
}

/**
 * Castling. The right must survive, the squares between king and rook must be
 * empty, and the king may not be in check, cross an attacked square, or land on
 * one. The last of those is left to the ordinary legality filter; the first two
 * squares are checked here because nothing else would look at them.
 */
function castles(s: ChessState, c: Color): Move[] {
  const out: Move[] = [];
  const row = c === 'w' ? 7 : 0;
  const king = sqAt(row, 4);
  const p = s.board[king];
  if (!p || p.t !== 'k' || p.c !== c) return out;

  const rights = c === 'w' ? { k: s.castling.wk, q: s.castling.wq } : { k: s.castling.bk, q: s.castling.bq };
  const enemy = other(c);
  if (attacked(s.board, king, enemy)) return out;

  if (rights.k) {
    const rook = s.board[sqAt(row, 7)];
    const empty = !s.board[sqAt(row, 5)] && !s.board[sqAt(row, 6)];
    if (rook && rook.t === 'r' && rook.c === c && empty && !attacked(s.board, sqAt(row, 5), enemy)) {
      out.push({ from: king, to: sqAt(row, 6), t: 'k', castle: 'k' });
    }
  }
  if (rights.q) {
    const rook = s.board[sqAt(row, 0)];
    const empty = !s.board[sqAt(row, 1)] && !s.board[sqAt(row, 2)] && !s.board[sqAt(row, 3)];
    if (rook && rook.t === 'r' && rook.c === c && empty && !attacked(s.board, sqAt(row, 3), enemy)) {
      out.push({ from: king, to: sqAt(row, 2), t: 'k', castle: 'q' });
    }
  }
  return out;
}

/** The board after a move, with nothing else about the position touched. */
function moveBoard(board: Board, m: Move, c: Color): Board {
  const next = board.slice();
  next[m.from] = null;
  next[m.to] = piece(c, m.promo ?? m.t);
  if (m.ep) next[sqAt(rowOf(m.from), colOf(m.to))] = null;
  if (m.castle) {
    const row = rowOf(m.from);
    if (m.castle === 'k') {
      next[sqAt(row, 7)] = null;
      next[sqAt(row, 5)] = piece(c, 'r');
    } else {
      next[sqAt(row, 0)] = null;
      next[sqAt(row, 3)] = piece(c, 'r');
    }
  }
  return next;
}

/**
 * Every move the side to move may legally make.
 *
 * The filter plays each pseudo-legal move onto the board and takes it straight
 * back off rather than copying sixty-four squares thirty-five times, because
 * this runs at every node of the search. The board is left exactly as it was
 * found, so the function is still pure from the outside.
 */
export function legalMoves(s: ChessState, c: Color = s.turn): Move[] {
  return keepLegal(s, c, pseudoMoves(s, c));
}

/**
 * Captures and promotions only — everything the quiescence search looks at.
 * Filtering before the king-safety test rather than after is most of what
 * keeps a decision inside its node budget.
 */
export function legalCaptures(s: ChessState, c: Color = s.turn): Move[] {
  return keepLegal(
    s,
    c,
    pseudoMoves(s, c).filter((m) => m.cap || m.promo),
  );
}

function keepLegal(s: ChessState, c: Color, pseudo: Move[]): Move[] {
  const out: Move[] = [];
  const board = s.board;
  const enemy = other(c);
  const home = kingSquare(board, c);

  for (const m of pseudo) {
    const mover = board[m.from];
    const taken = board[m.to];
    const epSq = m.ep ? sqAt(rowOf(m.from), colOf(m.to)) : -1;
    const epPawn = epSq >= 0 ? board[epSq] : null;
    const row = rowOf(m.from);
    const rookFrom = m.castle ? sqAt(row, m.castle === 'k' ? 7 : 0) : -1;
    const rookTo = m.castle ? sqAt(row, m.castle === 'k' ? 5 : 3) : -1;

    board[m.from] = null;
    board[m.to] = piece(c, m.promo ?? m.t);
    if (epSq >= 0) board[epSq] = null;
    if (rookFrom >= 0) {
      board[rookFrom] = null;
      board[rookTo] = piece(c, 'r');
    }

    const safe = !attacked(board, m.t === 'k' ? m.to : home, enemy);

    board[m.from] = mover;
    board[m.to] = taken;
    if (epSq >= 0) board[epSq] = epPawn;
    if (rookFrom >= 0) {
      board[rookFrom] = piece(c, 'r');
      board[rookTo] = null;
    }

    if (safe) out.push(m);
  }
  return out;
}

/** The legal moves that start on one square — what the screen highlights. */
export const movesFrom = (s: ChessState, from: number): Move[] => legalMoves(s).filter((m) => m.from === from);

/**
 * The legal move matching a from/to pair, or null. A promotion needs `promo`
 * to say which piece; without it the queen is assumed, since that is what the
 * picker defaults to.
 */
export function findMove(s: ChessState, from: number, to: number, promo?: PieceType): Move | null {
  const hits = legalMoves(s).filter((m) => m.from === from && m.to === to);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  return hits.find((m) => m.promo === (promo ?? 'q')) ?? hits[0];
}

/** Whether this exact from/to (and promotion) is legal in this position. */
export const isLegal = (s: ChessState, from: number, to: number, promo?: PieceType) =>
  findMove(s, from, to, promo) !== null;

/** Whether a move from this square would have to choose a promotion piece. */
export const needsPromotion = (s: ChessState, from: number, to: number) => {
  const p = s.board[from];
  return !!p && p.t === 'p' && rowOf(to) === lastRowOf(p.c) && isLegal(s, from, to);
};

// ── making a move ─────────────────────────────────────────────────

/** The position after a move, with no notation written. The search uses this. */
function step(s: ChessState, m: Move): ChessState {
  const c = s.turn;
  const board = moveBoard(s.board, m, c);
  const castling = { ...s.castling };

  if (m.t === 'k') {
    if (c === 'w') {
      castling.wk = false;
      castling.wq = false;
    } else {
      castling.bk = false;
      castling.bq = false;
    }
  }
  // A rook that leaves its corner, or is taken in it, kills that right.
  const corner = (sq: number) => {
    if (sq === sqAt(7, 0)) castling.wq = false;
    else if (sq === sqAt(7, 7)) castling.wk = false;
    else if (sq === sqAt(0, 0)) castling.bq = false;
    else if (sq === sqAt(0, 7)) castling.bk = false;
  };
  corner(m.from);
  corner(m.to);

  return {
    board,
    turn: other(c),
    castling,
    ep: m.dbl ? sqAt(rowOf(m.from) + forwardOf(c), colOf(m.from)) : null,
    half: m.t === 'p' || m.cap ? 0 : s.half + 1,
    full: c === 'b' ? s.full + 1 : s.full,
    moves: s.moves,
    last: m,
    resigned: s.resigned,
  };
}

/** Algebraic notation for a move, without the check or mate suffix. */
function notationBase(s: ChessState, m: Move): string {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const to = nameOf(m.to);
  if (m.t === 'p') {
    const body = m.cap ? `${FILES[colOf(m.from)]}x${to}` : to;
    return m.promo ? `${body}=${m.promo.toUpperCase()}` : body;
  }
  // Two knights that can both reach the square need telling apart.
  const rivals = legalMoves(s).filter((x) => x.t === m.t && x.to === m.to && x.from !== m.from && !x.castle);
  let mark = '';
  if (rivals.length) {
    const sharesFile = rivals.some((x) => colOf(x.from) === colOf(m.from));
    const sharesRank = rivals.some((x) => rowOf(x.from) === rowOf(m.from));
    if (!sharesFile) mark = FILES[colOf(m.from)];
    else if (!sharesRank) mark = String(8 - rowOf(m.from));
    else mark = nameOf(m.from);
  }
  return `${m.t.toUpperCase()}${mark}${m.cap ? 'x' : ''}${to}`;
}

/** Algebraic notation, check and mate included. */
export function notation(s: ChessState, m: Move): string {
  const base = notationBase(s, m);
  const next = step(s, m);
  if (!inCheck(next, next.turn)) return base;
  return legalMoves(next).length === 0 ? `${base}#` : `${base}+`;
}

/**
 * Play a move. Throws on an illegal one — ask `findMove` first.
 *
 * The whole position moves forward: the board, the castling rights, the
 * en-passant window, the fifty-move clock and the notation log. A promotion
 * with no piece named becomes a queen, which is what the picker offers first.
 */
export function applyMove(s: ChessState, m: Move): ChessState {
  if (s.resigned) throw new Error('The game is over');
  const legal = findMove(s, m.from, m.to, m.promo);
  if (!legal) throw new Error(`Illegal move ${nameOf(m.from)}${nameOf(m.to)}`);
  if (m.promo && legal.promo !== m.promo) throw new Error(`Illegal promotion ${nameOf(m.from)}${nameOf(m.to)}`);
  const text = notation(s, legal);
  const next = step(s, legal);
  return { ...next, moves: s.moves.concat(text) };
}

/** Concede. The position stops mattering. */
export const resign = (s: ChessState, c: Color): ChessState => (s.resigned ? s : { ...s, resigned: c });

// ── how a game ends ───────────────────────────────────────────────

/** Half-moves without a capture or a pawn move before the game is drawn. */
export const FIFTY = 100;

/**
 * Neither side could deliver mate with what is left: bare kings, a lone minor
 * piece, or one bishop each on squares of the same colour.
 */
export function insufficient(s: ChessState): boolean {
  const minors: Record<Color, PieceType[]> = { w: [], b: [] };
  const bishops: Record<Color, number[]> = { w: [], b: [] };
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
    minors[p.c].push(p.t);
    if (p.t === 'b') bishops[p.c].push(i);
  }
  const total = minors.w.length + minors.b.length;
  if (total <= 1) return true;
  if (minors.w.length === 1 && minors.b.length === 1 && bishops.w.length === 1 && bishops.b.length === 1) {
    return isLightSquare(bishops.w[0]) === isLightSquare(bishops.b[0]);
  }
  return false;
}

export type Status = 'playing' | 'checkmate' | 'stalemate' | 'insufficient' | 'fifty' | 'resigned';

/** Where the position stands. */
export function status(s: ChessState): Status {
  if (s.resigned) return 'resigned';
  if (legalMoves(s).length === 0) return inCheck(s) ? 'checkmate' : 'stalemate';
  if (insufficient(s)) return 'insufficient';
  if (s.half >= FIFTY) return 'fifty';
  return 'playing';
}

export interface Outcome {
  over: boolean;
  status: Status;
  /** null on a draw, or while the game is still running. */
  winner: Color | null;
  draw: boolean;
}

export function outcome(s: ChessState): Outcome {
  const st = status(s);
  if (st === 'playing') return { over: false, status: st, winner: null, draw: false };
  if (st === 'checkmate') return { over: true, status: st, winner: other(s.turn), draw: false };
  if (st === 'resigned') return { over: true, status: st, winner: other(s.resigned as Color), draw: false };
  return { over: true, status: st, winner: null, draw: true };
}

/** One line of plain English for the banner and the scoreboard. */
export function outcomeText(o: Outcome, nameFor: (c: Color) => string): string {
  switch (o.status) {
    case 'checkmate':
      return `Checkmate — ${nameFor(o.winner as Color)} wins`;
    case 'resigned':
      return `${nameFor(o.winner as Color)} wins by resignation`;
    case 'stalemate':
      return 'Stalemate — a draw';
    case 'insufficient':
      return 'Insufficient material — a draw';
    case 'fifty':
      return 'Fifty moves without a capture — a draw';
    default:
      return 'Game on';
  }
}

// ── material ──────────────────────────────────────────────────────

const FULL_SET: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** What `c` has taken off the board, biggest piece first. */
export function capturedBy(s: ChessState, c: Color): PieceType[] {
  const enemy = other(c);
  const alive: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const p of s.board) if (p && p.c === enemy) alive[p.t]++;
  const out: PieceType[] = [];
  for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
    for (let i = 0; i < Math.max(0, FULL_SET[t] - alive[t]); i++) out.push(t);
  }
  return out;
}

/** Material lead for `c`, in pawns. Positive means ahead. */
export function materialLead(s: ChessState, c: Color): number {
  let score = 0;
  for (const p of s.board) {
    if (!p || p.t === 'k') continue;
    score += (p.c === c ? 1 : -1) * VALUE[p.t];
  }
  return Math.round(score / 100);
}

// ── evaluation ────────────────────────────────────────────────────

/**
 * Piece-square tables, written from White's point of view in board order (a8
 * first). Black reads the same table with the rank flipped, which is `i ^ 56`.
 */
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  // Replaced by KING_END once the queens and most of the rooks are gone.
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
    -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30,
  -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0,
  0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Non-pawn material left on the board, in centipawns, both sides together. */
function heavyMaterial(board: Board): number {
  let total = 0;
  for (const p of board) if (p && p.t !== 'p' && p.t !== 'k') total += VALUE[p.t];
  return total;
}

/**
 * Static evaluation in centipawns, always from White's point of view. Material
 * dominates; the tables supply the positional sense that keeps knights off the
 * rim, rooks on open ranks and the king tucked away until the endgame, when it
 * should walk to the middle instead.
 */
export function evaluate(s: ChessState): number {
  const endgame = heavyMaterial(s.board) <= 1300;
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p) continue;
    const idx = p.c === 'w' ? i : i ^ 56;
    const table = p.t === 'k' && endgame ? KING_END : PST[p.t];
    const v = VALUE[p.t] + table[idx];
    score += p.c === 'w' ? v : -v;
  }
  return score;
}

// ── the search ────────────────────────────────────────────────────

export const MATE = 100000;
/**
 * How many positions one decision may visit. This is what keeps the search off
 * the UI thread's back: it bounds the work without reading a clock, so the same
 * position always produces the same move however fast the phone is.
 */
export const NODE_BUDGET = 16000;
/** Plies of capture-only search past the main depth. */
const QUIESCE_DEPTH = 4;

interface Ctx {
  nodes: number;
  budget: number;
}

/** Winning captures first, then promotions — the ordering alpha-beta lives on. */
function orderScore(m: Move): number {
  let v = 0;
  if (m.cap) v += 10 * VALUE[m.cap] - VALUE[m.t];
  if (m.promo) v += VALUE[m.promo];
  if (m.castle) v += 40;
  return v;
}

const byOrder = (a: Move, b: Move) => orderScore(b) - orderScore(a);

/**
 * Capture-only search past the horizon, so the engine does not congratulate
 * itself on a position where its queen is about to be taken.
 */
function quiesce(s: ChessState, alpha: number, beta: number, ctx: Ctx, left: number): number {
  const sign = s.turn === 'w' ? 1 : -1;
  const stand = evaluate(s) * sign;
  if (left <= 0 || ctx.nodes >= ctx.budget) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = legalCaptures(s).sort(byOrder);

  for (const m of captures) {
    ctx.nodes++;
    if (ctx.nodes >= ctx.budget) break;
    const score = -quiesce(step(s, m), -beta, -alpha, ctx, left - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** Negamax with alpha-beta. Scores are from the side to move's point of view. */
function negamax(s: ChessState, depth: number, alpha: number, beta: number, ctx: Ctx, ply: number): number {
  const moves = legalMoves(s).sort(byOrder);
  if (!moves.length) return inCheck(s) ? -(MATE - ply) : 0;
  if (s.half >= FIFTY || insufficient(s)) return 0;
  if (depth <= 0 || ctx.nodes >= ctx.budget) return quiesce(s, alpha, beta, ctx, QUIESCE_DEPTH);

  let best = -MATE * 2;
  for (const m of moves) {
    ctx.nodes++;
    const score = -negamax(step(s, m), depth - 1, -beta, -alpha, ctx, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (ctx.nodes >= ctx.budget) break;
  }
  return best;
}

export interface Scored {
  move: Move;
  /** Centipawns from the searching side's point of view. */
  score: number;
}

/** Best first, and a stable sort so equal scores keep the order they came in. */
const rank = (list: Scored[]): Scored[] =>
  list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.score - a.x.score || a.i - b.i)
    .map((w) => w.x);

/**
 * Every legal move, scored and sorted best first.
 *
 * The root deepens one ply at a time and feeds each pass's ordering into the
 * next, which is both what makes alpha-beta prune well and what makes running
 * out of node budget harmless: a search cut off part-way through the last pass
 * falls back on the last one that finished rather than on nothing.
 *
 * An `rng` shuffles the list before the first pass, so moves the search cannot
 * tell apart come out in a different order from game to game — and the same
 * order from the same seed.
 */
export function searchRoot(s: ChessState, depth: number, rng?: Rng, budget = NODE_BUDGET): Scored[] {
  const base = legalMoves(s);
  if (!base.length) return [];

  let order = (rng ? shuffle(base, rng) : base.slice()).sort(byOrder);
  let best: Scored[] = order.map((move) => ({ move, score: 0 }));
  const ctx: Ctx = { nodes: 0, budget };
  const d = Math.max(1, Math.floor(depth));

  for (let ply = 1; ply <= d; ply++) {
    // A full window at the root: the ranking widens a careless bot's choice, so
    // every move needs an honest score rather than an upper bound.
    const pass: Scored[] = [];
    for (const move of order) {
      ctx.nodes++;
      pass.push({ move, score: -negamax(step(s, move), ply - 1, -MATE * 2, MATE * 2, ctx, 1) });
      if (ctx.nodes >= ctx.budget) break;
    }
    if (pass.length === order.length) {
      best = rank(pass);
      order = best.map((x) => x.move);
    }
    if (ctx.nodes >= ctx.budget) break;
  }
  return best;
}

/** The move the search likes most, or null in a finished position. */
export function bestMove(s: ChessState, depth: number, rng?: Rng): Move | null {
  const ranked = searchRoot(s, depth, rng);
  return ranked.length ? ranked[0].move : null;
}

/**
 * What the opponent plays.
 *
 * `depth` sets how far it looks, `skill` sets how close to the best line it
 * insists on — a sharp engine takes the top move, a careless one settles for
 * anything within a pawn and a half of it — and `blunder` is the chance it
 * throws the whole decision away and plays something that is deliberately not
 * the best move it can see.
 */
export function botMove(s: ChessState, bot: BotProfile, rng: Rng): Move | null {
  const legal = legalMoves(s);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];

  if (rng() < bot.blunder) {
    // A real mistake: the best move it can see cheaply, specifically avoided.
    const shallow = searchRoot(s, 1, rng);
    const rest = shallow.slice(1);
    return rest.length ? pick(rest, rng).move : shallow[0].move;
  }

  const ranked = searchRoot(s, Math.max(1, bot.depth), rng);
  const window = Math.round(170 * (1 - Math.max(0, Math.min(1, bot.skill))));
  const top = ranked.filter((r) => r.score >= ranked[0].score - window);
  return pick(top.length ? top : ranked, rng).move;
}

// ── the scoreboard ────────────────────────────────────────────────

/**
 * XP: a flat fee, a little for every move you saw through, a little for the
 * material you took, and the prize for the point.
 */
export function xpFor(s: ChessState, c: Color, o: Outcome): number {
  const taken = capturedBy(s, c).reduce((n, t) => n + VALUE[t], 0);
  const bonus = o.draw ? 110 : o.winner === c ? 300 : 0;
  return 50 + 5 * Math.min(80, s.full) + Math.round(taken / 25) + bonus;
}

/** The move list as numbered pairs — "1. e4 e5", "2. Nf3 Nc6". */
export function movePairs(s: ChessState): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.moves.length; i += 2) {
    out.push(`${i / 2 + 1}. ${s.moves[i]}${s.moves[i + 1] ? ` ${s.moves[i + 1]}` : ''}`);
  }
  return out;
}
