'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaItem } from '@/types/domain';

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

  const getEmbedUrl = useCallback((url: string): string => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const params = new URLSearchParams({
          autoplay: '1',
          rel: '0',
          modestbranding: '1',
          playsinline: '1',
          enablejsapi: '1',
          origin: window.location.origin,
        });
        return `https://www.youtube.com/embed/${match[1]}?${params.toString()}`;
      }
    }

    return url;
  }, []);

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

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const parseTags = (tagsString: string): string[] => {
    try {
      return JSON.parse(tagsString || '[]');
    } catch {
      return [];
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
          {/* Custom Controls Overlay */}
          <div
            className={`absolute inset-0 z-10 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-4">
                  <h2 className="text-white text-lg font-semibold mb-1 truncate">{media.title}</h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-300">
                    {media.uploadedBy && <span>By {media.uploadedBy.name}</span>}
                    {media.createdAt && <span>{formatDate(media.createdAt)}</span>}
                    {playlist.length > 1 && (
                      <span>
                        {currentIndex + 1} of {playlist.length}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Playlist Toggle */}
                  {playlist.length > 1 && (
                    <button
                      onClick={() => setShowPlaylist(!showPlaylist)}
                      className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                      title="Toggle Playlist"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" />
                        <path d="M13 8.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-7z" />
                      </svg>
                    </button>
                  )}

                  {/* Fullscreen Toggle */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                    title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      {isFullscreen ? (
                        <path d="M3 4a1 1 0 011-1h4a1 1 0 110 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 11-2 0V4zM15 4a1 1 0 10-2 0v1.586l-2.293 2.293a1 1 0 101.414 1.414L14.586 7H16a1 1 0 100-2h-1zM5 12a1 1 0 011 1v1.586l2.293-2.293a1 1 0 111.414 1.414L7.414 16H9a1 1 0 110 2H5a1 1 0 01-1-1v-4a1 1 0 011-1zM15 12a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L13.586 15V13a1 1 0 011-1z" />
                      ) : (
                        <path d="M3 4a1 1 0 000 2h1.586l2.293 2.293a1 1 0 001.414-1.414L6 4.586V6a1 1 0 01-2 0V4h2zM13 4a1 1 0 011 1v1.586l2.293-2.293a1 1 0 111.414 1.414L15.414 8H17a1 1 0 110 2h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zm2 1v2h2v-2H5zM13 12a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4a1 1 0 011-1h4z" />
                      )}
                    </svg>
                  </button>

                  {/* Close Button */}
                  <button
                    onClick={onClose}
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                    title="Close (Esc)"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <div className="flex items-center justify-between">
                {/* Left Controls */}
                <div className="flex items-center space-x-3">
                  {/* Previous/Next */}
                  {playlist.length > 1 && (
                    <>
                      <button
                        onClick={onPlayPrevious}
                        disabled={currentIndex === 0}
                        className="p-2 text-white hover:bg-white/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Previous (←)"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                        </svg>
                      </button>

                      <button
                        onClick={onPlayNext}
                        disabled={currentIndex === playlist.length - 1}
                        className="p-2 text-white hover:bg-white/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Next (→)"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                {/* Right Controls */}
                <div className="flex items-center space-x-3">
                  {/* External Link */}
                  <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                    title="Watch on YouTube"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-2a1 1 0 10-2 0v2H5V7h2a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Video Player */}
          {media.type === 'YOUTUBE_VIDEO' ? (
            <iframe
              ref={iframeRef}
              src={getEmbedUrl(media.url)}
              title={media.title}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              loading="eager"
            />
          ) : (
            <video controls className="w-full h-full object-contain" preload="metadata" autoPlay>
              <source src={media.url} />
              Your browser does not support the video tag.
            </video>
          )}
        </div>

        {/* Playlist Sidebar */}
        {showPlaylist && playlist.length > 1 && (
          <div
            className={`bg-gray-900 text-white overflow-y-auto playlist-scrollbar ${
              isFullscreen ? 'w-80' : 'w-72'
            }`}
          >
            <div className="p-4 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Playlist ({playlist.length})</h3>
                <button
                  onClick={() => setShowPlaylist(false)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-2">
              {playlist.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={index === currentIndex ? 'true' : undefined}
                  className={`block w-full text-left p-3 rounded cursor-pointer hover:bg-gray-800 transition-colors mb-2 ${
                    index === currentIndex ? 'bg-gray-700 border-l-4 border-red-500' : ''
                  }`}
                  onClick={() => {
                    if (index !== currentIndex) onSelect?.(index);
                  }}
                >
                  <div className="flex items-start space-x-3">
                    <div className="text-sm text-gray-400 mt-1 w-6">
                      {index === currentIndex ? (
                        <svg
                          className="w-4 h-4 text-red-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M8 5v10l8-5-8-5z" />
                        </svg>
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.title}</p>
                      {item.uploadedBy && (
                        <p className="text-xs text-gray-400 mt-1">{item.uploadedBy.name}</p>
                      )}
                      {item.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {parseTags(item.tags)
                            .slice(0, 2)
                            .map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
