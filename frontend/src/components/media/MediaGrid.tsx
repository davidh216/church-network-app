import type { MediaItem } from '../../types/domain';
import { formatMediaDate, parseTags } from '../../lib/media/format';
import { mediaVideoId, thumbnailUrl } from '../../lib/media/youtube';

interface MediaGridProps {
  media: MediaItem[];
  onPlay: (item: MediaItem) => void;
}

const MAX_TAGS = 3;

/** One page of videos as thumbnail cards; the play button covers the thumbnail. */
export default function MediaGrid({ media, onPlay }: MediaGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
      {media.map((item) => {
        const videoId = mediaVideoId(item);
        const tags = parseTags(item.tags);
        return (
          <div
            key={item.id}
            className="bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105"
          >
            <div className="relative group bg-gray-200 h-48">
              {videoId && (
                <img
                  src={thumbnailUrl(videoId, 'maxres')}
                  alt={item.title}
                  className="w-full h-48 object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = thumbnailUrl(videoId);
                    // Last resort: hide the broken image and let the grey frame show.
                    target.onerror = () => {
                      target.style.visibility = 'hidden';
                    };
                  }}
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200" />
              <button
                type="button"
                onClick={() => onPlay(item)}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <div className="bg-red-600 rounded-full p-4 hover:bg-red-700 transition-colors shadow-lg">
                  <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 5v10l8-5-8-5z" />
                  </svg>
                </div>
              </button>
            </div>

            <div className="p-4">
              <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 leading-tight">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>
              )}
              <div className="flex flex-wrap gap-1 mb-3">
                {tags.slice(0, MAX_TAGS).map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                  </span>
                ))}
                {tags.length > MAX_TAGS && (
                  <span className="text-xs text-gray-400">+{tags.length - MAX_TAGS}</span>
                )}
              </div>
              <div className="flex justify-between items-center text-sm text-gray-500">
                <span className="truncate mr-2">By {item.uploadedBy?.name}</span>
                <span className="whitespace-nowrap">{formatMediaDate(item.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
