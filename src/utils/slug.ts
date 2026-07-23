import {
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from '../config/constants.js';
import { AppError } from '../core/errors.js';

/**
 * Slugs are the public primary key of the registry -- they appear in URLs,
 * install commands, and manifest dependencies. Normalisation lives here so
 * every entry point derives the same slug from the same input.
 */

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Drop combining marks so "Café" becomes "cafe" rather than "caf-e".
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

/**
 * Resolves the slug for a create request: uses the explicit one when given,
 * otherwise derives it from the name.
 */
export function resolveSlug(explicit: string | undefined, fallbackSource: string): string {
  const slug = explicit ? explicit.trim().toLowerCase() : slugify(fallbackSource);

  if (!isValidSlug(slug)) {
    throw AppError.validation(
      `'${slug}' is not a valid slug. Use ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} lowercase letters, digits, and single hyphens.`,
      [{ field: 'slug', message: 'Invalid slug format.', value: slug }],
    );
  }

  if (isReservedSlug(slug)) {
    throw AppError.validation(`The slug '${slug}' is reserved.`, [
      { field: 'slug', message: 'Reserved slug.', value: slug },
    ]);
  }

  return slug;
}
