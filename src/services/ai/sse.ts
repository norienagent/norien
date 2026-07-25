/**
 * Parses an OpenAI-compatible streaming chat response into content deltas.
 *
 * Both chat gateways (Virtuals Compute and Groq) return the same wire format
 * when `stream: true`: server-sent events whose `data:` lines each carry a JSON
 * chunk with `choices[0].delta.content`, terminated by a `data: [DONE]`. This
 * reads the body incrementally and yields each non-empty content delta, so a
 * caller can forward tokens the moment they arrive.
 */
export async function* parseSseDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines only; a partial line stays in the buffer.
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) yield delta;
        } catch {
          // Keep-alive comments and partial frames are not JSON — skip them.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
