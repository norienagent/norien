import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RuntimeError } from './errors.js';
import type { PermissionResolution } from './types.js';

/**
 * Permission Validator.
 *
 * An agent declares the capabilities it needs in `agent.json`. The workspace
 * decides which of those it will actually allow, in `norien.policy.json`.
 * Execution is refused unless every declared permission has been granted --
 * deny by default, so installing an agent never silently confers capability.
 *
 * The policy is a plain file on purpose: it belongs in version control, where
 * a change to what an agent may do shows up in review.
 */

export const POLICY_FILENAME = 'norien.policy.json';

export interface AgentPolicy {
  granted: string[];
  /** When the grant was recorded, for auditing. */
  grantedAt?: string;
}

export interface PolicyFile {
  version: 1;
  agents: Record<string, AgentPolicy>;
}

const EMPTY_POLICY: PolicyFile = { version: 1, agents: {} };

export function policyPath(workspace: string): string {
  return path.join(workspace, POLICY_FILENAME);
}

export class PermissionValidator {
  constructor(private readonly workspace: string) {}

  async read(): Promise<PolicyFile> {
    try {
      const raw = await readFile(policyPath(this.workspace), 'utf8');
      const parsed = JSON.parse(raw) as Partial<PolicyFile>;
      return { version: 1, agents: parsed.agents ?? {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_POLICY, agents: {} };
      if (error instanceof SyntaxError) {
        throw new RuntimeError(
          'PERMISSION_DENIED',
          `${POLICY_FILENAME} is not valid JSON.`,
          { hint: 'Fix or delete the file, then grant permissions again.' },
        );
      }
      throw error;
    }
  }

  async write(policy: PolicyFile): Promise<void> {
    // Sorted for clean diffs -- this file is meant to be reviewed.
    const agents = Object.fromEntries(
      Object.entries(policy.agents)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, entry]) => [slug, { ...entry, granted: [...entry.granted].sort() }]),
    );

    await writeFile(
      policyPath(this.workspace),
      `${JSON.stringify({ version: 1, agents }, null, 2)}\n`,
      'utf8',
    );
  }

  async grantedFor(slug: string): Promise<string[]> {
    const policy = await this.read();
    return policy.agents[slug]?.granted ?? [];
  }

  /** Records additional grants, merging with what is already allowed. */
  async grant(slug: string, permissions: readonly string[]): Promise<string[]> {
    if (permissions.length === 0) return this.grantedFor(slug);

    const policy = await this.read();
    const existing = policy.agents[slug]?.granted ?? [];
    const merged = [...new Set([...existing, ...permissions])].sort();

    policy.agents[slug] = { granted: merged, grantedAt: new Date().toISOString() };
    await this.write(policy);

    return merged;
  }

  async revoke(slug: string, permissions?: readonly string[]): Promise<string[]> {
    const policy = await this.read();
    const existing = policy.agents[slug]?.granted ?? [];

    const remaining = permissions
      ? existing.filter((entry) => !permissions.includes(entry))
      : [];

    if (remaining.length === 0) {
      delete policy.agents[slug];
    } else {
      policy.agents[slug] = { granted: remaining, grantedAt: new Date().toISOString() };
    }

    await this.write(policy);
    return remaining;
  }

  /**
   * Compares what the agent declares against what the workspace allows.
   *
   * Grants may use a trailing wildcard (`network:*`) so a policy can allow a
   * whole namespace without enumerating every action.
   */
  async resolve(slug: string, declared: readonly string[]): Promise<PermissionResolution> {
    const granted = await this.grantedFor(slug);
    const missing = declared.filter((permission) => !isCovered(permission, granted));

    return { declared: [...declared], granted, missing };
  }

  /** Refuses execution when anything declared has not been granted. */
  assertSatisfied(slug: string, resolution: PermissionResolution): void {
    if (resolution.missing.length === 0) return;

    throw new RuntimeError(
      'PERMISSION_DENIED',
      `'${slug}' declares ${resolution.missing.length} permission(s) this workspace has not granted.`,
      {
        details: resolution.missing.map((permission) => ({
          field: 'permissions',
          message: `'${permission}' is declared in agent.json but not granted.`,
          permission,
        })),
        hint: `Review them, then grant with: norien run ${slug} ${resolution.missing
          .map((permission) => `--grant ${permission}`)
          .join(' ')}`,
      },
    );
  }
}

/** `network:*` covers `network:fetch`; an exact match always covers itself. */
function isCovered(permission: string, granted: readonly string[]): boolean {
  if (granted.includes(permission)) return true;

  return granted.some((entry) => {
    if (!entry.endsWith('*')) return false;
    const prefix = entry.slice(0, -1);
    return permission.startsWith(prefix);
  });
}
