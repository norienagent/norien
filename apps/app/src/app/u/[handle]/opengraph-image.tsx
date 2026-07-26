import { api } from '@norien-live/web-ui/api';

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '../../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Publisher on Norien';

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = raw.replace(/^@/, '');

  const [agents, tools, skills] = await Promise.all([
    api.agents({ author: handle, limit: 60 }),
    api.tools({ author: handle, limit: 60 }),
    api.skills({ author: handle, limit: 60 }),
  ]);

  return ogCard({
    eyebrow: 'Publisher',
    title: `@${handle}`,
    subtitle: 'Building on Robinhood Chain with Norien',
    stats: [
      { label: 'Agents', value: String(agents?.data.length ?? 0) },
      { label: 'Tools', value: String(tools?.data.length ?? 0) },
      { label: 'Skills', value: String(skills?.data.length ?? 0) },
    ],
  });
}
