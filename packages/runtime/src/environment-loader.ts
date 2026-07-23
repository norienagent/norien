import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AgentManifest, EnvironmentVariable, ResolvedTool } from '@norien-live/sdk';

import { RuntimeError } from './errors.js';
import type { EnvironmentResolution } from './types.js';

/**
 * Environment Loader.
 *
 * Builds the exact environment a child process receives, from four layers in
 * increasing precedence:
 *
 *   1. manifest defaults      (declared in agent.json)
 *   2. workspace .env         (shared across agents)
 *   3. agent .env             (per-agent, wins over workspace)
 *   4. explicit overrides     (passed to `run`)
 *
 * Values never leave this module: everything returned to callers, logged, or
 * serialised over the API is variable *names* only.
 */

const NORIEN_PREFIX = 'NORIEN_';

/**
 * Minimal `.env` parser.
 *
 * Written rather than pulled in as a dependency so the quoting rules are
 * explicit and stable: `KEY=value`, `export` prefixes tolerated, single and
 * double quotes stripped, escape sequences expanded only inside double quotes,
 * `#` starting a comment only outside quotes.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separator + 1).trim();

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      // Single quotes are literal; no escape processing.
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    result[key] = value;
  }

  return result;
}

async function readEnvFile(file: string): Promise<Record<string, string> | null> {
  try {
    return parseEnvFile(await readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new RuntimeError('ENVIRONMENT_INCOMPLETE', `Could not read ${file}.`, { cause: error });
  }
}

export interface LoadedEnvironment {
  /** The full map handed to the child process. Never logged or serialised. */
  values: Record<string, string>;
  resolution: EnvironmentResolution;
}

export interface LoadEnvironmentInput {
  slug: string;
  version: string;
  agentDirectory: string;
  workspace: string;
  manifest: AgentManifest;
  tools: ResolvedTool[];
  grantedPermissions: string[];
  registry?: string | undefined;
  port?: number | undefined;
  overrides?: Record<string, string> | undefined;
}

export class EnvironmentLoader {
  /**
   * Resolves the child environment. Does not throw on missing variables --
   * reporting them is `validate`'s job, so a caller can inspect the result
   * before deciding whether to refuse the run.
   */
  async load(input: LoadEnvironmentInput): Promise<LoadedEnvironment> {
    const declared = input.manifest.environment ?? [];
    const sources: string[] = [];
    const values: Record<string, string> = {};

    // 1. Manifest defaults.
    for (const variable of declared) {
      if (variable.default !== undefined) values[variable.name] = variable.default;
    }
    if (declared.some((variable) => variable.default !== undefined)) {
      sources.push('agent.json (defaults)');
    }

    // 2. Workspace .env, then 3. agent .env -- later wins.
    const workspaceEnv = await readEnvFile(path.join(input.workspace, '.env'));
    if (workspaceEnv) {
      Object.assign(values, workspaceEnv);
      sources.push(path.join(input.workspace, '.env'));
    }

    const agentEnv = await readEnvFile(path.join(input.agentDirectory, '.env'));
    if (agentEnv) {
      Object.assign(values, agentEnv);
      sources.push(path.join(input.agentDirectory, '.env'));
    }

    // 4. Explicit overrides from the caller.
    if (input.overrides && Object.keys(input.overrides).length > 0) {
      Object.assign(values, input.overrides);
      sources.push('--env overrides');
    }

    // Supervisor-injected context. Applied last so an agent can always trust
    // these to describe the run it is actually part of.
    const injected = this.buildInjectedEnvironment(input);
    Object.assign(values, injected);

    const required = declared.filter((variable) => variable.required);
    const satisfied = required
      .filter((variable) => isPresent(values[variable.name]))
      .map((variable) => variable.name);
    const missing = required
      .filter((variable) => !isPresent(values[variable.name]))
      .map((variable) => variable.name);

    return {
      values,
      resolution: {
        names: Object.keys(values).sort(),
        satisfied,
        missing,
        injected: Object.keys(injected).sort(),
        sources,
      },
    };
  }

  /**
   * Tool injection.
   *
   * Everything the agent needs to call its tools arrives as environment
   * variables, so an agent needs no Norien SDK to be launchable: read
   * `NORIEN_TOOLS`, get every resolved tool's schemas and auth requirements.
   */
  private buildInjectedEnvironment(input: LoadEnvironmentInput): Record<string, string> {
    const injected: Record<string, string> = {
      [`${NORIEN_PREFIX}AGENT`]: input.slug,
      [`${NORIEN_PREFIX}AGENT_VERSION`]: input.version,
      [`${NORIEN_PREFIX}RUNTIME`]: input.manifest.runtime,
      [`${NORIEN_PREFIX}ENTRYPOINT`]: input.manifest.entrypoint,
      [`${NORIEN_PREFIX}AGENT_DIR`]: input.agentDirectory,
      [`${NORIEN_PREFIX}WORKSPACE`]: input.workspace,
      [`${NORIEN_PREFIX}PERMISSIONS`]: input.grantedPermissions.join(','),
      [`${NORIEN_PREFIX}TOOLS`]: JSON.stringify(
        input.tools.map((tool) => ({
          slug: tool.slug,
          name: tool.name,
          version: tool.version,
          category: tool.category,
          runtime: tool.runtime ?? null,
          entrypoint: tool.entrypoint ?? null,
          authentication: tool.authentication,
          input_schema: tool.input_schema,
          output_schema: tool.output_schema,
          permissions: tool.permissions ?? [],
        })),
      ),
      [`${NORIEN_PREFIX}TOOL_SLUGS`]: input.tools.map((tool) => tool.slug).join(','),
    };

    if (input.registry) injected[`${NORIEN_PREFIX}REGISTRY`] = input.registry;

    if (input.port !== undefined) {
      injected[`${NORIEN_PREFIX}PORT`] = String(input.port);
      // Also as PORT, which is what most HTTP frameworks read by default.
      injected.PORT = String(input.port);
    }

    return injected;
  }

  /**
   * Refuses a run whose required variables are absent.
   *
   * The error names every missing variable and points at the `.env.example`
   * the CLI already generated, so the fix is mechanical.
   */
  validate(
    resolution: EnvironmentResolution,
    context: { slug: string; agentDirectory: string; declared: EnvironmentVariable[] },
  ): void {
    if (resolution.missing.length === 0) return;

    const byName = new Map(context.declared.map((variable) => [variable.name, variable]));

    throw new RuntimeError(
      'ENVIRONMENT_INCOMPLETE',
      `'${context.slug}' cannot start: ${resolution.missing.length} required environment variable(s) are not set.`,
      {
        details: resolution.missing.map((name) => {
          const variable = byName.get(name);
          return {
            field: name,
            message: variable?.description ?? 'Required by agent.json.',
            secret: variable?.secret ?? false,
          };
        }),
        hint: `Copy ${path.join(context.agentDirectory, '.env.example')} to ${path.join(context.agentDirectory, '.env')} and fill in the values.`,
      },
    );
  }
}

function isPresent(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}
