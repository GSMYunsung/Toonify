import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkToon } from '../services/toon-service';
import { __resetToonCache } from '../services/toon-store';
import { fetchLatestPosts } from '../services/instagram-api';
import { extractTextFromImage } from '../services/ocr-service';

// ── Mocks ──────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationChannelAsync: jest.fn(),
}));
jest.mock('../services/instagram-api', () => ({ fetchLatestPosts: jest.fn() }));
jest.mock('../services/ocr-service', () => ({ extractTextFromImage: jest.fn() }));
jest.mock('../services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ data: [], error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}));

// ── 헬퍼 ──────────────────────────────────────────────
const BASE_TOON = {
  id: 'test-toon-1',
  username: 'test_webtoon',
  seriesName: '참교육 썰',
  lastEpisode: 2,
  readEpisode: 2,
  hasNewEpisode: false,
  episodeHistory: [{ episode: 2, url: 'https://instagram.com/p/2/' }],
  unreadPosts: [],
  isComplete: false,
  undetectable: false,
};

function makePost(ep, opts = {}) {
  return {
    id: `post-${ep}`,
    caption: opts.caption ?? `참교육 썰 ${ep}화`,
    thumbnailUrl: `https://img.com/${ep}.jpg`,
    timestamp: 1000 + ep, // 오래된 순 정렬용
    url: `https://instagram.com/p/${ep}/`,
    ...opts,
  };
}

async function seedToon(toon) {
  await AsyncStorage.setItem('toon_notifier_v2', JSON.stringify([toon]));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetToonCache();
  jest.clearAllMocks();
  extractTextFromImage.mockResolvedValue(''); // 기본: OCR 빈 결과
});

// ── 테스트 ──────────────────────────────────────────────
describe('checkToon — 캡션 감지', () => {
  it('새 화수 1개 감지', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([makePost(2), makePost(3)]);

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(true);
    expect(result.episodes).toEqual([3]);
  });

  it('복수 화수 동시 감지', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([makePost(2), makePost(3), makePost(4)]);

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(true);
    expect(result.episodes).toEqual([3, 4]);
  });

  it('새 화수 없음', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([makePost(1), makePost(2)]);

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(false);
  });

  it('완결 화수 감지', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([
      makePost(2),
      makePost(3, { caption: '참교육 썰 3화 완결' }),
    ]);

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(true);
    const saved = JSON.parse(await AsyncStorage.getItem('toon_notifier_v2'));
    expect(saved[0].isComplete).toBe(true);
  });

  it('이미 hasNewEpisode=true이면 알림 재발송 안 함', async () => {
    const { scheduleNotificationAsync } = require('expo-notifications');
    const toon = { ...BASE_TOON, hasNewEpisode: true };
    await seedToon(toon);
    fetchLatestPosts.mockResolvedValue([makePost(2), makePost(3)]);

    await checkToon(toon);

    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('checkToon — OCR 감지', () => {
  it('캡션에 키워드 없고 OCR에서 감지', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([
      makePost(2),
      makePost(3, { caption: '✨ 새 게시물 ✨' }), // 캡션에 시리즈 키워드 없음
    ]);
    extractTextFromImage.mockResolvedValue('참교육 썰 3화'); // OCR 결과에 있음

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(true);
  });

  it('OCR 한도 초과(null) 2회 → OCR_LIMIT 에러', async () => {
    await seedToon(BASE_TOON);
    // 12개 게시물 모두 캡션 키워드 없음 → OCR 2번 null 반환
    fetchLatestPosts.mockResolvedValue([
      makePost(3, { caption: '✨ 1' }),
      makePost(4, { caption: '✨ 2' }),
      makePost(5, { caption: '✨ 3' }),
    ]);
    extractTextFromImage.mockResolvedValue(null); // 한도 초과 sentinel

    const ocrLimitRef = { count: 0 };
    await expect(checkToon(BASE_TOON, ocrLimitRef)).rejects.toMatchObject({
      code: 'OCR_LIMIT',
    });
  });
});

describe('checkToon — undetectable', () => {
  it('12개 캡션 모두 키워드 없으면 undetectable 저장', async () => {
    await seedToon(BASE_TOON);
    fetchLatestPosts.mockResolvedValue([
      { id: 'x1', caption: '오늘 일상', thumbnailUrl: '', timestamp: 100, url: 'u1' },
      { id: 'x2', caption: '광고', thumbnailUrl: '', timestamp: 200, url: 'u2' },
    ]);
    // OCR도 빈 결과
    extractTextFromImage.mockResolvedValue('');

    const result = await checkToon(BASE_TOON);

    expect(result.found).toBe(false);
    expect(result.undetectable).toBe(true);
    const saved = JSON.parse(await AsyncStorage.getItem('toon_notifier_v2'));
    expect(saved[0].undetectable).toBe(true);
  });

  it('시리즈 게시물 있으면 undetectable 해제', async () => {
    const toon = { ...BASE_TOON, undetectable: true };
    await seedToon(toon);
    fetchLatestPosts.mockResolvedValue([makePost(2)]); // 기존 화수만 있음, 신규 없음

    const result = await checkToon(toon);

    expect(result.undetectable).toBe(false);
    const saved = JSON.parse(await AsyncStorage.getItem('toon_notifier_v2'));
    expect(saved[0].undetectable).toBe(false);
  });
});
