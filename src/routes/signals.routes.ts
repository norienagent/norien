import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../config/env.js';
import { type ChatMessage } from '../services/ai/groq.js';
import { groqService } from '../services/ai/groq.js';
import { openRouterService } from '../services/ai/openrouter.js';
import { virtualsComputeService } from '../services/ai/virtuals.js';
import { signalsService } from '../services/signals.service.js';
import { errorResponseSchema } from '../validation/common.js';
import { signalsResponseSchema } from '../validation/signals.schema.js';

/** Provider for the AI brief. Defaults to OpenRouter (free), then falls back. */
function signalsProvider() {
  const preferred =
    env.SIGNALS_PROVIDER === 'groq'
      ? groqService
      : env.SIGNALS_PROVIDER === 'virtuals'
        ? virtualsComputeService
        : openRouterService;
  if (preferred.configured) return preferred;
  if (openRouterService.configured) return openRouterService;
  if (groqService.configured) return groqService;
  if (virtualsComputeService.configured) return virtualsComputeService;
  return null;
}

const SYSTEM = `You are Norien Signals — a market observer for Robinhood Chain.
You are given SIGNALS computed from live on-chain data (price, 24h change, volume,
liquidity, holders, age, and an activity ratio = volume/liquidity). Your job:

- Pick the most notable 4–6 signals and write ONE tight sentence each explaining
  what the numbers show and why it stands out.
- Use ONLY the numbers provided. Never invent a price, percentage, or token.
- Be plain and specific: name the token, cite the figure that matters.
- Flag risk honestly: thin liquidity, huge % on tiny liquidity, brand-new age.
- Group under short bold headers by theme if helpful (Momentum, Activity, New).

Format as concise markdown. Start with a one-line summary. End with exactly this
line: "_Observations from live data — not financial advice._"

Never tell anyone to buy or sell. These are observations, not recommendations.`;

/** Renders the computed signals into a compact block the model reasons over. */
function toPromptData(signals: Awaited<ReturnType<typeof signalsService.detect>>['signals']): string {
  if (signals.length === 0) return 'No notable signals right now.';
  return signals
    .map((s) => {
      const parts = [
        `${s.symbol} (${s.name})`,
        s.price != null ? `price $${s.price}` : null,
        s.change24h != null ? `24h ${s.change24h.toFixed(1)}%` : null,
        s.volume24h != null ? `vol $${Math.round(s.volume24h)}` : null,
        s.liquidity != null ? `liq $${Math.round(s.liquidity)}` : null,
        s.activity != null ? `activity ${s.activity}` : null,
        s.holders != null ? `${s.holders} holders` : null,
        s.ageHours != null ? `age ${s.ageHours}h` : null,
        `tags: ${s.tags.join(', ')}`,
      ].filter(Boolean);
      return `- ${parts.join(' · ')}`;
    })
    .join('\n');
}

/**
 * AI Signals.
 *
 * `GET /api/signals` returns the deterministic, data-derived signals (no model,
 * always available). `POST /api/signals/brief` streams a grounded AI read of
 * them as SSE. Observations only — never advice.
 */
export const signalsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/signals',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'AI Signals (raw)',
        description:
          'Signals computed from live Robinhood Chain data — momentum, activity, fresh launches, and thin-liquidity risk. Deterministic; no model. Observations, not advice.',
        response: { 200: signalsResponseSchema },
      },
    },
    async () => {
      const result = await signalsService.detect(12);
      return { data: result };
    },
  );

  app.post(
    '/api/signals/brief',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'AI Signals brief (streaming)',
        description:
          'Streams a grounded AI read of the current signals as server-sent events. Observations, not advice.',
        response: { 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const provider = signalsProvider();
      if (!provider) {
        return reply.code(503).send({
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'No AI provider is configured for signals.',
            request_id: request.id,
          },
        });
      }

      const { signals } = await signalsService.detect(12);
      const conversation: ChatMessage[] = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `SIGNALS:\n${toPromptData(signals)}\n\nWrite the brief.` },
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
        for await (const delta of provider.chatStream(conversation, { maxTokens: 800 })) {
          emitted = true;
          send({ text: delta });
        }
        if (!emitted) {
          const answer = await provider.chat(conversation, { maxTokens: 800 });
          send({ text: answer });
        }
        send({ done: true });
      } catch (error) {
        request.log.error({ err: error }, 'signals brief failed');
        send({ error: 'Could not generate the brief. The free model may be rate-limited — try again shortly.' });
      } finally {
        raw.end();
      }
    },
  );
};
