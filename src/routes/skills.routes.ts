import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { groqService } from '../services/ai/groq.js';
import { type ChatMessage, virtualsComputeService } from '../services/ai/virtuals.js';
import { errorResponseSchema, paginated } from '../validation/common.js';
import {
  listSkillsQuerySchema,
  publishSkillSchema,
  runSkillSchema,
  skillResponseSchema,
  skillSlugParamsSchema,
} from '../validation/skill.schema.js';

/** Same selection logic as chat: prefer CHAT_PROVIDER, fall back to whichever is configured. */
function chatProvider() {
  const preferred = env.CHAT_PROVIDER === 'groq' ? groqService : virtualsComputeService;
  if (preferred.configured) return preferred;
  if (virtualsComputeService.configured) return virtualsComputeService;
  if (groqService.configured) return groqService;
  return null;
}

/**
 * Skills — the runnable-capability catalogue.
 *
 * `/api/skills` lists and searches; `/api/skills/:slug` is the detail; publish
 * mirrors the tool marketplace; `/api/skills/:slug/run` is the payoff — it
 * resolves the skill's data source and streams a grounded result as SSE.
 */
export const skillRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/skills',
    {
      schema: {
        tags: ['Skills'],
        summary: 'List and search skills',
        description: 'Paginated catalogue of runnable skills, with full-text search and tag filters.',
        querystring: listSkillsQuerySchema,
        response: { 200: paginated(skillResponseSchema), 422: errorResponseSchema },
      },
    },
    async (request) => app.services.skills.list(request.query, request.principal),
  );

  app.get(
    '/api/skills/:slug',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Skill detail',
        params: skillSlugParamsSchema,
        response: { 200: skillResponseSchema, 404: errorResponseSchema, 422: errorResponseSchema },
      },
    },
    async (request) => app.services.skills.getBySlug(request.params.slug),
  );

  app.post(
    '/api/skills',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Publish a skill',
        description: 'Publish a new skill, or update your existing one with the same slug.',
        body: publishSkillSchema,
        response: {
          201: skillResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const skill = await app.services.skills.publish(request.body, request.principal);
      return reply.status(201).send(skill);
    },
  );

  app.post(
    '/api/skills/:slug/run',
    {
      schema: {
        tags: ['Skills'],
        summary: 'Run a skill (streaming)',
        description:
          'Runs the skill against your input: resolves its Norien data source and streams a grounded result as server-sent events.',
        params: skillSlugParamsSchema,
        body: runSkillSchema,
      },
    },
    async (request, reply) => {
      const provider = chatProvider();
      if (!provider) throw AppError.badRequest('Skills are not runnable on this deployment.');

      const skill = await app.services.skills.loadForRun(request.params.slug);
      const input = request.body.input ?? '';
      const context = await app.services.skills.resolveContext(skill.dataSource, input);

      const system =
        `You are running the Norien skill "${skill.name}". Follow these instructions exactly:\n\n` +
        `${skill.instructions}\n\n` +
        `Use any DATA provided below as ground truth — do not invent numbers. Be concise and useful, ` +
        `and format with markdown (headings, bullets, \`code\`) where it helps. Never mention the ` +
        `underlying AI model, provider, or that you are an assistant — you are this Norien skill.`;
      const userContent = [
        context ? `DATA:\n${context}` : '',
        input ? `REQUEST: ${input}` : 'Run the skill.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const conversation: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ];

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (event: Record<string, unknown>): void => {
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        let emitted = false;
        for await (const delta of provider.chatStream(conversation, { maxTokens: 900 })) {
          emitted = true;
          send({ text: delta });
        }
        if (!emitted) {
          const answer = await provider.chat(conversation, { maxTokens: 900 });
          send({ text: answer });
        }
        send({ done: true });
      } catch (error) {
        request.log.error({ err: error }, 'skill run failed');
        send({ error: 'The skill could not run. Please try again.' });
      } finally {
        raw.end();
      }
    },
  );
};
