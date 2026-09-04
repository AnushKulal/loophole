import { chromium } from 'playwright';

/**
 * Drives the sign-in screen the way a person would.
 *
 * Run against two builds: one with no Firebase config (port 5191) and one with
 * a deliberately invalid key (5192). The second is the interesting one — a
 * wrong key still reaches Firebase, so it exercises the whole chain: form →
 * fetch → Firebase's error envelope → the translation table → the screen.
 */

const PORT = process.argv[2] || '5191';
const MODE = process.argv[3] || 'unconfigured';
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = process.env.SHOT_DIR ?? 'e2e-shots';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(8000);

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.split('\n')[0].slice(0, 180)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 180));
});

const B = (n) => page.getByRole('button', { name: n }).first();
const F = (n) => page.getByLabel(n).first();
const shot = (n) => page.screenshot({ path: `${OUT}/${MODE}-${n}.png` });
const seen = async (re) => (await page.getByText(re).count()) > 0;

const checks = [];
const check = (name, ok, note = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await B(/Enter Loophole/).click();
await page.waitForTimeout(1000);
await shot('01-arrive');

if (MODE === 'unconfigured') {
  check('says accounts are off rather than offering a dead form', await seen(/Accounts are switched off/i));
  check('no email field at all', (await F('Email address').count()) === 0);
  check('no create-account button either', (await B(/Create new account/).count()) === 0);
} else {
  check('shows the sign-in form', (await F('Email address').count()) === 1);
  check('starts in sign-in mode, so no confirm field', (await F('Confirm password').count()) === 0);

  // Empty submit → the topmost problem, focused.
  await B(/^Sign in$/).click();
  await page.waitForTimeout(400);
  check('empty form is refused with a reason', await seen(/Enter your email address/i));
  await shot('02-empty');

  // A malformed address is caught before any network call.
  await F('Email address').fill('nope');
  await B(/^Sign in$/).click();
  await page.waitForTimeout(400);
  check('malformed email is caught locally', await seen(/does not look like an email/i));

  // Typing clears the message — otherwise stale errors sit under a fixed form.
  await F('Email address').fill('player@example.com');
  await page.waitForTimeout(300);
  check('error clears as you correct it', !(await seen(/does not look like an email/i)));

  // Short password.
  await F('Password').fill('123');
  await B(/^Sign in$/).click();
  await page.waitForTimeout(400);
  check('short password is caught locally', await seen(/at least 6 characters/i));

  // Show/hide toggle.
  await F('Password').fill('secret123');
  await B(/Show password/).click();
  await page.waitForTimeout(250);
  check('password can be revealed', (await B(/Hide password/).count()) === 1);
  await B(/Hide password/).click();

  // The real round trip. The key is invalid, so Firebase answers with prose;
  // this proves the fetch, the error envelope and the translation all line up.
  await shot('03-filled');
  await B(/^Sign in$/).click();
  await page.waitForTimeout(1200);
  const busy = await seen(/Just a moment/i);
  await page.waitForTimeout(17000);   // past the client's 15s request timeout
  await shot('04-server-error');
  check('shows a busy state while the request is in flight', busy);
  check('recovers from a hung request instead of spinning forever', !(await seen(/Just a moment/i)));
  check(
    'translates the server rejection into something actionable',
    await seen(/apiKey in app\.json|Sign-in failed|Could not reach the server/i),
  );

  // Switch to create-account and back.
  await B(/Create new account/).click();
  await page.waitForTimeout(500);
  await shot('05-signup');
  check('create mode adds a display name field', (await F('Display name').count()) === 1);
  check('create mode adds a confirm field', (await F('Confirm password').count()) === 1);

  await F('Display name').fill('Anush');
  await F('Password').fill('secret123');
  await F('Confirm password').fill('different');
  await B(/^Create account$/).click();
  await page.waitForTimeout(400);
  check('mismatched confirmation is caught', await seen(/do not match/i));

  await B(/I already have an account/).click();
  await page.waitForTimeout(500);
  check('switching back drops the confirm field', (await F('Confirm password').count()) === 0);

  // Forgot password validates the address before sending.
  await F('Email address').fill('');
  await B(/Forgot your password/).click();
  await page.waitForTimeout(400);
  check('reset needs an address first', await seen(/Enter your email address/i));
  await shot('06-forgot');
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length) console.log('console/page errors:\n' + [...new Set(errors)].join('\n'));
process.exit(failed.length || errors.length ? 1 : 0);
