'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Inline **bold** and `code`, as React nodes (never raw HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function render(text: string): ReactNode {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="my-1 ml-4 list-disc space-y-0.5">
          {bullets}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) bullets.push(<li key={i}>{inline(bullet[1])}</li>);
    else {
      flush();
      if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
    }
  });
  flush();
  return <div className="space-y-1.5">{out}</div>;
}

const SUGGESTIONS = [
  'What is Norien?',
  'How do I publish an agent?',
  'How do I check a wallet portfolio?',
  'How does the runtime work?',
];

/**
 * A floating "Ask Norien" assistant.
 *
 * Ask anything about Norien — what it is, how to use it, its features. Grounded
 * server-side in the product's own facts, so it answers about the real thing.
 * Talks to `/api/chat` with no agent, which the registry treats as the Norien
 * assistant.
 */
export function AskNorien() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, open]);

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
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Could not answer just now.');
      }
      const { reply } = (await response.json()) as { reply: string };
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div className="flex h-[30rem] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-xl">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkle /> Ask Norien
            </span>
            <div className="flex items-center gap-3">
              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                  className="text-xs font-medium text-muted transition-colors hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted transition-colors hover:text-ink"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="text-sm text-muted">
                <p className="leading-relaxed">
                  Hi — I’m the Norien assistant. Ask me anything about the product, how to use it, or
                  its features.
                </p>
                <div className="mt-3 flex flex-col items-start gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-left text-xs text-ink transition-colors hover:border-accent/40 hover:text-accent"
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
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'whitespace-pre-wrap bg-accent text-white'
                          : 'border border-line bg-canvas text-ink'
                      }`}
                    >
                      {m.role === 'user' ? m.content : render(m.content)}
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
            {error ? <p className="mt-2 text-sm text-down">{error}</p> : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-line p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Norien…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              aria-label="Ask Norien"
            />
            <button
              type="submit"
              disabled={pending || input.trim() === ''}
              className="inline-flex min-h-10 items-center rounded-lg border border-accent bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-3 text-sm font-medium text-ink shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Sparkle />
          Ask Norien
        </button>
      )}
    </div>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-accent" fill="currentColor" aria-hidden>
      <path d="M10 1l1.6 4.4L16 7l-4.4 1.6L10 13l-1.6-4.4L4 7l4.4-1.6L10 1z" />
      <path d="M15.5 12l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" opacity="0.6" />
    </svg>
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
