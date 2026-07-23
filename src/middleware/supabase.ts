import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { slugify } from '../utils/slug.js';

/**
 * Supabase session verification.
 *
 * A web user signs in through Supabase (GitHub/Google) and the browser sends the
 * resulting JWT as `Authorization: Bearer <jwt>`. This verifies that token
 * against the project's public JWKS — the Supabase project signs with an
 * asymmetric ES256 key, so verification needs only the public keys, never a
 * shared secret.
 *
 * Verification is additive: it runs before the header-based fallback in
 * `resolvePrincipal`, and anything that is not a valid Supabase JWT (for
 * instance the CLI's own Bearer API key) simply returns null and falls through.
 */

export interface SupabaseIdentity {
  /** Supabase user UUID (the JWT `sub`). Stable across logins. */
  subject: string;
  email: string | null;
  /** Derived Norien handle: the OAuth username where possible. */
  handle: string;
}

/**
 * A remote JWK set, fetched once and cached (with periodic refresh) by jose.
 * Created lazily so the registry starts even when Supabase is not configured.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

/**
 * Derives a Norien handle from Supabase user metadata.
 *
 * Prefers the OAuth username (GitHub's `user_name`, Google's `preferred_username`)
 * so a published artifact is attributed to a recognisable name, and falls back
 * to the email local part. Always returns a valid slug.
 */
function deriveHandle(claims: Record<string, unknown>): string {
  const metadata = (claims.user_metadata as Record<string, unknown> | undefined) ?? {};
  const email = typeof claims.email === 'string' ? claims.email : null;

  const candidates = [
    metadata.user_name,
    metadata.preferred_username,
    metadata.nickname,
    metadata.name,
    email ? email.split('@')[0] : undefined,
    claims.sub,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const handle = slugify(candidate);
      if (handle.length > 0) return handle;
    }
  }

  // A UUID always slugifies to something valid, so this is only a last resort.
  return slugify(String(claims.sub ?? 'user'));
}

/**
 * Verifies a Bearer token as a Supabase session JWT.
 *
 * Returns the identity on success, or null for a missing/invalid/non-Supabase
 * token — never throws, so the caller can fall through to header-based
 * identification without special-casing failures.
 */
export async function verifySupabaseToken(authorization: string | undefined): Promise<SupabaseIdentity | null> {
  if (!env.SUPABASE_URL) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  const token = match?.[1]?.trim();
  if (!token) return null;

  // A Supabase session JWT has three dot-separated segments. The CLI's opaque
  // API key does not, so this cheap check avoids a pointless verify attempt.
  if (token.split('.').length !== 3) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL), {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      handle: deriveHandle(payload as Record<string, unknown>),
    };
  } catch {
    // Expired, wrong issuer/audience, bad signature, or simply not a Supabase
    // token: all resolve to "unauthenticated by this method".
    return null;
  }
}
