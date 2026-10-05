import type { MediaItem } from '../../types/domain';
import { formatMediaDate } from '../../lib/media/format';

interface PlayerControlsProps {
  /** id for the title heading, which names the player dialog. */
  titleId: string;
  media: MediaItem;
  /** Controls fade out after a few idle seconds in fullscreen. */
  visible: boolean;
  playlistLength: number;
  currentIndex: number;
  isFullscreen: boolean;
  onTogglePlaylist: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onPlayPrevious?: () => void;
  onPlayNext?: () => void;
}

/** The overlay over the video: title bar with playlist, fullscreen and close; previous/next and the YouTube link. */
export default function PlayerControls({
  titleId,
  media,
  visible,
  playlistLength,
  currentIndex,
  isFullscreen,
  onTogglePlaylist,
  onToggleFullscreen,
  onClose,
  onPlayPrevious,
  onPlayNext,
}: PlayerControlsProps) {
  return (
    <div
      className={`absolute inset-0 z-10 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none focus-within:opacity-100'
      }`}
    >
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1 mr-4">
            <h2 id={titleId} className="text-white text-lg font-semibold mb-1 truncate">
              {media.title}
            </h2>
            <div className="flex items-center space-x-4 text-sm text-gray-300">
              {media.uploadedBy && <span>By {media.uploadedBy.name}</span>}
              {media.createdAt && <span>{formatMediaDate(media.createdAt)}</span>}
              {playlistLength > 1 && (
                <span>
                  {currentIndex + 1} of {playlistLength}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Playlist Toggle */}
            {playlistLength > 1 && (
              <button
                onClick={onTogglePlaylist}
                className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                type="button"
                aria-label="Toggle playlist"
                title="Toggle Playlist"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  <path d="M13 8.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-7z" />
                </svg>
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={onToggleFullscreen}
              className="p-2 text-white hover:bg-white/20 rounded transition-colors"
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                {isFullscreen ? (
                  <path d="M3 4a1 1 0 011-1h4a1 1 0 110 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 11-2 0V4zM15 4a1 1 0 10-2 0v1.586l-2.293 2.293a1 1 0 101.414 1.414L14.586 7H16a1 1 0 100-2h-1zM5 12a1 1 0 011 1v1.586l2.293-2.293a1 1 0 111.414 1.414L7.414 16H9a1 1 0 110 2H5a1 1 0 01-1-1v-4a1 1 0 011-1zM15 12a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L13.586 15V13a1 1 0 011-1z" />
                ) : (
                  <path d="M3 4a1 1 0 000 2h1.586l2.293 2.293a1 1 0 001.414-1.414L6 4.586V6a1 1 0 01-2 0V4h2zM13 4a1 1 0 011 1v1.586l2.293-2.293a1 1 0 111.414 1.414L15.414 8H17a1 1 0 110 2h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zm2 1v2h2v-2H5zM13 12a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4a1 1 0 011-1h4z" />
                )}
              </svg>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white/20 rounded transition-colors"
              type="button"
              aria-label="Close player"
              title="Close (Esc)"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
        <div className="flex items-center justify-between">
          {/* Left Controls */}
          <div className="flex items-center space-x-3">
            {/* Previous/Next */}
            {playlistLength > 1 && (
              <>
                <button
                  onClick={onPlayPrevious}
                  disabled={currentIndex === 0}
                  className="p-2 text-white hover:bg-white/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                  aria-label="Previous video"
                  title="Previous (←)"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                  </svg>
                </button>

                <button
                  onClick={onPlayNext}
                  disabled={currentIndex === playlistLength - 1}
                  className="p-2 text-white hover:bg-white/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                  aria-label="Next video"
                  title="Next (→)"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3">
            {/* External Link */}
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-white hover:bg-white/20 rounded transition-colors"
              aria-label="Watch on YouTube (opens in a new tab)"
              title="Watch on YouTube"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-2a1 1 0 10-2 0v2H5V7h2a1 1 0 000-2H5z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
