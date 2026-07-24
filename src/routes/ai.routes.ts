import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../core/errors.js';
import { groqService } from '../services/ai/groq.js';
import { errorResponseSchema } from '../validation/common.js';

/**
 * AI helpers, powered by Groq.
 *
 * Currently: generate a draft `agent.json` from a plain-English description, to
 * lower the barrier to publishing. The output is a draft the author reviews and
 * validates — never published automatically.
 */

const MANIFEST_SYSTEM = `You generate a Norien agent manifest (agent.json). Output ONLY a JSON object, no prose, matching exactly this shape:
{"name":string,"version":"0.1.0","description":string,"runtime":"node"|"python","entrypoint":string,"commands":{"start":string,"health":string},"tools":string[],"permissions":string[],"environment":[{"name":string,"required":boolean,"secret":boolean}]}
Rules: choose the runtime that best fits the description; entrypoint like index.js (node) or main.py (python); commands.start runs the agent and commands.health reports health; tools are short lowercase-kebab slugs; permissions look like network:fetch; environment lists the API keys/config the agent needs, marking secrets with secret:true. Keep it realistic and minimal. Always include a health command.`;

export const aiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/api/ai/manifest',
    {
      schema: {
        tags: ['AI'],
        summary: 'Generate a draft agent.json',
        description:
          'Turns a plain-English description into a draft Norien manifest. A starting point the author reviews and validates — never auto-published.',
        body: z.object({ description: z.string().trim().min(5).max(1000) }),
        response: {
          200: z.object({ manifest: z.record(z.string(), z.unknown()) }),
          400: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!groqService.configured) {
        throw AppError.badRequest('AI generation is not enabled on this deployment.');
      }

      let content: string;
      try {
        content = await groqService.chat(
          [
            { role: 'system', content: MANIFEST_SYSTEM },
            { role: 'user', content: request.body.description },
          ],
          { json: true, temperature: 0.4, maxTokens: 800 },
        );
      } catch (error) {
        throw AppError.internal('Could not generate a manifest. Please try again.', error);
      }

      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(content) as Record<string, unknown>;
      } catch {
        throw AppError.internal('The generated manifest was not valid JSON. Try rephrasing.');
      }

      return reply.send({ manifest });
    },
  );
};
