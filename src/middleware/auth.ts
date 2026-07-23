import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { env, isProduction } from '../config/env.js';
import { ANONYMOUS_PRINCIPAL, type Principal } from '../core/principal.js';
import { getDb } from '../db/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { isValidSlug } from '../utils/slug.js';
import { verifySupabaseToken } from './supabase.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}

const USER_SCOPES = ['agents:write', 'tools:write', 'install'] as const;

/**
 * Principal resolution — two paths, tried in order.
 *
 * 1. A Supabase session JWT (`Authorization: Bearer <jwt>`), the way a web user
 *    authenticates after signing in with GitHub or Google. Verified against the
 *    project's public JWKS.
 * 2. The development handle header (`x-norien-actor`), the way the CLI and every
 *    existing flow identify themselves. Unchanged.
 *
 * The JWT path is additive: anything that is not a valid Supabase token falls
 * through to the header, so adding real auth breaks neither the CLI nor the
 * tests. Every service still depends only on the `Principal` interface.
 */
async function resolvePrincipal(request: FastifyRequest): Promise<Principal> {
  const authorization = firstHeader(request.headers.authorization);
  const identity = await verifySupabaseToken(authorization);

  if (identity) {
    const db = await getDb();
    const user = await new UserRepository(db).findByHandle(identity.handle);
    return {
      kind: 'user',
      userId: user?.id ?? null,
      handle: identity.handle,
      organisationId: null,
      scopes: [...USER_SCOPES],
    };
  }

  const raw = firstHeader(request.headers[env.DEV_PRINCIPAL_HEADER]);
  const handle = (raw ?? env.DEV_PRINCIPAL_FALLBACK).trim().toLowerCase();

  if (!handle || handle === 'anonymous' || !isValidSlug(handle)) {
    return ANONYMOUS_PRINCIPAL;
  }

  const db = await getDb();
  const user = await new UserRepository(db).findByHandle(handle);

  return {
    kind: 'user',
    // A publisher that has never published yet has no row; the id is
    // materialised on their first write, so reads still work anonymously.
    userId: user?.id ?? null,
    handle,
    organisationId: null,
    scopes: [...USER_SCOPES],
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  if (isProduction && !env.SUPABASE_URL) {
    app.log.warn(
      'No SUPABASE_URL set: only header-based identification is active. Set it to verify Supabase session JWTs before treating writes as authenticated.',
    );
  } else if (env.SUPABASE_URL) {
    app.log.info('Supabase session verification enabled.');
  }

  // Declared without a value: Fastify 5 refuses reference-type defaults on
  // request decorators, since one object would be shared by every request.
  app.decorateRequest('principal');

  app.addHook('onRequest', async (request) => {
    request.principal = await resolvePrincipal(request);
  });
});
