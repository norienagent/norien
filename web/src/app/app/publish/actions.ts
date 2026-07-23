'use server';

import type { NormalizedAgent } from '@/lib/api';
import { API_URL } from '@/lib/config';

export interface InspectState {
  status: 'idle' | 'ok' | 'invalid' | 'error';
  message?: string;
  /** Field-level problems reported by the registry's validator. */
  issues?: { field: string; message: string }[];
  result?: NormalizedAgent;
  manifest?: string;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    /** The registry reports these as `field`, e.g. "manifest.version". */
    details?: { field?: string; message?: string }[] | Record<string, unknown>;
  };
}

/**
 * Validates a pasted `agent.json` against the live registry.
 *
 * This is the same pre-flight `norien publish` runs — `POST /runtime/inspect`
 * parses the manifest, detects the runtime, resolves every declared tool
 * against the real catalogue, and reports what publishing this version would
 * do. Nothing is stored.
 *
 * It runs as a server action so the API origin stays server-side and no
 * credentials would ever reach the browser.
 */
export async function inspectManifest(
  _previous: InspectState,
  formData: FormData,
): Promise<InspectState> {
  const raw = String(formData.get('manifest') ?? '').trim();

  if (!raw) {
    return { status: 'invalid', message: 'Paste an agent.json to validate.' };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    return {
      status: 'invalid',
      message: `That is not valid JSON — ${(error as Error).message}`,
      manifest: raw,
    };
  }

  try {
    const response = await fetch(`${API_URL}/runtime/inspect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ manifest }),
      cache: 'no-store',
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const envelope = body as ErrorEnvelope | null;
      const details = envelope?.error?.details;

      return {
        status: 'invalid',
        message: envelope?.error?.message ?? `The registry rejected this manifest (${response.status}).`,
        manifest: raw,
        ...(Array.isArray(details)
          ? {
              issues: details.map((detail) => ({
                field: detail.field ?? '',
                message: detail.message ?? '',
              })),
            }
          : {}),
      };
    }

    return { status: 'ok', result: body as NormalizedAgent, manifest: raw };
  } catch {
    return {
      status: 'error',
      message: 'Could not reach the registry. Check that it is running on ' + API_URL + '.',
      manifest: raw,
    };
  }
}
