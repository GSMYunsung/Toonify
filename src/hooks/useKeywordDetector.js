export function extractEpisodeNumber(text) {
  const patterns = [
    /(\d+)\s*화/,
    /(\d+)\s*완/,   // "10완", "10완결"
    /(\d+)\s*편/,
    /ep\.?\s*(\d+)/i,
    /(?:^|\n)(\d{1,3})\s*(?:\n|$)/,  // 줄 단독 숫자 ("남미새\n3\n" 형태)
    /#(\d+)/,
    /[(\（](\d+)[)\）]/,  // "(3)", "（3）" 괄호 안 숫자
    /(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

export function extractSeriesName(text) {
  return text.split(/\d+화|\d+편|ep\.\d+/i)[0].trim();
}

export function isCompleteEpisode(text) {
  // /완결?/ 는 "완" 단독 매칭 버그 있음 → 완결 명시적으로만 감지
  return /완결/.test(text) || /[\[\(「]완[\]\)」]/.test(text);
}

// OCR 텍스트 전용 — 캡션에는 오탐 위험이 있어 사용하지 않음
export function extractEpisodeNumberFromOCR(text) {
  const standard = extractEpisodeNumber(text);
  if (standard !== null) return standard;

  // 괄호 안 숫자: (2) 또는 (2,
  const parenMatch = text.match(/\((\d+)/);
  if (parenMatch) return parseInt(parenMatch[1], 10);

  // 줄 단위로 독립된 숫자 검색
  for (const line of text.split('\n')) {
    const match = line.match(/\b(\d+)\b/);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}
