import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../core/errors.js';
import { requireUser } from '../core/principal.js';
import { getDb } from '../db/client.js';
import type { ApiKeyRow } from '../db/schema/api-keys.js';
import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { generateKey } from '../services/api-key.service.js';
import { errorResponseSchema } from '../validation/common.js';

/**
 * Personal API key management.
 *
 * Authenticated with the caller's session (a Supabase JWT) — this is the web
 * minting keys for a signed-in user. The keys it issues authenticate the CLI,
 * SDKs, and scripts as that same user via `Authorization: Bearer norien_…`.
 * The plaintext is returned exactly once, on creation, and never stored.
 */

const MAX_KEYS_PER_USER = 10;

const keySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

function toSummary(row: ApiKeyRow): z.infer<typeof keySummarySchema> {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export const keyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/keys',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'List your API keys',
        description: 'The signed-in user’s keys, newest first. Never returns the secret itself.',
        response: {
          200: z.object({ data: z.array(keySummarySchema) }),
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const principal = requireUser(request.principal);
      const db = await getDb();
      const rows = await new ApiKeyRepository(db).listByHandle(principal.handle);
      return { data: rows.map(toSummary) };
    },
  );

  app.post(
    '/api/keys',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Create an API key',
        description:
          'Mints a key for the signed-in user and returns the plaintext once. Store it now — it cannot be shown again.',
        body: z.object({ name: z.string().trim().min(1).max(80).optional() }),
        response: {
          201: z.object({ key: z.string(), data: keySummarySchema }),
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = requireUser(request.principal);
      const db = await getDb();
      const repo = new ApiKeyRepository(db);

      const active = await repo.countActiveByHandle(principal.handle);
      if (active >= MAX_KEYS_PER_USER) {
        throw AppError.badRequest(
          `You already have ${MAX_KEYS_PER_USER} active keys — revoke one before creating another.`,
        );
      }

      // Materialise the user row so the handle is a real owner going forward.
      await new UserRepository(db).ensureByHandle(principal.handle);

      const { plaintext, prefix, keyHash } = generateKey();
      const row = await repo.insert({
        handle: principal.handle,
        subject: principal.userId,
        name: request.body.name?.trim() || 'API key',
        prefix,
        keyHash,
      });

      return reply.status(201).send({ key: plaintext, data: toSummary(row) });
    },
  );

  app.delete(
    '/api/keys/:id',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Revoke an API key',
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ revoked: z.boolean() }),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const principal = requireUser(request.principal);
      const db = await getDb();
      const revoked = await new ApiKeyRepository(db).revoke(request.params.id, principal.handle);
      if (!revoked) throw AppError.notFound('API key', request.params.id);
      return { revoked: true };
    },
  );
};
