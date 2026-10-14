import RequireStaff from '@/components/auth/RequireStaff';
import FamilyDetailPage from '@/components/families/FamilyDetailPage';

export default async function FamilyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireStaff>
      <FamilyDetailPage id={id} />
    </RequireStaff>
  );
}
