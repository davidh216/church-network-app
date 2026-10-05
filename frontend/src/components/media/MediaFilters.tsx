import { MEDIA_TAGS, tagLabel } from '../../lib/media/format';

interface MediaFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  tag: string;
  onTagChange: (tag: string) => void;
}

const inputClass =
  'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

/** The media search box and the category select ('all' for every category). */
export default function MediaFilters({
  search,
  onSearchChange,
  tag,
  onTagChange,
}: MediaFiltersProps) {
  return (
    <div className="mt-4 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <input
          type="text"
          placeholder="Search videos..."
          aria-label="Search videos"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full ${inputClass}`}
        />
      </div>
      <div>
        <select
          aria-label="Category"
          value={tag}
          onChange={(e) => onTagChange(e.target.value)}
          className={inputClass}
        >
          <option value="all">All Categories</option>
          {MEDIA_TAGS.map((t) => (
            <option key={t} value={t}>
              {tagLabel(t)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
