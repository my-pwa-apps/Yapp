/**
 * Cryptographically verify a Firebase ID token (JWT, RS256).
 * Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 *
 * - iss == https://securetoken.google.com/<projectId>
 * - aud == <projectId>
 * - exp > now, iat <= now, auth_time <= now
 * - kid in Google public keys
 * - signature verifies with that key
 */

interface PublicKeyCache {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
}

let cachedKeys: PublicKeyCache | null = null;

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface VerifiedIdToken {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<VerifiedIdToken | null> {
  try {
    const [headerB64, payloadB64, sigB64] = idToken.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const header = JSON.parse(utf8FromB64url(headerB64)) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;

    const payload = JSON.parse(utf8FromB64url(payloadB64)) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);

    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
    if (typeof payload.auth_time !== 'number' || payload.auth_time > now + 60) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    const keys = await getPublicKeys();
    const key = keys.get(header.kid);
    if (!key) return null;

    const signedBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64urlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      signedBytes
    );
    if (!valid) return null;

    return {
      uid: payload.sub as string,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return null;
  }
}

async function getPublicKeys(): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now + 60_000) {
    return cachedKeys.keys;
  }
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error(`Failed to fetch Google public keys: ${res.status}`);

  // Respect Cache-Control max-age; fall back to 1 hour
  const cacheControl = res.headers.get('Cache-Control') || '';
  const maxAgeMatch = /max-age=(\d+)/.exec(cacheControl);
  const ttlMs = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600_000;

  const certs = (await res.json()) as Record<string, string>;
  const keys = new Map<string, CryptoKey>();
  await Promise.all(
    Object.entries(certs).map(async ([kid, pem]) => {
      try {
        const key = await importRsaPublicKeyFromPem(pem);
        keys.set(kid, key);
      } catch {
        /* skip malformed cert */
      }
    })
  );

  cachedKeys = { keys, expiresAt: now + ttlMs };
  return keys;
}

async function importRsaPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  // Extract SubjectPublicKeyInfo from x509 cert via SPKI.
  // Cloudflare Workers support importKey('spki'), but these PEMs are full certificates.
  // Parse out the SPKI bytes from the DER cert.
  const der = pemToDer(pem);
  const spki = extractSpkiFromCertificateDer(der);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Minimal ASN.1/DER parser to locate the SubjectPublicKeyInfo (SPKI) inside an
 * X.509 certificate. Returns SPKI bytes suitable for crypto.subtle.importKey('spki').
 *
 * Cert structure:
 *   Certificate ::= SEQUENCE {
 *     tbsCertificate       TBSCertificate,
 *     signatureAlgorithm   AlgorithmIdentifier,
 *     signatureValue       BIT STRING
 *   }
 *   TBSCertificate ::= SEQUENCE {
 *     [0] version, serial, signature, issuer, validity, subject,
 *     subjectPublicKeyInfo SubjectPublicKeyInfo,
 *     ...
 *   }
 */
function extractSpkiFromCertificateDer(der: Uint8Array): Uint8Array {
  // Outer SEQUENCE (certificate)
  const outer = readTlv(der, 0);
  if (outer.tag !== 0x30) throw new Error('Not a SEQUENCE');

  // Inside: tbsCertificate (SEQUENCE)
  const tbs = readTlv(der, outer.headerLen);
  if (tbs.tag !== 0x30) throw new Error('Not a TBS SEQUENCE');

  // Walk the TBS children, skipping the first 6 fields (version[0], serial,
  // signature, issuer, validity, subject). The 7th is SPKI.
  let offset = tbs.contentStart;
  const end = tbs.contentStart + tbs.contentLen;

  // [0] version — explicit tag, optional. Skip if present.
  const firstTag = der[offset];
  if (firstTag === 0xa0) {
    const v = readTlv(der, offset);
    offset += v.totalLen;
  }
  // Skip: serial (INTEGER), signature (SEQUENCE), issuer (SEQUENCE), validity (SEQUENCE), subject (SEQUENCE)
  for (let i = 0; i < 5 && offset < end; i++) {
    const field = readTlv(der, offset);
    offset += field.totalLen;
  }
  // Next should be subjectPublicKeyInfo
  const spki = readTlv(der, offset);
  if (spki.tag !== 0x30) throw new Error('SPKI not found');
  return der.subarray(offset, offset + spki.totalLen);
}

function readTlv(buf: Uint8Array, offset: number): {
  tag: number;
  headerLen: number;
  contentLen: number;
  contentStart: number;
  totalLen: number;
} {
  const tag = buf[offset];
  const lenByte = buf[offset + 1];
  let contentLen: number;
  let headerLen: number;
  if ((lenByte & 0x80) === 0) {
    contentLen = lenByte;
    headerLen = 2;
  } else {
    const numLenBytes = lenByte & 0x7f;
    contentLen = 0;
    for (let i = 0; i < numLenBytes; i++) {
      contentLen = (contentLen << 8) | buf[offset + 2 + i];
    }
    headerLen = 2 + numLenBytes;
  }
  return {
    tag,
    headerLen,
    contentLen,
    contentStart: offset + headerLen,
    totalLen: headerLen + contentLen,
  };
}

function utf8FromB64url(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

function b64urlToBytes(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
