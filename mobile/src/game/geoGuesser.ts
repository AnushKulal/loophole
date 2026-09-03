/**
 * GeoGuesser — three rounds of "where on Earth is this?".
 *
 * There is no imagery to fetch, so a round's "view" is a stylised scene
 * *generated from the location's own cues*: the sky and ground colour come from
 * its climate, the silhouette from its terrain, the greenery from its
 * vegetation, the skyline from its architecture, and the road sign carries a
 * real word in the local script on the correct side of the road. Every one of
 * those is a fact about the place, so the picture is genuinely readable — a
 * pagoda under pines beside a left-hand road with 止まれ on the sign is Japan,
 * and nothing about it is decoration.
 *
 * Everything here is pure: state is plain data, transitions return new state,
 * and both the bots and the scene layout are driven by an injected `Rng`.
 */

import { makeRng, shuffle, type BotProfile, type Rng } from './contract';

// ── the world ─────────────────────────────────────────────────────

export type Climate = 'polar' | 'boreal' | 'temperate' | 'mediterranean' | 'arid' | 'tropical' | 'highland';
export type Terrain = 'mountains' | 'dunes' | 'flat' | 'coast';
export type Vegetation = 'palms' | 'pines' | 'scrub' | 'none';
export type Architecture = 'lowrise' | 'pagoda' | 'adobe' | 'glass';
export type Script = 'latin' | 'cyrillic' | 'greek' | 'arabic' | 'devanagari' | 'cjk' | 'hangul' | 'thai';
export type Drive = 'left' | 'right';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Place extends LatLon {
  id: string;
  name: string;
  country: string;
  /** Named at the reveal, never before it. */
  region: string;
  climate: Climate;
  terrain: Terrain;
  vegetation: Vegetation;
  architecture: Architecture;
  script: Script;
  /** What the road sign reads — a real word, in the local script. */
  sign: string;
  /** Which side they drive on, which is what side the sign stands on. */
  drive: Drive;
  /** The one line of "you should have spotted this", shown at the reveal. */
  tell: string;
}

/**
 * Twenty-seven real places, chosen so that no two share the whole cue set —
 * every scene has at least one attribute that separates it from its neighbours.
 */
