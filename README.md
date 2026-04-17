# Yappin'

A React 19 + TypeScript PWA combining WhatsApp-style chat with a Twitter-style social feed ("Yapps"). Uses Firebase Realtime Database as its sole backend and a Cloudflare Worker for Web Push + Giphy proxy.

**Live**: <https://my-pwa-apps.github.io/Yapp/>

## Features

- Real-time 1:1 & group messaging with typing indicators, read receipts, edits, soft-delete, and ephemeral (self-destructing) messages
- Twitter-style "Yapps" feed with likes, replies, reyapps, public/contacts visibility
- WebRTC audio & video calls (1:1 and group)
- Opt-in end-to-end encryption (ECDH-P256 + AES-GCM-256, PBKDF2 password-based backup)
- Installable PWA with offline shell, Web Push, app badge, and cold-start deep links
- Google sign-in + email/password

## Architecture

- **Client**: Vite + React 19 + TypeScript, deployed to GitHub Pages at `/Yapp/`
- **Data**: Firebase Realtime Database (no Firestore, no Cloud Functions, no Storage)
- **Push & edge glue**: Cloudflare Worker (`worker/src/index.ts`) implementing RFC 8291 Web Push, cryptographic Firebase ID token verification, rate limiting, and a scheduled ephemeral-message purge

See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for repo conventions.

## Development

```bash
# 1. Install
npm install

# 2. Configure env (see .env.example)
cp .env.example .env
#    Fill in VITE_FIREBASE_* with your project values.

# 3. Run
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # Type-check + production build → dist/
npm run preview      # Serve the production build locally
npm test             # Unit tests (Vitest)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
```

### Deploying database rules

```bash
npx firebase deploy --only database --project <your-project-id>
```

### Deploying the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put FIREBASE_DATABASE_URL
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
npx wrangler secret put ALLOWED_ORIGINS         # e.g. https://my-pwa-apps.github.io,http://localhost:5173
npx wrangler secret put GIPHY_API_KEY           # optional
npm run deploy
```

Generate VAPID keys with `node generate-vapid-keys.mjs` once and reuse.

## Security notes

- The worker **cryptographically verifies** Firebase ID tokens (RS256, signed with Google's public keys).
- Rate limiting uses the Cloudflare Rate Limiting binding — durable across isolates.
- Ephemeral messages are purged server-side on a 10-minute cron.
- E2EE private keys are encrypted with a user-chosen passphrase (PBKDF2 600k iterations) and backed up to RTDB only in encrypted form; raw keys never leave the device in plaintext.

## Project layout

```
src/
  components/    # Chat/, Feed/, Layout/, Auth/
  contexts/      # AuthContext (auth + E2EE + presence)
  hooks/         # Firebase subscriptions + standalone action fns
  utils/         # contentFilter, sendPushNotification
  types.ts       # Shared interfaces
  firebase.ts    # Firebase client init (env-driven)
worker/
  src/
    index.ts            # Worker entry (HTTP + scheduled)
    firebase.ts         # ID token verify + RTDB helpers
    verifyIdToken.ts    # RS256 JWT signature verification
    ephemeralPurge.ts   # Cron: purge expired ephemeral messages
  wrangler.toml
database.rules.json      # RTDB security rules
tests/                   # Security-rule unit tests (Firebase emulator)
```
