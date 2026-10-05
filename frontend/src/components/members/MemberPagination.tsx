import Pagination from '@/components/ui/Pagination';

const MEMBER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface MemberPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Server-side paging for the member list; hidden while there are no members. */
export default function MemberPagination(props: MemberPaginationProps) {
  if (props.total === 0) return null;
  return <Pagination {...props} pageSizeOptions={MEMBER_PAGE_SIZE_OPTIONS} itemLabel="members" />;
}
