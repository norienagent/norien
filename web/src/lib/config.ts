/**
 * Service origins.
 *
 * Declared once so the default can never drift between the data layer, the
 * address route handler, the publish action, and the pages that display these
 * values back to the user.
 *
 * Not marked `server-only`: several pages render these origins as text, which
 * is harmless — they are addresses, not credentials.
 */

/** The Norien registry, which serves both the catalogue and the unified data API. */
export const API_URL = process.env.NORIEN_API_URL ?? 'http://127.0.0.1:3000';

/** The runtime supervisor. Optional — not running is a valid local state. */
export const RUNTIME_URL = process.env.NORIEN_RUNTIME_URL ?? 'http://127.0.0.1:4123';

/**
 * This app's own public origin, used where the UI reports where it is served
 * from. Falls back to the local dev port rather than guessing a domain.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
