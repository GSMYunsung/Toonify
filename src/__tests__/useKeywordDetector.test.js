import {
  extractEpisodeNumber,
  extractSeriesName,
  isCompleteEpisode,
  extractEpisodeNumberFromOCR,
} from '../hooks/useKeywordDetector';

describe('extractEpisodeNumber', () => {
  it('n화 패턴', () => expect(extractEpisodeNumber('남자친구 참교육 3화')).toBe(3));
  it('n편 패턴', () => expect(extractEpisodeNumber('슬픈썰 10편')).toBe(10));
  it('ep. 패턴', () => expect(extractEpisodeNumber('ep.12 오늘의 썰')).toBe(12));
  it('EP 대문자', () => expect(extractEpisodeNumber('EP.5 새편')).toBe(5));
  it('괄호 숫자', () => expect(extractEpisodeNumber('(5) 편')).toBe(5));
  it('완결 표기 포함', () => expect(extractEpisodeNumber('15완')).toBe(15));
  it('해시태그', () => expect(extractEpisodeNumber('#47 새편')).toBe(47));
  it('화수 없음', () => expect(extractEpisodeNumber('오늘 일상 공유')).toBeNull());
  it('빈 문자열', () => expect(extractEpisodeNumber('')).toBeNull());
  it('숫자만', () => expect(extractEpisodeNumber('47')).toBe(47));
});

describe('extractSeriesName', () => {
  it('n화 기준 앞부분 추출', () =>
    expect(extractSeriesName('남자친구 참교육 3화').trim()).toBe('남자친구 참교육'));
  it('ep. 형식', () =>
    expect(extractSeriesName('오늘의 썰 ep.5').trim()).toBe('오늘의 썰'));
  it('화수만 있는 캡션', () =>
    expect(extractSeriesName('3화')).toBe(''));
  it('n편 기준', () =>
    expect(extractSeriesName('썰 모음 5편').trim()).toBe('썰 모음'));
});

describe('isCompleteEpisode', () => {
  it('완결 텍스트 포함', () => expect(isCompleteEpisode('10화 완결')).toBe(true));
  it('[완] 표기', () => expect(isCompleteEpisode('[완] 마지막화')).toBe(true));
  it('「완」 표기', () => expect(isCompleteEpisode('「완」')).toBe(true));
  it('일반 텍스트', () => expect(isCompleteEpisode('3화 보러오세요')).toBe(false));
  it('"완" 단독 — 오탐 방지', () => expect(isCompleteEpisode('완벽한 하루')).toBe(false));
  it('빈 문자열', () => expect(isCompleteEpisode('')).toBe(false));
});

describe('extractEpisodeNumberFromOCR', () => {
  it('표준 n화 패턴', () => expect(extractEpisodeNumberFromOCR('3화')).toBe(3));
  it('괄호 숫자 "(4,"', () => expect(extractEpisodeNumberFromOCR('(4,')).toBe(4));
  it('줄 단위 독립 숫자', () => expect(extractEpisodeNumberFromOCR('\n47\n')).toBe(47));
  it('패턴 없음', () => expect(extractEpisodeNumberFromOCR('텍스트만 있음')).toBeNull());
  it('빈 문자열', () => expect(extractEpisodeNumberFromOCR('')).toBeNull());
});
