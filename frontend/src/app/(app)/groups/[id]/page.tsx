import GroupDetailPage from '@/components/groups/GroupDetailPage';

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetailPage id={id} />;
}
