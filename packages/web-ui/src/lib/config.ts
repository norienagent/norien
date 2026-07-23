/**
 * Service and subdomain origins.
 *
 * Declared once so the value can never drift between the data layer, the address
 * route handler, cross-subdomain links, and the pages that display these origins
 * back to the user.
 *
 * Not marked `server-only`: several pages render these origins as text, which is
 * harmless — they are addresses, not credentials.
 */

/** The Norien registry / unified data API. Backend, unchanged. */
export const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

/** The runtime supervisor. Optional — not running is a valid local state. */
export const RUNTIME_URL = process.env.NORIEN_RUNTIME_URL ?? 'http://127.0.0.1:4123';

/**
 * Public subdomains. Each app is deployed independently, so any app that links
 * to another builds the URL from these. Dev falls back to distinct local ports:
 * marketing 3001, app 3002, docs 3003 (the registry owns 3000).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3003';

/** Cookie domain for cross-subdomain auth, e.g. `.norien.live`. Unset locally. */
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
