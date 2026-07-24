'use server';

import { revalidatePath } from 'next/cache';

import { API_URL } from '@norien-live/web-ui';
import { getAccessToken } from '@norien-live/web-ui/supabase/server';

export interface KeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type CreateKeyResult =
  | { ok: true; key: string; summary: KeySummary }
  | { ok: false; error: string };

export type RevokeKeyResult = { ok: true } | { ok: false; error: string };

/** Reads the message from the registry's error envelope, or a fallback. */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Mints a key for the signed-in user. The registry returns the plaintext once;
 * this hands it straight back to the UI to show — it is never persisted here.
 */
export async function createApiKey(name: string): Promise<CreateKeyResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'You need to be signed in to create a key.' };

  const response = await fetch(`${API_URL}/api/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: name.trim() || undefined }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response) return { ok: false, error: 'Could not reach the registry. Try again.' };
  if (!response.ok) return { ok: false, error: await errorMessage(response, 'Could not create the key.') };

  const body = (await response.json()) as { key: string; data: KeySummary };
  revalidatePath('/api-keys');
  return { ok: true, key: body.key, summary: body.data };
}

export async function revokeApiKey(id: string): Promise<RevokeKeyResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'You need to be signed in.' };

  const response = await fetch(`${API_URL}/api/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!response) return { ok: false, error: 'Could not reach the registry. Try again.' };
  if (!response.ok) return { ok: false, error: await errorMessage(response, 'Could not revoke the key.') };

  revalidatePath('/api-keys');
  return { ok: true };
}
