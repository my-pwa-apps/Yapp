import { createSign } from 'node:crypto';

const required = [
  'FIREBASE_DATABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT_EMAIL',
  'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const databaseUrl = process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '');
const serviceAccountEmail = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
const serviceAccountPrivateKey = process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');

const accessToken = await getAccessToken(serviceAccountEmail, serviceAccountPrivateKey);
const yapps = await fetchJson('yapps', accessToken);

if (!yapps) {
  console.log('No yapps found.');
  process.exit(0);
}

const updates = {};

for (const [yappId, yapp] of Object.entries(yapps)) {
  if (!yapp || typeof yapp !== 'object') continue;
  const timestamp = typeof yapp.timestamp === 'number' ? yapp.timestamp : Date.now();
  if (yapp.parentId) {
    updates[`replyYappIds/${yapp.parentId}/${yappId}`] = timestamp;
    continue;
  }
  if ((yapp.privacy ?? 'public') === 'contacts') {
    updates[`privateAuthorYappIds/${yapp.authorId}/${yappId}`] = timestamp;
  } else {
    updates[`publicYappIds/${yappId}`] = timestamp;
    updates[`publicAuthorYappIds/${yapp.authorId}/${yappId}`] = timestamp;
  }
}

await fetch(`${databaseUrl}/.json?access_token=${encodeURIComponent(accessToken)}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updates),
});

console.log(`Backfilled ${Object.keys(updates).length} yapp index entries.`);

async function fetchJson(path, token) {
  const res = await fetch(`${databaseUrl}/${path}.json?access_token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getAccessToken(email, privateKey) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: email,
    sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    iat: issuedAt,
    exp: expiresAt,
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to obtain access token: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}