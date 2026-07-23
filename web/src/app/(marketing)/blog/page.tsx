import Link from 'next/link';

import { NOTES } from '@/lib/notes';
import { Container, PageHeader } from '@/components/marketing';
import { Badge } from '@/components/ui';

export const metadata = {
  title: 'Blog',
  description: 'Engineering notes on how Norien is built.',
};

/**
 * Blog.
 *
 * Engineering notes about decisions in this codebase. No author or date is
 * shown because the project records neither, and inventing them would make the
 * page claim something it does not know.
 */
export default function BlogPage() {
  return (
    <>
      <PageHeader
        title="Engineering notes"
        detail="Write-ups of decisions made while building Norien — why things are the way they are."
      />

      <Container className="pb-20">
        <ul className="grid gap-4 lg:grid-cols-2">
          {NOTES.map((note) => (
            <li key={note.slug}>
              <Link
                href={`/blog/${note.slug}`}
                className="group flex h-full flex-col rounded-xl border border-line bg-card p-6 transition-colors hover:border-accent/40"
              >
                <Badge>{note.topic}</Badge>
                <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink group-hover:text-accent">
                  {note.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{note.summary}</p>
                <span className="mt-4 text-sm font-medium text-accent">Read →</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
