# Yapp — Copilot Instructions

## Architecture Overview

Yapp is a **React 19 + TypeScript PWA** combining a WhatsApp-style chat with a Twitter-style social feed ("Yapps"). It uses **Firebase Realtime Database** (RTDB) as its sole backend — no Firestore, no Cloud Functions, no Firebase Storage. Push notifications are handled by a **Cloudflare Worker** (`worker/src/index.ts`).

- **Entry flow**: `main.tsx` → `App.tsx` (auth gate via `AuthContext`) → `AppLayout.tsx` (god component orchestrating all views)
- **No router library** — navigation is state-driven: `appMode: 'chat' | 'feed'`, `activeChat`, modal booleans, `threadStack[]` for feed threads
- **No state management library** — all state lives in React `useState` + Firebase `onValue` subscriptions
- **Zero UI dependencies** — all icons are inline SVGs, all components hand-built

## Key Directories & Files

| Path | Purpose |
|------|---------|
| `src/contexts/AuthContext.tsx` | Single context: auth, profile, E2EE keys, presence tracking |
| `src/hooks/` | Firebase RTDB subscriptions + standalone action functions |
| `src/components/Layout/AppLayout.tsx` | Top-level orchestrator (~470 lines, ~15 useState calls) |
| `src/components/Chat/` | Chat UI: ChatWindow, MessageBubble, ChatList, modals, pickers |
| `src/components/Feed/` | Social feed: FeedView, YappCard, YappThread, YappProfile, YappComposer |
| `src/types.ts` | All shared TypeScript interfaces (UserProfile, Chat, Message, Yapp, etc.) |
| `database.rules.json` | Firebase RTDB security rules — deploy with `npx firebase deploy --only database --project yappin-d355d` |
| `vite.config.ts` | Vite + PWA config; base path is `/Yapp/` (GitHub Pages) |

## RTDB Data Model

```
users/{uid}                     → UserProfile
contacts/{uid}/{contactUid}     → true
contactRequests/{uid}/{senderId} → ContactRequest
chats/{chatId}                  → Chat (members, admins, pendingMembers, typing, encryptedGroupKey)
messages/{chatId}/{msgId}       → Message
calls/{callId}                  → CallData
callSignaling/{callId}/         → WebRTC SDP/ICE exchange
privateKeys/{uid}               → E2EE encrypted private key backup
pushSubscriptions/{uid}/{hash}  → Web Push subscription
yapps/{yappId}                  → Yapp (social post)
yappLikes/{yappId}/{uid}        → true
yappFollowing/{uid}/{targetUid} → true
yappFollowers/{uid}/{followerUid} → true
yappsSettings/{uid}             → YappsSettings (notification + feed prefs)
```

Membership/admin sets use `Record<string, boolean>` (`uid → true`).

## Hook Conventions

All hooks in `src/hooks/` follow this Firebase subscription pattern:

```typescript
export function useXxx(id: string | undefined) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    const unsub = onValue(ref(db, `path/${id}`), (snap) => {
      // parse snapshot → setData(...)
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [id]);
  return { data, loading };
}
```

**Standalone action functions** are exported alongside hooks and called directly by components — e.g., `sendMessage()`, `postYapp()`, `toggleLike()`. They are NOT returned from hooks.

Note: `useCrypto.ts` is a utility module of ~20 pure crypto functions, not a React hook despite its location.

## Component Conventions

- Props: explicit `interface Props` (not exported), component typed as `React.FC<Props>`
- Communication: props down, callbacks up (`onBack`, `onOpenThread`, `onOpenProfile`); components call Firebase action functions directly
- Settings modals use the pattern: `modal-overlay` → `modal modal-sm` → `modal-header` + `modal-body modal-body-pad` → `notif-setting-row` with toggle switches
- `MessageBubble` is wrapped in `React.memo`; prefer memoization for list-rendered components

## CSS & Theming

- **Plain CSS** with CSS custom properties on `:root` — dark theme default, light theme via `@media (prefers-color-scheme: light)`
- Accent color: lime green `#65a30d` / `#84cc16`
- Naming: BEM-ish flat classes (`.feed-title-row`, `.yapp-card-avatar`, `.sidebar-search-input`)
- Main CSS files: `src/index.css` (globals/theme), `AppLayout.css` (chat UI), `FeedView.css` (feed UI), `LoginPage.css`
- iOS PWA safe areas: `env(safe-area-inset-*)` on `#root` and bottom nav

## Critical Patterns

1. **All media is stored as base64 data URLs in RTDB** — images are compressed via `compressImage()` (canvas resize → JPEG 0.7 quality, max 800px). No Firebase Storage or CDN.
2. **E2EE** (opt-in): ECDH P-256 key exchange, AES-GCM-256 encryption. Keys stored in IndexedDB with PBKDF2 password backup to RTDB.
3. **WebRTC calls** signal through RTDB nodes (`callSignaling/{callId}/`), not a dedicated server.
4. **Client-side filtering**: `useChats` reads the entire `chats` node and filters by membership in JS. Same for `useGroupInvites`.

## Build & Deploy

```bash
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build → dist/
npx firebase deploy --only database --project yappin-d355d  # Deploy RTDB rules
```

The app deploys to GitHub Pages at `my-pwa-apps.github.io/Yapp/` — all asset paths must use the `/Yapp/` base prefix.
