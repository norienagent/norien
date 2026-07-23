import path from 'node:path';

import { ToolError } from './errors.js';
import { type ResolvedBinary, resolveBinary, spawnJson } from './exec.js';
import { type ToolManifest, normalizeEnvironment } from './manifest.js';
import { type JsonSchema, validateAgainstSchema } from './schema-validator.js';
import { readInstalledToolManifest, toolDir } from './workspace.js';

/**
 * Tool Executor -- the plugin engine.
 *
 * Given an installed tool and an input, it validates the input against the
 * tool's `input_schema`, invokes the tool according to its runtime, validates
 * the result against `output_schema`, and returns it.
 *
 * The executor never knows what any particular tool does. `node`/`python`
 * tools speak a generic JSON protocol over stdin/stdout; `http` tools are
 * proxied to their endpoint. That is what makes every tool a plugin and keeps
 * the runtime free of hardcoded tool implementations.
 *
 * ## Plugin protocol (node/python)
 *
 * The tool receives one JSON document on **stdin**:
 *   `{ "input": <input>, "context": { tool, version, permissions, env } }`
 * and must write one JSON document to **stdout**:
 *   `{ "output": <result> }`  or  `{ "error": { "message": "..." } }`
 * Anything the tool logs must go to **stderr**.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ToolExecutionOptions {
  /** Environment values available to the tool (names → values). */
  env?: Record<string, string>;
  /** Permissions the caller has granted. When set, the tool's must be a subset. */
  grantedPermissions?: string[];
  timeoutMs?: number;
  /** Skip output-schema validation (for tools with loose output contracts). */
  skipOutputValidation?: boolean;
}

export interface ToolExecutionResult {
  tool: string;
  version: string;
  runtime: string;
  output: unknown;
  duration_ms: number;
  /** Captured stderr, useful for debugging a tool run. */
  logs: string;
}

export class ToolExecutor {
  private readonly interpreterCache = new Map<string, ResolvedBinary | null>();

  constructor(
    private readonly workspace: string,
    private readonly options: { registry?: string } = {},
  ) {}

  /** Executes an installed tool by slug. */
  async execute(
    slug: string,
    input: unknown,
    options: ToolExecutionOptions = {},
  ): Promise<ToolExecutionResult> {
    const manifest = await readInstalledToolManifest(this.workspace, slug);
    return this.executeManifest(manifest, toolDir(this.workspace, slug), input, options);
  }

  /**
   * Executes a tool from an explicit manifest and directory. Used by the agent
   * runtime, which resolves tools centrally rather than by workspace lookup.
   */
  async executeManifest(
    manifest: ToolManifest,
    directory: string,
    input: unknown,
    options: ToolExecutionOptions = {},
  ): Promise<ToolExecutionResult> {
    const slug = manifest.slug ?? manifest.name;
    const started = Date.now();

    this.assertPermitted(slug, manifest, options.grantedPermissions);
    this.assertInputValid(slug, manifest.input_schema, input);
    this.assertEnvironmentComplete(slug, manifest, options.env ?? {});

    const context = {
      tool: slug,
      version: manifest.version,
      permissions: manifest.permissions ?? [],
      env: Object.keys(options.env ?? {}),
    };

    const result =
      manifest.runtime === 'http'
        ? await this.executeHttp(manifest, input, options)
        : await this.executeProcess(manifest, directory, input, context, options);

    if (!options.skipOutputValidation) {
      this.assertOutputValid(slug, manifest.output_schema, result.output);
    }

    return {
      tool: slug,
      version: manifest.version,
      runtime: manifest.runtime,
      output: result.output,
      duration_ms: Date.now() - started,
      logs: result.logs,
    };
  }

  // --- Guards -------------------------------------------------------------

  private assertPermitted(slug: string, manifest: ToolManifest, granted?: string[]): void {
    if (!granted) return;
    const declared = manifest.permissions ?? [];
    const missing = declared.filter((permission) => !isCovered(permission, granted));

    if (missing.length > 0) {
      throw new ToolError(
        'PERMISSION_DENIED',
        `'${slug}' requires permission(s) the caller has not granted: ${missing.join(', ')}.`,
        {
          details: missing.map((permission) => ({ field: 'permissions', message: permission })),
          hint: 'An agent may only use tools within the permissions it was granted.',
        },
      );
    }
  }

