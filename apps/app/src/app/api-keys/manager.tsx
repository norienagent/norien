'use client';

import { useState, useTransition } from 'react';

import { Badge, Button, Empty, Input } from '@norien-live/web-ui';

import { createApiKey, type KeySummary, revokeApiKey } from './actions';

/**
 * The interactive key manager.
 *
 * Keeps the list in local state so a create or revoke reflects immediately,
 * and surfaces a freshly minted key in a copy-once panel — the only moment the
 * plaintext ever exists on the client.
 */
export function ApiKeysManager({ initialKeys }: { initialKeys: KeySummary[] }) {
  const [keys, setKeys] = useState<KeySummary[]>(initialKeys);
  const [name, setName] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFreshKey(null);
    startTransition(async () => {
      const result = await createApiKey(name);
      if (result.ok) {
        setKeys((current) => [result.summary, ...current]);
        setFreshKey(result.key);
        setName('');
      } else {
        setError(result.error);
      }
    });
  }

  function onRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKey(id);
      if (result.ok) {
        setKeys((current) =>
          current.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
        );
      } else {
        setError(result.error);
      }
    });
  }

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-5">
      {freshKey ? <FreshKey value={freshKey} onDismiss={() => setFreshKey(null)} /> : null}

      <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. laptop, ci, my-bot)"
          maxLength={80}
          className="sm:flex-1"
          aria-label="Key name"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Working…' : 'Create key'}
        </Button>
      </form>

      {error ? <p className="text-sm text-down">{error}</p> : null}

      {keys.length === 0 ? (
        <Empty
          title="No keys yet"
          detail="Create one above to authenticate the CLI, an SDK, or your own scripts as you."
        />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm font-medium ${key.revokedAt ? 'text-muted line-through' : 'text-ink'}`}
                  >
                    {key.name}
                  </span>
                  {key.revokedAt ? <Badge tone="down">revoked</Badge> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span className="font-mono">{key.prefix}…</span>
                  <span>
                    {key.lastUsedAt
                      ? `last used ${new Date(key.lastUsedAt).toLocaleDateString('en-US')}`
                      : 'never used'}
                  </span>
                </div>
              </div>
              {key.revokedAt ? null : (
                <Button tone="secondary" onClick={() => onRevoke(key.id)} disabled={pending}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        {active.length} active {active.length === 1 ? 'key' : 'keys'} · up to 10.
      </p>
    </div>
  );
}

function FreshKey({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the value is selectable in the field regardless.
    }
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/50 p-4">
      <p className="text-sm font-medium text-ink">Copy your key now — it won’t be shown again.</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs text-ink"
        />
        <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-xs text-muted underline underline-offset-2 hover:text-ink"
      >
        I’ve saved it — dismiss
      </button>
    </div>
  );
}
