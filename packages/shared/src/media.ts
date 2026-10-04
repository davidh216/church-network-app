import { z } from 'zod';
import { MAX_PAGE_SIZE } from './primitives';

// Only YouTube videos can be added today; the column also names IMAGE, VIDEO, AUDIO and DOCUMENT.
export const mediaType = z.enum(['YOUTUBE_VIDEO']);

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const SHARE_HOST = 'youtu.be';

// The video id of a YouTube watch URL (`youtube.com/watch?v=<id>`) or share URL
// (`youtu.be/<id>`), or null when the URL is neither or the id is malformed. Accepts http and
// https so rows stored before strict validation still resolve; new input must be https.
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();
  let id: string | null = null;
  if (WATCH_HOSTS.has(host)) {
    if (parsed.pathname !== '/watch' && parsed.pathname !== '/watch/') return null;
    id = parsed.searchParams.get('v');
  } else if (host === SHARE_HOST) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    id = segments[0] ?? null;
  }
  return id !== null && YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Validates an https YouTube watch or share URL and outputs the canonical watch URL.
export const youtubeUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((url) => url.startsWith('https://') && youtubeVideoId(url) !== null, {
    error: 'Must be an https:// YouTube watch or youtu.be link with an 11-character video id',
  })
  .transform((url) => canonicalYouTubeUrl(youtubeVideoId(url)!));

// POST /api/media (staff)
export const createMediaInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  type: mediaType,
  url: youtubeUrl,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export const DEFAULT_MEDIA_PAGE_SIZE = 24;

// Query string of GET /api/media (all values arrive as strings).
export const listMediaQuery = z.object({
  type: mediaType.optional(),
  tag: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_MEDIA_PAGE_SIZE),
});

export type MediaType = z.infer<typeof mediaType>;
export type CreateMediaInput = z.input<typeof createMediaInput>;
export type ListMediaQuery = z.input<typeof listMediaQuery>;
