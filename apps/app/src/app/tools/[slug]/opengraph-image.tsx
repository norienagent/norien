import { api } from '@norien-live/web-ui/api';

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '../../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Tool on Norien';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await api.tool(slug);

  if (!tool) {
    return ogCard({ eyebrow: 'Tool', title: slug });
  }

  return ogCard({
    eyebrow: tool.category ? `Tool · ${tool.category}` : 'Tool',
    title: tool.name,
    subtitle: tool.description,
    stats: [
      { label: 'Runtime', value: tool.runtime ?? 'http' },
      ...(tool.downloads > 0 ? [{ label: 'Installs', value: tool.downloads.toLocaleString() }] : []),
    ],
  });
}
