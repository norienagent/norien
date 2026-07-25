'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The terminal block, but typed out on a loop.
 *
 * Same chrome and colours as the static {@link Terminal}; the difference is the
 * body types itself in, holds, deletes, and repeats — a live "here's the CLI"
 * on the landing page. The docs keep the static version, because there the
 * commands are reference to be read and copied, not a demo.
 *
 * Details that matter:
 * - Server-renders the full text (so it's there for no-JS, SEO, and a clean
 *   first paint), then the animation takes over on mount.
 * - Reserves the full block height, so typing and deleting never reflow the page.
 * - Respects `prefers-reduced-motion` (stays static) and only animates while
 *   on screen (an IntersectionObserver pauses it when scrolled away).
 */

const TYPE_MS = 24; // per character while typing
const NEWLINE_PAUSE = 160; // extra beat at the end of a line, like pressing enter
const DELETE_MS = 9; // per character while clearing
const HOLD_FULL = 2400; // dwell on the finished block
const HOLD_EMPTY = 600; // dwell before typing again

type Phase = 'holdFull' | 'deleting' | 'holdEmpty' | 'typing';

export function AnimatedTerminal({ lines, caption }: { lines: string[]; caption?: string }) {
  const full = lines.join('\n');
  const [n, setN] = useState(full.length); // visible character count; full for SSR
  const [mounted, setMounted] = useState(false);

  const nRef = useRef(full.length);
  const phaseRef = useRef<Phase>('holdFull');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let inView = false;

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const schedule = (ms: number) => {
      clear();
      timer.current = setTimeout(step, ms);
    };

    function step() {
      switch (phaseRef.current) {
        case 'typing': {
          if (nRef.current >= full.length) {
            phaseRef.current = 'holdFull';
            return schedule(HOLD_FULL);
          }
          nRef.current += 1;
          setN(nRef.current);
          const nextIsNewline = full[nRef.current] === '\n';
          return schedule(TYPE_MS + (nextIsNewline ? NEWLINE_PAUSE : 0));
        }
        case 'holdFull':
          phaseRef.current = 'deleting';
          return schedule(0);
        case 'deleting': {
          if (nRef.current <= 0) {
            phaseRef.current = 'holdEmpty';
            return schedule(HOLD_EMPTY);
          }
          nRef.current -= 1;
          setN(nRef.current);
          return schedule(DELETE_MS);
        }
        case 'holdEmpty':
          phaseRef.current = 'typing';
          return schedule(0);
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !inView) {
          inView = true;
          schedule(phaseRef.current === 'holdFull' ? HOLD_FULL : 0);
        } else if (!entry.isIntersecting && inView) {
          inView = false;
          clear();
        }
      },
      { threshold: 0.25 },
    );
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      observer.disconnect();
      clear();
    };
  }, [full]);

  const shown = full.slice(0, n);
  const shownLines = shown.split('\n');
  const showCaret = mounted;

  return (
    <div ref={rootRef} className="overflow-hidden rounded-xl border border-line bg-ink">
      <style>{
        '@keyframes norien-caret-blink{0%,49%{opacity:1}50%,100%{opacity:0}}' +
        '.norien-caret{display:inline-block;width:0.55em;height:1.05em;margin-left:1px;' +
        'transform:translateY(0.15em);background:currentColor;animation:norien-caret-blink 1s steps(1) infinite}'
      }</style>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-white/20 [animation:dot-pulse_5.4s_ease-in-out_infinite]" />
        <span
          aria-hidden
          className="size-2.5 rounded-full bg-white/20 [animation:dot-pulse_5.4s_ease-in-out_infinite]"
          style={{ animationDelay: '-1.8s' }}
        />
        <span
          aria-hidden
          className="size-2.5 rounded-full bg-white/20 [animation:dot-pulse_5.4s_ease-in-out_infinite]"
          style={{ animationDelay: '-3.6s' }}
        />
        {caption ? <span className="ml-2 text-xs text-white/40">{caption}</span> : null}
      </div>
      <pre className="scroll-x px-4 py-4 font-mono text-[0.8125rem] leading-relaxed text-code-fg">
        {/* minHeight reserves the full block so type/delete never reflows the page. */}
        <code className="block" style={{ minHeight: `${(lines.length * 1.625).toFixed(3)}em` }}>
          {shownLines.map((line, index) => {
            const isLast = index === shownLines.length - 1;
            return (
              <span key={index} className="block">
                {line.startsWith('$') ? (
                  <>
                    <span className="text-code-prompt select-none">{line.slice(0, 2)}</span>
                    {line.slice(2)}
                  </>
                ) : (
                  <span className="text-white/45">{line}</span>
                )}
                {isLast && showCaret ? <span aria-hidden className="norien-caret" /> : null}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
