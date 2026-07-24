'use client';

import { useEffect, useRef, useState } from 'react';

import { Badge, Button } from '@norien-live/web-ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat with an agent.
 *
 * The agent's manifest (name, description, declared tools) is sent as context;
 * the registry builds the persona server-side and Virtuals Compute answers. A
 * preview — it talks in character but never runs the published code.
 */
export function ChatPanel({
  agent,
}: {
  agent: { name: string; description: string; tools: string[] };
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;

    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agent: { name: agent.name, description: agent.description, tools: agent.tools },
          messages: next.slice(-16),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'The agent could not respond.');
      }

      const { reply } = (await response.json()) as { reply: string };
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  const suggestions = [
    `What can you do?`,
    `How would you approach ${agent.name.toLowerCase().includes('trad') ? 'a trade' : 'a task'}?`,
    `What tools do you use?`,
  ];

  return (
    <section className="flex flex-col rounded-xl border border-line bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Chat with {agent.name}</h2>
        <Badge>preview</Badge>
      </header>

      <div ref={scrollRef} className="max-h-[24rem] min-h-[12rem] overflow-y-auto px-4 py-4 sm:px-5">
        {messages.length === 0 ? (
          <div className="text-sm text-muted">
            <p className="leading-relaxed">
              Talk to this agent in character. It reasons about its declared tools but doesn’t run
              the published code — a preview.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <span
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-white'
                      : 'border border-line bg-canvas text-ink'
                  }`}
                >
                  {m.content}
                </span>
              </li>
            ))}
            {pending ? (
              <li className="flex justify-start">
                <span className="rounded-2xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-muted">
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                  </span>
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {error ? <p className="px-4 pb-2 text-sm text-down sm:px-5">{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-line p-3 sm:px-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${agent.name}…`}
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          aria-label="Message"
        />
        <Button type="submit" disabled={pending || input.trim() === ''}>
          Send
        </Button>
      </form>
    </section>
  );
}

function Dot({ delay = '0s' }: { delay?: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay }}
    />
  );
}
