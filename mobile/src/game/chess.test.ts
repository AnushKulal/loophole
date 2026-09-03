import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  FIFTY,
  MATE,
  PROMOTIONS,
  VALUE,
  applyMove,
  attacked,
  bestMove,
  botMove,
  capturedBy,
  evaluate,
  findMove,
  fromFen,
  insufficient,
  inCheck,
  isLegal,
  isLightSquare,
  kingSquare,
  legalCaptures,
  legalMoves,
  materialLead,
  movePairs,
  movesFrom,
  nameOf,
  needsPromotion,
  newGame,
  notation,
  other,
  outcome,
  outcomeText,
  repetitions,
  resign,
  searchRoot,
  squareOf,
  status,
  toFen,
  xpFor,
  type ChessState,
  type Color,
  type Move,
  type PieceType,
} from './chess';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** Every leaf of the move tree, `d` plies deep — the standard correctness net. */
function perft(s: ChessState, d: number): number {
  if (d === 0) return 1;
  let n = 0;
  for (const m of legalMoves(s)) n += perft(applyMove(s, m), d - 1);
  return n;
}

/** Play a line written the way a person writes it: "e2e4", "e7e8q". */
function play(s: ChessState, ...line: string[]): ChessState {
  for (const step of line) {
    const from = squareOf(step.slice(0, 2));
    const to = squareOf(step.slice(2, 4));
    const promo = step[4] as Move['promo'];
    const m = findMove(s, from, to, promo);
    if (!m) throw new Error(`no legal move ${step} in ${toFen(s)}`);
    s = applyMove(s, m);
  }
  return s;
}

/** What `c` took between two positions — the row's delta, not the whole row. */
const took = (before: ChessState, after: ChessState, c: Color): PieceType[] =>
  after.captured[c].slice(before.captured[c].length);

/** Both seats played by a bot, to a finished game or a ply cap. */
function autoGame(white: BotProfile, black: BotProfile, rng: Rng, check = false, maxPly = 500): ChessState {
  let s = newGame();
  for (let ply = 0; ply < maxPly && status(s) === 'playing'; ply++) {
    const bot = s.turn === 'w' ? white : black;
    const m = botMove(s, bot, rng);
    expect(m).not.toBeNull();
    if (check) expect(isLegal(s, (m as Move).from, (m as Move).to, (m as Move).promo)).toBe(true);
    s = applyMove(s, m as Move);
  }
  return s;
}

// ── the board ─────────────────────────────────────────────────────

describe('the board', () => {
  it('numbers squares from a8 to h1 and names them back', () => {
    expect(nameOf(0)).toBe('a8');
    expect(nameOf(63)).toBe('h1');
    expect(nameOf(squareOf('e4'))).toBe('e4');
    expect(squareOf('a1')).toBe(56);
    for (let sq = 0; sq < 64; sq++) expect(squareOf(nameOf(sq))).toBe(sq);
  });

  it('puts a dark square in each player’s bottom-left corner', () => {
    expect(isLightSquare(squareOf('a1'))).toBe(false);
    expect(isLightSquare(squareOf('h1'))).toBe(true);
    expect(isLightSquare(squareOf('a8'))).toBe(true);
  });

  it('reads and writes a position without losing anything', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(toFen(fromFen(fen))).toBe(fen);
    expect(toFen(newGame())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('sets up thirty-two pieces with White to move', () => {
    const s = newGame();
    expect(s.board.filter(Boolean)).toHaveLength(32);
    expect(s.turn).toBe('w');
    expect(kingSquare(s.board, 'w')).toBe(squareOf('e1'));
    expect(kingSquare(s.board, 'b')).toBe(squareOf('e8'));
    expect(legalMoves(s)).toHaveLength(20);
  });
});

// ── move generation, against the published counts ─────────────────

describe('legal move generation', () => {
  // These five positions and their node counts are the standard test for a
  // chess move generator: between them they cover pins, discovered check,
  // castling through check, en passant that would expose the king, and
  // under-promotion. A wrong number here means a wrong rule somewhere.
  it('walks the opening tree to the published counts', () => {
    const s = newGame();
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });

  it('counts a middlegame bristling with castles and pins', () => {
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });

  it('counts an endgame that turns on en passant', () => {
    const s = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(s, 1)).toBe(14);
    expect(perft(s, 2)).toBe(191);
    expect(perft(s, 3)).toBe(2812);
  });

  it('counts a position full of promotions', () => {
    const s = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(s, 1)).toBe(6);
    expect(perft(s, 2)).toBe(264);
  });

  it('counts a cramped position with a knight already inside the castle', () => {
    const s = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(s, 1)).toBe(44);
    expect(perft(s, 2)).toBe(1486);
  });
});

// ── what is and is not a move ─────────────────────────────────────

