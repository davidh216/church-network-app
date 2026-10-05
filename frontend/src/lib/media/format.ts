import { formatLocalDate } from '@/lib/format/date';

/** The categories a video can be tagged with. */
export const MEDIA_TAGS = [
  'worship',
  'sermon',
  'prayer',
  'testimony',
  'youth',
  'baptism',
  'communion',
  'special-event',
] as const;

/** A media row's JSON-encoded tag list; anything unparsable or non-array is []. */
export function parseTags(tags?: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(tags || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** "special-event" -> "Special event". */
export function tagLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
}

/** A short date in the viewer's locale ("Jan 5, 2024" in en-US), or "" without a real date. */
export function formatMediaDate(dateString: string): string {
  return formatLocalDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' }) ?? '';
}
