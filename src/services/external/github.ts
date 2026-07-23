import { env } from '../../config/env.js';
import { type ProviderClient, providerClient } from '../../core/provider-client.js';
import type { Commit, Contributor, Release, Repository } from './types.js';

/**
 * GitHub — repository health for projects.
 *
 * Stars, releases, commits, contributors, and languages. Each sub-resource is a
 * separate REST call, so `getRepository` fetches them concurrently and tolerates
 * individual failures: a repo with no releases, or whose contributor list is
 * temporarily unavailable, still returns everything else.
 */

const REPO_TTL_MS = 900_000;

interface RawRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count?: number;
  watchers_count: number;
  default_branch: string;
  pushed_at: string | null;
  license: { spdx_id?: string | null; name?: string } | null;
}

interface RawRelease {
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
}

interface RawContributor {
  login: string;
  contributions: number;
  avatar_url: string | null;
  html_url: string;
}

interface RawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
  author: { login?: string } | null;
}

/** `owner/repo`, tolerating a full GitHub URL or a `.git` suffix. */
export function parseRepoPath(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts;
  if (!owner || !repo) return null;

  return { owner, repo };
}

export class GitHubService {
  readonly name = 'github' as const;

  constructor(private readonly client: ProviderClient = providerClient) {}

  get configured(): boolean {
    return env.GITHUB_TOKEN !== undefined;
  }

  private headers(): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(this.configured ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    };
  }

  private get<T>(path: string, cacheKey: string): Promise<T> {
    return this.client.request<T>('github', `${env.GITHUB_API_URL}${path}`, {
      headers: this.headers(),
      cacheKey,
      cacheTtlMs: REPO_TTL_MS,
      nullOnStatus: [404],
    });
  }

  /**
   * Resolves an organisation to its most-starred public repository.
   *
   * Needed because upstream sources frequently identify a project by org name
   * alone (`"aave"`) rather than a full `owner/repo` path. The most-starred
   * repo is the closest thing to "the project's repository".
   */
  async findOrganizationRepository(org: string): Promise<{ owner: string; repo: string } | null> {
    const query = `org:${org}`;
    const search = await this.client
      .request<{ items?: { full_name: string }[] }>(
        'github',
        `${env.GITHUB_API_URL}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=1`,
        {
          headers: this.headers(),
          cacheKey: `github:org:${org.toLowerCase()}`,
          cacheTtlMs: REPO_TTL_MS,
          nullOnStatus: [404, 422],
        },
      )
      .catch(() => null);

    const fullName = search?.items?.[0]?.full_name;
    return fullName ? parseRepoPath(fullName) : null;
  }

  /**
   * A repository plus its sub-resources.
   *
   * Accepts `owner/repo`, a GitHub URL, or a bare organisation name (which is
   * resolved to that org's most-starred repo). The repo itself is required;
   * languages, releases, contributors, and commits are best-effort, because a
   * missing release list should not blank out star counts.
   */
  async getRepository(input: string): Promise<Repository | null> {
    const parsed = parseRepoPath(input) ?? (await this.findOrganizationRepository(input.trim()));
    if (!parsed) return null;

    const { owner, repo } = parsed;
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const key = `${owner}/${repo}`.toLowerCase();

    const raw = await this.get<RawRepo | null>(base, `github:repo:${key}`);
    if (!raw) return null;

    const [languages, releases, contributors, commits] = await Promise.all([
      this.get<Record<string, number> | null>(`${base}/languages`, `github:lang:${key}`).catch(
        () => null,
      ),
      this.get<RawRelease[] | null>(`${base}/releases?per_page=1`, `github:rel:${key}`).catch(
        () => null,
      ),
      this.get<RawContributor[] | null>(
        `${base}/contributors?per_page=5`,
        `github:contrib:${key}`,
      ).catch(() => null),
      this.get<RawCommit[] | null>(`${base}/commits?per_page=5`, `github:commits:${key}`).catch(
        () => null,
      ),
    ]);

    return {
      fullName: raw.full_name,
      url: raw.html_url,
      description: raw.description,
      stars: raw.stargazers_count,
      forks: raw.forks_count,
      openIssues: raw.open_issues_count,
      watchers: raw.subscribers_count ?? raw.watchers_count,
      license: raw.license?.spdx_id ?? raw.license?.name ?? null,
      defaultBranch: raw.default_branch,
      pushedAt: raw.pushed_at,
      languages: normalizeLanguages(languages),
      latestRelease: normalizeRelease(releases?.[0]),
      topContributors: (contributors ?? []).map(normalizeContributor),
      recentCommits: (commits ?? []).map(normalizeCommit),
    };
  }

  /** Liveness probe used by `/api/providers`. */
  async ping(): Promise<boolean> {
    await this.client.request<unknown>('github', `${env.GITHUB_API_URL}/rate_limit`, {
      headers: this.headers(),
      cacheKey: 'github:ping',
      cacheTtlMs: 60_000,
    });
    return true;
  }
}

/** Byte counts become shares, which is what a UI actually renders. */
function normalizeLanguages(
  languages: Record<string, number> | null,
): { name: string; bytes: number; share: number }[] {
  if (!languages) return [];

  const entries = Object.entries(languages);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total === 0) return [];

  return entries
    .map(([name, bytes]) => ({
      name,
      bytes,
      share: Math.round((bytes / total) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function normalizeRelease(raw: RawRelease | undefined): Release | null {
  if (!raw) return null;
  return {
    name: raw.name,
    tag: raw.tag_name,
    url: raw.html_url,
    publishedAt: raw.published_at,
  };
}

function normalizeContributor(raw: RawContributor): Contributor {
  return {
    login: raw.login,
    contributions: raw.contributions,
    avatar: raw.avatar_url,
    url: raw.html_url,
  };
}

function normalizeCommit(raw: RawCommit): Commit {
  return {
    sha: raw.sha.slice(0, 10),
    // Only the subject line; commit bodies are noise in a summary.
    message: raw.commit.message.split('\n')[0] ?? '',
    author: raw.author?.login ?? raw.commit.author?.name ?? null,
    date: raw.commit.author?.date ?? null,
    url: raw.html_url,
  };
}

export const gitHubService = new GitHubService();
