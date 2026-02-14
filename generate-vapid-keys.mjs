/**
 * generate-vapid-keys.mjs
 *
 * Run once to generate VAPID keys and an API key for the Cloudflare Worker:
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

// 2. Generate a random API key
const apiKeyBytes = new Uint8Array(32);
webcrypto.getRandomValues(apiKeyBytes);
const apiKey = bufToBase64url(apiKeyBytes);

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           VAPID Keys & API Key Generated                ║');
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
console.log(`  npx wrangler secret put PUSH_API_KEY`);
console.log(`  → Paste: ${apiKey}`);
console.log('');
console.log('── Step 2: Update src/pushConfig.ts ──');
console.log(`  VAPID_PUBLIC_KEY = '${publicKeyBase64url}'`);
console.log(`  PUSH_API_KEY    = '${apiKey}'`);
console.log('');
console.log('── Step 3: Deploy the Worker ──');
console.log('  cd worker');
console.log('  npm install');
console.log('  npx wrangler deploy');
console.log('  → Copy the Worker URL and paste it into src/pushConfig.ts as PUSH_WORKER_URL');
console.log('');
