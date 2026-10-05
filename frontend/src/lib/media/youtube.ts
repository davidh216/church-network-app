import { YOUTUBE_VIDEO_ID, youtubeVideoId } from '@embrace/shared';

/** The parts of a media row needed to find its YouTube video. */
interface VideoSource {
  url: string;
  videoId?: string | null;
}

/**
 * The 11-character YouTube id of a media row: the API's `videoId` when it is well formed,
 * otherwise parsed from the watch or share URL with the shared strict parser; null when the
 * video cannot be embedded.
 */
export function mediaVideoId(media: VideoSource): string | null {
  if (media.videoId && YOUTUBE_VIDEO_ID.test(media.videoId)) return media.videoId;
  return youtubeVideoId(media.url);
}

/** A thumbnail URL on i.ytimg.com for a video id; '' when the id is missing or malformed. */
export function thumbnailUrl(videoId: string | null, quality: 'hq' | 'maxres' = 'hq'): string {
  if (!videoId || !YOUTUBE_VIDEO_ID.test(videoId)) return '';
  return `https://i.ytimg.com/vi/${videoId}/${quality === 'maxres' ? 'maxresdefault' : 'hqdefault'}.jpg`;
}

/**
 * The privacy-preserving embed URL for a video id, or null when the id does not pass the
 * strict check (so a stored URL is never placed in the iframe as it is).
 */
export function embedUrl(videoId: string | null, origin: string): string | null {
  if (!videoId || !YOUTUBE_VIDEO_ID.test(videoId)) return null;
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
    origin,
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
