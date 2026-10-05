import type { MediaItem } from '../../types/domain';
import { parseTags } from '../../lib/media/format';

interface PlaylistPanelProps {
  playlist: MediaItem[];
  currentIndex: number;
  /** Called with the index of a different item; choosing the current item does nothing. */
  onSelect?: (index: number) => void;
  onClose: () => void;
  /** Wider in fullscreen. */
  wide: boolean;
}

/** The player's playlist sidebar: one button per video, the playing one marked current. */
export default function PlaylistPanel({
  playlist,
  currentIndex,
  onSelect,
  onClose,
  wide,
}: PlaylistPanelProps) {
  return (
    <div
      className={`bg-gray-900 text-white overflow-y-auto playlist-scrollbar ${wide ? 'w-80' : 'w-72'}`}
    >
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Playlist ({playlist.length})</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded"
            aria-label="Close playlist"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="p-2">
        {playlist.map((item, index) => {
          const current = index === currentIndex;
          return (
            <button
              type="button"
              key={item.id}
              aria-current={current ? 'true' : undefined}
              className={`block w-full text-left p-3 rounded cursor-pointer hover:bg-gray-800 transition-colors mb-2 ${
                current ? 'bg-gray-700 border-l-4 border-red-500' : ''
              }`}
              onClick={() => {
                if (!current) onSelect?.(index);
              }}
            >
              <div className="flex items-start space-x-3">
                <div className="text-sm text-gray-400 mt-1 w-6">
                  {current ? (
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 5v10l8-5-8-5z" />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  {item.uploadedBy && (
                    <p className="text-xs text-gray-400 mt-1">{item.uploadedBy.name}</p>
                  )}
                  {item.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parseTags(item.tags)
                        .slice(0, 2)
                        .map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
