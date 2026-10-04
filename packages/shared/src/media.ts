import { z } from 'zod';

// Only YouTube videos can be added today; the column also names IMAGE, VIDEO, AUDIO and DOCUMENT.
export const mediaType = z.enum(['YOUTUBE_VIDEO']);

const YOUTUBE_HOST = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/;
const YOUTUBE_VIDEO = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;

export const youtubeUrl = z
  .url({ protocol: /^https$/, hostname: YOUTUBE_HOST, error: 'Must be an https:// YouTube URL' })
  .max(2048)
  .refine((url) => YOUTUBE_VIDEO.test(url), 'Please provide a valid YouTube video URL');

// POST /api/media (staff)
export const createMediaInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  type: mediaType,
  url: youtubeUrl,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export type MediaType = z.infer<typeof mediaType>;
export type CreateMediaInput = z.input<typeof createMediaInput>;
