import { api } from '@norien-live/web-ui/api';

import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '../../../lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Skill on Norien';

const GROUNDING: Record<string, string> = {
  markets: 'Live markets',
  portfolio: 'A wallet',
  token: 'A token',
  registry: 'The registry',
  none: 'Instructions',
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const skill = await api.skill(slug);

  if (!skill) {
    return ogCard({ eyebrow: 'Skill', title: slug });
  }

  return ogCard({
    eyebrow: 'Skill',
    title: skill.name,
    subtitle: skill.description,
    stats: [{ label: 'Grounded in', value: GROUNDING[skill.data_source] ?? skill.data_source }],
  });
}
