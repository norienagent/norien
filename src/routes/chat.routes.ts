import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../core/errors.js';
import { type ChatMessage, virtualsComputeService } from '../services/ai/virtuals.js';
import { errorResponseSchema } from '../validation/common.js';

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

function systemPrompt(agent?: { name: string; description?: string; tools?: string[] }): string {
  if (!agent) {
    return (
      'You are Norien, a concise, honest assistant for an AI-agent registry, runtime, and data ' +
      `API on Robinhood Chain. Help users understand agents, tools, and the platform. ${IDENTITY_GUARD}`
    );
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
      if (!virtualsComputeService.configured) {
        throw AppError.badRequest('Chat is not enabled on this deployment.');
      }

      const { agent, messages } = request.body;
      const conversation: ChatMessage[] = [
        { role: 'system', content: systemPrompt(agent) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      try {
        const answer = await virtualsComputeService.chat(conversation, { maxTokens: 800 });
        const clean = scrubIdentity(answer, agent?.name ?? 'this agent');
        return reply.send({ reply: clean || '…' });
      } catch (error) {
        throw AppError.internal('The chat model could not respond. Please try again.', error);
      }
    },
  );
};
