import { z } from 'zod';
import { idParams, pagination } from '../../lib/schemas';

export { idParams };

// Only YouTube videos can be added today; the column also names IMAGE, VIDEO, AUDIO and DOCUMENT.
export const mediaType = z.enum(['YOUTUBE_VIDEO']);

const YOUTUBE_HOST = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/;
const YOUTUBE_VIDEO = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;

export const youtubeUrl = z
  .url({ protocol: /^https$/, hostname: YOUTUBE_HOST, error: 'Must be an https:// YouTube URL' })
  .max(2048)
  .refine((url) => YOUTUBE_VIDEO.test(url), 'Please provide a valid YouTube video URL');

export const listMediaQuery = z.object({
  type: mediaType.optional(),
  tag: z.string().trim().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  limit: pagination(20).limit,
});

export const createMediaBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  type: mediaType,
  url: youtubeUrl,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});
