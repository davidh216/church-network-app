import { describe, expect, it } from 'vitest';
import { embedUrl, mediaVideoId, thumbnailUrl } from './youtube';
import { formatMediaDate, parseTags, tagLabel } from './format';

const ID = 'dQw4w9WgXcQ';

describe('mediaVideoId', () => {
  it('prefers a well-formed videoId from the API', () => {
    expect(mediaVideoId({ url: 'https://example.com', videoId: ID })).toBe(ID);
  });

  it('parses watch and share URLs when videoId is missing', () => {
    expect(mediaVideoId({ url: `https://www.youtube.com/watch?v=${ID}` })).toBe(ID);
    expect(mediaVideoId({ url: `https://youtu.be/${ID}`, videoId: null })).toBe(ID);
  });

  it('rejects malformed ids and non-YouTube URLs', () => {
    expect(mediaVideoId({ url: 'https://www.youtube.com/watch?v=short' })).toBeNull();
    expect(mediaVideoId({ url: `https://evil.example/watch?v=${ID}` })).toBeNull();
    expect(mediaVideoId({ url: 'javascript:alert(1)' })).toBeNull();
    expect(mediaVideoId({ url: 'not a url', videoId: 'bad/id"><x' })).toBeNull();
  });
});

describe('thumbnailUrl', () => {
  it('builds hq and maxres thumbnails', () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(thumbnailUrl(ID, 'maxres')).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  });

  it('returns an empty string without a valid id', () => {
    expect(thumbnailUrl(null)).toBe('');
    expect(thumbnailUrl('../../x')).toBe('');
  });
});

describe('embedUrl', () => {
  it('embeds a valid id with autoplay and the page origin', () => {
    const url = new URL(embedUrl(ID, 'http://localhost:3000')!);
    expect(url.origin + url.pathname).toBe(`https://www.youtube.com/embed/${ID}`);
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('rel')).toBe('0');
    expect(url.searchParams.get('origin')).toBe('http://localhost:3000');
  });

  it('refuses anything that is not an 11-character id', () => {
    expect(embedUrl(null, 'o')).toBeNull();
    expect(embedUrl('dQw4w9WgXc', 'o')).toBeNull();
    expect(embedUrl('dQw4w9WgXcQ?x=1', 'o')).toBeNull();
    expect(embedUrl('https://evil.example/', 'o')).toBeNull();
  });
});

describe('media formatting', () => {
  it('parses tags and falls back to an empty list', () => {
    expect(parseTags('["worship","youth"]')).toEqual(['worship', 'youth']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('{')).toEqual([]);
    expect(parseTags('"x"')).toEqual([]);
  });

  it('labels tags and formats dates', () => {
    expect(tagLabel('special-event')).toBe('Special event');
    expect(tagLabel('worship')).toBe('Worship');
    expect(formatMediaDate('2024-01-05T12:00:00')).toBe('Jan 5, 2024');
  });
});
