import { Brand } from '@/components/brand';
import { ButtonLink, Card, Empty } from '@/components/ui';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-24">
      <div className="mb-8 text-center">
        <Brand />
      </div>
      <Card>
        <Empty
          title="Page not found"
          detail="That page does not exist. It may have moved, or the link may be wrong."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/app">Open the app</ButtonLink>
              <ButtonLink href="/" tone="secondary">
                Back to the site
              </ButtonLink>
            </div>
          }
        />
      </Card>
    </div>
  );
}
