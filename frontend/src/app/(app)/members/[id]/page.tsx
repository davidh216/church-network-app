import MemberProfileRoute from '@/components/members/MemberProfileRoute';

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberProfileRoute id={id} />;
}
