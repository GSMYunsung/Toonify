// 앱(check-service.js)과 서버(check-toons.js)가 공유하는 매칭·감지 로직
// CommonJS: 서버는 require(), 앱은 Metro가 자동 변환

function buildSeriesKeys(seriesName) {
  const allWords = seriesName.split(/\s+/).filter((w) => w.length >= 2);
  const words3up = allWords.filter((w) => w.length >= 3);
  const keyWords = (
    words3up.length >= 1
      ? words3up
      : [...allWords].sort((a, b) => b.length - a.length).slice(0, 2)
  ).map((w) => w.toLowerCase());
  return { allWords, keyWords, minMatch: Math.min(2, keyWords.length) };
}

function captionMatches(keyWords, minMatch, caption) {
  const tokens = new Set(
    caption.toLowerCase().match(/[가-힣a-z]+|[0-9]+/g) || [],
  );
  const matched = keyWords.filter((w) => tokens.has(w.toLowerCase()));
  return { ok: keyWords.length > 0 && matched.length >= minMatch, matched, tokens };
}

function ocrMatches(keyWords, minMatch, text) {
  const lowerText = text.toLowerCase();
  const matched = keyWords.filter((w) => lowerText.includes(w.toLowerCase()));
  return { ok: matched.length >= minMatch, matched };
}

// timestamp가 초(서버) 또는 밀리초(앱) 어느 쪽이든 자동 변환
function isSeriesAbandoned(posts) {
  if (!posts || posts.length === 0) return false;
  const toMs = (ts) => (ts < 1e10 ? ts * 1000 : ts);
  const newestMs = Math.max(...posts.map((p) => toMs(p.timestamp || 0)));
  return Date.now() - newestMs > 21 * 24 * 60 * 60 * 1000;
}

function isCompleteEpisode(text) {
  return (
    /완결/.test(text) ||
    /최종화/.test(text) ||
    /마지막\s*화/.test(text) ||
    /(?:^|[\s(\[「（【])완(?:$|[\s)\]」）】.,!?])/.test(text)
  );
}

function extractEpisodeNumber(text) {
  text = text.replace(/[①-⑳]/g, (c) => String(c.charCodeAt(0) - 9311));
  const patterns = [
    /(\d+)\s*화/,
    /(\d+)\s*완/,
    /(\d+)\s*편/,
    /ep\.?\s*(\d+)/i,
    /(?:^|\n)(\d{1,3})\s*(?:\n|$)/,
    /#(\d+)/,
    /[(\（](\d+)[)\）]/,
    /(\d+)$/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function extractEpisodeNumberFromOCR(text) {
  const standard = extractEpisodeNumber(text);
  if (standard !== null) return standard;

  const parenMatch = text.match(/\((\d+)/);
  if (parenMatch) return parseInt(parenMatch[1], 10);

  for (const line of text.split('\n')) {
    const match = line.match(/\b(\d+)\b/);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}

function extractSeriesName(text) {
  return text.split(/\d+화|\d+편|ep\.\d+/i)[0].trim();
}

// last_post_id 이후의 새 포스트만 반환
function filterNewPosts(posts, lastPostId) {
  if (!lastPostId) return posts;
  const lastSeenIdx = posts.findIndex((p) => p.id === lastPostId);
  return lastSeenIdx === -1 ? posts : posts.slice(lastSeenIdx + 1);
}

module.exports = {
  buildSeriesKeys,
  captionMatches,
  ocrMatches,
  isSeriesAbandoned,
  isCompleteEpisode,
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  extractSeriesName,
  filterNewPosts,
};
