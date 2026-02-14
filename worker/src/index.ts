/**
 * Cloudflare Worker for sending Web Push notifications.
 *
 * Implements RFC 8291 (Web Push Encryption) + RFC 8188 (aes128gcm)
 * using the Web Crypto API. No Node.js dependencies needed.
 */

interface Env {
  VAPID_PRIVATE_JWK: string;   // JWK JSON string
  VAPID_PUBLIC_KEY: string;     // base64url 65-byte uncompressed public key
  PUSH_API_KEY: string;         // shared API key
}

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;   // base64url
    auth: string;     // base64url
  };
}

interface PushRequest {
  subscriptions: PushSubscriptionJSON[];
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  };
}

// ─── Entry point ─────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return Response.json({ status: 'ok' }, { headers: corsHeaders() });
    }

    // Push endpoint
    if (url.pathname === '/push' && request.method === 'POST') {
      // Verify API key
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey || apiKey !== env.PUSH_API_KEY) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
      }

      try {
        const body = (await request.json()) as PushRequest;
        if (!body.subscriptions?.length || !body.payload) {
          return Response.json({ error: 'Missing subscriptions or payload' }, { status: 400, headers: corsHeaders() });
        }

        const results = await sendPushNotifications(body, env);
        return Response.json(results, { headers: corsHeaders() });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders() });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;

// ─── Push delivery ───────────────────────────────────────────

async function sendPushNotifications(req: PushRequest, env: Env) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(req.payload));
  const vapidJwk: JsonWebKey = JSON.parse(env.VAPID_PRIVATE_JWK);
  const results: { endpoint: string; status: number; ok: boolean }[] = [];

  for (const sub of req.subscriptions) {
    try {
      const res = await sendWebPush(sub, payloadBytes, vapidJwk, env.VAPID_PUBLIC_KEY);
      results.push({ endpoint: sub.endpoint.substring(0, 60) + '...', status: res.status, ok: res.ok });
    } catch (err) {
      results.push({ endpoint: sub.endpoint.substring(0, 60) + '...', status: 0, ok: false });
    }
  }

  return { sent: results.filter((r) => r.ok).length, total: results.length, results };
}

async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: Uint8Array,
  vapidJwk: JsonWebKey,
  vapidPublicKeyB64: string
): Promise<Response> {
  // 1. Import subscriber's ECDH public key (p256dh)
  const uaPublicBytes = base64urlDecode(subscription.keys.p256dh);
  const uaPublic = await crypto.subtle.importKey(
    'raw', uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // 2. Auth secret from subscription
  const authSecret = base64urlDecode(subscription.keys.auth);

  // 3. Generate ephemeral ECDH key pair (for this push only)
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits']
  );

  // 4. ECDH shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublic },
    ephemeralKeyPair.privateKey,
    256
  );
  const ecdhSecret = new Uint8Array(sharedSecretBits);

  // 5. Export ephemeral public key (raw, 65 bytes uncompressed)
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey));

  // 6. Derive IKM using HKDF ( RFC 8291, Section 3.4 )
  //    salt = auth_secret, IKM = ecdh_secret
  //    info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  // 7. Generate random salt for content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 8. Derive content encryption key (CEK) — 16 bytes
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(ikm, salt, cekInfo, 16);

  // 9. Derive nonce — 12 bytes
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(ikm, salt, nonceInfo, 12);

  // 10. Encrypt: payload + 0x02 padding delimiter
  const padded = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  );

  // 11. Build aes128gcm body:
  //     salt (16) || record_size (4, uint32 BE) || keyid_len (1) || keyid (65) || ciphertext
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const body = concat(salt, recordSize, new Uint8Array([65]), asPublicBytes, encrypted);

  // 12. Build VAPID Authorization header
  const authorization = await createVapidAuth(subscription.endpoint, vapidJwk, vapidPublicKeyB64);

  // 13. Send the push
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '60',
      'Urgency': 'high',
      'Authorization': authorization,
      'Content-Length': String(body.byteLength),
    },
    body,
  });
}

// ─── VAPID JWT ───────────────────────────────────────────────

async function createVapidAuth(
  endpoint: string,
  vapidJwk: JsonWebKey,
  vapidPublicKeyB64: string
): Promise<string> {
  const origin = new URL(endpoint).origin;

  // Build JWT
  const header = base64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64urlEncode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:noreply@yapp.app',
  }));

  const data = new TextEncoder().encode(`${header}.${payload}`);

  // Import VAPID private key for signing
  const signingKey = await crypto.subtle.importKey(
    'jwk', vapidJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  // Sign (Web Crypto produces IEEE P1363 format = r||s, exactly what JWS ES256 needs)
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey, data
  ));

  const jwt = `${header}.${payload}.${base64urlEncodeBytes(signature)}`;
  return `vapid t=${jwt}, k=${vapidPublicKeyB64}`;
}

// ─── HKDF helper ─────────────────────────────────────────────

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

// ─── Base64url helpers ───────────────────────────────────────

function base64urlDecode(str: string): Uint8Array {
  // Pad to multiple of 4
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlEncode(str: string): string {
  return base64urlEncodeBytes(new TextEncoder().encode(str));
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Byte array helpers ──────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ─── CORS ────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}
