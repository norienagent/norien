import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponseSchema, paginated, paginationQuery } from '../validation/common.js';
import {
  agentResponseSchema,
  agentSlugParamsSchema,
  agentVersionQuerySchema,
  agentVersionResponseSchema,
  createAgentSchema,
  listAgentsQuerySchema,
  updateAgentSchema,
} from '../validation/agent.schema.js';

/**
 * Routes stay declarative: validate, delegate to a service, serialise. Any
 * logic that appears here belongs in a service instead.
 */
export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  const errors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    422: errorResponseSchema,
  };

  app.get(
    '/agents',
    {
      schema: {
        tags: ['Agents'],
        summary: 'List agents',
        description:
          'Paginated catalogue of agents. Supports full-text search, tag and author filters, and filtering by required tool.',
        querystring: listAgentsQuerySchema,
        response: { 200: paginated(agentResponseSchema), 422: errorResponseSchema },
      },
    },
    async (request) => app.services.agents.list(request.query, request.principal),
  );

  app.get(
    '/agents/:slug',
    {
      schema: {
        tags: ['Agents'],
        summary: 'Get an agent',
        description:
          'Returns the agent at its latest version, or at a specific version/range via `?version=`.',
        params: agentSlugParamsSchema,
        querystring: agentVersionQuerySchema,
        response: { 200: agentResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.agents.getBySlugAtVersion(
        request.params.slug,
        request.query.version,
        request.principal,
      ),
  );

  app.get(
    '/agents/:slug/versions',
    {
      schema: {
        tags: ['Agents'],
        summary: 'List published versions of an agent',
        params: agentSlugParamsSchema,
        querystring: paginationQuery,
        response: { 200: paginated(agentVersionResponseSchema), 404: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.agents.listVersions(request.params.slug, request.query, request.principal),
  );

  app.post(
    '/agents',
    {
      schema: {
        tags: ['Agents'],
        summary: 'Publish a new agent',
        description:
          'Creates an agent and its first version. Accepts either a manifest or explicit fields; explicit fields take precedence. Fails with 409 if the slug is taken -- use POST /publish to add a version.',
        body: createAgentSchema,
        response: { 201: agentResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const agent = await app.services.agents.create(request.body, request.principal);
      return reply.status(201).send(agent);
    },
  );

  app.patch(
    '/agents/:slug',
    {
      schema: {
        tags: ['Agents'],
        summary: 'Update agent metadata',
        description:
          'Updates presentation and distribution metadata. Published version payloads are immutable -- publish a new version to change them.',
        params: agentSlugParamsSchema,
        body: updateAgentSchema,
        response: { 200: agentResponseSchema, ...errors },
      },
    },
    async (request) =>
      app.services.agents.update(request.params.slug, request.body, request.principal),
  );

  app.delete(
    '/agents/:slug',
    {
      schema: {
        tags: ['Agents'],
        summary: 'Remove an agent',
        description:
          'Soft-deletes the agent. The slug stays reserved so previously published references can never be repointed.',
        params: agentSlugParamsSchema,
        response: {
          204: z.null().describe('Deleted.'),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await app.services.agents.remove(request.params.slug, request.principal);
      return reply.status(204).send(null);
    },
  );
};
