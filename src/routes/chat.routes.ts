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
- Start a new agent: norien init <dir> — scaffolds a runnable agent (agent.json + entrypoint + README), node or python, publishable as-is.
- Discover: norien search <query> ; norien info <slug>   (search shows a Downloads column once agents have installs; sort with --sort downloads)
- Install & run: norien install <slug> ; norien runtime start ; norien run <slug> ; norien logs <slug> -f
- Skills: norien skill search <query> ; norien skill info <slug> ; norien skill run <slug> [input] ; norien skill publish
- Chat: norien chat [agent] — a streaming REPL (an agent in-character as a preview, or the Norien assistant with no agent).
- Publish: write agent.json, then norien login (paste an API key) and norien publish

MCP SERVER
Norien ships an MCP (Model Context Protocol) server so any MCP client — Claude Desktop, Cursor, ChatGPT, Codex — can use Norien as an agent's data + skills layer. It exposes tools: get_markets, get_token, get_portfolio, search_registry, list_skills, run_skill, ask_norien. Reads need no key. Run it with: npx @norien-live/mcp (or npm i -g @norien-live/mcp then norien-mcp). It pairs with Robinhood's official Agentic Trading MCP — Norien is the intel, Robinhood is the execution. Setup guide: docs.norien.live/mcp.
- Auth: reads need no key; publishing needs an API key (create one on the app's API Keys page).

FEATURES IN THE APP (app.norien.live)
- /registry — browse & search published agents; each agent page has a "Chat with agent" preview.
- /tools — the tool marketplace.
- /skills — runnable, data-grounded capabilities (the 4th primitive, between tools and agents). A skill = plain-language instructions + a live data source (markets, a wallet, a token, or the registry); running it resolves that real Norien data and streams a grounded result. Starters: market-recap, review-wallet, explain-token, find-agent, draft-agent. Anyone can publish their own.
- /markets & /tokens — live token prices, liquidity, volume, holders (Robinhood Chain). Each token page has an interactive price chart (24h/7d/30d/90d) and a star to add it to your watchlist.
- /new — new-launches radar: the freshest tokens on the chain, newest first, updating live.
- /watchlist — the tokens you star, with live prices and per-token ±% price alerts (browser notifications). Saved on your device.
- /portfolio — paste any wallet address to see its priced holdings and native balances across Ethereum, Base, Arbitrum, Optimism, and Polygon, with a total and per-chain breakdown.
- /u/<handle> — a publisher's public profile: all the agents, tools, and skills they've shipped, with install counts.
- /publish — validate an agent.json against the live registry; includes an AI generator: describe an agent in plain English and it drafts the agent.json for you.
- /runtime — supervisor status + live registry/chain health.
- /api-keys — create and revoke personal API keys (Authorization: Bearer norien_…).
- /search — global search across market data and the registry.

API (api.norien.live, public reads)
Examples: GET /api/tokens , GET /api/token/:address , GET /api/token/:address/chart , GET /api/new , GET /api/portfolio/:address , GET /agents , GET /search , GET /health. Full reference at api.norien.live/docs and docs.norien.live.

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

/**
 * The streaming counterpart to {@link scrubIdentity}: drops identity-revealing
 * sentences from a chunk while keeping its separators, so newlines (and the
 * bullet lists and paragraphs they carry) survive. Applied only to whole
 * sentences, so it is fed chunks that end on a sentence or line boundary.
 */
function scrubChunk(text: string): string {
  const parts = text.split(/([.!?]+[ \t]+|\n+)/);
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    const separator = parts[i + 1] ?? '';
    if (sentence && IDENTITY_TELL.test(sentence)) {
      // Drop the sentence; keep a newline separator so structure holds, but
      // discard a plain space so no gap is left behind.
      out += separator.includes('\n') ? separator : '';
    } else {
      out += sentence + separator;
    }
  }
  return out;
}

/** Index just past the last sentence/line boundary in a buffer, or -1. */
function completeUpTo(buffer: string): number {
  const boundary = /[.!?]+[ \t]+|\n+/g;
  let index = -1;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(buffer)) !== null) index = match.index + match[0].length;
  return index;
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

  /**
   * Streaming chat, as server-sent events.
   *
   * Emits `data: {"text": "..."}` frames as the reply forms and a final
   * `data: {"done": true}`; an error mid-stream arrives as `data: {"error": ...}`.
   * Tokens are held back to whole-sentence boundaries so the identity scrub can
   * still drop a self-disclosing sentence before it reaches the client — the
   * one thing raw token streaming would leak. Falls back to a single completion
   * for a provider that does not stream.
   */
  app.post(
    '/api/chat/stream',
    {
      schema: {
        tags: ['AI'],
        summary: 'Chat with an agent (streaming)',
        description:
          'Server-sent events variant of /api/chat. Streams the reply as it forms; a preview that never executes the agent’s code.',
        body: chatBody,
      },
    },
    async (request, reply) => {
      const provider = chatProvider();
      if (!provider) {
        throw AppError.badRequest('Chat is not enabled on this deployment.');
      }

      const { agent, messages } = request.body;
      const agentName = agent?.name ?? 'this agent';
      const conversation: ChatMessage[] = [
        { role: 'system', content: systemPrompt(agent) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Stop reverse proxies (nginx and the like) from buffering the stream.
        'X-Accel-Buffering': 'no',
      });
      const send = (event: Record<string, unknown>): void => {
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      let buffer = '';
      let emitted = false;

      const flushComplete = (): void => {
        const at = completeUpTo(buffer);
        if (at <= 0) return;
        const clean = scrubChunk(buffer.slice(0, at));
        buffer = buffer.slice(at);
        if (clean) {
          send({ text: clean });
          emitted = true;
        }
      };

      try {
        for await (const delta of provider.chatStream(conversation, { maxTokens: 800 })) {
          buffer += delta;
          flushComplete();
        }
        const tail = scrubChunk(buffer);
        if (tail.trim()) {
          send({ text: tail });
          emitted = true;
        }
        if (!emitted) {
          // A provider that did not actually stream (or a reply that scrubbed to
          // nothing) still gets one honest answer.
          const answer = await provider.chat(conversation, { maxTokens: 800 });
          send({ text: scrubIdentity(answer, agentName) });
        }
        send({ done: true });
      } catch (error) {
        request.log.error({ err: error }, 'chat stream failed');
        if (!emitted) {
          try {
            const answer = await provider.chat(conversation, { maxTokens: 800 });
            send({ text: scrubIdentity(answer, agentName) });
            send({ done: true });
          } catch {
            send({ error: 'The chat model could not respond. Please try again.' });
          }
        } else {
          send({ error: 'The reply was cut short. Please try again.' });
        }
      } finally {
        raw.end();
      }
    },
  );
};
