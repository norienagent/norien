import { APP_URL } from '@norien-live/web-ui';
import { Brand } from '@norien-live/web-ui';
import { ButtonLink, Card, Empty } from '@norien-live/web-ui';

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
              <ButtonLink href={APP_URL}>Open the app</ButtonLink>
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