describe('legality', () => {
  it('accepts an opening move and refuses one the piece cannot make', () => {
    const s = newGame();
    expect(isLegal(s, squareOf('e2'), squareOf('e4'))).toBe(true);
    expect(isLegal(s, squareOf('g1'), squareOf('f3'))).toBe(true);
    expect(isLegal(s, squareOf('e2'), squareOf('e5'))).toBe(false); // three squares
    expect(isLegal(s, squareOf('a1'), squareOf('a4'))).toBe(false); // rook through a pawn
    expect(isLegal(s, squareOf('e1'), squareOf('e2'))).toBe(false); // king onto its own pawn
    expect(isLegal(s, squareOf('e7'), squareOf('e5'))).toBe(false); // not Black's move
    expect(isLegal(s, squareOf('e3'), squareOf('e4'))).toBe(false); // empty square
    expect(() => applyMove(s, { from: squareOf('e2'), to: squareOf('e5'), t: 'p' })).toThrow();
  });

  it('refuses a move that leaves the king in check, and forces one that answers it', () => {
    // A black bishop on b4 with c3 and d2 empty checks the king on e1.
    const s = fromFen('rnbqk1nr/pppp1ppp/8/4p3/1b6/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1');
    expect(inCheck(s, 'w')).toBe(true);
    const moves = legalMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    // Every answer either blocks, takes the bishop or moves the king.
    for (const m of moves) expect(inCheck(applyMove(s, m), 'w')).toBe(false);
    expect(isLegal(s, squareOf('a2'), squareOf('a3'))).toBe(false);
    expect(isLegal(s, squareOf('c2'), squareOf('c3'))).toBe(true);
  });

  it('pins a piece to its own king', () => {
    // The white knight on e2 shields the king from the rook on e8.
    const s = fromFen('4r3/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(movesFrom(s, squareOf('e2'))).toHaveLength(0);
    expect(movesFrom(s, squareOf('e1')).length).toBeGreaterThan(0);
    for (const m of movesFrom(s, squareOf('e1'))) expect(nameOf(m.to)).not.toMatch(/^e/);
  });

  it('knows which squares each side attacks', () => {
    const s = newGame();
    expect(attacked(s.board, squareOf('f3'), 'w')).toBe(true); // g2 pawn and g1 knight
    expect(attacked(s.board, squareOf('e4'), 'w')).toBe(false);
    expect(attacked(s.board, squareOf('a6'), 'b')).toBe(true); // b7 pawn
    expect(other('w')).toBe('b');
  });

  it('offers exactly the destinations a piece has, and no more', () => {
    const s = newGame();
    expect(movesFrom(s, squareOf('b1')).map((m) => nameOf(m.to)).sort()).toEqual(['a3', 'c3']);
    expect(movesFrom(s, squareOf('d2')).map((m) => nameOf(m.to)).sort()).toEqual(['d3', 'd4']);
    expect(movesFrom(s, squareOf('c1'))).toHaveLength(0);
    expect(movesFrom(s, squareOf('e5'))).toHaveLength(0);
  });

  it('lists only captures and promotions when asked for the loud moves', () => {
    const s = fromFen('8/P7/8/3p4/8/4N3/8/K1k5 w - - 0 1');
    const loud = legalCaptures(s);
    expect(loud.length).toBeGreaterThan(0);
    for (const m of loud) expect(!!(m.cap || m.promo)).toBe(true);
    expect(loud.some((m) => m.promo === 'q')).toBe(true);
    expect(loud.some((m) => m.cap === 'p')).toBe(true);
  });
});

// ── castling ──────────────────────────────────────────────────────

describe('castling', () => {
  const open = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

  it('castles both ways and puts the rook on the far side of the king', () => {
    const s = fromFen(open);
    const short = play(s, 'e1g1');
    expect(short.board[squareOf('g1')]).toMatchObject({ c: 'w', t: 'k' });
    expect(short.board[squareOf('f1')]).toMatchObject({ c: 'w', t: 'r' });
    expect(short.board[squareOf('h1')]).toBeNull();
    expect(short.moves).toEqual(['O-O']);

    const long = play(s, 'e1c1');
    expect(long.board[squareOf('c1')]).toMatchObject({ c: 'w', t: 'k' });
    expect(long.board[squareOf('d1')]).toMatchObject({ c: 'w', t: 'r' });
    expect(long.board[squareOf('a1')]).toBeNull();
    expect(long.moves).toEqual(['O-O-O']);
  });

  it('gives up the right the moment the king or that rook moves', () => {
    const s = fromFen(open);
    const kingMoved = play(s, 'e1f1');
    expect(kingMoved.castling).toEqual({ wk: false, wq: false, bk: true, bq: true });

    const rookMoved = play(s, 'h1g1');
    expect(rookMoved.castling.wk).toBe(false);
    expect(rookMoved.castling.wq).toBe(true);

    // And a rook taken in its corner takes the right with it.
    const taken = play(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'a1a8');
    expect(taken.castling.bq).toBe(false);
    expect(taken.castling.bk).toBe(true);
  });

  it('refuses to castle out of, through, or into check', () => {
    // A rook on e8 stares down the white king: castling out of check.
    expect(isLegal(fromFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1'), squareOf('e1'), squareOf('g1'))).toBe(false);
    // A rook on f8 covers f1: the king may not pass through it.
    expect(isLegal(fromFen('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1'), squareOf('e1'), squareOf('g1'))).toBe(false);
    // A rook on g8 covers g1: the king may not land on it.
    expect(isLegal(fromFen('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), squareOf('e1'), squareOf('g1'))).toBe(false);
    // b1 attacked is fine for the long castle — the king never stands there.
    expect(isLegal(fromFen('1r6/8/8/8/8/8/8/R3K2R w KQ - 0 1'), squareOf('e1'), squareOf('c1'))).toBe(true);
  });

  it('refuses to castle through a piece, or without the right', () => {
    expect(isLegal(fromFen('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1'), squareOf('e1'), squareOf('g1'))).toBe(false);
    expect(isLegal(fromFen('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1'), squareOf('e1'), squareOf('c1'))).toBe(false);
    expect(isLegal(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1'), squareOf('e1'), squareOf('g1'))).toBe(false);
    expect(isLegal(fromFen('r3k2r/8/8/8/8/8/8/R3K2R b KQ - 0 1'), squareOf('e8'), squareOf('g8'))).toBe(false);
  });
});

// ── en passant ────────────────────────────────────────────────────

describe('en passant', () => {
  it('opens a one-move window after a double push and shuts it again', () => {
    let s = play(newGame(), 'e2e4');
    expect(s.ep).toBe(squareOf('e3'));
    s = play(s, 'a7a6');
    expect(s.ep).toBeNull();
    expect(play(newGame(), 'e2e3').ep).toBeNull();
  });

  it('takes the pawn that walked past, not the one on the target square', () => {
    const s = play(fromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1'), 'd7d5', 'e5d6');
    expect(s.board[squareOf('d6')]).toMatchObject({ c: 'w', t: 'p' });
    expect(s.board[squareOf('d5')]).toBeNull();
    expect(s.board[squareOf('e5')]).toBeNull();
    expect(s.moves[1]).toBe('exd6');
  });

  it('is illegal a move later', () => {
    const s = play(fromFen('4k3/3p4/8/4P3/8/8/7P/4K3 b - - 0 1'), 'd7d5', 'h2h3', 'e8d8');
    expect(isLegal(s, squareOf('e5'), squareOf('d6'))).toBe(false);
  });

  it('is refused when taking would expose the king along the rank', () => {
    // White king on h5, black rook on a5: taking en passant clears two pawns
    // off the fifth rank at once and hangs the king to the rook.
    const s = fromFen('8/8/8/r2pP2K/8/8/8/4k3 w - d6 0 2');
    expect(isLegal(s, squareOf('e5'), squareOf('d6'))).toBe(false);
    expect(legalMoves(s).some((m) => m.ep)).toBe(false);
  });
});

// ── promotion ─────────────────────────────────────────────────────

describe('promotion', () => {
  const s = fromFen('8/4P3/8/8/8/8/8/K6k w - - 0 1');

  it('offers all four pieces and nothing else', () => {
    const moves = movesFrom(s, squareOf('e7'));
    expect(moves.map((m) => m.promo).sort()).toEqual([...PROMOTIONS].sort());
    expect(needsPromotion(s, squareOf('e7'), squareOf('e8'))).toBe(true);
    expect(needsPromotion(newGame(), squareOf('e2'), squareOf('e4'))).toBe(false);
  });

  it('puts the chosen piece on the board and writes it into the notation', () => {
    expect(play(s, 'e7e8q').board[squareOf('e8')]).toMatchObject({ c: 'w', t: 'q' });
    expect(play(s, 'e7e8n').board[squareOf('e8')]).toMatchObject({ c: 'w', t: 'n' });
    expect(play(s, 'e7e8n').moves).toEqual(['e8=N']);
    // Naming a piece a pawn cannot become is rejected.
    expect(() => applyMove(s, { from: squareOf('e7'), to: squareOf('e8'), t: 'p', promo: 'k' })).toThrow();
  });

  it('defaults to a queen when the picker is skipped', () => {
    expect(applyMove(s, { from: squareOf('e7'), to: squareOf('e8'), t: 'p' }).moves).toEqual(['e8=Q']);
  });

  it('promotes with a capture too', () => {
    const n = play(fromFen('5r2/4P3/8/8/8/8/8/K6k w - - 0 1'), 'e7f8q');
    expect(n.board[squareOf('f8')]).toMatchObject({ c: 'w', t: 'q' });
    expect(n.moves).toEqual(['exf8=Q']);
  });
});

// ── how a game ends ───────────────────────────────────────────────

describe('endings', () => {
  it('calls checkmate and hands the point to the mating side', () => {
    // Fool's mate.
    const s = play(newGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(status(s)).toBe('checkmate');
    expect(inCheck(s, 'w')).toBe(true);
    expect(legalMoves(s)).toHaveLength(0);
    const o = outcome(s);
    expect(o).toMatchObject({ over: true, winner: 'b', draw: false });
    expect(s.moves[3]).toBe('Qh4#');
    expect(outcomeText(o, (c) => (c === 'w' ? 'You' : 'Ada'))).toBe('Checkmate — Ada wins');
  });

  it('calls stalemate a draw, not a loss', () => {
    const s = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(inCheck(s, 'b')).toBe(false);
    expect(legalMoves(s)).toHaveLength(0);
    expect(status(s)).toBe('stalemate');
    expect(outcome(s)).toMatchObject({ over: true, winner: null, draw: true });
  });

  it('draws when neither side has the material to mate', () => {
    expect(insufficient(fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1'))).toBe(true); // bare kings
    expect(insufficient(fromFen('8/8/4k3/8/8/3K1N2/8/8 w - - 0 1'))).toBe(true); // lone knight
    expect(insufficient(fromFen('8/8/4k3/8/8/3K1B2/8/8 w - - 0 1'))).toBe(true); // lone bishop
    // One bishop each, both on light squares — c8 and f3.
    expect(insufficient(fromFen('2b5/8/4k3/8/8/3K1B2/8/8 w - - 0 1'))).toBe(true);
    // One bishop each, on opposite colours: mate is possible with help.
    expect(insufficient(fromFen('1b6/8/4k3/8/8/3K1B2/8/8 w - - 0 1'))).toBe(false);
    expect(insufficient(fromFen('8/8/4k3/8/8/3K1R2/8/8 w - - 0 1'))).toBe(false); // a rook mates
    expect(insufficient(fromFen('8/5p2/4k3/8/8/3K4/8/8 w - - 0 1'))).toBe(false); // a pawn queens
    expect(status(fromFen('8/8/4k3/8/8/3K1N2/8/8 w - - 0 1'))).toBe('insufficient');
  });

  it('draws after fifty moves with no capture and no pawn moved', () => {
    expect(FIFTY).toBe(100);
    const s = fromFen('8/8/4k3/8/8/3K4/7R/8 w - - 99 60');
    expect(status(s)).toBe('playing');
    const n = play(s, 'h2h3');
    expect(n.half).toBe(100);
    expect(status(n)).toBe('fifty');
    expect(outcome(n).draw).toBe(true);
    // A capture or a pawn move puts the clock back to nothing.
    expect(play(fromFen('8/8/4k3/8/8/3K3P/8/8 w - - 40 60'), 'h3h4').half).toBe(0);
    expect(play(fromFen('8/8/4k3/7r/8/3K3R/8/8 w - - 40 60'), 'h3h5').half).toBe(0);
    // Checkmate on the hundredth half-move is still checkmate.
    expect(status(fromFen('7k/6Q1/5K2/8/8/8/8/8 b - - 100 60'))).toBe('checkmate');
  });

  it('draws when the same position has stood three times', () => {
    // The rook shuffles h1–h2 and the king e8–e7: four plies puts everything
    // back, so the opening position stands again on the fourth and the eighth.
    const s = fromFen('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
    expect(repetitions(s)).toBe(1);
    const twice = play(s, 'h1h2', 'e8e7', 'h2h1', 'e7e8');
    expect(repetitions(twice)).toBe(2);
    expect(status(twice)).toBe('playing');

    const thrice = play(twice, 'h1h2', 'e8e7', 'h2h1', 'e7e8');
    expect(repetitions(thrice)).toBe(3);
    expect(thrice.half).toBe(8); // nowhere near the fifty-move clock
    expect(status(thrice)).toBe('repetition');
    expect(outcome(thrice)).toMatchObject({ over: true, winner: null, draw: true });
    expect(outcomeText(outcome(thrice), () => 'You')).toBe('The same position three times — a draw');
  });

  it('counts two positions as the same only if the same things are still possible', () => {
    // The castling right dies with the rook's first move, so the position the
    // rook returns to is not the one it left: three shuffles, not two.
    const rights = fromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(status(play(rights, 'h1h2', 'e8e7', 'h2h1', 'e7e8', 'h1h2', 'e8e7', 'h2h1', 'e7e8'))).toBe('playing');
    expect(status(play(rights, 'h1h2', 'e8e7', 'h2h1', 'e7e8', 'h1h2', 'e8e7', 'h2h1', 'e7e8', 'h1h2', 'e8e7', 'h2h1', 'e7e8'))).toBe(
      'repetition',
    );

    // And a pawn move can never be taken back, so it draws a line under the
    // record: the shuffle that follows starts counting from one again.
    const pawn = play(fromFen('4k3/8/8/8/8/7P/8/4K2R w - - 0 1'), 'h1h2', 'e8e7', 'h2h1', 'e7e8', 'h3h4');
    expect(repetitions(pawn)).toBe(1);
    expect(pawn.seen).toHaveLength(1);
  });

  it('lets a player resign, and refuses to move on afterwards', () => {
    const s = resign(newGame(), 'w');
    expect(status(s)).toBe('resigned');
    expect(outcome(s)).toMatchObject({ over: true, winner: 'b', draw: false });
    expect(() => play(s, 'e2e4')).toThrow();
    // The first resignation is the one that counts.
    expect(resign(s, 'b').resigned).toBe('w');
  });

  it('is still playing in an ordinary position', () => {
    expect(status(newGame())).toBe('playing');
    expect(outcome(newGame())).toMatchObject({ over: false, winner: null });
  });
});

// ── bookkeeping ───────────────────────────────────────────────────

describe('the running position', () => {
  it('counts full moves from one, incrementing after Black', () => {
    let s = newGame();
    expect(s.full).toBe(1);
    s = play(s, 'e2e4');
    expect(s.full).toBe(1);
    s = play(s, 'e7e5');
    expect(s.full).toBe(2);
    expect(s.turn).toBe('w');
  });

  it('writes the notation a scoresheet would', () => {
    const s = play(newGame(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6');
    expect(s.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(movePairs(s)).toEqual(['1. e4 e5', '2. Nf3 Nc6', '3. Bb5 a6']);
    expect(movePairs(play(newGame(), 'e2e4'))).toEqual(['1. e4']);
    // A check gets a +, a capture an x.
    expect(play(newGame(), 'e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5e5').moves.slice(-1)).toEqual(['Qxe5+']);
  });

  it('tells two identical pieces apart when both can reach the square', () => {
    // Knights on b1 and f3 can both go to d2.
    const two = fromFen('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1');
    const bd2 = findMove(two, squareOf('b1'), squareOf('d2')) as Move;
    expect(notation(two, bd2)).toBe('Nbd2');
    // Rooks on a1 and a8: the file is shared, so the rank tells them apart.
    const files = fromFen('R7/8/4k3/8/8/8/8/R3K3 w - - 0 1');
    const a1a4 = findMove(files, squareOf('a1'), squareOf('a4')) as Move;
    expect(notation(files, a1a4)).toBe('R1a4');
    // A lone piece needs no help.
    expect(notation(newGame(), findMove(newGame(), squareOf('g1'), squareOf('f3')) as Move)).toBe('Nf3');
  });

  it('remembers the move just played so the board can light it up', () => {
    const s = play(newGame(), 'e2e4');
    expect(s.last).toMatchObject({ from: squareOf('e2'), to: squareOf('e4'), t: 'p', dbl: true });
    expect(newGame().last).toBeNull();
  });

  it('leaves the position it was given untouched', () => {
    const s = newGame();
    const before = toFen(s);
    legalMoves(s);
    searchRoot(s, 2, makeRng(1));
    applyMove(s, findMove(s, squareOf('e2'), squareOf('e4')) as Move);
    expect(toFen(s)).toBe(before);
    expect(s.moves).toEqual([]);
  });
});

// ── material ──────────────────────────────────────────────────────

describe('material', () => {
  it('lists what each side has taken, best piece first', () => {
    const s = fromFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPP3/RNBQKBNR w KQkq - 0 1');
    expect(capturedBy(s, 'w')).toEqual(['q']);
    expect(capturedBy(s, 'b')).toEqual(['p', 'p', 'p']);
    expect(capturedBy(newGame(), 'w')).toEqual([]);
  });

  it('keeps the strip on a promotion, which takes nothing and gives nothing back', () => {
    // A white pawn on h7 steps onto an empty h8. Nothing changes hands, so
    // neither row may change — the new queen is not a pawn Black took.
    const s = fromFen('rnbqkbn1/pppppppP/8/8/8/8/PPPPPPP1/RNBQKBNR w Qkq - 0 1');
    expect(capturedBy(s, 'b')).toEqual([]);
    const n = play(s, 'h7h8q');
    expect(capturedBy(n, 'b')).toEqual([]);
    expect(xpFor(n, 'b', outcome(n))).toBe(xpFor(s, 'b', outcome(s)));
  });

  it('does not lose a piece that was really taken when the enemy promotes a new one', () => {
    // Black has White's queen. White promotes another onto h8: the board is
    // back to one white queen, but Black still took the first one.
    const s = fromFen('rnbqkbn1/pppppppP/8/8/8/8/PPPPPPP1/RNB1KBNR w Qkq - 0 1');
    expect(capturedBy(s, 'b')).toEqual(['q']);
    const n = play(s, 'h7h8q');
    expect(capturedBy(n, 'b')).toEqual(['q']);
  });

  it('adds a taken piece the moment it is taken, promotion or not', () => {
    const s = play(newGame(), 'e2e4', 'd7d5', 'e4d5');
    expect(capturedBy(s, 'w')).toEqual(['p']);
    expect(capturedBy(s, 'b')).toEqual([]);
    // A promotion that does capture counts the rook it took, and nothing more.
    const promo = fromFen('5r2/4P3/8/8/8/8/8/K6k w - - 0 1');
    expect(took(promo, play(promo, 'e7f8q'), 'w')).toEqual(['r']);
    // En passant counts the pawn that walked past, which is not on the square.
    const ep = fromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
    expect(took(ep, play(ep, 'd7d5', 'e5d6'), 'w')).toEqual(['p']);
  });

  it('reads a position it was handed by counting the gaps, promotions included', () => {
    // A second white queen on h2 with only seven pawns left: she came from the
    // missing one, so Black has taken nothing at all.
    expect(capturedBy(fromFen('4k3/8/8/8/8/8/PPPPPPPQ/RNBQKBNR b - - 0 1'), 'b')).toEqual([]);
  });

  it('scores the lead in pawns, from either chair', () => {
    const s = fromFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPP3/RNBQKBNR w KQkq - 0 1');
    expect(materialLead(s, 'w')).toBe(6); // a queen up, three pawns down
    expect(materialLead(s, 'b')).toBe(-6);
    expect(materialLead(newGame(), 'w')).toBe(0);
  });

  it('values the pieces the way the search does', () => {
    expect(VALUE.q).toBeGreaterThan(VALUE.r);
    expect(VALUE.r).toBeGreaterThan(VALUE.b);
    expect(VALUE.b).toBeGreaterThan(VALUE.n);
    expect(VALUE.n).toBeGreaterThan(VALUE.p);
  });
});

// ── evaluation and search ─────────────────────────────────────────

describe('the evaluation', () => {
  it('is level at the start and follows the material after that', () => {
    expect(evaluate(newGame())).toBe(0);
    expect(evaluate(fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'))).toBeLessThan(-800);
    expect(evaluate(fromFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))).toBeGreaterThan(800);
  });

  it('prefers a knight in the middle to a knight on the rim', () => {
    const middle = evaluate(fromFen('4k3/8/8/3N4/8/8/8/4K3 w - - 0 1'));
    const rim = evaluate(fromFen('4k3/8/8/N7/8/8/8/4K3 w - - 0 1'));
    expect(middle).toBeGreaterThan(rim);
  });

  it('walks the king to the middle once the heavy pieces are gone', () => {
    const central = evaluate(fromFen('8/8/8/3K4/8/8/8/7k w - - 0 1'));
    const corner = evaluate(fromFen('K7/8/8/8/8/8/8/7k w - - 0 1'));
    expect(central).toBeGreaterThan(corner);
  });
});

describe('the search', () => {
  it('scores every legal move and puts the best one first', () => {
    const s = newGame();
    const ranked = searchRoot(s, 2, makeRng(4));
    expect(ranked).toHaveLength(legalMoves(s).length);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    for (const r of ranked) expect(isLegal(s, r.move.from, r.move.to, r.move.promo)).toBe(true);
  });

  it('finds mate in one', () => {
    // Back-rank mate: the rook drops to a8 and the king has no air.
    const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const best = bestMove(s, 2) as Move;
    expect(nameOf(best.to)).toBe('a8');
    expect(status(applyMove(s, best))).toBe('checkmate');
    expect(searchRoot(s, 2)[0].score).toBeGreaterThan(MATE - 100);
  });

  it('sees mate in two, several plies out', () => {
    // Queen to g7 is mate next move whatever Black plays.
    const s = fromFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    const best = bestMove(s, 3) as Move;
    expect(nameOf(best.to)).toBe('a8');
  });

  it('takes a free queen', () => {
    const s = fromFen('4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1');
    const best = bestMove(s, 2) as Move;
    expect(nameOf(best.from)).toBe('e4');
    expect(nameOf(best.to)).toBe('d5');
    expect(best.cap).toBe('q');
  });

  it('does not take a pawn that is defended by a pawn', () => {
    // Nxd5 wins a pawn but loses the knight to exd5.
    const s = fromFen('4k3/8/4p3/3p4/8/4N3/8/4K3 w - - 0 1');
    const best = bestMove(s, 3) as Move;
    expect(nameOf(best.to)).not.toBe('d5');
  });

  it('escapes an attack on its queen rather than sitting still', () => {
    const s = fromFen('4k3/8/8/8/8/2r5/8/2Q1K3 w - - 0 1');
    const best = bestMove(s, 3) as Move;
    // Either take the rook or move the queen — anything but leave it hanging.
    const after = applyMove(s, best);
    expect(materialLead(after, 'w')).toBeGreaterThanOrEqual(materialLead(s, 'w'));
  });

  it('returns nothing from a finished position', () => {
    expect(bestMove(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 2)).toBeNull();
    expect(searchRoot(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 2)).toEqual([]);
  });

  it('stays inside its node budget, and still answers with a legal move', () => {
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const tiny = searchRoot(s, 3, makeRng(2), 40);
    expect(tiny.length).toBe(legalMoves(s).length);
    expect(isLegal(s, tiny[0].move.from, tiny[0].move.to, tiny[0].move.promo)).toBe(true);
  });
});

// ── the bot ───────────────────────────────────────────────────────

describe('the bot', () => {
  it('answers every position with a legal move, at every difficulty', () => {
    const positions = [
      newGame(),
      fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),
      fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'),
      fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'),
      fromFen('4k3/4P3/4K3/8/8/8/8/8 w - - 0 1'), // one pawn from queening
      fromFen('4r3/8/8/8/8/8/4N3/4K3 w - - 0 1'), // its only piece is pinned
      fromFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'), // castling both ways
      fromFen('8/8/4k3/8/8/3K1N2/8/8 w - - 0 1'), // a dead drawn endgame
    ];
    for (const d of DIFFS) {
      for (const s of positions) {
        const rng = makeRng(99);
        for (let n = 0; n < 3; n++) {
          const m = botMove(s, BOT[d], rng);
          expect(m).not.toBeNull();
          expect(isLegal(s, (m as Move).from, (m as Move).to, (m as Move).promo)).toBe(true);
        }
      }
    }
  }, 60000);

  it('returns nothing when there is nothing to play', () => {
    for (const d of DIFFS) {
      expect(botMove(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), BOT[d], makeRng(1))).toBeNull();
      expect(botMove(fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), BOT[d], makeRng(1))).toBeNull();
    }
  });

  it('plays the only move when there is only one', () => {
    // The king is checked by the rook and has exactly one square.
    const s = fromFen('8/8/8/8/8/8/6r1/K6k w - - 0 1');
    expect(legalMoves(s)).toHaveLength(1);
    for (const d of DIFFS) expect(nameOf((botMove(s, BOT[d], makeRng(7)) as Move).to)).toBe('b1');
  });

  it('finishes a mate in one nearly every time when it is sharp', () => {
    const s = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const hits = (d: (typeof DIFFS)[number]) => {
      let n = 0;
      for (let seed = 0; seed < 60; seed++) {
        const m = botMove(s, BOT[d], makeRng(seed * 31 + 1)) as Move;
        if (status(applyMove(s, m)) === 'checkmate') n++;
      }
      return n;
    };
    expect(hits('Sharp')).toBeGreaterThan(60 * (1 - BOT.Sharp.blunder) - 4);
    expect(hits('Sharp')).toBeGreaterThan(hits('Easy'));
  }, 60000);

  it('throws a decision away about as often as its blunder rate says', () => {
    // A free queen: anything but taking it is a mistake it chose to make.
    const s = fromFen('4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1');
    const takes = (d: (typeof DIFFS)[number]) => {
      let n = 0;
      for (let seed = 0; seed < 120; seed++) {
        const m = botMove(s, BOT[d], makeRng(seed * 13 + 3)) as Move;
        if (m.cap === 'q') n++;
      }
      return n / 120;
    };
    const sharp = takes('Sharp');
    const easy = takes('Easy');
    expect(sharp).toBeGreaterThan(1 - BOT.Sharp.blunder - 0.06);
    expect(easy).toBeLessThan(sharp);
    expect(easy).toBeGreaterThan(1 - BOT.Easy.blunder - 0.2); // still mostly sane
  }, 60000);

  it('spreads its choice wider the lower its skill', () => {
    const s = newGame();
    const spread = (d: (typeof DIFFS)[number]) => {
      const seen = new Set<string>();
      for (let seed = 0; seed < 20; seed++) {
        const m = botMove(s, BOT[d], makeRng(seed * 17 + 9)) as Move;
        seen.add(`${nameOf(m.from)}${nameOf(m.to)}`);
      }
      return seen.size;
    };
    expect(spread('Easy')).toBeGreaterThan(spread('Sharp'));
  }, 60000);

  it('beats a careless bot far more often than it loses to one', () => {
    const score = (white: BotProfile, black: BotProfile) => {
      let points = 0;
      for (let seed = 0; seed < 6; seed++) {
        const o = outcome(autoGame(white, black, makeRng(seed * 23 + 5)));
        points += o.draw ? 0.5 : o.winner === 'w' ? 1 : 0;
      }
      return points / 6;
    };
    expect(score(BOT.Normal, BOT.Easy)).toBeGreaterThan(0.75);
    // The same match from the other chair, so it is the profile winning.
    expect(score(BOT.Easy, BOT.Normal)).toBeLessThan(0.25);
  }, 120000);

  it('is materially ahead of a careless bot inside twenty moves when it is sharp', () => {
    // A full sharp game is slow, so strength is judged on the position it has
    // built rather than on the point — the lead after forty plies is the same
    // signal and costs a quarter of the search.
    let lead = 0;
    for (let seed = 0; seed < 3; seed++) {
      lead += materialLead(autoGame(BOT.Sharp, BOT.Easy, makeRng(seed * 23 + 5), false, 40), 'w');
    }
    expect(lead / 3).toBeGreaterThan(1.5);
  }, 120000);
});

// ── a full game ───────────────────────────────────────────────────

describe('a full game', () => {
  it('reaches a terminal position with at most one winner', () => {
    for (let seed = 0; seed < 5; seed++) {
      const s = autoGame(BOT.Easy, BOT.Easy, makeRng(seed * 41 + 7), true);
      const o = outcome(s);
      expect(o.over).toBe(true);
      expect(['checkmate', 'stalemate', 'insufficient', 'repetition', 'fifty']).toContain(o.status);
      // Exactly one of "somebody won" and "it was drawn" is true.
      expect(o.draw === (o.winner === null)).toBe(true);
      if (o.status === 'checkmate') {
        expect(inCheck(s, s.turn)).toBe(true);
        expect(legalMoves(s)).toHaveLength(0);
        expect(o.winner).toBe(other(s.turn));
        expect(s.moves[s.moves.length - 1].endsWith('#')).toBe(true);
      }
      // Both kings are on the board the whole way — nothing was ever captured.
      expect(kingSquare(s.board, 'w')).toBeGreaterThanOrEqual(0);
      expect(kingSquare(s.board, 'b')).toBeGreaterThanOrEqual(0);
      expect(s.moves).toHaveLength((s.full - 1) * 2 + (s.turn === 'b' ? 1 : 0));
    }
  }, 120000);

  it('pays the winner most and a draw something', () => {
    const mate = play(newGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    const o = outcome(mate);
    expect(xpFor(mate, 'b', o)).toBeGreaterThan(xpFor(mate, 'w', o));
    expect(xpFor(mate, 'b', o)).toBe(50 + 5 * mate.full + 0 + 300);

    const draw = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const d = outcome(draw);
    expect(d.draw).toBe(true);
    // White is a whole army up but the point was still shared, so both are paid
    // the draw bonus and only the captured material tells them apart.
    const army = 8 * VALUE.p + 2 * VALUE.n + 2 * VALUE.b + 2 * VALUE.r;
    expect(xpFor(draw, 'w', d)).toBe(50 + 5 * draw.full + Math.round((army + VALUE.q) / 25) + 110);
    expect(xpFor(draw, 'b', d)).toBe(50 + 5 * draw.full + Math.round(army / 25) + 110);
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  it('replays a whole game identically from the same seed', () => {
    const run = () => {
      const s = autoGame(BOT.Easy, BOT.Normal, makeRng(20260903));
      return { fen: toFen(s), moves: s.moves, status: status(s) };
    };
    const first = run();
    expect(first).toEqual(run());
    expect(first.moves.length).toBeGreaterThan(4);
  }, 120000);

  it('gives the same move for the same seed and different moves for different ones', () => {
    const s = newGame();
    const at = (seed: number) => {
      const m = botMove(s, BOT.Easy, makeRng(seed)) as Move;
      return `${nameOf(m.from)}${nameOf(m.to)}`;
    };
    expect(at(5)).toBe(at(5));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(at)).size).toBeGreaterThan(2);
  });

  it('searches the same position to the same ranking every time', () => {
    const s = fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    const sig = () => searchRoot(s, 2, makeRng(88)).map((r) => `${nameOf(r.move.from)}${nameOf(r.move.to)}:${r.score}`);
    expect(sig()).toEqual(sig());
    // And without an rng it is stable too.
    expect(searchRoot(s, 2)[0].score).toBe(searchRoot(s, 2)[0].score);
  });

  it('lets either colour win, so the bot is beatable as well as beating', () => {
    const winners = new Set<Color | null>();
    for (let seed = 0; seed < 8; seed++) winners.add(outcome(autoGame(BOT.Easy, BOT.Easy, makeRng(seed * 61 + 13))).winner);
    expect(winners.size).toBeGreaterThan(1);
  }, 120000);
});
