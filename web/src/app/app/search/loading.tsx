import { Card, SectionHeading, SkeletonRows } from '@/components/ui';

export default function SearchLoading() {
  return (
    <>
      <SectionHeading title="Search" />
      <Card padded={false}>
        <SkeletonRows rows={8} cols={3} />
      </Card>
    </>
  );
}
