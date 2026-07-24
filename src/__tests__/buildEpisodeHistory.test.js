import { buildEpisodeHistory } from '../services/toon-service';

// toon-service의 외부 의존성(AsyncStorage, Supabase 등)을 통째로 mock
jest.mock('../services/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));
jest.mock('../services/ocr-service', () => ({ extractTextFromImage: jest.fn() }));
jest.mock('../services/instagram-api', () => ({ fetchLatestPosts: jest.fn() }));

const toon = { seriesName: '참교육 썰', episodeHistory: [] };

const posts = [
  { caption: '참교육 썰 1화', url: 'https://instagram.com/p/1/' },
  { caption: '참교육 썰 3화', url: 'https://instagram.com/p/3/' },
  { caption: '오늘 일상', url: 'https://instagram.com/p/daily/' },
];

describe('buildEpisodeHistory', () => {
  it('시리즈 게시물만 필터링하여 화수 추출', () => {
    const result = buildEpisodeHistory(toon, posts);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ episode: 1, url: 'https://instagram.com/p/1/' });
    expect(result[1]).toEqual({ episode: 3, url: 'https://instagram.com/p/3/' });
  });

  it('오름차순 정렬', () => {
    const reversed = [...posts].reverse();
    const result = buildEpisodeHistory(toon, reversed);
    expect(result[0].episode).toBe(1);
    expect(result[1].episode).toBe(3);
  });

  it('기존 히스토리와 병합 — 중복 화수는 기존 것 유지', () => {
    const existing = [{ episode: 1, url: 'https://instagram.com/p/old1/' }];
    const result = buildEpisodeHistory({ ...toon, episodeHistory: existing }, posts);
    // 1화는 기존 url 유지
    expect(result.find((h) => h.episode === 1).url).toBe('https://instagram.com/p/old1/');
    // 3화는 새로 추가
    expect(result.find((h) => h.episode === 3).url).toBe('https://instagram.com/p/3/');
  });

  it('시리즈 키워드 없는 게시물 무시', () => {
    const result = buildEpisodeHistory(toon, [
      { caption: '오늘 일상 브이로그', url: 'https://instagram.com/p/daily/' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('episodeHistory 없는 툰', () => {
    const result = buildEpisodeHistory({ seriesName: '참교육 썰' }, posts);
    expect(result).toHaveLength(2);
  });
});
