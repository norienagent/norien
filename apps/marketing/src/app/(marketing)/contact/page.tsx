import Link from 'next/link';

import { Container, PageHeader } from '@norien-live/web-ui';
import { API_URL, DOCS_URL } from '@norien-live/web-ui';
import { Field, Input, Textarea } from '@norien-live/web-ui';
import { Button, Card } from '@norien-live/web-ui';

export const metadata = {
  title: 'Contact',
  description: 'How to get help with Norien.',
};

/**
 * Contact.
 *
 * The form is the real layout for when a delivery backend exists, disabled
 * rather than wired to a stub — a send button that appears to work and silently
 * discards a message is worse than one that says it is not connected. The
 * channels that do work are listed alongside it.
 */
export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact"
        detail="Norien runs locally and most problems are diagnosable from your own machine — start there, and get in touch if that does not resolve it."
      />

      <Container className="pb-20">
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card title="Send a message">
            <div className="mb-5 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
              <p className="text-sm leading-relaxed text-ink">
                <strong className="font-semibold">Not connected yet.</strong> There is no inbox behind
                this form, so it is disabled rather than accepting a message it would drop. Use the
                self-service routes on the right in the meantime.
              </p>
            </div>

            <form className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input name="name" disabled placeholder="Your name" className="w-full" />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" disabled placeholder="you@example.com" className="w-full" />
                </Field>
              </div>

              <Field label="Subject">
                <Input name="subject" disabled placeholder="What is this about?" className="w-full" />
              </Field>

              <Field label="Message">
                <Textarea
                  name="message"
                  rows={7}
                  disabled
                  placeholder="Describe the problem, and include the output of `norien doctor` if it is relevant."
                  className="w-full"
                />
              </Field>

              <Button type="submit" disabled aria-disabled="true">
                Send message
              </Button>
            </form>
          </Card>

          <div className="space-y-4">
            <Card title="Diagnose it yourself">
              <p className="text-sm leading-relaxed text-muted">
                One command checks the API, your manifest, dependencies, installed runtimes, and
                configuration, and tells you which one is wrong.
              </p>
              <div className="mt-3 rounded-lg border border-line bg-sunken px-4 py-3">
                <code className="font-mono text-sm text-ink">
                  <span className="select-none text-muted">$ </span>norien doctor
                </code>
              </div>
            </Card>

            <Card title="Read the docs">
              <p className="text-sm leading-relaxed text-muted">
                The manifest format, the CLI reference, the runtime model, and the full REST surface.
              </p>
              <Link href={DOCS_URL} className="mt-3 inline-block text-sm font-medium text-accent">
                Documentation →
              </Link>
            </Card>

            <Card title="Browse the API">
              <p className="text-sm leading-relaxed text-muted">
                Your local registry serves its own OpenAPI document and a Swagger UI — every endpoint,
                every schema, executable in the browser.
              </p>
              <a
                href={`${API_URL}/docs`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block text-sm font-medium text-accent"
              >
                Open the API reference ↗
              </a>
            </Card>
          </div>
        </div>
      </Container>
    </>
  );
}
