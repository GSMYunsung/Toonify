import { parsePosts } from '../services/instagram-api';

describe('parsePosts', () => {
  it('정상 응답 파싱', () => {
    const result = parsePosts({
      latestPosts: [{
        id: '1',
        caption: '썰 3화',
        displayUrl: 'https://img.com/a.jpg',
        timestamp: '2026-01-01T00:00:00Z',
        url: 'https://www.instagram.com/p/abc/',
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].caption).toBe('썰 3화');
    expect(result[0].thumbnailUrl).toBe('https://img.com/a.jpg');
    expect(typeof result[0].timestamp).toBe('number');
    expect(result[0].timestamp).toBeGreaterThan(0);
    expect(result[0].url).toBe('https://www.instagram.com/p/abc/');
  });

  it('latestPosts 없으면 빈 배열', () => {
    expect(parsePosts({})).toEqual([]);
    expect(parsePosts(null)).toEqual([]);
  });

  it('timestamp 없으면 0', () => {
    const result = parsePosts({ latestPosts: [{ id: '1' }] });
    expect(result[0].timestamp).toBe(0);
  });

  it('id 없을 때 shortcode 폴백', () => {
    const result = parsePosts({ latestPosts: [{ shortcode: 'xyz123' }] });
    expect(result[0].id).toBe('xyz123');
    expect(result[0].url).toContain('xyz123');
  });

  it('displayUrl 없을 때 images[0] 폴백', () => {
    const result = parsePosts({
      latestPosts: [{ id: '1', images: ['https://img.com/fallback.jpg'] }],
    });
    expect(result[0].thumbnailUrl).toBe('https://img.com/fallback.jpg');
  });

  it('caption 없으면 빈 문자열', () => {
    const result = parsePosts({ latestPosts: [{ id: '1' }] });
    expect(result[0].caption).toBe('');
  });
});
