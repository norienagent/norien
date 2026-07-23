import { Card, SectionHeading, SkeletonRows } from '@norien-live/web-ui';

export default function ProjectsLoading() {
  return (
    <>
      <SectionHeading title="Projects" detail="DeFi protocols ranked by total value locked." />
      <Card padded={false}>
        <SkeletonRows rows={10} cols={5} />
      </Card>
    </>
  );
}
