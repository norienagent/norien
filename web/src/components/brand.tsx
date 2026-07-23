import Link from 'next/link';

/**
 * The wordmark. One definition, used by both shells and the auth pages, so the
 * brand cannot drift between them.
 */
export function Brand({ href = '/', size = 'md' }: { href?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

  return (
    <Link
      href={href}
      className={`inline-flex items-baseline font-semibold tracking-tight text-ink ${sizes[size]}`}
      aria-label="Norien home"
    >
      <Mark />
      <span className="ml-2">
        nor<span className="text-accent">ien</span>
      </span>
    </Link>
  );
}

/**
 * The mark: a stack of three bars, widest at the base — a registry of layered
 * things. Inline SVG so it costs no request and inherits currentColor.
 */
export function Mark({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 self-center text-accent`}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <rect x="6" y="2.5" width="8" height="4" rx="1.25" fill="currentColor" opacity="0.45" />
      <rect x="3.5" y="8" width="13" height="4" rx="1.25" fill="currentColor" opacity="0.72" />
      <rect x="1" y="13.5" width="18" height="4" rx="1.25" fill="currentColor" />
    </svg>
  );
}
