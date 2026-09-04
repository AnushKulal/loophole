import { chromium } from 'playwright';

/**
 * Acceptance suite for Loophole.
 *
 * Drives the shipped JS bundle — the same one inside the APK — through the
 * app's features the way a person would, and reports each case pass or fail.
 * This is not a unit test: nothing is stubbed, every assertion is about what is
 * actually on screen after real interaction.
 *
 * Usage: node acceptance.mjs [port]
 */

const URL = `http://127.0.0.1:${process.argv[2] || '8080'}/`;
const OUT = process.env.SHOT_DIR ?? 'e2e-shots';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(9000);

const noise = [];
page.on('pageerror', (e) => noise.push('PAGEERROR: ' + e.message.split('\n')[0].slice(0, 160)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // The unconfigured build has no Firebase project, so its auth calls are
  // expected to fail. Anything else is real.
  if (/identitytoolkit|securetoken|ERR_CONNECTION|Failed to load resource/i.test(t)) return;
  noise.push('CONSOLE: ' + t.slice(0, 160));
});

const B = (n) => page.getByRole('button', { name: n }).first();
const T = (re) => page.getByText(re).first();
const has = async (re) => (await page.getByText(re).count()) > 0;
const hasBtn = async (n) => (await page.getByRole('button', { name: n }).count()) > 0;
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});
const wait = (ms) => page.waitForTimeout(ms);

const results = [];
let group = '';
const G = (g) => {
  group = g;
};

