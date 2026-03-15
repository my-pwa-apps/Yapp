interface FirebaseEnv {
  FIREBASE_DATABASE_URL: string;
  FIREBASE_WEB_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
}

interface VerifiedUser {
  uid: string;
}

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function verifyFirebaseUser(request: Request, env: FirebaseEnv): Promise<VerifiedUser | null> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!res.ok) return null;

  const json = await res.json() as { users?: Array<{ localId?: string }> };
  const uid = json.users?.[0]?.localId;
  return uid ? { uid } : null;
}

export async function fetchPushSubscriptions(
  recipientUids: string[],
  env: FirebaseEnv
): Promise<PushSubscriptionJSON[]> {
  const accessToken = await getFirebaseAccessToken(env);
  const uniqueRecipients = Array.from(new Set(recipientUids));
  const subscriptions: PushSubscriptionJSON[] = [];

  await Promise.all(
    uniqueRecipients.map(async (uid) => {
      const data = await getRtdbJson<Record<string, { endpoint?: string; keys?: { p256dh?: string; auth?: string } }> | null>(
        `pushSubscriptions/${uid}`,
        env,
        accessToken
      );

      if (!data) return;

      for (const entry of Object.values(data)) {
        if (entry.endpoint && entry.keys?.p256dh && entry.keys?.auth) {
          subscriptions.push({
            endpoint: entry.endpoint,
            keys: {
              p256dh: entry.keys.p256dh,
              auth: entry.keys.auth,
            },
          });
        }
      }
    })
  );

  return subscriptions;
}

export async function notificationRequestIsAuthorized(
  senderUid: string,
  recipientUids: string[],
  payload: { data?: Record<string, string> },
  env: FirebaseEnv
): Promise<boolean> {
  const type = payload.data?.type;
  if (!type) return false;

  const accessToken = await getFirebaseAccessToken(env);
  const recipients = new Set(recipientUids);

  if (type === 'message') {
    const chatId = payload.data?.chatId;
    if (!chatId) return false;
    const members = await getRtdbJson<Record<string, boolean> | null>(`chats/${chatId}/members`, env, accessToken);
    if (!members?.[senderUid]) return false;
    for (const uid of recipients) {
      if (uid === senderUid || !members[uid]) return false;
    }
    return true;
  }

  if (type === 'contact_request') {
    if (recipients.size !== 1) return false;
    const [targetUid] = Array.from(recipients);
    const request = await getRtdbJson<{ status?: string; from?: string; to?: string } | null>(
      `contactRequests/${targetUid}/${senderUid}`,
      env,
      accessToken
    );
    return !!request && request.status === 'pending' && request.from === senderUid && request.to === targetUid;
  }

  if (type === 'group_invite') {
    const chatId = payload.data?.chatId;
    if (!chatId) return false;
    const members = await getRtdbJson<Record<string, boolean> | null>(`chats/${chatId}/members`, env, accessToken);
    if (!members?.[senderUid]) return false;

    for (const uid of recipients) {
      const pending = await getRtdbJson<{ type?: string; fromUid?: string } | null>(
        `chats/${chatId}/pendingMembers/${uid}`,
        env,
        accessToken
      );
      if (!pending || pending.type !== 'invite' || pending.fromUid !== senderUid) return false;
    }
    return true;
  }

  if (type === 'join_request') {
    const chatId = payload.data?.chatId;
    if (!chatId) return false;
    const pending = await getRtdbJson<{ type?: string; fromUid?: string } | null>(
      `chats/${chatId}/pendingMembers/${senderUid}`,
      env,
      accessToken
    );
    if (!pending || pending.type !== 'request' || pending.fromUid !== senderUid) return false;

    const admins = await getRtdbJson<Record<string, boolean> | null>(`chats/${chatId}/admins`, env, accessToken);
    if (!admins) return false;
    for (const uid of recipients) {
      if (!admins[uid]) return false;
    }
    return true;
  }

  if (type === 'call') {
    const callId = payload.data?.callId;
    if (!callId) return false;
    const participants = await getRtdbJson<Record<string, boolean> | null>(`calls/${callId}/participants`, env, accessToken);
    if (!participants?.[senderUid]) return false;
    for (const uid of recipients) {
      if (uid === senderUid || !participants[uid]) return false;
    }
    return true;
  }

  return false;
}

async function getFirebaseAccessToken(env: FirebaseEnv): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 3600;
  const assertion = await signJwtAssertion(
    {
      alg: 'RS256',
      typ: 'JWT',
    },
    {
      iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
      sub: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain Firebase access token: ${text}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

async function getRtdbJson<T>(path: string, env: FirebaseEnv, accessToken: string): Promise<T> {
  const baseUrl = env.FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RTDB request failed for ${path}: ${res.status} ${text}`);
  }
  return await res.json() as T;
}

async function signJwtAssertion(
  header: Record<string, string>,
  payload: Record<string, string | number>,
  privateKeyPem: string
): Promise<string> {
  const encodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n');
  const base64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}