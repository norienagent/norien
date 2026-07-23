import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponseSchema, paginated } from '../validation/common.js';
import { searchHitSchema, searchQuerySchema } from '../validation/search.schema.js';

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/search',
    {
      schema: {
        tags: ['Search'],
        summary: 'Search agents and tools',
        description:
          'Ranked full-text search across both catalogues. Results carry a relevance `score` and a `type` discriminant, so agents and tools can be shown in one merged list.',
        querystring: searchQuerySchema,
        response: { 200: paginated(searchHitSchema), 422: errorResponseSchema },
      },
    },
    async (request) => app.services.search.search(request.query, request.principal),
  );
};
