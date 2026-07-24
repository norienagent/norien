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

/** A link to the public GitHub repo, sized as a proper touch target. */
export function GitHubLink({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://github.com/norienagent/norien"
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Norien on GitHub"
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink ${className}`}
    >
      <svg viewBox="0 0 16 16" className="size-[18px]" fill="currentColor" aria-hidden>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
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
