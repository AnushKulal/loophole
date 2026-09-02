/** Connect 4 on a 7×6 grid stored row-major: index = row * 7 + col, row 0 is the top. */

export type Disc = 'you' | 'bot';
export type Board = (Disc | null)[];
export type Outcome = Disc | 'draw' | null;

export const COLS = 7;
export const ROWS = 6;

export const emptyBoard = (): Board => Array(COLS * ROWS).fill(null);

/** Lowest free row in a column, or -1 when the column is full. */
export function lowest(b: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + col]) return r;
  return -1;
}

/** The four indices of a winning line for `p`, or null. */
export function findWin(b: Board, p: Disc): number[] | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of dirs) {
        const line: number[] = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== p) {
            line.length = 0;
            break;
          }
          line.push(rr * COLS + cc);
        }
        if (line.length === 4) return line;
      }
  return null;
}

/** A copy of `b` with `p` dropped into `col`, or null if the column is full. */
export function place(b: Board, col: number, p: Disc): Board | null {
  const r = lowest(b, col);
  if (r < 0) return null;
  const n = b.slice();
  n[r * COLS + col] = p;
  return n;
}

/**
 * The bot's column: take a win if it has one, otherwise block yours,
 * otherwise favour the centre.
 */
export function botMove(b: Board): number | null {
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => lowest(b, c) >= 0);
  if (!order.length) return null;

  for (const c of order) {
    const n = place(b, c, 'bot');
    if (n && findWin(n, 'bot')) return c;
  }
  for (const c of order) {
    const n = place(b, c, 'you');
    if (n && findWin(n, 'you')) return c;
  }
  return order[Math.random() < 0.7 ? 0 : Math.min(1, order.length - 1)];
}
