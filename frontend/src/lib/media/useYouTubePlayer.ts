import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** The origin of the embedded player (`embedUrl` uses www.youtube.com). */
const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/** YouTube iframe API player states we act on. */
const PLAYING = 1;
const BUFFERING = 3;

/**
 * The player state carried by a message from the YouTube iframe API (`onStateChange`, or the
 * `playerState` of an `infoDelivery`/`initialDelivery`), or null for any other message.
 */
export function playerStateFromMessage(data: unknown): number | null {
  let message: unknown = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== 'object') return null;
  const { event, info } = message as { event?: unknown; info?: unknown };
  if (event === 'onStateChange' && typeof info === 'number') return info;
  if (
    (event === 'infoDelivery' || event === 'initialDelivery') &&
    info &&
    typeof info === 'object'
  ) {
    const state = (info as { playerState?: unknown }).playerState;
    return typeof state === 'number' ? state : null;
  }
  return null;
}

/**
 * Talks to an embedded YouTube player (`enablejsapi=1`) through postMessage, only with
 * https://www.youtube.com: subscribes to its state on load and toggles play/pause.
 */
export function useYouTubePlayer(iframeRef: RefObject<HTMLIFrameElement | null>) {
  const [playing, setPlayingState] = useState(false);
  // Read by the keyboard handler between renders, so it is updated with the state.
  const playingRef = useRef(false);
  const setPlaying = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlayingState(next);
  }, []);

  const post = useCallback(
    (message: object) =>
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_ORIGIN),
    [iframeRef],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YOUTUBE_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      const state = playerStateFromMessage(e.data);
      if (state !== null) setPlaying(state === PLAYING || state === BUFFERING);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef, setPlaying]);

  /** Call from the iframe's onLoad: asks the player to send its state changes. */
  const listen = useCallback(() => post({ event: 'listening', id: 1, channel: 'widget' }), [post]);

  const togglePlay = useCallback(() => {
    const func = playingRef.current ? 'pauseVideo' : 'playVideo';
    post({ event: 'command', func, args: [] });
    setPlaying(!playingRef.current);
  }, [post, setPlaying]);

  return { playing, listen, togglePlay };
}
