import { createHash, randomBytes } from 'node:crypto';

/**
 * API key minting and hashing.
 *
 * A key is `norien_` followed by 24 random bytes (base64url). Only its SHA-256
 * is ever persisted, so a database leak exposes no usable credential; the
 * plaintext exists just long enough to be returned once at creation.
 */

const KEY_PREFIX = 'norien_';
/** How much of the key is shown in listings — enough to recognise, not to use. */
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 7;

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateKey(): { plaintext: string; prefix: string; keyHash: string } {
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
    keyHash: hashKey(plaintext),
  };
}

/** True when a bearer token is one of our API keys rather than a session JWT. */
export function isApiKey(token: string | undefined): token is string {
  return typeof token === 'string' && token.startsWith(KEY_PREFIX);
}
