import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fetchSource, parseSource } from '@norien-live/tools';

/**
 * Source-fetching tests.
 *
 * The registry distributes manifests, not code; a manifest that declares a
 * `source` lets the CLI clone the code at install time. `parseSource` is pure
 * and tested exhaustively. `fetchSource` is tested both for its graceful
 * degradation (which needs no network) and, in the live block, against a real
 * public repository — the same "test against the real thing" stance the rest of
 * the suite takes.
 */

describe('parseSource', () => {
  it('accepts https, ssh, and git@ URLs', () => {
    expect(parseSource({ type: 'git', url: 'https://github.com/owner/repo' })).not.toBeNull();
    expect(parseSource({ type: 'git', url: 'ssh://git@github.com/owner/repo' })).not.toBeNull();
    expect(parseSource({ type: 'git', url: 'git@github.com:owner/repo.git' })).not.toBeNull();
  });

  it('rejects file:// and other schemes, so a manifest cannot point at a local path', () => {
    expect(parseSource({ type: 'git', url: 'file:///etc/passwd' })).toBeNull();
    expect(parseSource({ type: 'git', url: 'http://insecure.example/repo' })).toBeNull();
    expect(parseSource({ type: 'git', url: '/absolute/local/path' })).toBeNull();
  });

  it('rejects anything that is not a git source', () => {
    expect(parseSource(null)).toBeNull();
    expect(parseSource({})).toBeNull();
    expect(parseSource({ type: 'npm', url: 'https://x' })).toBeNull();
    expect(parseSource({ type: 'git' })).toBeNull();
    expect(parseSource('https://github.com/owner/repo')).toBeNull();
  });

  it('carries ref and directory through, trimmed', () => {
    const source = parseSource({
      type: 'git',
      url: 'https://github.com/owner/repo',
      ref: '  v1.0.0 ',
      directory: ' packages/agent ',
    });
    expect(source).toEqual({
      type: 'git',
      url: 'https://github.com/owner/repo',
      ref: 'v1.0.0',
      directory: 'packages/agent',
    });
  });
});

describe('fetchSource — graceful degradation (no network)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'norien-src-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns not-fetched for an absent source rather than throwing', async () => {
    const result = await fetchSource(undefined, dir);
    expect(result.fetched).toBe(false);
    expect(result.reason).toBe('no source declared');
  });

  it('refuses a rejected scheme and says so, distinctly from "no source"', async () => {
    const result = await fetchSource({ type: 'git', url: 'file:///etc/passwd' }, dir);
    expect(result.fetched).toBe(false);
    expect(result.reason).toContain('unsupported URL scheme');
  });
});

/**
 * Live: a real clone of a small, stable public repository. Needs network.
 * `octocat/Hello-World` is GitHub's canonical test repo — tiny and unchanging.
 */
describe('fetchSource — live clone', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'norien-src-live-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('clones a repository and resolves the commit', async () => {
    const result = await fetchSource(
      { type: 'git', url: 'https://github.com/octocat/Hello-World' },
      dir,
    );

    expect(result.fetched).toBe(true);
    // A full 40-character commit SHA, proving the clone resolved a real ref.
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
  }, 60_000);

  it('checks out an exact commit when given a ref', async () => {
    const commit = '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d';
    const result = await fetchSource(
      { type: 'git', url: 'https://github.com/octocat/Hello-World', ref: commit },
      dir,
    );

    expect(result.fetched).toBe(true);
    expect(result.commit).toBe(commit);
  }, 60_000);

  it('extracts a subdirectory and leaves canonical files untouched', async () => {
    const result = await fetchSource(
      { type: 'git', url: 'https://github.com/octocat/Spoon-Knife' },
      dir,
    );

    expect(result.fetched).toBe(true);
    const entries = await readdir(dir);
    // The repo's README is a canonical name, so it is never copied over a
    // registry-materialised one; its code files are.
    expect(entries).not.toContain('README.md');
    expect(entries).toContain('index.html');
  }, 60_000);

  it('reports a missing entrypoint after an otherwise successful fetch', async () => {
    const result = await fetchSource(
      { type: 'git', url: 'https://github.com/octocat/Hello-World' },
      dir,
      { entrypoint: 'dist/index.js' },
    );

    expect(result.fetched).toBe(true);
    expect(result.reason).toContain('dist/index.js');
    await expect(stat(path.join(dir, 'dist/index.js'))).rejects.toThrow();
  }, 60_000);

  it('degrades to not-fetched for a repository that does not exist', async () => {
    const result = await fetchSource(
      { type: 'git', url: 'https://github.com/norien-does-not/exist-xyz-000' },
      dir,
    );

    expect(result.fetched).toBe(false);
    expect(result.reason).toContain('clone failed');
  }, 60_000);
});
