'use client';

import { useState } from 'react';
import SimpleMediaLibrary from './SimpleMediaLibrary';
import VideoPlayer from './VideoPlayer';
import type { MediaItem } from '@/types/domain';

interface Playing {
  media: MediaItem;
  playlist: MediaItem[];
  index: number;
}

/** The `/media` route: the library plus the player for the chosen video and its playlist. */
export default function MediaPage() {
  const [playing, setPlaying] = useState<Playing | null>(null);

  const play = (media: MediaItem, playlist: MediaItem[] = []) => {
    const index = playlist.findIndex((item) => item.id === media.id);
    setPlaying({ media, playlist, index: Math.max(index, 0) });
  };

  // Next, previous and playlist picks: ignore indexes outside the playlist.
  const select = (index: number) => {
    setPlaying((prev) => {
      const media = prev?.playlist[index];
      return prev && media ? { ...prev, media, index } : prev;
    });
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Embrace Media Library</h1>
      <SimpleMediaLibrary onPlayMedia={play} />
      {playing && (
        <VideoPlayer
          media={playing.media}
          onClose={() => setPlaying(null)}
          playlist={playing.playlist}
          currentIndex={playing.index}
          onPlayNext={() => select(playing.index + 1)}
          onPlayPrevious={() => select(playing.index - 1)}
          onSelect={select}
        />
      )}
    </div>
  );
}
