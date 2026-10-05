'use client';

interface PaginationProps {
  /** Items across every page. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Shown as a "Per page" select when given. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  /** Noun for the summary line, e.g. "members". */
  itemLabel: string;
}

const buttonClass =
  'px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';

/** Server-side paging controls: "Showing a to b of total", page size, previous and next. */
export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  itemLabel,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3"
    >
      <div className="flex items-center gap-4 text-sm text-gray-700">
        <p>
          Showing <span className="font-medium">{first}</span> to{' '}
          <span className="font-medium">{last}</span> of{' '}
          <span className="font-medium">{total}</span> {itemLabel}
        </p>
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-2">
            Per page
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded-md"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="text-sm text-gray-700">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
