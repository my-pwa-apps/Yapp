/**
 * Push notification configuration.
 *
 * Fill in these values after running:
 *   node generate-vapid-keys.mjs
 *
 * Then deploy the Cloudflare Worker:
 *   cd worker && npm install && npx wrangler deploy
 * and paste the Worker URL below.
 */

/** VAPID public key (base64url-encoded 65-byte uncompressed P-256 key) */
export const VAPID_PUBLIC_KEY = 'BHLIOnB6TVsB7dgRA8KZVYTj4rRQlDkeuqFuiT_BfJ9HoCCW7pQz5u7kvWrjW54ntnopFjPOiVBPQmcgVKoM4cw';

/** Cloudflare Worker URL (e.g. https://yapp-push.<subdomain>.workers.dev) */
export const PUSH_WORKER_URL = 'https://yapp-push.garfieldapp.workers.dev';

/** Shared API key between client and Worker */
export const PUSH_API_KEY = 'hyeWeBXYs7C6w1IRKfzuWYN0Sx44YwSAPQT_OWoOH44';
