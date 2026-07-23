import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NorienClient, type ResolvedTool } from '@norien-live/sdk';

import { RuntimeError } from './errors.js';
import type { DependencyResolution } from './types.js';

/**
 * Dependency Resolver.
 *
 * Turns an agent's declared tool slugs into the full metadata the runtime
 * injects at launch. `norien install` already wrote that metadata to disk, so
 * the offline path is the fast, always-available default; the registry is
 * consulted only when asked, or when the local metadata is absent.
 *
 * This is why an agent can be launched on a machine with no network access.
 */

const METADATA_FILENAME = 'norien.metadata.json';

interface InstallMetadata {
  slug?: string;
  version?: string;
  dependencies?: {
    requested?: string[];
    resolved?: ResolvedTool[];
    missing?: string[];
    satisfied?: boolean;
  };
}

export interface ResolveDependenciesInput {
  slug: string;
  agentDirectory: string;
  declared: readonly string[];
  /** Skip the registry even when it is configured. */
  offline?: boolean;
}

export class DependencyResolver {
  constructor(
    private readonly options: {
      registry?: string | undefined;
      actor?: string | undefined;
      apiKey?: string | undefined;
    } = {},
  ) {}

  async resolve(input: ResolveDependenciesInput): Promise<DependencyResolution> {
    if (input.declared.length === 0) {
      return { tools: [], missing: [], satisfied: true, source: 'install-metadata' };
    }

    const local = await this.fromInstallMetadata(input);

    // Local metadata is authoritative when it covers everything declared: it
    // is exactly what was resolved at install time, and reusing it keeps the
    // launch path offline and deterministic.
    if (local && local.missing.length === 0) return local;

    if (input.offline || !this.options.registry) {
      return (
        local ?? {
          tools: [],
          missing: [...input.declared],
          satisfied: false,
          source: 'install-metadata',
        }
      );
    }

    return this.fromRegistry(input);
  }

  private async fromInstallMetadata(
    input: ResolveDependenciesInput,
  ): Promise<DependencyResolution | null> {
    let metadata: InstallMetadata;

    try {
      const raw = await readFile(path.join(input.agentDirectory, METADATA_FILENAME), 'utf8');
      metadata = JSON.parse(raw) as InstallMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      // Corrupt metadata should fall back to the registry, not abort the run.
      return null;
    }

    const resolved = metadata.dependencies?.resolved ?? [];
    const bySlug = new Map(resolved.map((tool) => [tool.slug, tool]));

    // Ordered by declaration, and checked against what the manifest asks for
    // now rather than what it asked for at install time.
    const tools = input.declared
      .map((slug) => bySlug.get(slug))
      .filter((tool): tool is ResolvedTool => tool !== undefined);
    const missing = input.declared.filter((slug) => !bySlug.has(slug));

    return {
      tools,
      missing,
      satisfied: missing.length === 0,
      source: 'install-metadata',
    };
  }

  private async fromRegistry(input: ResolveDependenciesInput): Promise<DependencyResolution> {
    const client = new NorienClient({
      baseUrl: this.options.registry as string,
      ...(this.options.actor ? { actor: this.options.actor } : {}),
      ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
      userAgent: '@norien-live/runtime',
    });

    try {
      // The registry already resolves an agent's whole dependency set in one
      // call, so this reuses that rather than fetching tools one by one.
      const normalized = await client.agents.runtime(input.slug);

      return {
        tools: normalized.dependencies.resolved,
        missing: normalized.dependencies.missing,
        satisfied: normalized.dependencies.satisfied,
        source: 'registry',
      };
    } catch (error) {
      throw new RuntimeError(
        'DEPENDENCY_MISSING',
        `Could not resolve tools for '${input.slug}' from the registry.`,
        {
          hint: 'Run with --offline to use the metadata recorded at install time.',
          cause: error,
        },
      );
    }
  }

  /** Refuses a launch whose tools cannot all be resolved. */
  assertSatisfied(slug: string, resolution: DependencyResolution): void {
    if (resolution.satisfied) return;

    throw new RuntimeError(
      'DEPENDENCY_MISSING',
      `'${slug}' requires ${resolution.missing.length} tool(s) that could not be resolved.`,
      {
        details: resolution.missing.map((tool) => ({
          field: 'tools',
          message: `'${tool}' is declared in agent.json but is not available.`,
          tool,
        })),
        hint: `Reinstall to refresh tool metadata: norien install ${slug} --force`,
      },
    );
  }
}