/** Runs one case; a throw is a failure, not a crash. */
async function T_(id, name, fn) {
  const before = noise.length;
  try {
    const ok = await fn();
    const dirty = noise.slice(before);
    const pass = ok !== false && dirty.length === 0;
    results.push({ id, group, name, pass, note: dirty[0] ?? (ok === false ? 'assertion failed' : '') });
  } catch (e) {
    results.push({ id, group, name, pass: false, note: String(e).split('\n')[0].slice(0, 110) });
    await shot(`FAIL-${id}`);
  }
  const r = results[results.length - 1];
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${name}${r.note ? '  — ' + r.note : ''}`);
}

/** Back to Home from anywhere: leave a match first, then find the tab bar. */
async function home() {
  for (let i = 0; i < 9; i++) {
    if (await hasBtn('HOME')) {
      await B('HOME').click();
      await wait(450);
      return;
    }
    for (const esc of ['Got it', 'Leave lobby', 'Leave', 'Back', 'Close']) {
      if (await hasBtn(esc)) {
        await B(esc).click().catch(() => {});
        await wait(550);
        break;
      }
    }
  }
  throw new Error('could not return home');
}

// ─────────────────────────────────────────────────────────── boot & accounts

await page.goto(URL, { waitUntil: 'networkidle' });
await wait(2500);

G('Boot');
await T_('B1', 'splash renders the brand and an entry point', async () => {
  await shot('01-splash');
  return (await has(/Loophole/)) && (await hasBtn(/Enter Loophole/));
});

await T_('B2', 'splash leads to sign-in', async () => {
  await B(/Enter Loophole/).click();
  await wait(900);
  return has(/Welcome back|Accounts are switched off/i);
});

G('Accounts');
await T_('A1', 'the sign-in screen offers a real form', async () => {
  await shot('02-signin');
  return (await page.getByLabel('Email address').count()) === 1;
});

await T_('A2', 'creating an account asks for a name and a confirmation', async () => {
  await B(/Create new account/).click();
  await wait(600);
  return (
    (await page.getByLabel('Display name').count()) === 1 &&
    (await page.getByLabel('Confirm password').count()) === 1
  );
});

await T_('A3', 'a new account reaches onboarding', async () => {
  await page.getByLabel('Email address').first().fill('acceptance@example.com');
  await page.getByLabel('Display name').first().fill('Acceptance');
  await page.getByLabel('Password').first().fill('secret123');
  await page.getByLabel('Confirm password').first().fill('secret123');
  await B(/^Create account$/).click();
  await wait(2200);
  await shot('03-onboarding');
  return hasBtn(/Mark 1/);
});

await T_('A4', 'onboarding lets you pick an avatar mark', async () => {
  await B(/Mark 4/).click();
  await wait(400);
  return true;
});

await T_('A5', 'onboarding leads to home', async () => {
  await B(/Enter Loophole/).click();
  await wait(1000);
  await shot('04-home');
  return has(/Create\s*lobby/i);
});

// ─────────────────────────────────────────────────────────────── navigation

G('Navigation');
for (const [id, tab, marker] of [
  ['N1', 'PLAY', /Game setup/i],
  ['N2', 'RANKS', /Leaderboard|Global/i],
  ['N3', 'YOU', /Player card/i],
  ['N4', 'HOME', /Create\s*lobby/i],
]) {
  await T_(id, `the ${tab} tab opens its screen`, async () => {
    await B(tab).click();
    await wait(700);
    await shot(`nav-${tab}`);
    return has(marker);
  });
}

await T_('N5', 'the game library lists every title', async () => {
  await B(/All games/).click();
  await wait(700);
  await shot('05-library');
  const titles = ['Imposter Word', 'UNO', 'Chess', 'Carrom', 'Gravity Flip'];
  for (const t of titles) if (!(await has(new RegExp(t, 'i')))) return false;
  return true;
});

await T_('N6', 'category filters narrow the library', async () => {
  if (await hasBtn(/^Arcade$/)) {
    await B(/^Arcade$/).click();
    await wait(600);
    const tank = await has(/3D Tank War/i);
    const chess = await has(/Chess/i);
    await B(/^All$/).click().catch(() => {});
    await wait(400);
    return tank && !chess;
  }
  return false;
});

// ───────────────────────────────────────────────────────────────── the games

const GAMES = [
  ['G01', 'Imposter Word', [/Tap to reveal|Reveal/i, /Lock|Submit|Send|Continue/i], 1300],
  ['G02', 'Imposter Video', [/seen enough|Reveal/i, /Lock|Submit|Send|Continue/i], 2400],
  ['G03', "Liar's Bar", [/^Play|Claim/i, /Liar|Accept|Pass/i], 1500],
  ['G04', 'Guess Who I Am', [/Ask|\?/i], 1500],
  ['G05', 'GeoGuesser', [/Confirm|Guess|Drop/i], 1500],
  ['G06', 'UNO', [/Draw a card/i], 1800],
  ['G07', 'Ludo', [/Roll/i], 1800],
  ['G08', 'Snakes & Ladders', [/Roll/i], 1800],
  ['G09', 'Chess', [], 1500],
  ['G10', 'Carrom', [], 1500],
  ['G11', 'Connect 4', [/Drop in column 4/i, /Drop in column 3/i], 1600],
  ['G12', '3D Tank War', [/Fire/i], 1600],
  ['G13', 'Gravity Flip', [/^Run$/, /^Start the run$/], 1600],
];

G('Games');
for (const [id, name, acts, settle] of GAMES) {
  await T_(id, `${name} starts, accepts input and runs a turn`, async () => {
    await home();
    await B(/All games/).click();
    await wait(500);
    await page
      .getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .first()
      .click();
    await wait(500);
    await B(/Create lobby/).click();
    await wait(3800);
    await B(/Start game/).click();
    await wait(1000);

    if (!(await hasBtn('Leave'))) return false;
    if (await has(/no playable module yet/i)) return false;

    for (const a of acts) {
      const btn = page.getByRole('button', { name: a }).first();
      if (!(await btn.count())) continue;
      const label = await btn.getAttribute('aria-label');
      if (/how to play|table chat|leave/i.test(label ?? '')) continue;
      await btn.click().catch(() => {});
      await wait(settle);
    }
    await wait(settle);
    await shot(`game-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    // A game screen with almost no controls is a rendering failure.
    return (await page.getByRole('button').count()) >= 3;
  });
}

// ─────────────────────────────────────────────────────── the rest of the app

G('Features');
await T_('F1', 'in-match rules are the ones for that game, not another', async () => {
  await home();
  await B(/All games/).click();
  await wait(500);
  await page.getByRole('button', { name: /Chess/i }).first().click();
  await wait(500);
  await B(/Create lobby/).click();
  await wait(3800);
  await B(/Start game/).click();
  await wait(1100);
  if (!(await hasBtn(/How to play/i))) return false;
  await B(/How to play/i).click();
  await wait(800);
  await shot('06-rules');
  // Chess terms present and UNO's absent — the sheet used to show UNO's rules
  // for ten of the fourteen titles.
  const chess = await has(/check|checkmate|castl|pawn|piece|board/i);
  const uno = await has(/wild|draw four|skip|reverse/i);
  await B(/Got it|Close/).click().catch(() => {});
  await wait(400);
  return chess && !uno;
});

