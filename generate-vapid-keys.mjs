/**
 * generate-vapid-keys.mjs
 *
 * Run once to generate VAPID keys for the Cloudflare Worker:
 *   node generate-vapid-keys.mjs
 *
 * Then follow the printed instructions to configure the Worker and client.
 */

import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

function bufToBase64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// 1. Generate VAPID key pair (ECDSA P-256)
const keyPair = await subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

const publicKeyRaw = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
const privateKeyJwk = await subtle.exportKey('jwk', keyPair.privateKey);

const publicKeyBase64url = bufToBase64url(publicKeyRaw);
const privateKeyJwkString = JSON.stringify(privateKeyJwk);

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║                 VAPID Keys Generated                    ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');
console.log('── Step 1: Set Cloudflare Worker secrets ──');
console.log('  cd worker');
console.log(`  npx wrangler secret put VAPID_PRIVATE_JWK`);
console.log(`  → Paste: ${privateKeyJwkString}`);
console.log('');
console.log(`  npx wrangler secret put VAPID_PUBLIC_KEY`);
console.log(`  → Paste: ${publicKeyBase64url}`);
console.log('');
console.log('  Also set these worker secrets for server-side RTDB access:');
console.log('  FIREBASE_DATABASE_URL');
console.log('  FIREBASE_WEB_API_KEY');
console.log('  FIREBASE_SERVICE_ACCOUNT_EMAIL');
console.log('  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY');
console.log('');
console.log('── Step 2: Update client env ──');
console.log(`  VITE_VAPID_PUBLIC_KEY = '${publicKeyBase64url}'`);
console.log('');
console.log('── Step 3: Deploy the Worker ──');
console.log('  cd worker');
console.log('  npm install');
console.log('  npx wrangler deploy');
console.log('  → Copy the Worker URL and paste it into src/pushConfig.ts as PUSH_WORKER_URL');
console.log('');
