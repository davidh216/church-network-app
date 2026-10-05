import type { MediaItem } from '@/types/domain';
import { formatMediaDate, parseTags } from '@/lib/media/format';
import { mediaVideoId } from '@/lib/media/youtube';
import VideoThumbnail from './VideoThumbnail';

interface MediaListViewProps {
  media: MediaItem[];
  onPlay: (item: MediaItem) => void;
}

const playIcon = <path d="M8 5v10l8-5-8-5z" />;

/** One page of videos as rows with a thumbnail, details, Play and an external link. */
export default function MediaListView({ media, onPlay }: MediaListViewProps) {
  return (
    <div className="divide-y divide-gray-200">
      {media.map((item) => {
        const videoId = mediaVideoId(item);
        return (
          <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start space-x-4">
              <div className="relative shrink-0 group bg-gray-200 rounded-lg w-32 h-20">
                {videoId && (
                  <VideoThumbnail
                    videoId={videoId}
                    alt={item.title}
                    sizes="128px"
                    className="object-cover rounded-lg"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onPlay(item)}
                  aria-label={`Play ${item.title}`}
                  className="group/play absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 focus-visible:bg-black/50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-blue-500 transition-colors rounded-lg"
                >
                  <div className="bg-red-600 rounded-full p-2 opacity-0 group-hover:opacity-100 group-focus-visible/play:opacity-100 transition-opacity">
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4 text-white ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      {playIcon}
                    </svg>
                  </div>
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <h2 className="text-lg font-medium text-gray-900 mb-1 truncate">
                      {item.title}
                    </h2>
                    <div className="flex items-center space-x-3 text-sm text-gray-500 mb-2">
                      <span>By {item.uploadedBy?.name}</span>
                      <span>•</span>
                      <span>{formatMediaDate(item.createdAt)}</span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {parseTags(item.tags).map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onPlay(item)}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500 flex items-center space-x-2"
                    >
                      <svg
                        aria-hidden="true"
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        {playIcon}
                      </svg>
                      <span>Play</span>
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
                      aria-label={`Open ${item.title} on YouTube (opens in a new tab)`}
                      title="Open in YouTube"
                    >
                      <svg
                        aria-hidden="true"
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-2a1 1 0 10-2 0v2H5V7h2a1 1 0 000-2H5z" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
