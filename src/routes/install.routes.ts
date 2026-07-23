import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponseSchema, paginated } from '../validation/common.js';
import {
  installRequestSchema,
  installResultSchema,
  installationResponseSchema,
  listInstallationsQuerySchema,
  uninstallRequestSchema,
} from '../validation/install.schema.js';

export const installRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/install',
    {
      schema: {
        tags: ['Installations'],
        summary: 'Install an agent',
        description:
          'Resolves the requested version or range against what has been published, records the installation, and returns everything needed to run the agent -- including its resolved tool dependencies. Repeated calls are idempotent.',
        body: installRequestSchema,
        response: {
          201: installResultSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await app.services.installations.install(request.body, request.principal);
      return reply.status(201).send(result);
    },
  );

  app.get(
    '/installations',
    {
      schema: {
        tags: ['Installations'],
        summary: 'List the current principal\'s installations',
        querystring: listInstallationsQuerySchema,
        response: { 200: paginated(installationResponseSchema), 401: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.installations.listForPrincipal(request.query, request.principal),
  );

  app.post(
    '/uninstall',
    {
      schema: {
        tags: ['Installations'],
        summary: 'Uninstall an agent',
        description: 'Tombstones the active installation, preserving install history.',
        body: uninstallRequestSchema,
        response: {
          204: z.null().describe('Uninstalled.'),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await app.services.installations.uninstall(request.body.agent, request.principal);
      return reply.status(204).send(null);
    },
  );
};
