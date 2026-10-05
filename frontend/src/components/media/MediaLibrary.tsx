'use client';

import { DEFAULT_MEDIA_PAGE_SIZE } from '@embrace/shared';
import { useState, type RefObject } from 'react';
import { useIsStaff } from '@/lib/auth/AuthProvider';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useClampedPage } from '@/lib/hooks/useClampedPage';
import { useResettingPage } from '@/lib/hooks/useResettingPage';
import { useMedia } from '@/lib/queries/media';
import type { MediaItem } from '@/types/domain';
import InlineError from '@/components/ui/InlineError';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import ViewToggle, { GRID_ICON, LIST_ICON, type ViewOption } from '@/components/ui/ViewToggle';
import AddMediaDialog from './AddMediaDialog';
import MediaFilters from './MediaFilters';
import MediaGrid from './MediaGrid';
import MediaListView from './MediaListView';

interface MediaLibraryProps {
  /** Plays a video with the current page of videos as its playlist. */
  onPlayMedia: (media: MediaItem, playlist?: MediaItem[]) => void;
  /** The page heading (in MediaPage), focused when the add dialog's opener is gone. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

type MediaView = 'grid' | 'list';
const VIEWS: ViewOption<MediaView>[] = [
  { mode: 'grid', title: 'Grid View', icon: GRID_ICON },
  { mode: 'list', title: 'List View', icon: LIST_ICON },
];

const addButtonClass =
  'bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500';

/** The media library: search, category, grid or list of one server page, and Add Video for staff. */
export default function MediaLibrary({ onPlayMedia, headingRef }: MediaLibraryProps) {
  const canManage = useIsStaff();
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [viewMode, setViewMode] = useState<MediaView>('grid');
  // The input updates at once; the query follows 300 ms after the last keystroke.
  const search = useDebouncedValue(searchTerm.trim());
  const [page, setPage] = useResettingPage(`${search}|${selectedTag}`);
  const mediaQuery = useMedia({
    search,
    tag: selectedTag,
    page,
    pageSize: DEFAULT_MEDIA_PAGE_SIZE,
  });
  const media = mediaQuery.data?.media ?? [];
  const total = mediaQuery.data?.total ?? 0;
  useClampedPage(
    page,
    setPage,
    mediaQuery.isPlaceholderData ? undefined : mediaQuery.data?.total,
    DEFAULT_MEDIA_PAGE_SIZE,
  );
  const filtered = search !== '' || selectedTag !== 'all';
  const empty = media.length === 0 && mediaQuery.isSuccess;
  const play = (item: MediaItem) => onPlayMedia(item, media);

  return (
    <div className="bg-white shadow-sm rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <span aria-live="polite" className="text-sm text-gray-500">
            {mediaQuery.data && `(${total} videos)`}
          </span>
          <div className="flex items-center space-x-3">
            <ViewToggle value={viewMode} onChange={setViewMode} options={VIEWS} />
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className={`${addButtonClass} px-4 py-2 flex items-center space-x-2`}
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>Add Video</span>
              </button>
            )}
          </div>
        </div>
        <MediaFilters
          search={searchTerm}
          onSearchChange={setSearchTerm}
          tag={selectedTag}
          onTagChange={setSelectedTag}
        />
      </div>

      {mediaQuery.error && (
        <InlineError
          error={mediaQuery.error}
          fallback="Failed to load media"
          onRetry={() => void mediaQuery.refetch()}
        />
      )}

      {mediaQuery.isPending && <Skeleton rows={4} label="Loading videos" className="p-6" />}

      {/* Videos render only once data exists, so the skeleton is the only loading state. */}
      <div aria-busy={mediaQuery.isFetching}>
        {mediaQuery.data &&
          (viewMode === 'grid' ? (
            <MediaGrid media={media} onPlay={play} />
          ) : (
            <MediaListView media={media} onPlay={play} />
          ))}

        {total > DEFAULT_MEDIA_PAGE_SIZE && (
          <Pagination
            total={total}
            page={page}
            pageSize={DEFAULT_MEDIA_PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="videos"
          />
        )}

        {empty && filtered && (
          <p className="px-6 py-12 text-center text-gray-500">No videos match your search.</p>
        )}

        {empty && !filtered && (
          <div className="px-6 py-12 text-center">
            <div className="max-w-md mx-auto">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to Embrace Media!</h2>
              {canManage ? (
                <>
                  <p className="text-gray-500 mb-6">
                    Start building your church&apos;s media library by adding videos from your
                    YouTube channel.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className={`${addButtonClass} px-6 py-3`}
                  >
                    Add Your First Video
                  </button>
                </>
              ) : (
                <p className="text-gray-500">No videos have been added yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {canManage && showAddForm && (
        <AddMediaDialog
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false);
            // The new video sorts first, so show it.
            setPage(1);
          }}
          fallbackFocus={headingRef}
        />
      )}
    </div>
  );
}
