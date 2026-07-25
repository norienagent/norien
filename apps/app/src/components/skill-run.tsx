'use client';

import { type ReactNode, useState } from 'react';

import { Button } from '@norien-live/web-ui';

/** Inline **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

/** Markdown-lite: headings, bullets, fenced code blocks, paragraphs. */
function render(text: string): ReactNode {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  let code: string[] | null = null;

  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="my-2 ml-5 list-disc space-y-1">
          {bullets}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith('```')) {
      if (code === null) {
        flush();
        code = [];
      } else {
        out.push(
          <pre key={`code-${i}`} className="scroll-x my-2 rounded-lg border border-line bg-ink p-3.5 font-mono text-[0.8rem] leading-relaxed text-code-fg">
            <code>{code.join('\n')}</code>
          </pre>,
        );
        code = null;
      }
      return;
    }
    if (code !== null) {
      code.push(line);
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const cls = level === 1 ? 'text-base font-semibold' : level === 2 ? 'text-sm font-semibold' : 'text-sm font-medium';
      out.push(
        <p key={i} className={`mt-3 ${cls} text-ink`}>
          {inline(heading[2])}
        </p>,
      );
      return;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) {
      bullets.push(<li key={i}>{inline(bullet[1])}</li>);
      return;
    }
    flush();
    if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  });
  const leftover = code as unknown as string[] | null;
  if (leftover && leftover.length) {
    out.push(
      <pre key="code-tail" className="scroll-x my-2 rounded-lg border border-line bg-ink p-3.5 font-mono text-[0.8rem] leading-relaxed text-code-fg">
        <code>{leftover.join('\n')}</code>
      </pre>,
    );
  }
  flush();
  return <div className="space-y-1.5 text-sm leading-relaxed text-ink">{out}</div>;
}

/**
 * Runs a skill in the browser.
 *
 * Streams the grounded result from `/api/skills/:slug/run` the same way the chat
 * panels stream — token by token into a live-rendering markdown area.
 */
export function SkillRunPanel({
  slug,
  inputHint,
  examples,
  requiresInput,
}: {
  slug: string;
  inputHint: string | null;
  examples: string[];
  requiresInput: boolean;
}) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    if (running) return;
    setOutput('');
    setError(null);
    setRunning(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(slug)}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Could not run this skill.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const raw = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!raw.startsWith('data:')) continue;
          try {
            const event = JSON.parse(raw.slice(5).trim()) as { text?: string; error?: string };
            if (typeof event.text === 'string') {
              acc += event.text;
              setOutput(acc);
            } else if (event.error) {
              setError(event.error);
            }
          } catch {
            // ignore keep-alives
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-card">
      <header className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Run this skill</h2>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(input);
        }}
        className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:px-5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={inputHint ?? (requiresInput ? 'Enter input…' : 'Optional input…')}
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          aria-label="Skill input"
        />
        <Button type="submit" disabled={running || (requiresInput && input.trim() === '')}>
          {running ? 'Running…' : 'Run'}
        </Button>
      </form>

      {examples.length > 0 && !output && !running ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setInput(ex);
                run(ex);
              }}
              className="rounded-full border border-line bg-canvas px-3 py-1.5 text-left text-xs text-ink transition-colors hover:border-accent/40 hover:text-accent"
            >
              {ex.length > 48 ? `${ex.slice(0, 47)}…` : ex}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="px-4 pb-4 text-sm text-down sm:px-5">{error}</p> : null}

      {output ? (
        <div className="border-t border-line px-4 py-4 sm:px-5">{render(output)}</div>
      ) : running ? (
        <div className="border-t border-line px-4 py-4 text-sm text-muted sm:px-5">Working…</div>
      ) : null}
    </section>
  );
}
