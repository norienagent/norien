import { Card, SectionHeading, SkeletonRows } from '@/components/ui';

export default function MarketsLoading() {
  return (
    <>
      <SectionHeading title="Markets" detail="Live token prices, liquidity, volume, and holders." />
      <Card padded={false}>
        <SkeletonRows rows={10} cols={7} />
      </Card>
    </>
  );
}
