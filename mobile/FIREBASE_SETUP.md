# Firebase setup

The app code is ready for a real backend — it's just not connected to one
yet. Everything below has to happen in the Firebase Console (a Google
account you control), which I can't do on your behalf. Once you've done
these steps and handed me the config values, the app switches over
automatically — no code changes needed on your side.

## 1. Create the project

1. Go to https://console.firebase.google.com → **Add project**.
2. If your Play Console account is under a Google Cloud organization, you
   can link the Firebase project to that same org/billing account here —
   not required, but tidier if you're managing this as a business.
3. Give it a name (e.g. "Golkonda Audio Guide"). Google Analytics is
   optional — skip it unless you want it.

## 2. Register a Web app (yes, even though this is a mobile app)

The Expo app talks to Firebase through the **Firebase JS SDK**, which is
the "Web" app type in the console — this is normal for Expo/React Native
projects and not a mistake.

1. In the project overview, click the **</>** (Web) icon → register an app
   (any nickname, e.g. "mobile").
2. You'll be shown a `firebaseConfig` object with `apiKey`, `authDomain`,
   `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
3. Send me those six values (or paste them directly into
   `mobile/src/utils/firebase.js`, replacing the `YOUR_...` placeholders).

## 3. Turn on Authentication

1. Console → **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.

## 4. Turn on Firestore

1. Console → **Build → Firestore Database → Create database**.
2. Choose **Production mode** (not test mode — test mode allows anyone to
   read/write everything, and expires after 30 days anyway).
3. Pick a region close to your users (e.g. `asia-south1` for India).
4. Once created, go to the **Rules** tab, delete the default contents, and
   paste in everything from `mobile/firestore.rules` in this repo. Publish.

## 5. Turn on Storage

1. Console → **Build → Storage → Get started**. Same production-mode /
   region choices as Firestore.
2. Go to the **Rules** tab and paste in `mobile/storage.rules`. Publish.

## 6. Create your own admin account

The app has no "become admin" button on purpose — it's set entirely from
the console, so a public app build can never self-escalate.

1. Console → **Authentication → Users → Add user**. Use your real email and
   a strong password — this is what you'll actually log in with going
   forward, replacing `admin@tourist.com`.
2. Copy the **User UID** shown for that account.
3. Console → **Firestore Database → Data → Start collection** → collection
   ID `admins` → **Document ID**: paste the UID you just copied → add any
   field (e.g. `role` = `admin`, or just `createdAt` = current timestamp) →
   **Save**.

That's it — that one document is the entire difference between an admin
and a regular visitor. Add more admins later the same way, straight from
the console, with no app update needed.

## 7. Hand me the config

Once steps 1–6 are done, give me the six `firebaseConfig` values from step
2 (or paste them into `firebase.js` yourself). I'll wire it in, and from
that point on:

- `admin@tourist.com` / `user@tourist.com` stop working (they're a
  local-only fallback that only exists while Firebase isn't configured —
  see the comments in `dataStore.js`).
- Real sign-up creates a real Firebase account; real login checks a real
  password.
- All tour content becomes shared across every device instead of living
  separately on each phone — which also means the admin panel becomes
  genuinely useful for maintaining the tour after launch, instead of a
  one-device-at-a-time dead end.

## What this does not cover

This gets the app functionally ready. It does **not** cover the Play Store
listing requirements from the earlier readiness review — a real app icon
(the current one is still Expo's default template icon), a privacy policy
URL, the `android.package` identifier and EAS build setup, or store
listing content (screenshots, descriptions, Data Safety form). Those are
separate next steps once this backend piece is live.
