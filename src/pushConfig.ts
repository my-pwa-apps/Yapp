/**
 * Push notification configuration.
 *
 * Set these values in a .env file (see .env.example):
 *   VITE_VAPID_PUBLIC_KEY=<base64url 65-byte uncompressed P-256 key>
 *   VITE_PUSH_WORKER_URL=<Cloudflare Worker URL>
 *
 * Generate VAPID keys:  node generate-vapid-keys.mjs
 * Deploy Worker:        cd worker && npm install && npx wrangler deploy
 */

/** VAPID public key (base64url-encoded 65-byte uncompressed P-256 key) */
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

/** Cloudflare Worker URL (e.g. https://yapp-push.<subdomain>.workers.dev) */
export const PUSH_WORKER_URL = import.meta.env.VITE_PUSH_WORKER_URL ?? '';
