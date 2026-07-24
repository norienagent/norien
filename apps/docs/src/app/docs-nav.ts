/**
 * The documentation map.
 *
 * One source of truth for the sidebar, the mobile menu, and the prev/next
 * pager, so navigation can never drift from the routes that actually exist.
 * Every entry is a real App Router page — no hash anchors.
 */

export interface DocLink {
  href: string;
  label: string;
}

export interface DocGroup {
  title: string;
  links: DocLink[];
}

export const DOCS_NAV: DocGroup[] = [
  {
    title: 'Introduction',
    links: [
      { href: '/', label: 'What is Norien' },
      { href: '/why', label: 'Why Norien' },
      { href: '/getting-started', label: 'Getting started' },
    ],
  },
  {
    title: 'Core concepts',
    links: [
      { href: '/concepts/registry', label: 'Registry' },
      { href: '/concepts/runtime', label: 'Runtime' },
      { href: '/concepts/api', label: 'Unified data API' },
      { href: '/concepts/manifest', label: 'The manifest' },
      { href: '/concepts/tools', label: 'Tools' },
      { href: '/concepts/versioning', label: 'Versioning' },
    ],
  },
  {
    title: 'Features',
    links: [
      { href: '/features/portfolio', label: 'Multi-chain portfolio' },
      { href: '/features/chat', label: 'Chat with an agent' },
      { href: '/features/ai', label: 'AI manifest generator' },
    ],
  },
  {
    title: 'Architecture',
    links: [{ href: '/architecture', label: 'System overview' }],
  },
  {
    title: 'Guides',
    links: [
      { href: '/guides/publishing', label: 'Publishing agents' },
      { href: '/guides/installing', label: 'Installing agents' },
      { href: '/guides/running', label: 'Running agents' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { href: '/cli', label: 'CLI' },
      { href: '/sdk', label: 'SDKs' },
      { href: '/api-reference', label: 'REST API' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/faq', label: 'FAQ' },
      { href: '/roadmap', label: 'Roadmap' },
    ],
  },
];

/** Flattened, in reading order — powers the prev/next pager. */
export const DOCS_ORDER: DocLink[] = DOCS_NAV.flatMap((group) => group.links);

export function adjacent(pathname: string): { prev: DocLink | null; next: DocLink | null } {
  const index = DOCS_ORDER.findIndex((link) => link.href === pathname);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? DOCS_ORDER[index - 1] : null,
    next: index < DOCS_ORDER.length - 1 ? DOCS_ORDER[index + 1] : null,
  };
}
