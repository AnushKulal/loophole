const AXES = [
  { label: 'BLUFF', x: 110, y: 10 },
  { label: 'SPEED', x: 206, y: 66 },
  { label: 'VOTES', x: 170, y: 180 },
  { label: 'SURVIVAL', x: 50, y: 180 },
  { label: 'BOARD', x: 14, y: 66 },
];

const OUTER = '110,18 197,68 164,166 56,166 23,68';
const INNER = '110,60 154,86 137,136 83,136 66,86';

/** The five-axis performance matrix on both profile screens. */
export function Radar({
  points,
  stroke,
  fill,
  width = 212,
  height = 184,
  spokes = false,
}: {
  points: string;
  stroke: string;
  fill: string;
  width?: number;
  height?: number;
  /** My profile draws the axis spokes; a player card leaves them out. */
  spokes?: boolean;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 220 190" role="img" aria-label="Performance matrix">
      <polygon points={OUTER} fill="none" stroke="var(--line2)" strokeWidth={1} />
      <polygon points={INNER} fill="none" stroke="var(--line)" strokeWidth={1} />
      {spokes &&
        [
          [110, 18],
          [197, 68],
          [164, 166],
          [56, 166],
          [23, 68],
        ].map(([x, y]) => <line key={`${x}-${y}`} x1={110} y1={92} x2={x} y2={y} stroke="var(--line)" />)}
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={2} />
      {AXES.map((a) => (
        <text key={a.label} x={a.x} y={a.y} fill="var(--dim)" fontSize={9.5} fontFamily="Outfit" textAnchor="middle">
          {a.label}
        </text>
      ))}
    </svg>
  );
}
