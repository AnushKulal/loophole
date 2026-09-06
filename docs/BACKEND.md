# Switching on real accounts, friends and multiplayer

Everything is built and tested. None of it runs until a Firebase project exists,
because a friend request has to land somewhere both phones can see. This is the
one part I cannot do for you — the project has to be created under your own
Google account.

Fifteen minutes, once.

## What is already true

`mobile/src/auth/config.ts` ships an empty `apiKey` and `projectId`, so
`isConfigured()` is false and the app quietly uses on-device accounts: real
passwords, salted and hashed in the phone's keystore, but existing only on that
phone. Nobody can add you, because there is nothing to add.

The moment those two values are filled in, the same code paths switch to
Firebase and the social features become reachable. Nothing else changes.

## 1 · Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   **Add project**. Call it `loophole`. Analytics is not needed.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database.** Pick the region closest to
   you — `asia-south1` (Mumbai) if you are in India, because every move in a
   match makes a round trip and the physical distance is most of the latency.
   Start in **production mode**; the rules below replace the default.

## 2 · Copy the two values

**Project settings** (the gear, top left) **→ General → Your apps → Web → `</>`**.
Register the app with any nickname. You are shown a `firebaseConfig` block:

```js
const firebaseConfig = {
  apiKey: "AIzaSy…",          // ← this
  authDomain: "loophole.firebaseapp.com",
  projectId: "loophole-1a2b3",  // ← and this
  …
};
```

Only those two matter. Put them in `mobile/.env`:

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy…
EXPO_PUBLIC_FIREBASE_PROJECT_ID=loophole-1a2b3
```

Or paste them into `DEFAULTS` in `mobile/src/auth/config.ts` and commit — which
is what the GitHub build needs, since it does not have your `.env`.

**These two values are public.** They identify the project; they do not
authorise anything. Every Firebase web app ships them in its bundle and
Firebase's own documentation says to treat them as public. What protects the
data is the rules in the next step — which is why that step is not optional.

> If you use `.env` locally, remember `--clear`: Metro inlines these at build
> time and caches the result. A stale bundle carrying a dummy key once nearly
> shipped from this repo. `npm run build:web` already passes it.

## 3 · Install the rules

**This is the security of the whole app.** There is no server of ours between
the phone and the database, so anything the rules permit is permitted to anyone
who unpacks the APK.

Copy `mobile/firestore.rules` into **Firestore → Rules** in the console and
**Publish**. Or, with the Firebase CLI:

```bash
cd mobile
npx firebase-tools deploy --only firestore:rules --project <projectId>
```

The rules are commented; the parts worth knowing:

- A profile is public to anyone signed in and writable only by its owner.
- A handle can be created only pointing at yourself, and never updated — a
  handle that can be repointed is not a claim.
- A relationship is readable and writable only by its two members, and you can
  only act in your own name. Without that last rule either member could forge a
  request from the other and "accept" it, which is how people end up on friends
  lists they never agreed to.
- A move can be created but never changed or deleted. That is what makes the
  move log an authority: a move already shown on someone's screen cannot
  afterwards become a different move.

## 4 · Add the two indexes

Firestore serves single-field queries from automatic indexes but needs to be
told about composite ones. Two queries need them:

| Collection | Fields |
| --- | --- |
| `edges` | `pair` (array-contains), `at` (ascending) |
| `users` | `handle` (ascending) |

The console offers to build these for you the first time a query fails: the
error in the app's logs contains a direct link. That is genuinely the easiest
route — open Friends, watch it fail once, click the link.

## 5 · Check it

```bash
cd mobile
npm test          # 905 tests, none of which need a project
npm run web       # sign up twice in two browser profiles and add yourself
```

Two different browser profiles give you two accounts on one machine, which is
the fastest way to see a friend request cross.

## What it costs

Nothing, at this scale. Firestore's free tier is 50,000 document reads and
20,000 writes a day. A match polls about once a second while it is on screen, so
an hour of solid play across four people is roughly 15,000 reads — you would
need to play for most of a day, every day, to leave the free tier.

Polling is the reason that number is as high as it is. Firestore's real-time
listeners ride a transport the REST API does not expose, and using them would
mean the Firebase SDK, a native dependency, and a rebuild to change a query.
That trade is worth revisiting if this ever has real users; it is the wrong
trade for getting it working.

## What is not built yet

Being honest about the boundary:

- **The screens still read fixtures.** `src/data/people.ts` is unchanged, so
  Friends, Inbox and the leaderboard show the same six invented people until
  they are wired to `src/social/service.ts`. That is the next piece of work.
- **DMs are not networked.** The thread UI is real; the messages are canned.
- **One game at a time.** The lockstep transport is general, but each of the 14
  screens needs its local `useState` swapped for the shared move log. UNO,
  Connect 4 and Chess are the ones to do first — turn-based, small moves, and
  the deal or the board is the whole of the state.
- **Tank War and Gravity Flip may never suit this.** They are real-time rather
  than turn-based, and lockstep over a polled transport is the wrong shape for
  them. They stay single-player against bots unless something better replaces
  the transport.
