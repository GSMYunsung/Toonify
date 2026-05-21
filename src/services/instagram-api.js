import { HASDATA_KEY } from '../../config';

const BASE_URL = 'https://api.hasdata.com/scrape/instagram/profile';

export async function fetchLatestPosts(username) {
  if (!HASDATA_KEY || HASDATA_KEY.includes('여기에')) {
    throw new Error('config.js에 hasdata API 키를 입력해주세요.');
  }

  const res = await fetch(`${BASE_URL}?handle=${encodeURIComponent(username)}`, {
    method: 'GET',
    headers: {
      'x-api-key': HASDATA_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('hasdata API 키가 잘못됐거나 만료됐습니다.');
  }
  if (res.status === 429) {
    throw new Error('API 요청 한도 초과입니다. 잠시 후 다시 시도해주세요.');
  }
  if (!res.ok) {
    throw new Error(`API 오류 (${res.status})`);
  }

  const data = await res.json();
  return parsePosts(data);
}

function parsePosts(data) {
  const items = data?.latestPosts ?? [];

  return items.map(item => ({
    id: String(item.id ?? item.shortcode ?? ''),
    caption: item.caption ?? '',
    thumbnailUrl: item.displayUrl ?? item.images?.[0] ?? '',
    timestamp: item.timestamp ? new Date(item.timestamp).getTime() / 1000 : 0,
    url: item.url ?? `https://www.instagram.com/p/${item.shortcode ?? ''}/`,
  }));
}
