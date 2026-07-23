import Link from 'next/link';
import { notFound } from 'next/navigation';

import { findNote, NOTES } from '@/lib/notes';
import { CodeBlock, Container } from '@norien-live/web-ui';
import { Badge } from '@norien-live/web-ui';

export function generateStaticParams() {
  return NOTES.map((note) => ({ slug: note.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = findNote(slug);
  return note ? { title: note.title, description: note.summary } : { title: 'Not found' };
}

export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = findNote(slug);

  // A static route with known params: notFound is correct here, unlike on the
  // data-backed detail pages where the message must survive streaming.
  if (!note) notFound();

  return (
    <Container className="py-14 sm:py-20">
      <article className="mx-auto max-w-2xl">
        <Link href="/blog" className="text-sm text-muted transition-colors hover:text-accent">
          ← All notes
        </Link>

        <header className="mt-6">
          <Badge>{note.topic}</Badge>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink">
            {note.title}
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-muted">{note.summary}</p>
        </header>

        <div className="mt-10 space-y-5">
          {note.body.map((block, index) => {
            if (block.kind === 'h') {
              return (
                <h2 key={index} className="pt-4 text-lg font-semibold tracking-tight text-ink">
                  {block.text}
                </h2>
              );
            }
            if (block.kind === 'code') {
              return (
                <CodeBlock key={index}>{block.text}</CodeBlock>
              );
            }
            return (
              <p key={index} className="text-[1.0625rem] leading-relaxed text-muted">
                {block.text}
              </p>
            );
          })}
        </div>

        <footer className="mt-12 border-t border-line pt-6">
          <Link href="/blog" className="text-sm font-medium text-accent">
            ← All engineering notes
          </Link>
        </footer>
      </article>
    </Container>
  );
}