export const PLACES: Place[] = [
  {
    id: 'reykjavik',
    name: 'Reykjavík',
    country: 'Iceland',
    region: 'North Atlantic',
    lat: 64.13,
    lon: -21.9,
    climate: 'polar',
    terrain: 'coast',
    vegetation: 'none',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'MIÐBÆR',
    drive: 'right',
    tell: 'A treeless volcanic coast with low painted houses, and an eð on the sign — sub-arctic North Atlantic.',
  },
  {
    id: 'tromso',
    name: 'Tromsø',
    country: 'Norway',
    region: 'Arctic Scandinavia',
    lat: 69.65,
    lon: 18.96,
    climate: 'polar',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'SENTRUM',
    drive: 'right',
    tell: 'Pale low sun, spruce to the waterline and SENTRUM on the sign — far northern Scandinavia.',
  },
  {
    id: 'ushuaia',
    name: 'Ushuaia',
    country: 'Argentina',
    region: 'Tierra del Fuego',
    lat: -54.8,
    lon: -68.3,
    climate: 'polar',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'Cold light and southern beech under jagged peaks, but the sign is Spanish — the far south of the Americas.',
  },
  {
    id: 'banff',
    name: 'Banff',
    country: 'Canada',
    region: 'Canadian Rockies',
    lat: 51.18,
    lon: -115.57,
    climate: 'boreal',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'DOWNTOWN',
    drive: 'right',
    tell: 'Dense conifer, big grey peaks and the word DOWNTOWN — North America, and high enough to be Canadian.',
  },
  {
    id: 'moscow',
    name: 'Moscow',
    country: 'Russia',
    region: 'Eastern Europe',
    lat: 55.76,
    lon: 37.62,
    climate: 'boreal',
    terrain: 'flat',
    vegetation: 'pines',
    architecture: 'glass',
    script: 'cyrillic',
    sign: 'ЦЕНТР',
    drive: 'right',
    tell: 'Cyrillic on the sign, birch-and-pine flatland, and towers on the skyline — the Russian plain.',
  },
  {
    id: 'edinburgh',
    name: 'Edinburgh',
    country: 'United Kingdom',
    region: 'Northern Europe',
    lat: 55.95,
    lon: -3.19,
    climate: 'temperate',
    terrain: 'coast',
    vegetation: 'scrub',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CITY CENTRE',
    drive: 'left',
    tell: 'Grey coastal light, stone terraces, English wording — and they drive on the left. Britain.',
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    country: 'Netherlands',
    region: 'Western Europe',
    lat: 52.37,
    lon: 4.9,
    climate: 'temperate',
    terrain: 'flat',
    vegetation: 'none',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CENTRUM',
    drive: 'right',
    tell: 'Dead flat, no relief at all, narrow brick frontages and CENTRUM — the Low Countries.',
  },
  {
    id: 'kyoto',
    name: 'Kyoto',
    country: 'Japan',
    region: 'East Asia',
    lat: 35.01,
    lon: 135.77,
    climate: 'temperate',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'pagoda',
    script: 'cjk',
    sign: '中央',
    drive: 'left',
    tell: 'Tiered temple roofs, wooded hills, kanji on the sign and left-hand traffic — Japan.',
  },
  {
    id: 'seoul',
    name: 'Seoul',
    country: 'South Korea',
    region: 'East Asia',
    lat: 37.57,
    lon: 126.98,
    climate: 'temperate',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'glass',
    script: 'hangul',
    sign: '시내',
    drive: 'right',
    tell: 'Hangul is circles and boxes, not strokes — Korea. Towers pressed up against forested granite hills.',
  },
  {
    id: 'shanghai',
    name: 'Shanghai',
    country: 'China',
    region: 'East Asia',
    lat: 31.23,
    lon: 121.47,
    climate: 'temperate',
    terrain: 'flat',
    vegetation: 'scrub',
    architecture: 'glass',
    script: 'cjk',
    sign: '市中心',
    drive: 'right',
    tell: 'Han characters with no kana mixed in, a flat delta and a wall of towers — eastern China.',
  },
  {
    id: 'athens',
    name: 'Athens',
    country: 'Greece',
    region: 'Southern Europe',
    lat: 37.98,
    lon: 23.73,
    climate: 'mediterranean',
    terrain: 'coast',
    vegetation: 'scrub',
    architecture: 'lowrise',
    script: 'greek',
    sign: 'ΚΕΝΤΡΟ',
    drive: 'right',
    tell: 'Greek letters, bleached limestone scrub and a hard blue sea — the eastern Mediterranean.',
  },
  {
    id: 'seville',
    name: 'Seville',
    country: 'Spain',
    region: 'Southern Europe',
    lat: 37.39,
    lon: -5.98,
    climate: 'mediterranean',
    terrain: 'flat',
    vegetation: 'palms',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'Date palms over pale plaster on a flat river plain, Spanish wording, right-hand traffic — Andalusia.',
  },
  {
    id: 'capetown',
    name: 'Cape Town',
    country: 'South Africa',
    region: 'Southern Africa',
    lat: -33.92,
    lon: 18.42,
    climate: 'mediterranean',
    terrain: 'coast',
    vegetation: 'scrub',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'STAD',
    drive: 'left',
    tell: 'Mediterranean scrub beside a cold ocean, English-adjacent wording, and they drive on the left — the Cape.',
  },
  {
    id: 'santiago',
    name: 'Santiago',
    country: 'Chile',
    region: 'Southern South America',
    lat: -33.45,
    lon: -70.67,
    climate: 'mediterranean',
    terrain: 'mountains',
    vegetation: 'scrub',
    architecture: 'glass',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'A dry scrub basin with a huge wall of mountains right behind the towers — the Andean side of Chile.',
  },
  {
    id: 'marrakesh',
    name: 'Marrakesh',
    country: 'Morocco',
    region: 'North Africa',
    lat: 31.63,
    lon: -7.99,
    climate: 'arid',
    terrain: 'dunes',
    vegetation: 'palms',
    architecture: 'adobe',
    script: 'arabic',
    sign: 'المدينة',
    drive: 'right',
    tell: 'Red mud-brick, palms and Arabic script on the dry western edge of the Sahara.',
  },
  {
    id: 'cairo',
    name: 'Cairo',
    country: 'Egypt',
    region: 'North Africa',
    lat: 30.04,
    lon: 31.24,
    climate: 'arid',
    terrain: 'dunes',
    vegetation: 'palms',
    architecture: 'lowrise',
    script: 'arabic',
    sign: 'الميدان',
    drive: 'right',
    tell: 'Sand haze, date palms and unfinished brick blocks under Arabic signage — the Nile.',
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'United Arab Emirates',
    region: 'Arabian Peninsula',
    lat: 25.2,
    lon: 55.27,
    climate: 'arid',
    terrain: 'dunes',
    vegetation: 'palms',
    architecture: 'glass',
    script: 'arabic',
    sign: 'المركز',
    drive: 'right',
    tell: 'Glass towers standing straight out of the dunes, Arabic script — the Gulf, not the Sahara.',
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    country: 'India',
    region: 'South Asia',
    lat: 26.91,
    lon: 75.79,
    climate: 'arid',
    terrain: 'flat',
    vegetation: 'scrub',
    architecture: 'adobe',
    script: 'devanagari',
    sign: 'केंद्र',
    drive: 'left',
    tell: 'Devanagari hangs from a bar across the top. Dry thorn scrub, ochre plaster, left-hand traffic — northern India.',
  },
  {
    id: 'alicesprings',
    name: 'Alice Springs',
    country: 'Australia',
    region: 'Central Australia',
    lat: -23.7,
    lon: 133.88,
    climate: 'arid',
    terrain: 'dunes',
    vegetation: 'scrub',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CITY',
    drive: 'left',
    tell: 'Red sand and spinifex, plain English on the sign, left-hand traffic — the Australian interior.',
  },
  {
    id: 'kathmandu',
    name: 'Kathmandu',
    country: 'Nepal',
    region: 'Himalaya',
    lat: 27.72,
    lon: 85.32,
    climate: 'highland',
    terrain: 'mountains',
    vegetation: 'pines',
    architecture: 'pagoda',
    script: 'devanagari',
    sign: 'सहर',
    drive: 'left',
    tell: 'Tiered pagoda roofs *and* Devanagari, thin blue highland light, huge peaks — the Himalayan foothills.',
  },
  {
    id: 'nairobi',
    name: 'Nairobi',
    country: 'Kenya',
    region: 'East Africa',
    lat: -1.29,
    lon: 36.82,
    climate: 'highland',
    terrain: 'flat',
    vegetation: 'scrub',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'MJINI',
    drive: 'left',
    tell: 'Swahili wording, high open savannah, left-hand traffic — East Africa, near the equator.',
  },
  {
    id: 'cusco',
    name: 'Cusco',
    country: 'Peru',
    region: 'Andes',
    lat: -13.53,
    lon: -71.97,
    climate: 'highland',
    terrain: 'mountains',
    vegetation: 'scrub',
    architecture: 'adobe',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'Adobe and terracotta at thin-air altitude with Spanish signage — the central Andes.',
  },
  {
    id: 'bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    region: 'Southeast Asia',
    lat: 13.76,
    lon: 100.5,
    climate: 'tropical',
    terrain: 'flat',
    vegetation: 'palms',
    architecture: 'glass',
    script: 'thai',
    sign: 'ในเมือง',
    drive: 'left',
    tell: 'Looping Thai script, a flat humid delta, towers and palms, left-hand traffic — Thailand.',
  },
  {
    id: 'ubud',
    name: 'Ubud',
    country: 'Indonesia',
    region: 'Southeast Asia',
    lat: -8.51,
    lon: 115.26,
    climate: 'tropical',
    terrain: 'mountains',
    vegetation: 'palms',
    architecture: 'pagoda',
    script: 'latin',
    sign: 'PUSAT KOTA',
    drive: 'left',
    tell: 'Tiered temple roofs but Latin letters in Malay, volcanic ridges and palms — the Indonesian islands.',
  },
  {
    id: 'rio',
    name: 'Rio de Janeiro',
    country: 'Brazil',
    region: 'Southeast Brazil',
    lat: -22.91,
    lon: -43.17,
    climate: 'tropical',
    terrain: 'coast',
    vegetation: 'palms',
    architecture: 'glass',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'Tropical forest running straight down to a warm ocean beside high-rise blocks, Portuguese wording — Brazil.',
  },
  {
    id: 'havana',
    name: 'Havana',
    country: 'Cuba',
    region: 'Caribbean',
    lat: 23.11,
    lon: -82.37,
    climate: 'tropical',
    terrain: 'coast',
    vegetation: 'palms',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CENTRO',
    drive: 'right',
    tell: 'Faded colonnades two storeys high, royal palms, warm sea, Spanish wording — the Caribbean.',
  },
  {
    id: 'lagos',
    name: 'Lagos',
    country: 'Nigeria',
    region: 'West Africa',
    lat: 6.52,
    lon: 3.38,
    climate: 'tropical',
    terrain: 'coast',
    vegetation: 'palms',
    architecture: 'lowrise',
    script: 'latin',
    sign: 'CITY CENTRE',
    drive: 'right',
    tell: 'Equatorial coast, oil palms, English wording — but right-hand traffic, which rules out East Africa.',
  },
];

