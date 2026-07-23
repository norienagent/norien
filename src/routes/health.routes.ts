import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../config/env.js';
import { pingDatabase } from '../db/client.js';

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.string(),
  uptime_seconds: z.number(),
  checks: z.object({
    database: z.object({
      ok: z.boolean(),
      driver: z.string().optional(),
      latency_ms: z.number().optional(),
      error: z.string().optional(),
    }),
  }),
});

const SERVICE_VERSION = process.env.npm_package_version ?? '0.1.0';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Service health',
        description:
          'Liveness and dependency check. Returns 503 with `status: degraded` when the database is unreachable, so a load balancer can act on it.',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const uptime = Math.round(process.uptime());

      try {
        const database = await pingDatabase();
        return reply.status(200).send({
          status: 'ok' as const,
          version: SERVICE_VERSION,
          environment: env.NODE_ENV,
          uptime_seconds: uptime,
          checks: {
            database: { ok: true, driver: database.driver, latency_ms: database.latencyMs },
          },
        });
      } catch (error) {
        app.log.error({ err: error }, 'health check failed');
        return reply.status(503).send({
          status: 'degraded' as const,
          version: SERVICE_VERSION,
          environment: env.NODE_ENV,
          uptime_seconds: uptime,
          checks: { database: { ok: false, error: 'Database is unreachable.' } },
        });
      }
    },
  );
};