  private assertInputValid(slug: string, schema: JsonSchema, input: unknown): void {
    const { valid, errors } = validateAgainstSchema(schema, input);
    if (!valid) {
      throw new ToolError('INPUT_INVALID', `Input to '${slug}' does not match its input_schema.`, {
        details: errors.map((issue) => ({
          field: issue.path.replace(/^\//, '').replaceAll('/', '.') || undefined,
          message: issue.message,
        })),
      });
    }
  }

  private assertOutputValid(slug: string, schema: JsonSchema, output: unknown): void {
    const { valid, errors } = validateAgainstSchema(schema, output);
    if (!valid) {
      throw new ToolError(
        'OUTPUT_INVALID',
        `Output from '${slug}' does not match its output_schema.`,
        {
          details: errors.map((issue) => ({
            field: issue.path.replace(/^\//, '').replaceAll('/', '.') || undefined,
            message: issue.message,
          })),
          hint: 'This is a bug in the tool, not the caller.',
        },
      );
    }
  }

  private assertEnvironmentComplete(
    slug: string,
    manifest: ToolManifest,
    env: Record<string, string>,
  ): void {
    const declared = normalizeEnvironment(manifest.environment);
    const available = { ...filterEnv(process.env), ...env };

    const missing = declared
      .filter((entry) => entry.required && entry.default === undefined && !isPresent(available[entry.name]))
      .map((entry) => entry.name);

    if (missing.length > 0) {
      throw new ToolError(
        'ENVIRONMENT_INCOMPLETE',
        `'${slug}' cannot run: ${missing.length} required environment variable(s) are not set.`,
        {
          details: missing.map((name) => ({ field: name, message: 'Required by tool.json.' })),
          hint: `Set them in .env or pass them to the executor.`,
        },
      );
    }
  }

  // --- Runtimes -----------------------------------------------------------

  private async executeProcess(
    manifest: ToolManifest,
    directory: string,
    input: unknown,
    context: Record<string, unknown>,
    options: ToolExecutionOptions,
  ): Promise<{ output: unknown; logs: string }> {
    const interpreter = await this.resolveInterpreter(manifest.runtime);
    const entrypointPath = path.isAbsolute(manifest.entrypoint)
      ? manifest.entrypoint
      : path.join(directory, manifest.entrypoint);

    const env = {
      ...filterEnv(process.env),
      ...defaultsFromManifest(manifest),
      ...(options.env ?? {}),
      NORIEN_TOOL: manifest.slug ?? manifest.name,
      NORIEN_TOOL_VERSION: manifest.version,
      ...(this.options.registry ? { NORIEN_REGISTRY: this.options.registry } : {}),
    };

    const result = await spawnJson(interpreter.executable, [entrypointPath], {
      cwd: directory,
      env,
      stdin: JSON.stringify({ input, context }),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (result.timedOut) {
      throw new ToolError('EXECUTION_FAILED', `'${context.tool}' timed out.`, {
        details: [{ message: result.stderr.trim() || 'no output' }],
      });
    }

    const parsed = parseToolOutput(result.stdout);

    if (parsed.error) {
      throw new ToolError('EXECUTION_FAILED', `'${context.tool}' reported an error: ${parsed.error}`, {
        details: [{ message: result.stderr.trim() }].filter((detail) => detail.message),
      });
    }

    if (result.code !== 0 && parsed.output === undefined) {
      throw new ToolError(
        'EXECUTION_FAILED',
        `'${context.tool}' exited with code ${result.code} and produced no result.`,
        {
          details: [{ message: result.stderr.trim() || 'no output on stdout' }],
          hint: 'A tool must write its JSON result to stdout and log to stderr.',
        },
      );
    }

    return { output: parsed.output, logs: result.stderr };
  }

  private async executeHttp(
    manifest: ToolManifest,
    input: unknown,
    options: ToolExecutionOptions,
  ): Promise<{ output: unknown; logs: string }> {
    const env = { ...filterEnv(process.env), ...(options.env ?? {}) };
    const httpConfig = (manifest.http as { method?: string } | undefined) ?? {};
    const method = (httpConfig.method ?? 'POST').toUpperCase();

    // `{field}` placeholders in the entrypoint URL are filled from the input.
    const url = new URL(fillTemplate(manifest.entrypoint, input));
    const headers: Record<string, string> = { accept: 'application/json' };
    let body: string | undefined;

    if (method === 'GET' || method === 'HEAD') {
      if (input && typeof input === 'object') {
        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
          if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        }
      }
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(input ?? {});
    }

    injectHttpAuth(manifest, env, url, headers);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
      });

      const text = await response.text();
      const output = safeJsonParse(text);

      if (!response.ok) {
        throw new ToolError(
          'EXECUTION_FAILED',
          `'${manifest.slug ?? manifest.name}' endpoint returned ${response.status}.`,
          { details: [{ message: typeof output === 'string' ? output.slice(0, 500) : text.slice(0, 500) }] },
        );
      }

      return { output, logs: '' };
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(
        'EXECUTION_FAILED',
        `'${manifest.slug ?? manifest.name}' request failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveInterpreter(runtime: string): Promise<ResolvedBinary> {
    if (runtime !== 'node' && runtime !== 'python') {
      throw new ToolError('RUNTIME_UNSUPPORTED', `Unsupported tool runtime '${runtime}'.`);
    }

    const candidates = runtime === 'node' ? ['node'] : ['python3', 'python'];

    for (const candidate of candidates) {
      if (this.interpreterCache.has(candidate)) {
        const cached = this.interpreterCache.get(candidate);
        if (cached) return cached;
        continue;
      }

      const resolved = await resolveBinary(candidate);
      this.interpreterCache.set(candidate, resolved);
      if (resolved) return resolved;
    }

    throw new ToolError('RUNTIME_UNSUPPORTED', `No ${runtime} interpreter found on PATH.`, {
      hint: `Install ${runtime} to run this tool.`,
    });
  }
}

// --- Helpers --------------------------------------------------------------

/** `network:*` covers `network:fetch`; exact matches always cover themselves. */
function isCovered(permission: string, granted: readonly string[]): boolean {
  if (granted.includes(permission)) return true;
  return granted.some((entry) => entry.endsWith('*') && permission.startsWith(entry.slice(0, -1)));
}

function parseToolOutput(stdout: string): { output?: unknown; error?: string } {
  const trimmed = stdout.trim();
  if (trimmed === '') return { output: undefined };

  // The whole of stdout as JSON is the happy path; otherwise the last JSON
  // line wins, so a tool that prints a stray line still works.
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];

  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value.startsWith('{') && !value.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        const err = parsed.error;
        return { error: typeof err === 'string' ? err : JSON.stringify(err) };
      }
      if (parsed && typeof parsed === 'object' && 'output' in parsed) {
        return { output: (parsed as { output: unknown }).output };
      }
      // A bare JSON document is treated as the output itself.
      return { output: parsed };
    } catch {
      // Try the next candidate.
    }
  }

  return { output: undefined };
}

function injectHttpAuth(
  manifest: ToolManifest,
  env: Record<string, string>,
  url: URL,
  headers: Record<string, string>,
): void {
  const auth = manifest.authentication;
  if (!auth || auth.type === 'none') return;

  const slugUpper = (manifest.slug ?? manifest.name).toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  if (auth.type === 'api_key') {
    const value = env[`${slugUpper}_API_KEY`] ?? env.API_KEY;
    if (!value) return;
    const name = auth.name ?? 'X-Api-Key';
    if (auth.location === 'query') url.searchParams.set(name, value);
    else headers[name.toLowerCase()] = value;
  } else if (auth.type === 'bearer') {
    const token = env[`${slugUpper}_TOKEN`] ?? env.TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
  } else if (auth.type === 'basic') {
    const user = env[`${slugUpper}_USERNAME`];
    const pass = env[`${slugUpper}_PASSWORD`];
    if (user && pass) headers.authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }
}

/** Substitutes `{field}` placeholders in a URL template from the input. */
function fillTemplate(template: string, input: unknown): string {
  if (!input || typeof input !== 'object') return template;
  const record = input as Record<string, unknown>;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    record[key] !== undefined ? encodeURIComponent(String(record[key])) : match,
  );
}

function defaultsFromManifest(manifest: ToolManifest): Record<string, string> {
  const values: Record<string, string> = {};
  for (const entry of normalizeEnvironment(manifest.environment)) {
    if (entry.default !== undefined) values[entry.name] = entry.default;
  }
  return values;
}

function safeJsonParse(text: string): unknown {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function filterEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function isPresent(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}
