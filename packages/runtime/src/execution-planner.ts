import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AgentManifest, RuntimeName } from '@norien/sdk';

import { resolveBinary, type ResolvedBinary } from '@norien/tools';

import { RuntimeError } from './errors.js';
import type { ExecutionPlan, PackageManager } from './types.js';

/** Runtimes this planner can launch. */
const RUNTIMES = ['node', 'python'] as const;

/**
 * Execution Planner.
 *
 * Decides exactly which binary is invoked, with which arguments. The result is
 * recorded on the instance and surfaced by `norien status` and the API, so a
 * launch is always explainable rather than magic.
 *
 * Precedence, highest first:
 *
 *   1. an explicit `--command` from the caller
 *   2. a `start` script in package.json / pyproject.toml, run through the
 *      detected package manager (this is what makes `pnpm start` work)
 *   3. `commands.start` from agent.json
 *   4. `<interpreter> <entrypoint>`
 *
 * Detection never overrides an explicit instruction; it only fills gaps.
 */

/** Lockfiles are the strongest signal of which package manager a project uses. */
const NODE_MANAGER_LOCKFILES: [PackageManager, string][] = [
  ['bun', 'bun.lockb'],
  ['bun', 'bun.lock'],
  ['pnpm', 'pnpm-lock.yaml'],
  ['yarn', 'yarn.lock'],
  ['npm', 'package-lock.json'],
];

const PYTHON_MANAGER_LOCKFILES: [PackageManager, string][] = [
  ['uv', 'uv.lock'],
  ['pip', 'requirements.txt'],
];

const RUN_SCRIPT: Partial<Record<PackageManager, string[]>> = {
  bun: ['run'],
  pnpm: ['run'],
  yarn: ['run'],
  npm: ['run'],
};

async function exists(target: string): Promise<boolean> {
  return access(target).then(
    () => true,
    () => false,
  );
}

// Binary resolution (including the Windows `.cmd`/`.exe` handling) lives in
// @norien/tools, the lower-level execution primitive, so it is defined once and
// shared by the tool executor and this planner.
export { executableCandidates, resolveBinary } from '@norien/tools';
export type { ResolvedBinary } from '@norien/tools';

/** Version string only. Kept for callers that do not need the executable name. */
export async function probeBinary(binary: string, args = ['--version']): Promise<string | null> {
  return (await resolveBinary(binary, args))?.version ?? null;
}

export interface PlanInput {
  manifest: AgentManifest;
  agentDirectory: string;
  /** Overrides everything else when provided. */
  explicitCommand?: string | undefined;
}

export class ExecutionPlanner {
  /** Caches binary probes for the process lifetime; PATH rarely changes. */
  private readonly probeCache = new Map<string, ResolvedBinary | null>();

  private async available(binary: string): Promise<ResolvedBinary | null> {
    if (this.probeCache.has(binary)) return this.probeCache.get(binary) ?? null;

    const resolved = await resolveBinary(binary);
    this.probeCache.set(binary, resolved);
    return resolved;
  }

  /**
   * Picks the package manager for a project directory.
   *
   * A lockfile wins, but only if its manager is actually installed -- a
   * `pnpm-lock.yaml` on a machine without pnpm should fall through rather than
   * produce a command that cannot run.
   */
  async detectPackageManager(
    runtime: RuntimeName,
    directory: string,
  ): Promise<{ manager: PackageManager; executable: string | null }> {
    const candidates = runtime === 'node' ? NODE_MANAGER_LOCKFILES : PYTHON_MANAGER_LOCKFILES;

    for (const [manager, lockfile] of candidates) {
      if (!(await exists(path.join(directory, lockfile)))) continue;

      // `pip` is not invoked to launch anything; it only signals a venv-style
      // project, and the interpreter is used directly.
      if (manager === 'pip') return { manager: 'pip', executable: null };

      const resolved = await this.available(manager);
      if (resolved) return { manager, executable: resolved.executable };
    }

    if (runtime === 'python') {
      // A uv project may declare uv in pyproject.toml without a lockfile yet.
      if (await exists(path.join(directory, 'pyproject.toml'))) {
        const resolved = await this.available('uv');
        if (resolved) return { manager: 'uv', executable: resolved.executable };
      }
      return { manager: 'none', executable: null };
    }

    // No lockfile: npm ships with Node, so it is the safe default for running
    // a package script.
    if (await exists(path.join(directory, 'package.json'))) {
      const resolved = await this.available('npm');
      if (resolved) return { manager: 'npm', executable: resolved.executable };
    }

    return { manager: 'none', executable: null };
  }

