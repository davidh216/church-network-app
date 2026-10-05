'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaItem } from '@/types/domain';
import { embedUrl, mediaVideoId } from '@/lib/media/youtube';
import PlayerControls from './PlayerControls';
import PlaylistPanel from './PlaylistPanel';

interface VideoPlayerProps {
  media: MediaItem | null;
  onClose: () => void;
  playlist?: MediaItem[];
  currentIndex?: number;
  onPlayNext?: () => void;
  onPlayPrevious?: () => void;
  onSelect?: (index: number) => void;
}

export default function VideoPlayer({
  media,
  onClose,
  playlist = [],
  currentIndex = 0,
  onPlayNext,
  onPlayPrevious,
  onSelect,
}: VideoPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isFullscreen) {
      onClose();
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (isFullscreen) {
            exitFullscreen();
          } else {
            onClose();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowRight':
          if (onPlayNext && currentIndex < playlist.length - 1) {
            onPlayNext();
          }
          break;
        case 'ArrowLeft':
          if (onPlayPrevious && currentIndex > 0) {
            onPlayPrevious();
          }
          break;
      }
    },
    [isFullscreen, onClose, onPlayNext, onPlayPrevious, currentIndex, playlist.length],
  );

  const togglePlayPause = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}',
        '*',
      );
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isFullscreen) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  // Hooks above must run on every render; bail out only after them.
  if (!media) return null;
  // Only a strictly checked YouTube id is embedded; a stored URL never goes into the iframe.
  const embed = embedUrl(mediaVideoId(media), window.location.origin);

  return (
    <div
      ref={playerRef}
      className={`fixed inset-0 bg-black z-50 flex items-center justify-center video-player-modal ${
        isFullscreen ? 'p-0' : 'p-4'
      }`}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
    >
      <div
        className={`bg-black relative w-full h-full flex ${
          isFullscreen ? '' : 'max-w-7xl max-h-[90vh] rounded-lg overflow-hidden'
        }`}
      >
        {/* Main Video Area */}
        <div className="flex-1 relative">
          <PlayerControls
            media={media}
            visible={showControls}
            playlistLength={playlist.length}
            currentIndex={currentIndex}
            isFullscreen={isFullscreen}
            onTogglePlaylist={() => setShowPlaylist(!showPlaylist)}
            onToggleFullscreen={toggleFullscreen}
            onClose={onClose}
            onPlayPrevious={onPlayPrevious}
            onPlayNext={onPlayNext}
          />

          {/* Video Player */}
          {embed ? (
            <iframe
              ref={iframeRef}
              src={embed}
              title={media.title}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
              This video cannot be played here.
            </div>
          )}
        </div>

        {showPlaylist && playlist.length > 1 && (
          <PlaylistPanel
            playlist={playlist}
            currentIndex={currentIndex}
            onSelect={onSelect}
            onClose={() => setShowPlaylist(false)}
            wide={isFullscreen}
          />
        )}
      </div>
    </div>
  );
}
