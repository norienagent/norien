import { env } from '../../config/env.js';
import { parseSseDeltas } from './sse.js';

/**
 * Groq — fast, free LLM inference for AI helpers.
 *
 * OpenAI-compatible. Like the Virtuals chat service it stays off the shared
 * ProviderClient: no caching or retrying a generation. Disabled without
 * `GROQ_API_KEY`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const TIMEOUT_MS = 30_000;

export class GroqService {
  get configured(): boolean {
    return env.GROQ_API_KEY !== undefined;
  }

  async chat(
    messages: ChatMessage[],
    options: { model?: string; json?: boolean; maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('Groq is not configured.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${env.GROQ_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.GROQ_API_KEY as string}`,
        },
        body: JSON.stringify({
          model: options.model ?? env.GROQ_MODEL,
          messages,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
          temperature: options.temperature ?? 0.5,
          max_tokens: options.maxTokens ?? 900,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Groq responded ${response.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Streaming variant of {@link chat}: yields content deltas as they arrive. */
  async *chatStream(
    messages: ChatMessage[],
    options: { model?: string; maxTokens?: number; temperature?: number } = {},
  ): AsyncGenerator<string, void, unknown> {
    if (!this.configured) throw new Error('Groq is not configured.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${env.GROQ_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.GROQ_API_KEY as string}`,
        },
        body: JSON.stringify({
          model: options.model ?? env.GROQ_MODEL,
          messages,
          temperature: options.temperature ?? 0.5,
          max_tokens: options.maxTokens ?? 900,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Groq responded ${response.status}: ${detail.slice(0, 200)}`);
      }

      yield* parseSseDeltas(response.body);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const groqService = new GroqService();
