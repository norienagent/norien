import { env } from '../../config/env.js';

/**
 * Virtuals Compute — the LLM behind "chat with an agent".
 *
 * An OpenAI-compatible multi-model gateway. Kept off the shared ProviderClient
 * on purpose: a chat completion must not be cached or retried (both would be
 * wrong and expensive), and it needs a longer timeout than a data fetch.
 *
 * Disabled without `VIRTUALS_COMPUTE_API_KEY`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const TIMEOUT_MS = 45_000;

export class VirtualsComputeService {
  get configured(): boolean {
    return env.VIRTUALS_COMPUTE_API_KEY !== undefined;
  }

  async chat(
    messages: ChatMessage[],
    options: { model?: string; maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('Virtuals Compute is not configured.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${env.VIRTUALS_COMPUTE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.VIRTUALS_COMPUTE_API_KEY as string}`,
        },
        body: JSON.stringify({
          model: options.model ?? env.VIRTUALS_COMPUTE_MODEL,
          messages,
          max_tokens: options.maxTokens ?? 800,
          temperature: options.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Virtuals Compute responded ${response.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } finally {
      clearTimeout(timer);
    }
  }
}

export const virtualsComputeService = new VirtualsComputeService();
