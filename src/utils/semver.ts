import semver from 'semver';

import { AppError } from '../core/errors.js';

/**
 * Versioning rules for the registry.
 *
 * Published versions are immutable and must strictly increase, which is what
 * lets a consumer trust a pinned `agent@1.2.3` and lets the resolver treat the
 * highest version as latest without extra bookkeeping.
 */

const SORT_SEGMENT_WIDTH = 10;

export function parseVersion(input: string): string {
  const parsed = semver.valid(semver.coerce(input) ?? input) ?? semver.valid(input);

  if (!parsed) {
    throw AppError.validation(`'${input}' is not a valid semantic version.`, [
      { field: 'version', message: 'Expected semver, e.g. 1.0.0.', value: input },
    ]);
  }

  // Preserve the publisher's prerelease/build metadata when it was already valid.
  return semver.valid(input) ?? parsed;
}

/**
 * Produces a lexicographically sortable key so the database can order versions
 * correctly without a semver-aware comparator (10.0.0 must beat 9.0.0).
 *
 * Prerelease identifiers sort before their release, matching semver. They are
 * compared as text rather than by the full semver prerelease algorithm, which
 * is accurate for the conventional `alpha.1` / `rc.2` style.
 */
export function versionSortKey(version: string): string {
  const parsed = semver.parse(version);

  if (!parsed) {
    throw AppError.validation(`'${version}' is not a valid semantic version.`);
  }

  const pad = (value: number) => String(value).padStart(SORT_SEGMENT_WIDTH, '0');
  const core = [parsed.major, parsed.minor, parsed.patch].map(pad).join('.');

  const suffix =
    parsed.prerelease.length > 0 ? `0${parsed.prerelease.join('.')}` : '1';

  return `${core}.${suffix}`;
}

export function compareVersions(a: string, b: string): number {
  return semver.compare(a, b);
}

/** Highest version wins; ties are impossible because versions are unique. */
export function highestVersion(versions: readonly string[]): string | null {
  if (versions.length === 0) return null;
  return [...versions].sort(compareVersions).at(-1) ?? null;
}

/**
 * Enforces that a newly published version is strictly greater than what is
 * already there. Republishing or downgrading a version is rejected.
 */
export function assertVersionIncreases(next: string, current: string | null): void {
  if (current === null) return;

  if (semver.eq(next, current)) {
    throw new AppError('VERSION_EXISTS', `Version ${next} has already been published.`, {
      details: [{ field: 'version', message: 'Versions are immutable.', value: next }],
    });
  }

  if (semver.lt(next, current)) {
    throw new AppError(
      'VERSION_NOT_INCREASING',
      `Version ${next} is lower than the current latest version ${current}.`,
      {
        details: [
          { field: 'version', message: 'New versions must increase.', value: next, current },
        ],
      },
    );
  }
}

/** Resolves a version range (e.g. `^1.2.0`, `latest`) against published versions. */
export function resolveVersionRange(
  range: string | undefined,
  available: readonly string[],
): string | null {
  if (available.length === 0) return null;
  if (!range || range === 'latest' || range === '*') return highestVersion(available);

  if (semver.valid(range)) {
    return available.includes(range) ? range : null;
  }

  return semver.maxSatisfying([...available], range);
}
