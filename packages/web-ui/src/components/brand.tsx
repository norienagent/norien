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
 * A link to Norien on X, sized as a proper touch target. Used in every
 * subdomain header so the social presence is one tap from anywhere.
 */
export function XLink({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://x.com/norienlive"
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Norien on X"
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
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
