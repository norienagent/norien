import readline from 'node:readline';

import type { CommandContext } from '../context.js';
import { CliError, line, spinner, styles, warn } from '../ui.js';

/**
 * `norien chat [agent]`
 *
 * A live conversation in the terminal. With an agent slug you chat with that
 * published agent in character (a preview — its code never runs); with no slug
 * you talk to the Norien assistant about the product itself. Replies stream in
 * token by token off `POST /api/chat/stream`.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Persona {
  name: string;
  description?: string;
  tools?: string[];
}

const HISTORY = 12; // messages of context sent per turn
const EXIT_WORDS = new Set(['exit', 'quit', '.exit', '.quit', ':q']);

export async function chat(
  context: CommandContext,
  agentSlug: string | undefined,
  options: { message?: string },
): Promise<number | void> {
  let persona: Persona | undefined;
  let title = 'Norien';

  if (agentSlug) {
    const progress = spinner(`Loading ${agentSlug}`).start();
    try {
      const agent = await context.client.info(agentSlug);
      persona = {
        name: agent.name,
        ...(agent.description ? { description: agent.description.slice(0, 2000) } : {}),
        ...(agent.required_tools.length > 0 ? { tools: agent.required_tools.slice(0, 40) } : {}),
      };
      title = agent.name;
      progress.succeed(`Chatting with ${styles.title(agent.name)}`);
    } catch (error) {
      progress.stop();
      throw error;
    }
  }

  const messages: Message[] = [];
  const label = `${styles.ok(title)} ${styles.dim('›')} `;

  // One-shot: `-m "..."` sends a single message and prints the reply. Works when
  // piped or in CI, where an interactive prompt would hang.
  if (options.message) {
    messages.push({ role: 'user', content: options.message });
    process.stdout.write(label);
    await streamTurn(context, persona, messages, label);
    process.stdout.write('\n');
    return;
  }

  if (!process.stdin.isTTY) {
    throw new CliError('Chat is interactive.', {
      exitCode: 2,
      details: ['Run it in a terminal, or pass -m "<message>" for a single reply.'],
    });
  }

  line();
  line(`${styles.title(title)} ${styles.dim(agentSlug ? '· agent preview' : '· assistant')}`);
  line(
    styles.dim(
      agentSlug
        ? 'In character — a preview, so no code runs and nothing goes on-chain.'
        : 'Ask anything about Norien — features, commands, how things work.',
    ),
  );
  line(styles.dim('Type a message. "exit" or Ctrl+C to leave.'));
  line();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => rl.close());
  const ask = (): Promise<string> => new Promise((resolve) => rl.question(`${styles.key('you')} ${styles.dim('›')} `, resolve));

  try {
    for (;;) {
      const input = (await ask()).trim();
      if (input === '') continue;
      if (EXIT_WORDS.has(input.toLowerCase())) break;

      messages.push({ role: 'user', content: input });
      process.stdout.write(`${label}${styles.dim('thinking…')}`);

      try {
        const reply = await streamTurn(context, persona, messages, label);
        messages.push({ role: 'assistant', content: reply || '…' });
        process.stdout.write('\n\n');
      } catch (error) {
        process.stdout.write('\n');
        warn(error instanceof Error ? error.message : String(error));
        line();
        messages.pop(); // drop the unanswered user turn so history stays clean
      }
    }
  } finally {
    rl.close();
  }

  line(styles.dim('Bye.'));
}

/**
 * Streams one assistant turn to stdout and returns the full reply text.
 *
 * The caller has already printed the speaker label (optionally with a
 * "thinking…" placeholder); on the first token we clear the line and reprint the
 * label, then append tokens as they arrive.
 */
async function streamTurn(
  context: CommandContext,
  persona: Persona | undefined,
  messages: Message[],
  label: string,
): Promise<string> {
  const url = new URL('/api/chat/stream', context.credentials.registry).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      ...(persona ? { agent: persona } : {}),
      messages: messages.slice(-HISTORY),
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    let message = `Chat failed (${response.status}).`;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // non-JSON body — keep the generic message
    }
    throw new CliError(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let first = true;
  let streamError: string | null = null;

  const onText = (text: string): void => {
    if (first) {
      // Clear the "thinking…" placeholder line and reprint the speaker label.
      process.stdout.write(`\r\x1b[2K${label}`);
      first = false;
    }
    full += text;
    process.stdout.write(text);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!raw.startsWith('data:')) continue;
      const data = raw.slice(5).trim();
      try {
        const event = JSON.parse(data) as { text?: string; error?: string; done?: boolean };
        if (typeof event.text === 'string') onText(event.text);
        else if (event.error) streamError = event.error;
      } catch {
        // ignore keep-alives / partial frames
      }
    }
  }

  if (first) {
    // Nothing streamed — clear the placeholder so the error/empty state is clean.
    process.stdout.write(`\r\x1b[2K${label}`);
  }
  if (streamError && full === '') throw new CliError(streamError);

  return full.trim();
}
