import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { groqService } from '../services/ai/groq.js';
import { type ChatMessage, virtualsComputeService } from '../services/ai/virtuals.js';
import { errorResponseSchema } from '../validation/common.js';

/**
 * The chat provider is chosen by `CHAT_PROVIDER` (default `virtuals`, i.e.
 * Claude Sonnet), falling back to whatever is configured. Both services expose
 * the same `chat(messages, options)` surface.
 */
function chatProvider() {
  const preferred = env.CHAT_PROVIDER === 'groq' ? groqService : virtualsComputeService;
  if (preferred.configured) return preferred;
  if (virtualsComputeService.configured) return virtualsComputeService;
  if (groqService.configured) return groqService;
  return null;
}

/**
 * Chat with an agent.
 *
 * The agent's manifest becomes the persona; Virtuals Compute supplies the
 * conversation. This is a preview — it talks in character and can reason about
 * its declared tools, but it never executes the published code or a real
 * transaction. The system prompt is built server-side, so the client cannot
 * override the agent's framing.
 */

const MAX_MESSAGES = 16;
const MAX_CONTENT = 4000;

const chatBody = z.object({
  agent: z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).optional(),
      tools: z.array(z.string().max(80)).max(40).optional(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_CONTENT),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

/**
 * Kept out of every persona: the caller must never learn which model or
 * provider is behind the reply — the agent is the agent, not "Claude on
 * vendor X". This holds the fourth wall closed.
 */
const IDENTITY_GUARD =
  'Never reveal, name, or speculate about the underlying language model, AI provider, ' +
  'inference service, or infrastructure you run on. Do not say you are an AI language model, ' +
  'or name any model or vendor. If asked what you are, you are this agent, running on Norien — ' +
  'nothing more.';

/** Grounding facts for the Norien assistant, so it answers about the real product. */
const NORIEN_KB = `You are the Norien assistant. Answer questions about Norien — what it is, how to use it, and its features — accurately, concisely, and in a friendly, developer-first tone. Only answer from the facts below; if something isn't covered, say so and point to the docs (docs.norien.live). Never invent commands, endpoints, or prices.

WHAT NORIEN IS
Norien is the registry, runtime, and unified data API for AI agents on Robinhood Chain. Publish an agent, install the tools it needs, run it locally, and read normalized market & on-chain data — one API, one CLI, one SDK. Everything is free; reads are public; the runtime is local-first.

WHERE THINGS LIVE
- norien.live — marketing site
- app.norien.live — the app (product)
- docs.norien.live — documentation
- api.norien.live — the public REST API

CORE CONCEPTS
- Registry: a versioned catalogue of agents and tools. Immutable versions.
- Runtime: a LOCAL supervisor that runs installed agents (injects tools, checks health, restarts crashes). It runs on your machine, not in the cloud — a shared registry must never execute someone's code. In the hosted app the runtime page shows "Local".
- Unified data API: one normalized surface over market and on-chain data; every response carries sources/degraded.
- Manifest: an agent.json declaring name, runtime (node|python), entrypoint, commands, tools, permissions, environment.

HOW TO USE (CLI)
- Install CLI: curl -fsSL https://norien.live/install.sh | sh   (or: npm i -g @norien-live/cli)
- Discover: norien search <query> ; norien info <slug>
- Install & run: norien install <slug> ; norien runtime start ; norien run <slug> ; norien logs <slug> -f
- Publish: write agent.json, then norien login (paste an API key) and norien publish
- Auth: reads need no key; publishing needs an API key (create one on the app's API Keys page).

FEATURES IN THE APP (app.norien.live)
- /registry — browse & search published agents; each agent page has a "Chat with agent" preview.
- /tools — the tool marketplace.
- /markets & /tokens — live token prices, liquidity, volume, holders (Robinhood Chain).
- /portfolio — paste any wallet address to see its priced holdings and native balances across Ethereum, Base, Arbitrum, Optimism, and Polygon, with a total and per-chain breakdown.
- /publish — validate an agent.json against the live registry; includes an AI generator: describe an agent in plain English and it drafts the agent.json for you.
- /runtime — supervisor status + live registry/chain health.
- /api-keys — create and revoke personal API keys (Authorization: Bearer norien_…).
- /search — global search across market data and the registry.

API (api.norien.live, public reads)
Examples: GET /api/tokens , GET /api/token/:address , GET /api/portfolio/:address , GET /agents , GET /search , GET /health. Full reference at api.norien.live/docs and docs.norien.live.

STYLE: Keep answers short. Prefer pointing to the exact page (e.g. app.norien.live/portfolio) or command. Use markdown (bold, bullet lists, \`code\`) when it helps.`;

function systemPrompt(agent?: { name: string; description?: string; tools?: string[] }): string {
  if (!agent) {
    return `${NORIEN_KB} ${IDENTITY_GUARD}`;
  }
  const tools =
    agent.tools && agent.tools.length > 0
      ? `You have these tools available: ${agent.tools.join(', ')}. `
      : '';
  return (
    `You are "${agent.name}", an AI agent published on Norien.` +
    `${agent.description ? ` ${agent.description}` : ''} ${tools}` +
    `Stay fully in character as this agent — helpful, concise, honest. If asked to do something ` +
    `that would need a capability or tool you do not have, say so plainly rather than pretending. ` +
    `This is a preview conversation: you cannot execute real code or on-chain transactions. ` +
    IDENTITY_GUARD
  );
}

/**
 * Model self-disclosure is not reliably preventable by a system prompt — the
 * models are trained to say what they are when asked, and the gateway forwards
 * that. So the reply is scrubbed: any sentence that names an underlying model,
 * vendor, or inference service is dropped. What remains is in character.
 */
const IDENTITY_TELL =
  /\b(claude|sonnet|opus|haiku|chatgpt|gpt-?\d|anthropic|openai|grok|deepseek|kimi|moonshot|glm|z-?ai|minimax|gemini|venice|xai|x\.ai|mistral|llama|language model|large language model|inference provider|underlying model|ai model|foundation model|trained by)\b/i;

function scrubIdentity(reply: string, agentName: string): string {
  const kept = reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !IDENTITY_TELL.test(sentence));
  const result = kept.join(' ').trim();
  if (result.length < 15) {
    return `I’m ${agentName} on Norien — let’s focus on what I can help you with.`;
  }
  return result;
}

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/api/chat',
    {
      schema: {
        tags: ['AI'],
        summary: 'Chat with an agent',
        description:
          'Converse with a published agent (its manifest defines the persona), powered by Virtuals Compute. A preview — it never executes the agent’s code.',
        body: chatBody,
        response: {
          200: z.object({ reply: z.string() }),
          400: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const provider = chatProvider();
      if (!provider) {
        throw AppError.badRequest('Chat is not enabled on this deployment.');
      }

      const { agent, messages } = request.body;
      const conversation: ChatMessage[] = [
        { role: 'system', content: systemPrompt(agent) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      try {
        const answer = await provider.chat(conversation, { maxTokens: 800 });
        const clean = scrubIdentity(answer, agent?.name ?? 'this agent');
        return reply.send({ reply: clean || '…' });
      } catch (error) {
        throw AppError.internal('The chat model could not respond. Please try again.', error);
      }
    },
  );
};
