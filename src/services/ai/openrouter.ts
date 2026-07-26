import { env } from '../../config/env.js';
import type { ChatMessage } from './groq.js';
import { parseSseDeltas } from './sse.js';

/**
 * OpenRouter — an OpenAI-compatible gateway with free models.
 *
 * Same shape as the Groq/Virtuals chat services (no shared ProviderClient: a
 * generation is never cached or retried). Backs AI Signals and can serve as a
 * chat provider. Disabled without `OPENROUTER_API_KEY`. The `HTTP-Referer` and
 * `X-Title` headers are OpenRouter's optional attribution fields.
 */

const TIMEOUT_MS = 45_000;

/**
 * Free models get rate-limited (429) or retired (404) without warning, so a
 * request tries the configured model first, then these. Kept to models verified
 * to return clean, on-topic output (no empty completions, no leaked
 * reasoning-preamble) — the Gemma family. If all are rate-limited the caller
 * degrades gracefully; the deterministic /api/signals data is unaffected.
 */
const FALLBACK_MODELS = ['google/gemma-4-26b-a4b-it:free'];

function modelChain(preferred: string): string[] {
  return [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
}

/** A soft failure worth trying the next model for (vs. a hard client error). */
function isRetryable(status: number): boolean {
  return status === 429 || status === 404 || status >= 500;
}

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${env.OPENROUTER_API_KEY as string}`,
    'HTTP-Referer': 'https://norien.live',
    'X-Title': 'Norien',
  };
}

export class OpenRouterService {
  get configured(): boolean {
    return env.OPENROUTER_API_KEY !== undefined;
  }

  async chat(
    messages: ChatMessage[],
    options: { model?: string; json?: boolean; maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('OpenRouter is not configured.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      let lastError = 'OpenRouter request failed.';
      for (const model of modelChain(options.model ?? env.OPENROUTER_MODEL)) {
        const response = await fetch(`${env.OPENROUTER_URL}/chat/completions`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model,
            messages,
            ...(options.json ? { response_format: { type: 'json_object' } } : {}),
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 900,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          lastError = `OpenRouter responded ${response.status}: ${detail.slice(0, 160)}`;
          if (isRetryable(response.status)) continue;
          throw new Error(lastError);
        }

        const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content?.trim() ?? '';
        if (content) return content;
        lastError = 'OpenRouter returned an empty completion.';
      }
      throw new Error(lastError);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Streaming variant of {@link chat}: yields content deltas as they arrive. */
  async *chatStream(
    messages: ChatMessage[],
    options: { model?: string; maxTokens?: number; temperature?: number } = {},
  ): AsyncGenerator<string, void, unknown> {
    if (!this.configured) throw new Error('OpenRouter is not configured.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      let lastError = 'OpenRouter request failed.';
      for (const model of modelChain(options.model ?? env.OPENROUTER_MODEL)) {
        const response = await fetch(`${env.OPENROUTER_URL}/chat/completions`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model,
            messages,
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 900,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => '');
          lastError = `OpenRouter responded ${response.status}: ${detail.slice(0, 160)}`;
          // Only the pre-stream response can be swapped for another model.
          if (response.ok || isRetryable(response.status)) continue;
          throw new Error(lastError);
        }

        yield* parseSseDeltas(response.body);
        return;
      }
      throw new Error(lastError);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const openRouterService = new OpenRouterService();
