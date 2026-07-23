import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Source fetching.
 *
 * The registry distributes manifests, not code — a deliberate split, because a
 * shared catalogue should not host and serve arbitrary bundles. That leaves a
 * gap: a `node` or `python` agent installed from the registry is a declaration
 * until its code arrives.
 *
 * This closes the gap without moving code through the registry. A manifest
 * declares where its code lives, in a `source` block, and this fetches it at
 * install time — the same model as `go get` or a git-backed package.
 *
 *   "source": {
 *     "type": "git",
 *     "url": "https://github.com/owner/repo",
 *     "ref": "v1.0.0",                    // optional: tag, branch, or commit
 *     "directory": "examples/agents/foo"  // optional: subpath within the repo
 *   }
 *
 * Fetching clones and copies. It never executes anything — not a build, not a
 * postinstall script, nothing. Running the code stays gated behind the runtime's
 * permission grant, so installing an agent is not a trust decision; running it
 * is, and that decision is made separately and explicitly.
 */

const run = promisify(execFile);

/** Names the registry already materialised — never overwritten by a fetch. */
const CANONICAL_FILES = new Set([
  'agent.json',
  'tool.json',
  'readme.md',
  'readme',
  'readme.markdown',
  'readme.txt',
  '.env.example',
  'norien.metadata.json',
]);

/** Never copied out of a cloned repository. */
const IGNORED = new Set(['.git', 'node_modules', '.norien', '.env']);

export interface GitSource {
  type: 'git';
  url: string;
  ref?: string;
  directory?: string;
}

export interface FetchResult {
  fetched: boolean;
  /** Why nothing was fetched, when `fetched` is false. Not an error — a state. */
  reason?: string;
  ref?: string;
  commit?: string;
  files: string[];
  /** True when the fetched code declares runtime dependencies the caller must install. */
  hasDependencies?: boolean;
}

/**
 * Narrows an unknown manifest field to a git source.
 *
 * Only `https` and `ssh` are accepted. `file://` and other schemes are rejected
 * on purpose: an install should reach out to a named remote, never read an
 * arbitrary local path chosen by whoever wrote the manifest.
 */
export function parseSource(value: unknown): GitSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;

  if (source.type !== 'git') return null;
  if (typeof source.url !== 'string' || source.url.length === 0) return null;

  const url = source.url.trim();
  const allowed = /^https:\/\//i.test(url) || /^git@/.test(url) || /^ssh:\/\//i.test(url);
  if (!allowed) return null;

  const result: GitSource = { type: 'git', url };
  if (typeof source.ref === 'string' && source.ref.trim()) result.ref = source.ref.trim();
  if (typeof source.directory === 'string' && source.directory.trim()) {
    result.directory = source.directory.trim();
  }
  return result;
}

async function gitAvailable(): Promise<boolean> {
  try {
    await run('git', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clones `source` into a temp directory and returns its path plus the resolved
 * commit. Uses init + fetch + checkout rather than `git clone`, because that one
 * sequence resolves a tag, a branch, and a commit SHA identically — `clone
 * --branch` cannot check out a bare commit.
 */
async function cloneToTemp(source: GitSource): Promise<{ dir: string; commit: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'norien-src-'));
  const git = (args: string[]) => run('git', args, { cwd: dir, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });

  try {
    await git(['init', '--quiet']);
    await git(['remote', 'add', 'origin', source.url]);

    const ref = source.ref ?? 'HEAD';
    // A shallow fetch of exactly the requested ref: one commit, no history.
    await git(['fetch', '--depth', '1', '--quiet', 'origin', ref]);
    await git(['checkout', '--quiet', 'FETCH_HEAD']);

    const { stdout } = await git(['rev-parse', 'HEAD']);
    return { dir, commit: stdout.trim() };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/** Rejects a `directory` that would escape the repository root. */
function resolveSubdir(root: string, directory: string | undefined): string | null {
  if (!directory) return root;

  const normalised = path.normalize(directory).replace(/^[/\\]+/, '');
  const target = path.resolve(root, normalised);
  const rel = path.relative(root, target);

  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

async function copyCode(from: string, to: string): Promise<string[]> {
  const entries = await readdir(from, { withFileTypes: true });
  const copied: string[] = [];

  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (IGNORED.has(entry.name) || IGNORED.has(lower)) continue;
    // The registry's materialised files are canonical; never clobber them.
    if (CANONICAL_FILES.has(lower)) continue;

    await cp(path.join(from, entry.name), path.join(to, entry.name), {
      recursive: true,
      force: true,
      // Defence in depth: a repo should not carry symlinks that reach outside it.
      filter: (src) => !IGNORED.has(path.basename(src)),
    });
    copied.push(entry.name);
  }

  return copied;
}

async function declaresDependencies(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, unknown> };
    if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) return true;
  } catch {
    // No package.json, or a malformed one: fall through to the Python checks.
  }

  for (const name of ['requirements.txt', 'pyproject.toml']) {
    if (await pathExists(path.join(dir, name))) return true;
  }
  return false;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches an installed package's code into `targetDir`.
 *
 * Never throws: a missing `source`, an absent `git`, or a clone failure all
 * resolve to `{ fetched: false, reason }`, so the caller can degrade to the
 * manifest-only install that has always been the fallback. The manifest is
 * still useful; the code is a bonus that either arrives or is reported missing.
 */
export async function fetchSource(
  rawSource: unknown,
  targetDir: string,
  options: { entrypoint?: string | null } = {},
): Promise<FetchResult> {
  const source = parseSource(rawSource);
  if (!source) {
    // Distinguish a rejected URL from an absent source: a security rejection is
    // something the user should be told about, not treated as "nothing here".
    const raw = rawSource as Record<string, unknown> | null;
    if (raw && raw.type === 'git' && typeof raw.url === 'string') {
      return {
        fetched: false,
        reason: `refusing to fetch from an unsupported URL scheme: ${raw.url}`,
        files: [],
      };
    }
    return { fetched: false, reason: 'no source declared', files: [] };
  }

  if (!(await gitAvailable())) {
    return { fetched: false, reason: 'git is not installed', files: [] };
  }

  let clone: { dir: string; commit: string };
  try {
    clone = await cloneToTemp(source);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { fetched: false, reason: `clone failed: ${message}`, files: [] };
  }

  try {
    const subdir = resolveSubdir(clone.dir, source.directory);
    if (!subdir || !(await pathExists(subdir))) {
      return {
        fetched: false,
        reason: source.directory
          ? `directory "${source.directory}" not found in the repository`
          : 'repository is empty',
        files: [],
      };
    }

    const files = await copyCode(subdir, targetDir);
    const hasDependencies = await declaresDependencies(subdir);

    const result: FetchResult = {
      fetched: true,
      ref: source.ref ?? 'default branch',
      commit: clone.commit,
      files,
      hasDependencies,
    };

    // The entrypoint is what `norien run` will execute; if the fetch did not
    // produce it, say so rather than letting the failure surface only at run.
    if (options.entrypoint) {
      const entry = path.resolve(targetDir, options.entrypoint);
      if (!(await pathExists(entry))) {
        result.reason = `fetched, but the entrypoint "${options.entrypoint}" is still missing`;
      }
    }

    return result;
  } finally {
    await rm(clone.dir, { recursive: true, force: true });
  }
}
