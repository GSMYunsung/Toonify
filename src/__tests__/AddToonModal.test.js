import React from 'react';
import { render, fireEvent, waitFor, configure } from '@testing-library/react-native';
import AddToonModal from '../components/AddToonModal';
import { fetchPostByUrl } from '../services/instagram-api';
import * as Clipboard from 'expo-clipboard';

configure({ defaultIncludeHiddenElements: true });

// ── Mocks ──────────────────────────────────────────────
jest.mock('../services/instagram-api', () => ({ fetchPostByUrl: jest.fn() }));
jest.mock('../services/ocr-service', () => ({ extractTextFromImage: jest.fn().mockResolvedValue('') }));
jest.mock('../services/toon-service', () => ({
  addToon: jest.fn().mockResolvedValue({ id: 'new-1' }),
  updateToonInfo: jest.fn().mockResolvedValue(undefined),
  checkToon: jest.fn().mockResolvedValue({ found: false }),
}));
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn().mockResolvedValue(''),
}));
jest.mock('../hooks/useKeywordDetector', () => ({
  extractEpisodeNumber: jest.fn().mockReturnValue(5),
  extractEpisodeNumberFromOCR: jest.fn().mockReturnValue(null),
  extractSeriesName: jest.fn().mockReturnValue('참교육 썰'),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f5', text: '#000', muted: '#999',
      divider: '#eee', accent: '#A594F9', overlayBg: 'rgba(0,0,0,0.3)',
      ctaBg: '#A594F9', ctaText: '#fff', ctaChipBg: '#7c5cba', ctaChipColor: '#fff',
      tagNewBg: '#f0eaff', tagNewColor: '#7c5cba', tagCompleteColor: '#388e3c',
      accent2_100: '#e8eaf6', accent2_500: '#3f51b5',
      shadowColor: '#000', deleteBg: '#ff4444',
    },
  }),
}));
jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));

const INSTA_URL = 'https://www.instagram.com/p/AbCdEfG/';

async function renderModal(props = {}) {
  const defaults = {
    visible: true,
    onClose: jest.fn(),
    onAdded: jest.fn(),
    onUpdate: jest.fn(),
    editToon: null,
  };
  return render(<AddToonModal {...defaults} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  Clipboard.getStringAsync.mockResolvedValue('');
});

// ── 테스트 ──────────────────────────────────────────────
describe('AddToonModal — 필드 잠금', () => {
  it('링크 붙여넣기 전 계정명 필드 잠김', async () => {
    const { getAllByPlaceholderText } = await renderModal();
    await waitFor(() => {});
    const inputs = getAllByPlaceholderText('링크를 먼저 붙여넣어 주세요');
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => expect(input.props.editable).toBe(false));
  });

  it('저장 버튼 비활성화 (imported=false)', async () => {
    const onAdded = jest.fn();
    const { getByText } = await renderModal({ onAdded });
    await waitFor(() => {});
    fireEvent.press(getByText('추가'));
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe('AddToonModal — 링크 붙여넣기 버튼', () => {
  const mockPost = {
    username: 'test_webtoon',
    caption: '참교육 썰 5화',
    thumbnailUrl: 'https://img.com/5.jpg',
    id: 'post-5',
    timestamp: 1000,
  };

  beforeEach(() => {
    fetchPostByUrl.mockResolvedValue(mockPost);
  });

  it('클립보드에 링크 있을 때 버튼 탭 → 필드 자동 채움', async () => {
    Clipboard.getStringAsync.mockResolvedValue(INSTA_URL);
    const { getByText, findByDisplayValue } = await renderModal();

    fireEvent.press(getByText('링크 붙여넣기'));

    await waitFor(() => expect(fetchPostByUrl).toHaveBeenCalledWith(INSTA_URL));
    await findByDisplayValue('test_webtoon');
    await findByDisplayValue('참교육 썰');
    await findByDisplayValue('5');
  });

  it('클립보드에 유효하지 않은 링크 → 에러 메시지 표시', async () => {
    Clipboard.getStringAsync.mockResolvedValue('https://example.com/not-insta');
    const { getByText, findByText } = await renderModal();

    fireEvent.press(getByText('링크 붙여넣기'));

    await findByText('클립보드에 인스타그램 링크가 없어요');
  });

  it('링크 가져오기 실패 → 에러 메시지 표시', async () => {
    Clipboard.getStringAsync.mockResolvedValue(INSTA_URL);
    fetchPostByUrl.mockRejectedValue(new Error('링크 정보를 가져올 수 없어요'));
    const { getByText, findByText } = await renderModal();

    fireEvent.press(getByText('링크 붙여넣기'));

    await findByText('링크 정보를 가져올 수 없어요');
  });

  it('모달 열릴 때 클립보드 자동 감지 안 함', async () => {
    Clipboard.getStringAsync.mockResolvedValue(INSTA_URL);
    await renderModal();
    await waitFor(() => {});
    // 버튼을 안 눌렀으므로 import 호출 없어야 함
    expect(fetchPostByUrl).not.toHaveBeenCalled();
  });
});
