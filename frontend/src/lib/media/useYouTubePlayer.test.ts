import { describe, expect, it } from 'vitest';
import { playerStateFromMessage } from './useYouTubePlayer';

describe('playerStateFromMessage', () => {
  it('reads onStateChange and the playerState of info deliveries', () => {
    expect(playerStateFromMessage('{"event":"onStateChange","info":1}')).toBe(1);
    expect(playerStateFromMessage({ event: 'onStateChange', info: 2 })).toBe(2);
    expect(playerStateFromMessage('{"event":"infoDelivery","info":{"playerState":1}}')).toBe(1);
    expect(playerStateFromMessage('{"event":"initialDelivery","info":{"playerState":5}}')).toBe(5);
  });

  it('ignores other messages and malformed data', () => {
    expect(playerStateFromMessage('{"event":"infoDelivery","info":{"currentTime":3}}')).toBeNull();
    expect(playerStateFromMessage('{"event":"onReady"}')).toBeNull();
    expect(playerStateFromMessage('not json')).toBeNull();
    expect(playerStateFromMessage(null)).toBeNull();
    expect(playerStateFromMessage(42)).toBeNull();
  });
});
