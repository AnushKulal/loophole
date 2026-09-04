import { chromium } from 'playwright';
/** Drives a real sign-up and sign-in against the on-device account store. */
const OUT = process.env.SHOT_DIR ?? 'e2e-shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:402,height:874}, deviceScaleFactor:2 });
p.setDefaultTimeout(9000);
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.split('\n')[0].slice(0,150)));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text().slice(0,150));});
const B=n=>p.getByRole('button',{name:n}).first();
const F=n=>p.getByLabel(n).first();
const seen=async re=>(await p.getByText(re).count())>0;
const out=[]; const chk=(n,ok)=>{out.push([n,ok]);console.log(`${ok?'PASS':'FAIL'}  ${n}`)};

await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle'}); await p.waitForTimeout(2400);
await B(/Enter Loophole/).click(); await p.waitForTimeout(1000);
await p.screenshot({path:`${OUT}/dev-01-signin.png`});
chk('a real form, not a "switched off" notice', (await F('Email address').count())===1);
chk('says where the account lives', await seen(/lives on this phone/i));

// create an account
await B(/Create new account/).click(); await p.waitForTimeout(600);
await F('Email address').fill('anush@example.com');
await F('Display name').fill('Anush');
await F('Password').fill('secret123');
await F('Confirm password').fill('secret123');
await p.screenshot({path:`${OUT}/dev-02-signup.png`});
await B(/^Create account$/).click(); await p.waitForTimeout(2000);
await p.screenshot({path:`${OUT}/dev-03-after-signup.png`});
chk('sign-up lands in onboarding', (await p.getByRole('button',{name:/Mark 1/}).count())>0);

await B(/Enter Loophole/).click(); await p.waitForTimeout(1100);
chk('and then home', await seen(/Create\s*lobby/i));
chk('greeted by the name on the account', await seen(/Anush/));
await p.screenshot({path:`${OUT}/dev-04-home.png`});

// the account shows in settings, and sign-out works
await B('YOU').click(); await p.waitForTimeout(700);
await B('Settings').click(); await p.waitForTimeout(800);
chk('settings names the signed-in account', await seen(/anush@example\.com/i));
await B(/Sign out/).click(); await p.waitForTimeout(1100);
chk('sign out returns to the form', (await F('Email address').count())===1);

// duplicate address is refused
await B(/Create new account/).click(); await p.waitForTimeout(500);
await F('Email address').fill('anush@example.com');
await F('Display name').fill('Someone');
await F('Password').fill('secret123');
await F('Confirm password').fill('secret123');
await B(/^Create account$/).click(); await p.waitForTimeout(1600);
chk('a second account on the same address is refused', await seen(/already has an account/i));

// wrong password
await B(/I already have an account/).click(); await p.waitForTimeout(600);
await F('Email address').fill('anush@example.com');
await F('Password').fill('wrongpass');
await B(/^Sign in$/).click(); await p.waitForTimeout(1600);
chk('a wrong password is refused', await seen(/do not match/i));

// correct password signs back in
await F('Password').fill('secret123');
await B(/^Sign in$/).click(); await p.waitForTimeout(2000);
chk('the right password signs back in', await seen(/Create\s*lobby/i));
await p.screenshot({path:`${OUT}/dev-05-signed-in.png`});

// the session survives a reload
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2600);
await B(/Enter Loophole/).click(); await p.waitForTimeout(1600);
await p.screenshot({path:`${OUT}/dev-06-restored.png`});
chk('the session survives a restart', await seen(/Create\s*lobby/i));

await b.close();
const bad=out.filter(([,ok])=>!ok);
console.log(`\n${out.length-bad.length}/${out.length} checks passed`);
if(errs.length) console.log('errors:\n'+[...new Set(errs)].join('\n'));
process.exit(bad.length?1:0);