export const SCRIPT_LABEL: Record<Script, string> = {
  latin: 'Latin',
  cyrillic: 'Cyrillic',
  greek: 'Greek',
  arabic: 'Arabic',
  devanagari: 'Devanagari',
  cjk: 'Han characters',
  hangul: 'Hangul',
  thai: 'Thai',
};

export const CLIMATE_LABEL: Record<Climate, string> = {
  polar: 'Sub-polar',
  boreal: 'Boreal',
  temperate: 'Temperate',
  mediterranean: 'Mediterranean',
  arid: 'Arid',
  tropical: 'Tropical',
  highland: 'Highland',
};

// ── geometry ──────────────────────────────────────────────────────

export const EARTH_KM = 6371;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
/** Four decimals is about eleven metres — plenty, and it keeps state tidy. The
 *  `+ 0` folds a negative zero back to zero so pins compare cleanly. */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4 + 0;

/** Wrap a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  let v = ((lon + 180) % 360 + 360) % 360 - 180;
  if (Object.is(v, -0)) v = 0;
  return v;
}

/** A point pulled back onto the globe: latitude clamped, longitude wrapped. */
export const normalise = (p: LatLon): LatLon => ({ lat: r4(clamp(p.lat, -90, 90)), lon: r4(wrapLon(p.lon)) });

