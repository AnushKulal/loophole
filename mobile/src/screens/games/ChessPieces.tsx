import Svg, { Path } from 'react-native-svg';
import type { Color, PieceType } from '../../game/chess';

/**
 * The six men, drawn as vector paths rather than Unicode chess characters.
 *
 * The characters were font-dependent: no bundled family carries them, so each
 * glyph fell back separately and ♙ landed on an emoji face — a person, not a
 * pawn. Which glyphs broke would have differed by device. Paths render the same
 * everywhere and take the board's own colours.
 *
 * Each is one filled path on a 45×45 grid, sharing a common base width so the
 * set sits on one line. The contour that the old solid-over-outline pair gave
 * each man is now simply a stroke in the opposing colour.
 */
const PATHS: Record<PieceType, string> = {
  k:
    'M20.9 6.6h3.2v3.2h3.2V13h-3.2v3.4h-3.2V13h-3.2V9.8h3.2z ' +
    'M22.5 17.2c-5.2 0-9.4 2.9-9.4 6.6 0 2.5 1.3 4.6 2.8 6.4h13.2c1.5-1.8 2.8-3.9 2.8-6.4 0-3.7-4.2-6.6-9.4-6.6z ' +
    'M14.6 31.4h15.8v3.2H14.6z M11 36h23v5H11z',

  q:
    'M11.4 13.2 15 26.4h15l3.6-13.2-5 6.6-3.1-9-3 9-3.1-9-5 9z ' +
    'M14.4 28.6h16.2v3.2H14.4z M11 34.2h23v6H11z',

  r:
    'M11.6 8.4h4.8v3.4h4.2V8.4h3.8v3.4h4.2V8.4h4.8v9l-3.2 2.8v11.4l3.6 3.4v3H11.2v-3l3.6-3.4V20.2l-3.2-2.8z ' +
    'M9.6 37.8h25.8v3.4H9.6z',

  b:
    'M22.5 8.2a2.4 2.4 0 0 0-1.3 4.4c-3.1 2.3-6 5.9-6 10 0 3.2 1.7 5.5 3.7 7h7.2c2-1.5 3.7-3.8 3.7-7 0-4.1-2.9-7.7-6-10a2.4 2.4 0 0 0-1.3-4.4z ' +
    'M16.2 31.2h12.6v3.2H16.2z M11.6 36.4h21.8v4.4H11.6z',

  n:
    'M20.8 8.6c-.5 1.9-1.9 3.1-3.7 4.1l-3.9 2.2c-1.9 1.1-3 2.9-3 4.9 0 1.5.6 2.8 1.7 3.7l2.7-3c.8-.9 2.1-.4 2.1.7 0 1.8-.9 3.4-2.3 5-2.2 2.5-3.6 5.5-3.6 9.2v1.1h22.9v-2c0-6-.8-11.1-2.6-15.2-2.2-4.9-5.9-8.3-10.7-9.7-.5-.2-1.1-.4-1.3 0z ' +
    'M11.2 37.8h22.6v3.4H11.2z',

  p:
    'M22.5 9.2a5.2 5.2 0 0 0-3.1 9.4c-2.3 1.1-3.9 3.4-3.9 6 0 1.7.7 3.2 1.8 4.4-2.6 2-4.4 5.1-4.9 8.6h19.2c-.5-3.5-2.3-6.6-4.9-8.6 1.1-1.2 1.8-2.7 1.8-4.4 0-2.6-1.6-4.9-3.9-6a5.2 5.2 0 0 0-3.1-9.4z ' +
    'M11.2 37.6h22.6v3.6H11.2z',
};

export const PIECE_NAME: Record<PieceType, string> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};

/** One man, filled in `fill` with a contour in `edge`. */
export function ChessPiece({
  type,
  size,
  fill,
  edge,
  strokeWidth = 1.1,
}: {
  type: PieceType;
  size: number;
  fill: string;
  edge: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <Path d={PATHS[type]} fill={fill} stroke={edge} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * A captured man for the scoresheet strip. These sit on the page rather than on
 * a square, so they take one ink and are told apart by weight — the White men
 * hollow, the Black men solid, the way a scoresheet does.
 */
export function TakenPiece({ type, size, ink, victims }: { type: PieceType; size: number; ink: string; victims: Color }) {
  const hollow = victims === 'w';
  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <Path
        d={PATHS[type]}
        fill={hollow ? 'none' : ink}
        stroke={ink}
        strokeWidth={hollow ? 2.4 : 1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
