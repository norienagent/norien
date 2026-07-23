import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { env, isProduction } from '../config/env.js';
import { ANONYMOUS_PRINCIPAL, type Principal } from '../core/principal.js';
import { getDb } from '../db/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { isValidSlug } from '../utils/slug.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}

/**
 * Principal resolution.
 *
 * Today a development header is trusted so that ownership, visibility, and
 * install attribution are exercised end to end without a login flow. A later phase
 * replaces the body of `resolvePrincipal` with session/API-key verification;
 * nothing downstream changes, because every service already depends only on
 * the `Principal` interface.
 */
async function resolvePrincipal(request: FastifyRequest): Promise<Principal> {
  const header = request.headers[env.DEV_PRINCIPAL_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
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
    scopes: ['agents:write', 'tools:write', 'install'],
  };
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  if (isProduction) {
    app.log.warn(
      'Running with development principal resolution. Replace middleware/auth.ts before exposing this registry publicly.',
    );
  }

  // Declared without a value: Fastify 5 refuses reference-type defaults on
  // request decorators, since one object would be shared by every request.
  app.decorateRequest('principal');

  app.addHook('onRequest', async (request) => {
    request.principal = await resolvePrincipal(request);
  });
});
