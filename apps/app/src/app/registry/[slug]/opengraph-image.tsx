import { api } from '@norien-live/web-ui/api';

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '../../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Agent on Norien';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await api.agent(slug);

  if (!agent) {
    return ogCard({ eyebrow: 'Agent', title: slug });
  }

  return ogCard({
    eyebrow: 'Agent',
    title: agent.name,
    subtitle: agent.description,
    stats: [
      { label: 'Runtime', value: agent.runtime },
      { label: 'Tools', value: String(agent.required_tools.length) },
      ...(agent.downloads > 0 ? [{ label: 'Installs', value: agent.downloads.toLocaleString() }] : []),
    ],
  });
}
