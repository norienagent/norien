'use client';

import { useState } from 'react';

/**
 * The AI read of the current signals.
 *
 * User-triggered (the free model is rate-limited, so we don't auto-run it on
 * every page load) and streamed as SSE. The signals data above is always there;
 * this is the optional narrative layer. Observations only — not advice.
 */
export function SignalsBrief() {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');

  async function run() {
    setText('');
    setState('streaming');
    try {
      const res = await fetch('/api/signals/brief', { method: 'POST' });
      if (!res.ok || !res.body) throw new Error('no stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as { text?: string; error?: string; done?: boolean };
            if (ev.text) {
              acc += ev.text;
              setText(acc);
            } else if (ev.error) {
              setText(ev.error);
              setState('error');
              return;
            }
          } catch {
            /* keep-alive */
          }
        }
      }
      setState('done');
    } catch {
      setText('Could not generate the brief — the free model may be rate-limited. Try again shortly.');
      setState('error');
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-white">✦</span>
          <span className="text-sm font-medium text-ink">AI read</span>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state === 'streaming'}
          className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {state === 'idle' ? 'Generate brief' : state === 'streaming' ? 'Reading…' : 'Regenerate'}
        </button>
      </div>

      {text ? (
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink [&_strong]:font-semibold">
          {renderLite(text)}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Get a grounded, plain-language read of the signals below. Observations only — not financial
          advice.
        </p>
      )}
    </div>
  );
}

/** Minimal markdown: bold, bullets, and italic disclaimer lines. */
function renderLite(md: string) {
  return md.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="h-2" />;
    const bulleted = /^[-*]\s+/.test(t);
    const body = bulleted ? t.replace(/^[-*]\s+/, '') : t;
    const italic = /^_.*_$/.test(body);
    const inner = body
      .replace(/^_|_$/g, '')
      .split(/(\*\*[^*]+\*\*)/g)
      .map((seg, j) =>
        seg.startsWith('**') && seg.endsWith('**') ? <strong key={j}>{seg.slice(2, -2)}</strong> : seg,
      );
    return (
      <div key={i} className={`${bulleted ? 'flex gap-2' : ''} ${italic ? 'mt-2 text-muted italic' : ''}`}>
        {bulleted ? <span className="text-accent">•</span> : null}
        <span>{inner}</span>
      </div>
    );
  });
}
