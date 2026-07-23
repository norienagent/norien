import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { agentResponseSchema } from '../validation/agent.schema.js';
import { errorResponseSchema } from '../validation/common.js';
import { toolResponseSchema } from '../validation/tool.schema.js';

const publishResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent'), agent: agentResponseSchema }),
  z.object({ type: z.literal('tool'), tool: toolResponseSchema }),
]);

export const publishRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/publish',
    {
      schema: {
        tags: ['Publishing'],
        summary: 'Publish an agent or tool',
        description:
          'Upsert-shaped publishing endpoint intended for the CLI: creates on first publish and appends an immutable version thereafter. `type` may be omitted when the payload is unambiguous (a `manifest` implies an agent; `input_schema` implies a tool).',
        // The body is deliberately loose here: the service picks the concrete
        // schema after resolving the payload type, and reports failures with
        // the same detail shape as the typed endpoints.
        body: z.record(z.string(), z.unknown()),
        response: {
          201: publishResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await app.services.publish.publish(request.body, request.principal);
      return reply.status(201).send(result);
    },
  );
};
