import { buildUnreadPosts } from '../services/toon-service';

jest.mock('../services/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));
jest.mock('../services/ocr-service', () => ({ extractTextFromImage: jest.fn() }));
jest.mock('../services/instagram-api', () => ({ fetchLatestPosts: jest.fn() }));

const toon = { seriesName: '참교육 썰', readEpisode: 3 };

const posts = [
  { caption: '참교육 썰 1화', url: 'https://instagram.com/p/1/' },
  { caption: '참교육 썰 3화', url: 'https://instagram.com/p/3/' },
  { caption: '참교육 썰 4화', url: 'https://instagram.com/p/4/' },
  { caption: '참교육 썰 5화', url: 'https://instagram.com/p/5/' },
  { caption: '오늘 일상', url: 'https://instagram.com/p/daily/' },
];

describe('buildUnreadPosts', () => {
  it('readEpisode 이하 화수 제외', () => {
    const result = buildUnreadPosts(toon, posts);
    expect(result.every((p) => p.episode > 3)).toBe(true);
    expect(result).toHaveLength(2); // 4화, 5화
  });

  it('오름차순 정렬', () => {
    const result = buildUnreadPosts(toon, posts);
    expect(result[0].episode).toBe(4);
    expect(result[1].episode).toBe(5);
  });

  it('중복 화수 제거', () => {
    const dup = [
      { caption: '참교육 썰 4화', url: 'https://instagram.com/p/4a/' },
      { caption: '참교육 썰 4화', url: 'https://instagram.com/p/4b/' },
    ];
    const result = buildUnreadPosts(toon, dup);
    expect(result).toHaveLength(1);
    expect(result[0].episode).toBe(4);
  });

  it('시리즈 키워드 없는 게시물 무시', () => {
    const result = buildUnreadPosts(toon, [
      { caption: '오늘 브이로그', url: 'https://instagram.com/p/v/' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('readEpisode=0 이면 모든 화수 포함', () => {
    const result = buildUnreadPosts({ ...toon, readEpisode: 0 }, posts);
    expect(result.map((p) => p.episode)).toEqual([1, 3, 4, 5]);
  });
});
