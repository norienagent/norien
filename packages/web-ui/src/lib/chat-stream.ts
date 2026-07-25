/**
 * Consumes the registry's streaming chat endpoint in the browser.
 *
 * Posts to `/api/chat/stream` (proxied to the registry) and calls `onText` with
 * each text chunk as it arrives, so a panel can render the reply as it forms.
 * Resolves when the stream ends; throws with a useful message on failure.
 */
export async function streamChat(
  body: { agent?: { name: string; description?: string; tools?: string[] }; messages: unknown[] },
  onText: (text: string) => void,
): Promise<void> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const parsed = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(parsed?.error?.message ?? 'Could not answer just now.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let received = false;
  let streamError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      try {
        const event = JSON.parse(data) as { text?: string; error?: string; done?: boolean };
        if (typeof event.text === 'string') {
          received = true;
          onText(event.text);
        } else if (event.error) {
          streamError = event.error;
        }
      } catch {
        // keep-alives / partial frames — ignore
      }
    }
  }

  if (!received && streamError) throw new Error(streamError);
  if (!received) throw new Error('Could not answer just now.');
}
