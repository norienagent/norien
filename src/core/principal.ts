import { AppError } from './errors.js';

/**
 * The identity performing a request.
 *
 * Today this is resolved from a development header, but every service already
 * takes a `Principal` and enforces ownership through it. Adding sessions, API
 * keys, or organisation membership in a later phase means changing only the
 * resolver in `middleware/auth.ts` -- no service signature changes.
 */

export type PrincipalKind = 'anonymous' | 'user' | 'api_key' | 'service';

export interface Principal {
  kind: PrincipalKind;
  /** Stable id of the acting user. Null for anonymous callers. */
  userId: string | null;
  /** Human-readable handle used as the author of published artifacts. */
  handle: string;
  /** Reserved for future team/organisation scoping. */
  organisationId: string | null;
  scopes: readonly string[];
}

export const ANONYMOUS_PRINCIPAL: Principal = Object.freeze({
  kind: 'anonymous',
  userId: null,
  handle: 'anonymous',
  organisationId: null,
  scopes: Object.freeze([]) as readonly string[],
});

/**
 * Asserts the caller is identified.
 *
 * Note this checks `kind`, not `userId`: a publisher's row is materialised on
 * their first write, so a brand-new account is authenticated before it has an
 * id. Services that need a concrete id call `ensureByHandle`.
 */
export function requireUser(principal: Principal): Principal {
  if (principal.kind === 'anonymous') {
    throw AppError.unauthorized();
  }
  return principal;
}

/**
 * Central ownership check. Every mutation funnels through here so the rules
 * stay in one place when teams and organisations arrive.
 */
export function assertCanMutate(
  principal: Principal,
  resource: { ownerId: string | null; kind: string; slug: string },
): void {
  const user = requireUser(principal);

  // An owned resource requires a matching id. A caller with no id yet cannot
  // own anything, so they are correctly refused here.
  if (resource.ownerId !== null && resource.ownerId !== user.userId) {
    throw AppError.forbidden(`You are not the owner of ${resource.kind} '${resource.slug}'.`);
  }
}

/** Whether a principal may see a private resource. */
export function canRead(
  principal: Principal,
  resource: { ownerId: string | null; visibility: 'public' | 'private' },
): boolean {
  if (resource.visibility === 'public') return true;
  return principal.userId !== null && principal.userId === resource.ownerId;
}