export const onEarth = (p: LatLon): boolean =>
  Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180;

/** Great-circle distance in kilometres. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Walk `km` from `from` along `bearing` degrees, great-circle. */
export function destination(from: LatLon, bearing: number, km: number): LatLon {
  const d = km / EARTH_KM;
  const br = rad(bearing);
  const lat1 = rad(from.lat);
  const lon1 = rad(from.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 =
    lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return normalise({ lat: deg(lat2), lon: deg(lon2) });
}

// ── the map ───────────────────────────────────────────────────────

/** The equirectangular canvas: one unit of x per degree of longitude. */
export const MAP_W = 360;
export const MAP_H = 180;

export const toXY = (p: LatLon, w = MAP_W, h = MAP_H) => ({
  x: ((wrapLon(p.lon) + 180) / 360) * w,
  y: ((90 - clamp(p.lat, -90, 90)) / 180) * h,
});

/** The inverse — what a tap at (x, y) on a `w`×`h` map means. */
export function toLatLon(x: number, y: number, w = MAP_W, h = MAP_H): LatLon {
  // Total by construction: a non-finite tap maps to the map's origin rather
  // than propagating NaN into a pin's coordinates.
  const fx = Number.isFinite(x) ? x : 0;
  const fy = Number.isFinite(y) ? y : 0;
  return {
    lat: r4(90 - clamp(fy / h, 0, 1) * 180),
    lon: r4(clamp(fx / w, 0, 1) * 360 - 180),
  };
}

/**
 * Coastlines, drastically simplified, in the same 360×180 space as `toXY`.
 * Enough shape to aim at a country, not enough to survey one.
 */
export const CONTINENTS: { id: string; d: string }[] = [
  {
    id: 'north-america',
    d: 'M12,24 L24,19 L50,20 L85,16 L100,17 L118,30 L124,39 L115,45 L106,50 L99,58 L100,65 L90,61 L83,64 L85,72 L90,75 L97,81 L103,82 L96,76 L83,74 L75,70 L70,66 L66,62 L63,57 L56,50 L56,42 L45,33 L30,31 L15,30 Z',
  },
  { id: 'greenland', d: 'M135,30 L125,20 L120,14 L135,7 L155,10 L160,20 L138,29 Z' },
  { id: 'caribbean', d: 'M95,69 L102,67 L106,68 L104,70 L98,70 Z' },
  {
    id: 'south-america',
    d: 'M99,85 L104,80 L120,79 L128,85 L136,92 L145,96 L141,108 L132,115 L122,125 L118,131 L115,140 L112,145 L107,135 L107,125 L109,110 L104,104 L99,95 L100,88 Z',
  },
  {
    id: 'africa',
    d: 'M163,75 L174,54 L190,53 L205,58 L215,59 L223,79 L231,78 L221,92 L220,105 L215,115 L212,119 L200,125 L194,112 L192,96 L189,86 L180,85 L172,85 L167,81 Z',
  },
  { id: 'madagascar', d: 'M224,103 L228,106 L230,113 L227,116 L224,111 Z' },
  {
    id: 'eurasia',
    d: 'M170,47 L171,51 L174,54 L183,48 L192,45 L198,50 L204,50 L210,49 L216,54 L215,57 L214,62 L224,77 L236,65 L240,65 L247,66 L253,70 L257,82 L260,77 L269,68 L275,74 L280,84 L284,80 L289,76 L288,69 L300,67 L302,59 L299,51 L306,50 L309,47 L315,35 L322,30 L340,30 L350,24 L360,25 L360,20 L340,20 L320,17 L290,14 L255,18 L240,20 L220,22 L210,20 L200,20 L190,27 L185,32 L184,38 L178,42 Z',
  },
  { id: 'britain', d: 'M174,36 L178,34 L179,39 L176,42 L173,40 Z' },
  { id: 'iceland', d: 'M158,26 L162,24 L166,25 L164,27 L159,27 Z' },
  { id: 'japan', d: 'M311,59 L314,55 L320,50 L326,46 L327,48 L321,53 L316,58 L313,61 Z' },
  { id: 'philippines', d: 'M298,76 L302,74 L303,80 L300,82 Z' },
  { id: 'borneo', d: 'M288,86 L296,86 L297,93 L290,92 Z' },
  { id: 'sunda', d: 'M275,88 L284,95 L295,97 L300,97 L296,99 L283,98 L275,92 Z' },
  { id: 'new-guinea', d: 'M310,95 L322,97 L330,99 L328,101 L316,99 L309,97 Z' },
  { id: 'sri-lanka', d: 'M260,81 L262,80 L262,83 L260,84 Z' },
  {
    id: 'australia',
    d: 'M294,112 L302,108 L310,102 L317,102 L322,101 L326,109 L333,115 L333,123 L330,127 L321,128 L316,125 L309,122 L298,125 L295,122 L294,116 Z',
  },
  { id: 'new-zealand', d: 'M346,131 L349,128 L351,133 L348,138 L345,135 Z' },
  {
    id: 'antarctica',
    d: 'M0,166 L40,164 L90,168 L140,163 L200,167 L260,163 L320,168 L360,165 L360,180 L0,180 Z',
  },
];

// ── scoring ───────────────────────────────────────────────────────

export const MAX_POINTS = 5000;
/** Beyond this you have scored nothing at all. */
export const ZERO_KM = 5000;
const FALLOFF = 1500;
const FLOOR = Math.exp(-ZERO_KM / FALLOFF);

/**
 * 5000 points on the nose, decaying exponentially and hitting exactly 0 at
 * 5000 km: 4665 at 100 km, 3530 at 500 km, 2477 at 1000 km, 517 at 3000 km.
 */
export function scoreFor(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return MAX_POINTS;
  if (km >= ZERO_KM) return 0;
  return Math.round((MAX_POINTS * (Math.exp(-km / FALLOFF) - FLOOR)) / (1 - FLOOR));
}

/** Thousands separators without leaning on Intl, which Hermes only half has. */
export function group(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const formatKm = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${group(km)} km`);

// ── match state ───────────────────────────────────────────────────

export const ROUNDS = 3;

export type Phase = 'guess' | 'reveal' | 'over';

export interface GeoState {
  seats: number;
  rounds: number;
  /** Which round is live (or, once over, the last one played). */
  round: number;
  /** One place per round, drawn up front so a seed replays exactly. */
  places: Place[];
  /** [round][seat] — null until that seat has committed a pin. */
  guesses: (LatLon | null)[][];
  /** [round][seat] — filled by `closeRound`. */
  km: number[][];
  points: number[][];
  totals: number[];
  /** Seat that took each round; null while the round is unscored. */
  winners: (number | null)[];
  phase: Phase;
  log: string[];
}

const grid = <T,>(rows: number, cols: number, v: T): T[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => v));

/** Deal a match: `rounds` distinct places, nobody has guessed yet. */
export function deal(seats: number, rounds: number = ROUNDS, rng: Rng = makeRng(1)): GeoState {
  if (!Number.isInteger(seats) || seats < 2) throw new Error('a match needs at least two seats');
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('a match needs at least one round');
  if (rounds > PLACES.length) throw new Error('not enough places for that many rounds');

  const places = shuffle(PLACES, rng).slice(0, rounds);
  return {
    seats,
    rounds,
    round: 0,
    places,
    guesses: grid<LatLon | null>(rounds, seats, null),
    km: grid(rounds, seats, 0),
    points: grid(rounds, seats, 0),
    totals: Array.from({ length: seats }, () => 0),
    winners: Array.from({ length: rounds }, () => null as number | null),
    phase: 'guess',
    log: ['Round 1 — where are you?'],
  };
}

export type GuessProblem = 'not-guessing' | 'off-table' | 'already-guessed' | 'off-globe';

export const GUESS_MESSAGE: Record<GuessProblem, string> = {
  'not-guessing': 'The round is not open for guesses',
  'off-table': 'That seat is not at this table',
  'already-guessed': 'That pin is already committed',
  'off-globe': 'That point is not on the globe',
};

export function guessProblem(s: GeoState, seat: number, at: LatLon): GuessProblem | null {
  if (s.phase !== 'guess') return 'not-guessing';
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.seats) return 'off-table';
  if (!onEarth(at)) return 'off-globe';
  if (s.guesses[s.round][seat] !== null) return 'already-guessed';
  return null;
}

export const isLegalGuess = (s: GeoState, seat: number, at: LatLon) => guessProblem(s, seat, at) === null;

/** Commit a pin. Throws on an illegal one — check `guessProblem` first. */
export function submitGuess(s: GeoState, seat: number, at: LatLon): GeoState {
  const bad = guessProblem(s, seat, at);
  if (bad) throw new Error(GUESS_MESSAGE[bad]);

  const guesses = s.guesses.map((r) => r.slice());
  guesses[s.round][seat] = normalise(at);
  return { ...s, guesses, log: s.log.concat(`Seat ${seat} dropped a pin`) };
}

/** Has every seat committed a pin for the live round? */
export const allIn = (s: GeoState) => s.guesses[s.round].every((g) => g !== null);

/** Seats still to guess this round. */
export const waitingOn = (s: GeoState) =>
  s.guesses[s.round].map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0);

/**
 * Score the live round: distance, points, and the seat that took it. Ties on
 * distance fall to the lower seat, so a round always has exactly one winner.
 */
export function closeRound(s: GeoState): GeoState {
  if (s.phase !== 'guess') throw new Error('the round is not open');
  if (!allIn(s)) throw new Error('not every seat has guessed');

  const place = s.places[s.round];
  const km = s.km.map((r) => r.slice());
  const points = s.points.map((r) => r.slice());
  const totals = s.totals.slice();
  const winners = s.winners.slice();

  let best = Infinity;
  let winner = 0;
  for (let seat = 0; seat < s.seats; seat++) {
    const d = haversine(s.guesses[s.round][seat] as LatLon, place);
    km[s.round][seat] = d;
    points[s.round][seat] = scoreFor(d);
    totals[seat] += points[s.round][seat];
    if (d < best) {
      best = d;
      winner = seat;
    }
  }
  winners[s.round] = winner;

  return {
    ...s,
    km,
    points,
    totals,
    winners,
    phase: 'reveal',
    log: s.log.concat(`It was ${place.name}, ${place.country} — seat ${winner} was closest at ${formatKm(best)}`),
  };
}

/** Move on: the next round, or the end of the match. */
export function nextRound(s: GeoState): GeoState {
  if (s.phase !== 'reveal') throw new Error('the round is not over');
  const next = s.round + 1;
  if (next >= s.rounds) return { ...s, phase: 'over', log: s.log.concat('Match over') };
  return { ...s, round: next, phase: 'guess', log: s.log.concat(`Round ${next + 1} — where are you?`) };
}

export const isOver = (s: GeoState) => s.phase === 'over';

export interface RoundRow {
  seat: number;
  guess: LatLon | null;
  km: number;
  points: number;
  win: boolean;
}

/** One scored round, nearest guess first. */
export function roundTable(s: GeoState, round: number): RoundRow[] {
  const rows: RoundRow[] = [];
  for (let seat = 0; seat < s.seats; seat++) {
    rows.push({
      seat,
      guess: s.guesses[round][seat],
      km: s.km[round][seat],
      points: s.points[round][seat],
      win: s.winners[round] === seat,
    });
  }
  return rows.sort((a, b) => a.km - b.km || a.seat - b.seat);
}

/** A seat's closest guess so far, or Infinity if it has not been scored yet. */
export function bestKm(s: GeoState, seat: number): number {
  let best = Infinity;
  for (let r = 0; r < s.rounds; r++) if (s.winners[r] !== null) best = Math.min(best, s.km[r][seat]);
  return best;
}

export interface Standing {
  seat: number;
  total: number;
  /** Rounds this seat took. */
  won: number;
  best: number;
  rank: number;
}

/**
 * The table, best first: points, then — for the rare dead heat, including
 * everyone scoring zero — the single closest pin, then seat order. That
 * ordering is total, so `matchWinner` is always exactly one seat.
 */
export function standings(s: GeoState): Standing[] {
  const rows = Array.from({ length: s.seats }, (_, seat) => ({
    seat,
    total: s.totals[seat],
    won: s.winners.filter((w) => w === seat).length,
    best: bestKm(s, seat),
    rank: 0,
  }));
  rows.sort((a, b) => b.total - a.total || a.best - b.best || a.seat - b.seat);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

export const matchWinner = (s: GeoState): number => standings(s)[0].seat;

/** XP for a seat, scaled off its points so a good match is worth more. */
export const xpFor = (total: number) => Math.round(total / 25);

// ── the bots ──────────────────────────────────────────────────────

/**
 * How far off a bot lands, in kilometres, before it gets unlucky. Sharp
 * (skill 1) is inside 250 km, Normal (0.7) inside ~1,330, Easy (0.35) inside
 * ~2,590 — the difference between naming the city and naming the continent.
 */
export const botError = (bot: BotProfile) => 250 + (1 - bot.skill) * 3600;

/** A blunder is the bot reading the scene as the wrong continent entirely. */
export const BLUNDER_MIN_KM = 2500;
export const BLUNDER_SPAN_KM = 6500;

/**
 * A bot's pin: it "reads" the scene correctly to within its own error radius,
 * except on a blunder, when it lands on the wrong continent. Always a real
 * point on the globe, whatever the profile.
 */
export function botGuess(place: Place, bot: BotProfile, rng: Rng): LatLon {
  const blundered = rng() < bot.blunder;
  const bearing = rng() * 360;
  const reach = blundered
    ? BLUNDER_MIN_KM + rng() * BLUNDER_SPAN_KM
    : botError(bot) * (0.25 + 0.75 * rng());
  return destination(place, bearing, reach);
}

/** Every seat that has yet to guess, filled in by a bot. */
export function botFill(s: GeoState, bot: BotProfile, rng: Rng): GeoState {
  let next = s;
  for (const seat of waitingOn(s)) next = submitGuess(next, seat, botGuess(s.places[s.round], bot, rng));
  return next;
}

// ── the generated scene ───────────────────────────────────────────

/**
 * Scene palette. Like `UC` in `uno.ts`, these are game-piece colours rather
 * than chrome — a sky has to be sky-coloured, and the theme has no token for
 * "Saharan afternoon". Nothing here is used for UI.
 */
export const SKY: Record<Climate, [string, string]> = {
  polar: ['#7d9cb8', '#dfe9f0'],
  boreal: ['#5f86b4', '#cfe0ee'],
  temperate: ['#5e93d8', '#d8e8f7'],
  mediterranean: ['#2f86d4', '#ecdfc2'],
  arid: ['#6f9fc8', '#f2dda9'],
  tropical: ['#2f9ad6', '#e9f3f0'],
  highland: ['#2c66bd', '#cfe2f5'],
};

/** near ground, far ground (hazier). */
export const LAND: Record<Climate, [string, string]> = {
  polar: ['#cfdae2', '#a8bbc9'],
  boreal: ['#3c5a45', '#66798b'],
  temperate: ['#4e7a46', '#7d96a9'],
  mediterranean: ['#8a8750', '#a89f87'],
  arid: ['#c8a263', '#d9c197'],
  tropical: ['#2e7a4f', '#7ea78f'],
  highland: ['#7d6f4f', '#96a3b4'],
};

export const WATER: Record<Climate, string> = {
  polar: '#4a6d86',
  boreal: '#3f6480',
  temperate: '#3d6c92',
  mediterranean: '#1f6fae',
  arid: '#2c7ea6',
  tropical: '#1a9ab4',
  highland: '#3f6f96',
};

export const BUILD: Record<Architecture, [string, string]> = {
  lowrise: ['#d3d6da', '#8d9199'],
  pagoda: ['#a8483a', '#6d3128'],
  adobe: ['#c98a55', '#94603a'],
  glass: ['#9dc0d6', '#4f7893'],
};

export const PLANT: Record<Vegetation, string> = {
  palms: '#256b3f',
  pines: '#23452f',
  scrub: '#6f7c46',
  none: '#000000',
};

export const TRUNK = '#7d6a49';
export const TRUNK_DARK = '#5c4a35';
export const SUN = '#ffffff';
export const SIGN_FACE = '#1f6b4a';
export const SIGN_INK = '#f2f7f4';
export const SIGN_POST = '#8d9199';
export const ROAD = '#4c5058';
export const ROAD_LINE = '#e6e2d4';

export const SCENE_W = 320;
export const SCENE_H = 172;
export const HORIZON = 92;
/** The road's vanishing edges at the horizon and at the bottom of the frame. */
export const ROAD_TOP: [number, number] = [152, 168];
export const ROAD_BOTTOM: [number, number] = [40, 280];

export interface ScenePlant {
  x: number;
  y: number;
  /** 1 is the nominal size for that species. */
  s: number;
  kind: Exclude<Vegetation, 'none'>;
}

export interface SceneBuilding {
  x: number;
  w: number;
  h: number;
  kind: Architecture;
}

export interface SceneSign {
  text: string;
  script: Script;
  /** Post foot, board box. */
  postX: number;
  postY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Points the way the traffic runs. */
  arrow: Drive;
}

export interface SceneSpec {
  sky: [string, string];
  sun: { x: number; y: number; r: number };
  land: string;
  landFar: string;
  /** Set only for a coast — the band of sea between horizon and shore. */
  water: { fill: string; d: string } | null;
  ridgeFar: string;
  ridge: string;
  ridgeFarFill: string;
  ridgeFill: string;
  buildings: SceneBuilding[];
  plants: ScenePlant[];
  sign: SceneSign;
  drive: Drive;
  /** Where things stand: behind the shore on a coast, at the horizon otherwise. */
  standY: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Where the road's edges are at depth `y`. */
export function roadEdges(y: number): [number, number] {
  const t = clamp((y - HORIZON) / (SCENE_H - HORIZON), 0, 1);
  return [ROAD_TOP[0] + (ROAD_BOTTOM[0] - ROAD_TOP[0]) * t, ROAD_TOP[1] + (ROAD_BOTTOM[1] - ROAD_TOP[1]) * t];
}

function jagged(rng: Rng, base: number, minH: number, maxH: number): string {
  let d = `M-12,${base + 46}L-12,${r1(base - rng() * minH)}`;
  let x = -12;
  while (x < SCENE_W + 12) {
    const w = 26 + rng() * 34;
    d += `L${r1(x + w / 2)},${r1(base - (minH + rng() * (maxH - minH)))}`;
    x += w;
    d += `L${r1(x)},${r1(base - rng() * minH * 0.5)}`;
  }
  return `${d}L${r1(x)},${base + 46}Z`;
}

function rolling(rng: Rng, base: number, amp: number): string {
  let d = `M-12,${base + 46}L-12,${r1(base - amp * 0.4)}`;
  let x = -12;
  while (x < SCENE_W + 12) {
    const w = 44 + rng() * 44;
    const h = amp * (0.45 + rng());
    d += `Q${r1(x + w / 2)},${r1(base - h)} ${r1(x + w)},${r1(base - h * 0.28)}`;
    x += w;
  }
  return `${d}L${r1(x)},${base + 46}Z`;
}

function shoreline(rng: Rng, from: number, to: number): string {
  let d = `M0,${from}L${SCENE_W},${from}L${SCENE_W},${r1(to)}`;
  let x = SCENE_W;
  while (x > 0) {
    const w = 60 + rng() * 40;
    d += `Q${r1(x - w / 2)},${r1(to + (rng() * 7 - 3.5))} ${r1(Math.max(0, x - w))},${r1(to)}`;
    x -= w;
  }
  return `${d}Z`;
}

const BUILDING_H: Record<Architecture, [number, number]> = {
  lowrise: [16, 30],
  pagoda: [26, 40],
  adobe: [13, 24],
  glass: [40, 78],
};

const BUILDING_W: Record<Architecture, [number, number]> = {
  lowrise: [17, 28],
  pagoda: [26, 38],
  adobe: [16, 26],
  glass: [13, 22],
};

const PLANT_COUNT: Record<Vegetation, [number, number]> = {
  palms: [4, 7],
  pines: [6, 10],
  scrub: [5, 9],
  none: [0, 0],
};

/**
 * Lay out a scene from a place's cues. Same place, same seed, same picture —
 * so a reveal can be replayed and the tests can assert on the geometry.
 */
export function scene(place: Place, rng: Rng): SceneSpec {
  const coast = place.terrain === 'coast';
  const shoreY = HORIZON + 24;
  const standY = coast ? shoreY + 16 : HORIZON + 20;

  const ridgeFar =
    place.terrain === 'mountains'
      ? jagged(rng, HORIZON, 30, 58)
      : place.terrain === 'dunes'
        ? rolling(rng, HORIZON, 13)
        : rolling(rng, HORIZON, place.terrain === 'coast' ? 5 : 4);

  const ridge =
    place.terrain === 'mountains'
      ? jagged(rng, HORIZON + 4, 12, 26)
      : place.terrain === 'dunes'
        ? rolling(rng, HORIZON + 4, 18)
        : rolling(rng, HORIZON + 4, place.terrain === 'coast' ? 3 : 6);

  // Buildings cluster either side of the road corridor so nothing stands in it.
  const [bLo, bHi] = BUILDING_H[place.architecture];
  const [wLo, wHi] = BUILDING_W[place.architecture];
  const count = place.architecture === 'pagoda' ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 3);
  const buildings: SceneBuilding[] = [];
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const w = r1(wLo + rng() * (wHi - wLo));
    const x = r1(left ? 14 + rng() * 92 : 206 + rng() * 92);
    buildings.push({ x, w, h: r1(bLo + rng() * (bHi - bLo)), kind: place.architecture });
  }
  buildings.sort((a, b) => a.x - b.x);

  const plants: ScenePlant[] = [];
  if (place.vegetation !== 'none') {
    const [pLo, pHi] = PLANT_COUNT[place.vegetation];
    const n = pLo + Math.floor(rng() * (pHi - pLo + 1));
    for (let i = 0; i < n; i++) {
      // Depth first, then a slot outside the road at that depth.
      const y = r1(standY + rng() * (SCENE_H - standY - 6));
      const [lo, hi] = roadEdges(y);
      const left = rng() < 0.5;
      const x = r1(left ? rng() * Math.max(6, lo - 10) : hi + 10 + rng() * Math.max(6, SCENE_W - hi - 12));
      plants.push({ x, y, s: r1(0.7 + rng() * 0.6), kind: place.vegetation });
    }
    plants.sort((a, b) => a.y - b.y);
  }

  // The sign stands on the side they drive on, at the near edge of the road.
  const postY = 154;
  const [lo, hi] = roadEdges(postY);
  const postX = r1(place.drive === 'left' ? Math.max(16, lo - 16) : Math.min(SCENE_W - 16, hi + 16));
  const w = r1(clamp(26 + place.sign.length * 8.4, 52, 120));
  const h = 24;
  const sign: SceneSign = {
    text: place.sign,
    script: place.script,
    postX,
    postY,
    x: r1(clamp(postX - w / 2, 4, SCENE_W - w - 4)),
    y: 112,
    w,
    h,
    arrow: place.drive,
  };

  const low = place.climate === 'polar' || place.climate === 'boreal';
  return {
    sky: SKY[place.climate],
    sun: { x: r1(40 + rng() * 240), y: r1(low ? HORIZON - 18 - rng() * 12 : 20 + rng() * 26), r: low ? 13 : 10 },
    land: LAND[place.climate][0],
    landFar: LAND[place.climate][1],
    water: coast ? { fill: WATER[place.climate], d: shoreline(rng, HORIZON, shoreY) } : null,
    ridgeFar,
    ridge,
    ridgeFarFill: LAND[place.climate][1],
    ridgeFill: LAND[place.climate][0],
    buildings,
    plants,
    sign,
    drive: place.drive,
    standY,
  };
}

/** A stable 32-bit hash, so a place always draws the same scene. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The canonical scene for a place — deterministic, no clock, no globals. */
export const sceneFor = (place: Place) => scene(place, makeRng(hashSeed(place.id)));
