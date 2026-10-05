'use client';

import Image from 'next/image';
import { useState } from 'react';
import { thumbnailUrl } from '@/lib/media/youtube';

interface VideoThumbnailProps {
  videoId: string;
  alt: string;
  /** Start from the large thumbnail (grid cards); list rows use the smaller one. */
  large?: boolean;
  /** The `sizes` hint for next/image (the box is filled, so this picks the width). */
  sizes: string;
  className?: string;
}

/**
 * A YouTube thumbnail through next/image (i.ytimg.com is allowed in next.config remotePatterns).
 * maxresdefault does not exist for every video, so a failure falls back to hqdefault, and a
 * second failure hides the image so the grey frame behind it shows.
 */
export default function VideoThumbnail({
  videoId,
  alt,
  large = false,
  sizes,
  className = 'object-cover',
}: VideoThumbnailProps) {
  const [quality, setQuality] = useState<'maxres' | 'hq' | 'none'>(large ? 'maxres' : 'hq');
  if (quality === 'none') return null;
  return (
    <Image
      key={quality}
      src={thumbnailUrl(videoId, quality)}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setQuality(quality === 'maxres' ? 'hq' : 'none')}
    />
  );
}
