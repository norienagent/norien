import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponseSchema, paginated, paginationQuery } from '../validation/common.js';
import {
  createToolSchema,
  listToolsQuerySchema,
  searchToolsQuerySchema,
  toolInstallQuerySchema,
  toolInstallResultSchema,
  toolResponseSchema,
  toolSlugParamsSchema,
  toolVersionResponseSchema,
  updateToolSchema,
} from '../validation/tool.schema.js';

/**
 * Tool marketplace routes.
 *
 * `/tools/search`, `/tools/publish`, and `/tools/install` are the marketplace
 * verbs; the plain `/tools` collection remains for CRUD. Static segments take
 * precedence over the `/:slug` parameter in Fastify's router, so ordering here
 * is not load-bearing.
 */
export const toolRoutes: FastifyPluginAsyncZod = async (app) => {
  const errors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    422: errorResponseSchema,
  };

  app.get(
    '/tools',
    {
      schema: {
        tags: ['Tools'],
        summary: 'List tools',
        description: 'Paginated tool catalogue with category, runtime, tag, and author filters.',
        querystring: listToolsQuerySchema,
        response: { 200: paginated(toolResponseSchema), 422: errorResponseSchema },
      },
    },
    async (request) => app.services.tools.list(request.query, request.principal),
  );

  app.get(
    '/tools/search',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Search the tool marketplace',
        description:
          'Ranked full-text search restricted to tools. Distinct from the cross-catalogue /search.',
        querystring: searchToolsQuerySchema,
        response: { 200: paginated(toolResponseSchema), 422: errorResponseSchema },
      },
    },
    async (request) => app.services.tools.search(request.query, request.principal),
  );

  app.post(
    '/tools',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Publish a new tool',
        description:
          'Creates a tool and its first version from a tool.json manifest. Fails with 409 if the slug is taken -- use POST /tools/publish to add a version.',
        body: createToolSchema,
        response: { 201: toolResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const tool = await app.services.tools.create(request.body, request.principal);
      return reply.status(201).send(tool);
    },
  );

  app.post(
    '/tools/publish',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Publish or version a tool',
        description:
          'Upsert-shaped: creates the tool on first publish and appends an immutable version thereafter. The endpoint the CLI targets.',
        body: createToolSchema,
        response: { 201: toolResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      const tool = await app.services.tools.publish(request.body, request.principal);
      return reply.status(201).send(tool);
    },
  );

  app.post(
    '/tools/install',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Resolve a tool for installation',
        description:
          'Resolves a version or range to a concrete published version and returns the full manifest plus its dependency tools, so a client can materialise the tool locally in one round trip.',
        body: z.object({
          tool: toolSlugParamsSchema.shape.slug,
          version: toolInstallQuerySchema.shape.version,
        }),
        response: {
          201: toolInstallResultSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await app.services.tools.install(
        request.body.tool,
        request.body.version,
        request.principal,
      );
      return reply.status(201).send(result);
    },
  );

  app.get(
    '/tools/:slug',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Get a tool',
        params: toolSlugParamsSchema,
        response: { 200: toolResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => app.services.tools.getBySlug(request.params.slug, request.principal),
  );

  app.get(
    '/tools/:slug/versions',
    {
      schema: {
        tags: ['Tools'],
        summary: 'List published versions of a tool',
        params: toolSlugParamsSchema,
        querystring: paginationQuery,
        response: { 200: paginated(toolVersionResponseSchema), 404: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.tools.listVersions(request.params.slug, request.query, request.principal),
  );

  app.patch(
    '/tools/:slug',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Update tool metadata',
        params: toolSlugParamsSchema,
        body: updateToolSchema,
        response: { 200: toolResponseSchema, ...errors },
      },
    },
    async (request) =>
      app.services.tools.update(request.params.slug, request.body, request.principal),
  );

  app.delete(
    '/tools/:slug',
    {
      schema: {
        tags: ['Tools'],
        summary: 'Remove a tool',
        description:
          'Soft-deletes the tool. Refused with 409 while any agent still declares it as a dependency.',
        params: toolSlugParamsSchema,
        response: {
          204: z.null().describe('Deleted.'),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await app.services.tools.remove(request.params.slug, request.principal);
      return reply.status(204).send(null);
    },
  );
};
