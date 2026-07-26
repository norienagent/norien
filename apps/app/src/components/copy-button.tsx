'use client';

import { useState } from 'react';

/**
 * A copy-to-clipboard control for the contract address.
 * Shows the value (monospace) and a copy affordance with brief confirmation.
 */
export function CopyAddress({ address, label = 'CA' }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title="Copy address"
      className="group inline-flex max-w-full items-center gap-2.5 rounded-xl border border-line bg-card px-4 py-2.5 text-left transition-colors hover:border-accent/40"
    >
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="truncate font-mono text-sm text-ink">{address}</span>
      <span className={`shrink-0 text-xs font-medium ${copied ? 'text-up' : 'text-accent'}`}>
        {copied ? (
          'Copied ✓'
        ) : (
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="7" y="7" width="9" height="9" rx="2" />
            <path d="M4 13V5a2 2 0 012-2h7" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}
