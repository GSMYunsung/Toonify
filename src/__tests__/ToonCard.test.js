import React from 'react';
import { render, fireEvent, waitFor, configure } from '@testing-library/react-native';
import ToonCard from '../components/ToonCard';
import { checkToon, deleteToon, advanceEpisode } from '../services/toon-service';
import { Linking } from 'react-native';

// Animated.View with opacity:0 도 쿼리에 포함 (에피소드 stagger 애니 때문)
configure({ defaultIncludeHiddenElements: true });

// ── Mocks ──────────────────────────────────────────────
jest.mock('../services/toon-service', () => ({
  checkToon: jest.fn().mockResolvedValue({ found: false }),
  deleteToon: jest.fn().mockResolvedValue(undefined),
  advanceEpisode: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      cardTints: ['#f0f0f0', '#e0e0e0', '#d0d0d0'],
      accent: '#A594F9',
      muted: '#999',
      surface: '#fff',
      text: '#000',
      divider: '#eee',
      tagNewBg: '#f0eaff',
      tagNewColor: '#7c5cba',
      tagReadBg: '#f5f5f5',
      tagReadColor: '#888',
      tagCompleteBg: '#e8f5e9',
      tagCompleteColor: '#388e3c',
      deleteBg: '#ff4444',
      deleteText: '#fff',
    },
    isDark: false,
  }),
}));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Swipeable: ({ children, enabled }) => <View testID={`swipeable-enabled-${enabled}`}>{children}</View>,
    GestureHandlerRootView: ({ children }) => <>{children}</>,
  };
});
jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
  Ionicons: 'Ionicons',
}));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Polygon: 'Polygon',
}));

beforeEach(() => {
  jest.clearAllMocks();
  checkToon.mockResolvedValue({ found: false });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

// ── 헬퍼 ──────────────────────────────────────────────
const BASE_TOON = {
  id: 'toon-1',
  username: 'test_webtoon',
  seriesName: '참교육 썰',
  lastEpisode: 3,
  readEpisode: 3,
  hasNewEpisode: false,
  isComplete: false,
  undetectable: false,
  episodeHistory: [
    { episode: 2, url: 'https://instagram.com/p/2/' },
    { episode: 3, url: 'https://instagram.com/p/3/' },
  ],
  unreadPosts: [],
};

async function renderCard(toon = BASE_TOON) {
  const onUpdate = jest.fn();
  const utils = await render(<ToonCard toon={toon} onUpdate={onUpdate} />);
  return { ...utils, onUpdate };
}

// ── 테스트 ──────────────────────────────────────────────
describe('ToonCard — 배지', () => {
  it('새 에피소드 배지', async () => {
    const { getByText } = await renderCard({ ...BASE_TOON, hasNewEpisode: true });
    expect(getByText('새 에피소드')).toBeTruthy();
  });

  it('읽음 배지', async () => {
    const { getByText } = await renderCard(BASE_TOON);
    expect(getByText('읽음')).toBeTruthy();
  });

  it('직접 확인 배지', async () => {
    const { getByText } = await renderCard({ ...BASE_TOON, undetectable: true });
    expect(getByText('직접 확인')).toBeTruthy();
  });

  it('완결 배지', async () => {
    const { getByText } = await renderCard({ ...BASE_TOON, isComplete: true });
    expect(getByText('완결')).toBeTruthy();
  });
});

describe('ToonCard — 에피소드 아코디언', () => {
  it('초기에는 에피소드 목록 숨겨짐', async () => {
    const { queryByText } = await renderCard();
    expect(queryByText('2화')).toBeNull();
  });

  it('카드 탭 → 에피소드 목록 표시', async () => {
    const { getByText, findByText } = await renderCard();
    fireEvent.press(getByText('참교육 썰'));
    await findByText('2화');
    await findByText('3화');
  });

  it('카드 재탭 → 에피소드 목록 숨겨짐', async () => {
    const { getByText, queryByText, findByText } = await renderCard();
    fireEvent.press(getByText('참교육 썰')); // 열기
    await findByText('2화');               // 열림 대기
    fireEvent.press(getByText('참교육 썰')); // 닫기
    await waitFor(() => expect(queryByText('2화')).toBeNull());
  });
});

describe('ToonCard — 에피소드 탭', () => {
  it('에피소드 탭 → Linking.openURL 호출', async () => {
    const { getByText, findByText } = await renderCard();
    fireEvent.press(getByText('참교육 썰'));
    const ep2 = await findByText('2화');
    fireEvent.press(ep2);
    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('https://instagram.com/p/2/');
    });
  });

  it('안 읽은 화 탭 → advanceEpisode 호출', async () => {
    const toon = { ...BASE_TOON, readEpisode: 1, hasNewEpisode: true };
    const { getByText, findByText } = await renderCard(toon);
    fireEvent.press(getByText('참교육 썰'));
    const ep2 = await findByText('2화');
    fireEvent.press(ep2);
    await waitFor(() => {
      expect(advanceEpisode).toHaveBeenCalledWith('toon-1', 2, expect.any(Array));
    });
  });
});

describe('ToonCard — 새로고침 & 스와이프', () => {
  it('OCR 중(isChecking) 스와이프 disabled', async () => {
    // 절대 resolve 안 되는 Promise → isChecking=true 유지
    checkToon.mockImplementation(() => new Promise(() => {}));
    const { getByTestId } = await renderCard();

    fireEvent.press(getByTestId('refresh-btn'));

    await waitFor(() => {
      const swipeable = getByTestId('swipeable-enabled-false');
      expect(swipeable).toBeTruthy();
    });
  });
});