  /** Reads a `start` script from package.json, if one is declared. */
  private async nodeStartScript(directory: string): Promise<boolean> {
    try {
      const raw = await readFile(path.join(directory, 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
      return typeof parsed.scripts?.start === 'string' && parsed.scripts.start.trim() !== '';
    } catch {
      return false;
    }
  }

  /** Resolves the interpreter binary for a runtime, preferring versioned names. */
  private async resolveInterpreter(runtime: RuntimeName): Promise<{ binary: string; version: string }> {
    // Checked explicitly: without this, an unrecognised runtime would fall
    // through to the Python branch and silently launch under the wrong
    // interpreter instead of being rejected.
    if (!(RUNTIMES as readonly string[]).includes(runtime)) {
      throw new RuntimeError('RUNTIME_UNAVAILABLE', `Unsupported runtime '${runtime}'.`, {
        details: [{ field: 'runtime', message: `Supported runtimes are: ${RUNTIMES.join(', ')}.` }],
        hint: 'Set "runtime" in agent.json to one of the supported values.',
      });
    }

    const candidates = runtime === 'node' ? ['node'] : ['python3', 'python'];

    for (const candidate of candidates) {
      const resolved = await this.available(candidate);
      if (resolved) return { binary: resolved.executable, version: resolved.version };
    }

    throw new RuntimeError(
      'RUNTIME_UNAVAILABLE',
      `No ${runtime} interpreter found on PATH.`,
      {
        details: [{ field: 'runtime', message: `Tried: ${candidates.join(', ')}.` }],
        hint:
          runtime === 'python'
            ? 'Install Python 3 and make sure `python3` or `python` is on PATH.'
            : 'Install Node.js and make sure `node` is on PATH.',
      },
    );
  }

  async plan(input: PlanInput): Promise<ExecutionPlan> {
    const runtime = input.manifest.runtime;
    const directory = input.agentDirectory;

    const { manager: packageManager, executable: managerExecutable } =
      await this.detectPackageManager(runtime, directory);
    const interpreter = await this.resolveInterpreter(runtime);

    // 1. Explicit command wins outright.
    if (input.explicitCommand && input.explicitCommand.trim() !== '') {
      const [command, ...args] = tokenize(input.explicitCommand);
      return {
        runtime,
        command: command as string,
        args,
        cwd: directory,
        packageManager,
        source: 'explicit-command',
        interpreterVersion: interpreter.version,
      };
    }

    // 2. A package script, launched through the detected manager.
    if (
      runtime === 'node' &&
      RUN_SCRIPT[packageManager] &&
      managerExecutable &&
      (await this.nodeStartScript(directory))
    ) {
      return {
        runtime,
        command: managerExecutable,
        args: [...(RUN_SCRIPT[packageManager] as string[]), 'start'],
        cwd: directory,
        packageManager,
        source: 'package-script',
        interpreterVersion: interpreter.version,
      };
    }

    // 3. The manifest's own start command.
    const declared = input.manifest.commands?.start?.trim();
    if (declared) {
      const [command, ...args] = tokenize(declared);

      // `uv run` provides the project's virtualenv, so a bare `python …` start
      // command is wrapped rather than run against the system interpreter.
      if (packageManager === 'uv' && managerExecutable && isBarePython(command as string)) {
        return {
          runtime,
          command: managerExecutable,
          args: ['run', command as string, ...args],
          cwd: directory,
          packageManager,
          source: 'manifest-command',
          interpreterVersion: interpreter.version,
        };
      }

      return {
        runtime,
        command: normaliseInterpreter(command as string, runtime, interpreter.binary),
        args,
        cwd: directory,
        packageManager,
        source: 'manifest-command',
        interpreterVersion: interpreter.version,
      };
    }

    // 4. Interpreter plus entrypoint.
    const entrypoint = input.manifest.entrypoint;
    if (!entrypoint) {
      throw new RuntimeError(
        'MANIFEST_INVALID',
        'agent.json declares no entrypoint and no start command.',
        { hint: 'Add "entrypoint" or "commands.start" to agent.json.' },
      );
    }

    if (packageManager === 'uv' && managerExecutable) {
      return {
        runtime,
        command: managerExecutable,
        args: ['run', interpreter.binary, entrypoint],
        cwd: directory,
        packageManager,
        source: 'interpreter-entrypoint',
        interpreterVersion: interpreter.version,
      };
    }

    return {
      runtime,
      command: interpreter.binary,
      args: [entrypoint],
      cwd: directory,
      packageManager,
      source: 'interpreter-entrypoint',
      interpreterVersion: interpreter.version,
    };
  }
}

/** Splits a command string, honouring single and double quotes. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current !== '') tokens.push(current);
  return tokens;
}

function isBarePython(command: string): boolean {
  return command === 'python' || command === 'python3';
}

/**
 * Maps a generic interpreter name onto the one actually present.
 *
 * A manifest saying `python main.py` must still run where only `python3`
 * exists -- common on Linux and macOS.
 */
function normaliseInterpreter(command: string, runtime: RuntimeName, resolved: string): string {
  if (runtime === 'python' && isBarePython(command)) return resolved;
  if (runtime === 'node' && command === 'node') return resolved;
  return command;
}
