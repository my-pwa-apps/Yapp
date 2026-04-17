/**
 * Scheduled purge of expired ephemeral messages.
 *
 * Runs on a cron trigger (see wrangler.toml). Walks every chat that has
 * at least one message with an ephemeralExpiry in the past and deletes those
 * message nodes server-side. Writes require an RTDB service-account access
 * token because security rules forbid arbitrary deletes.
 *
 * Performance note: this is a linear scan over /messages. Acceptable for small
 * installs; for scale, introduce an `ephemeralExpiryIndex/{chatId}/{ts}_{msgId}`
 * index populated on write and scan only that.
 */

interface FirebaseEnv {
  FIREBASE_DATABASE_URL: string;
  FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
}

const MAX_CHATS_PER_RUN = 500;

export async function scheduledPurgeEphemeralMessages(env: FirebaseEnv): Promise<void> {
  try {
    const accessToken = await getAccessToken(env);
    const baseUrl = env.FIREBASE_DATABASE_URL.replace(/\/$/, '');

    // Fetch shallow list of chat ids
    const chatsRes = await fetch(
      `${baseUrl}/chats.json?shallow=true&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!chatsRes.ok) return;
    const chatIds = Object.keys((await chatsRes.json()) || {}).slice(0, MAX_CHATS_PER_RUN);

    const now = Date.now();

    await Promise.allSettled(
      chatIds.map(async (chatId) => {
        const msgsRes = await fetch(
          `${baseUrl}/messages/${chatId}.json?access_token=${encodeURIComponent(accessToken)}`
        );
        if (!msgsRes.ok) return;
        const msgs =
          ((await msgsRes.json()) as Record<string, { ephemeralExpiry?: number }> | null) || {};

        const updates: Record<string, null> = {};
        for (const [msgId, msg] of Object.entries(msgs)) {
          if (typeof msg?.ephemeralExpiry === 'number' && msg.ephemeralExpiry > 0 && msg.ephemeralExpiry <= now) {
            updates[`messages/${chatId}/${msgId}`] = null;
          }
        }
        const keys = Object.keys(updates);
        if (keys.length === 0) return;

        await fetch(`${baseUrl}/.json?access_token=${encodeURIComponent(accessToken)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      })
    );
  } catch (err) {
    console.error('[ephemeralPurge] failed:', err);
  }
}

// ─── Service-account JWT for RTDB access ─────────────────────

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: FirebaseEnv): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 3600;
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
      sub: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.database',
      iat: issuedAt,
      exp: expiresAt,
    },
    env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

async function signJwt(
  header: Record<string, string>,
  payload: Record<string, string | number>,
  privateKeyPem: string
): Promise<string> {
  const h = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const input = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
