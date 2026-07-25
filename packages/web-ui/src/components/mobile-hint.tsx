'use client';

import { useEffect, useState } from 'react';

const KEY = 'norien-mobile-hint-v3';

/**
 * A gentle nudge for touch devices stuck in "Desktop site" mode.
 *
 * The app is mobile-first now (tables collapse their columns, names truncate),
 * so a phone forced into desktop mode just gets a shrunken page. A coarse
 * pointer in a desktop-width viewport is that tell — we suggest turning
 * "Desktop site" off, once, and remember the dismissal.
 */
export function MobileHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(KEY) === 'dismissed') return;
    } catch {
      // no storage — still fine to show once per load
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const wide = window.innerWidth >= 900;
    if (coarse && wide) setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, 'dismissed');
    } catch {
      // ignore
    }
  }

  if (!show) return null;

  return (
    // Sits above the Ask Norien pill (bottom-4 right-4), so the two never overlap.
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-lg">
      <span aria-hidden className="mt-0.5 text-accent">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="6" y="2.5" width="8" height="15" rx="2" />
          <path d="M9 15h2" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
        Norien works great on mobile. Turn off <span className="font-medium">“Desktop site”</span> in
        your browser for the best experience.
        <button
          type="button"
          onClick={dismiss}
          className="ml-2 whitespace-nowrap font-medium text-accent underline underline-offset-2"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
