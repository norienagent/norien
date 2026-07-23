import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { agentSlugParamsSchema } from '../validation/agent.schema.js';
import { errorResponseSchema } from '../validation/common.js';
import {
  normalizedAgentSchema,
  runtimeInspectSchema,
  runtimeQuerySchema,
} from '../validation/runtime.schema.js';

/**
 * The runtime layer.
 *
 * Both endpoints answer the same question -- "does the platform understand this
 * agent, and could it run here?" -- one for a published agent, one for an
 * `agent.json` that has not been published yet. Neither executes anything.
 */
export const runtimeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/agents/:slug/runtime',
    {
      schema: {
        tags: ['Runtime'],
        summary: 'Normalized runtime view of a published agent',
        description: [
          'Parses the manifest, detects the runtime, resolves every declared tool, and reports',
          'which environment variables are satisfied.',
          '',
          'Pass `?environment=A,B` to ask whether the agent could run with those variables set.',
          'Anything unsatisfied appears in `environment.missing` and in `diagnostics`, and',
          '`ready` becomes false.',
        ].join('\n'),
        params: agentSlugParamsSchema,
        querystring: runtimeQuerySchema,
        response: { 200: normalizedAgentSchema, 404: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.agents.describeRuntime(request.params.slug, request.principal, {
        ...(request.query.environment ? { environment: request.query.environment } : {}),
      }),
  );

  app.post(
    '/runtime/inspect',
    {
      schema: {
        tags: ['Runtime'],
        summary: 'Validate and normalize an agent.json before publishing',
        description: [
          'The pre-flight a CLI runs before `norien publish`. Validates the manifest, detects the',
          'runtime, resolves tool dependencies against the registry, and reports what publishing',
          'this version would do via `version_check.action`:',
          '',
          '- `create` — the slug is free',
          '- `new_version` — the version would be accepted',
          '- `conflict` — the version is already published or lower than the current latest',
          '',
          'Structural problems return 422. A manifest that parses but cannot be satisfied returns',
          '200 with `ready: false` and the reasons in `diagnostics`.',
        ].join('\n'),
        body: runtimeInspectSchema,
        response: { 200: normalizedAgentSchema, 422: errorResponseSchema },
      },
    },
    async (request) =>
      app.services.runtime.inspect(request.body.manifest, {
        ...(request.body.environment ? { environment: request.body.environment } : {}),
        ...(request.body.slug ? { slug: request.body.slug } : {}),
      }),
  );
};