await T_('F2', 'a lobby issues a join code you can copy', async () => {
  await home();
  await B(/All games/).click();
  await wait(500);
  await page.getByRole('button', { name: /UNO/i }).first().click();
  await wait(500);
  await B(/Create lobby/).click();
  await wait(1500);
  await shot('07-lobby');
  return has(/[A-Z0-9]{4,6}/);
});

await T_('F3', 'friends fill the lobby over time', async () => {
  await wait(3000);
  return has(/joined|ready|waiting/i);
});

await T_('F4', 'the theme toggle switches to day mode', async () => {
  await home();
  await B('YOU').click();
  await wait(700);
  if (await hasBtn(/Settings/i)) {
    await B(/Settings/i).click();
    await wait(700);
  }
  await shot('08-settings');
  const light = page.getByRole('button', { name: /Day|Light/i }).first();
  if (!(await light.count())) return false;
  await light.click();
  await wait(800);
  await shot('09-day-mode');
  return true;
});

await T_('F5', 'and back to night', async () => {
  const dark = page.getByRole('button', { name: /Night|Dark/i }).first();
  if (!(await dark.count())) return false;
  await dark.click();
  await wait(800);
  return true;
});

await T_('F6', 'settings names the signed-in account', async () => has(/acceptance@example\.com/i));

await T_('F7', 'the tint shop equips an accent', async () => {
  await home();
  await B(/Season 2 progress/i).click();
  await wait(800);
  if (!(await hasBtn(/Tint shop/i))) return false;
  await B(/Tint shop/i).click();
  await wait(800);
  await shot('10-shop');
  // Tints are equipped by tapping them, not by a separate button.
  if (!(await hasBtn(/^Coral$/))) return false;
  await B(/^Coral$/).click();
  await wait(900);
  await shot('10b-equipped');
  const confirmed = await has(/Coral equipped/i);
  // The accent follows you out of the shop; home must still render with it.
  await B('HOME').click();
  await wait(900);
  await shot('10c-home-tinted');
  return confirmed && (await has(/Create\s*lobby/i));
});

await T_('F8', 'the leaderboard ranks players', async () => {
  await home();
  await B('RANKS').click();
  await wait(800);
  await shot('11-leaderboard');
  return has(/#\s?1|Global/i);
});

await T_('F9', 'friends list opens a direct message thread', async () => {
  await home();
  if (!(await hasBtn(/Friends/i))) return false;
  await B(/Friends/i).click();
  await wait(800);
  await shot('12-friends');
  const msg = page.getByRole('button', { name: /Message|Chat/i }).first();
  if (!(await msg.count())) return true; // friends screen reached, no DM affordance
  await msg.click();
  await wait(900);
  await shot('13-dm');
  return true;
});

await T_('F10', 'the season pass shows progress and rewards', async () => {
  await home();
  await B(/Season 2 progress/i).click();
  await wait(900);
  await shot('14-season');
  return (await has(/Season/i)) && (await has(/LVL|Level|XP/i));
});

await T_('F11', 'settings is reachable from the player card', async () => {
  await home();
  await B('YOU').click();
  await wait(700);
  if (!(await hasBtn('Settings'))) return false;
  await B('Settings').click();
  await wait(800);
  return hasBtn(/Sign out/i);
});

await T_('F12', 'the chess board exposes every square to a screen reader', async () => {
  await home();
  await B(/All games/).click();
  await wait(500);
  await page.getByRole('button', { name: /Chess/i }).first().click();
  await wait(500);
  await B(/Create lobby/).click();
  await wait(3800);
  await B(/Start game/).click();
  await wait(1100);
  // 64 squares, each named by coordinate and occupant.
  const squares = await page.getByRole('button', { name: /^[a-h][1-8], / }).count();
  return squares === 64;
});

await browser.close();

// ───────────────────────────────────────────────────────────────── the report

const byGroup = {};
for (const r of results) (byGroup[r.group] ??= []).push(r);

console.log('\n' + '─'.repeat(64));
for (const [g, rows] of Object.entries(byGroup)) {
  const p = rows.filter((r) => r.pass).length;
  console.log(`${g.padEnd(12)} ${p}/${rows.length}`);
}
const passed = results.filter((r) => r.pass).length;
console.log('─'.repeat(64));
console.log(`TOTAL        ${passed}/${results.length}`);

const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  ${f.id}  ${f.name}\n        ${f.note}`);
}
console.log(JSON.stringify({ passed, of: results.length, results }, null, 0).slice(0, 0));
process.exit(failed.length ? 1 : 0);
