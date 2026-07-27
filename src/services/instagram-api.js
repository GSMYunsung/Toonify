import { HASDATA_KEY } from '../../config';
import { HASDATA_BASE_URL, INSTAGRAM_OEMBED_URL } from '../constants/urls';

export async function fetchLatestPosts(username) {
  if (!HASDATA_KEY || HASDATA_KEY.includes('여기에')) {
    throw new Error('config.js에 hasdata API 키를 입력해주세요.');
  }

  const res = await fetch(`${HASDATA_BASE_URL}?handle=${encodeURIComponent(username)}`, {
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

export async function fetchPostByUrl(postUrl) {
  console.log('[fetchPostByUrl] 입력 URL:', postUrl);

  if (!HASDATA_KEY || HASDATA_KEY.includes('여기에')) {
    throw new Error('config.js에 hasdata API 키를 입력해주세요.');
  }

  // URL에 username이 포함된 경우: instagram.com/username/p/shortcode
  const withUsername = postUrl.match(/instagram\.com\/([^/?#]+)\/(p|reel)\/([A-Za-z0-9_-]+)/);
  // URL에 username 없는 경우: instagram.com/p/shortcode
  const shortcodeOnly = postUrl.match(/instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/);

  if (!withUsername && !shortcodeOnly) {
    throw new Error('유효한 인스타그램 링크가 아닙니다.');
  }

  // username이 URL에 있으면 기존 프로필 API 활용 (확실한 방법)
  if (withUsername) {
    const username = withUsername[1];
    const shortcode = withUsername[3];
    console.log('[fetchPostByUrl] username 포함 URL → username:', username, 'shortcode:', shortcode);

    const posts = await fetchLatestPosts(username);
    console.log('[fetchPostByUrl] 프로필에서 가져온 포스트 수:', posts.length);

    const matched = posts.find(p => p.url?.includes(shortcode));
    console.log('[fetchPostByUrl] shortcode 매칭 포스트:', matched ?? '없음 — 최신 12개 밖, shortcode만 저장');

    if (matched) {
      return {
        username,
        caption: matched.caption ?? '',
        thumbnailUrl: matched.thumbnailUrl ?? '',
        id: matched.id,
        timestamp: matched.timestamp,
      };
    }
    // 앵커 게시물이 최신 12개 밖 → shortcode만 저장, timestamp=0
    // checkToon이 전체 12개를 오래된 순으로 처리하는 fallback으로 동작함
    return {
      username,
      caption: '',
      thumbnailUrl: '',
      id: shortcode,
      timestamp: 0,
    };
  }

  // username 없는 경우: 1순위 oEmbed → 2순위 OG 스크래핑
  const shortcode = shortcodeOnly[2];
  const cleanUrl = `https://www.instagram.com/p/${shortcode}/`;
  console.log('[fetchPostByUrl] shortcode만 추출:', shortcode);

  // ── 1순위: Instagram oEmbed (API 키 불필요, 구조화된 JSON) ──
  try {
    const oembedUrl = `${INSTAGRAM_OEMBED_URL}?url=${encodeURIComponent(cleanUrl)}&maxwidth=540`;
    console.log('[oEmbed] 요청:', oembedUrl);

    const oembedRes = await fetch(oembedUrl, {
      headers: { 'Accept': 'application/json' },
    });
    console.log('[oEmbed] 응답 status:', oembedRes.status);

    if (oembedRes.ok) {
      const data = await oembedRes.json();
      console.log('[oEmbed] 응답:', JSON.stringify(data, null, 2));

      const username = data.author_name ?? '';
      const caption = data.title ?? '';
      const thumbnailUrl = data.thumbnail_url ?? '';

      console.log('[oEmbed] 파싱 결과 → username:', username, '/ caption:', caption?.slice(0, 60));
      if (username) return { username, caption, thumbnailUrl, id: shortcode, timestamp: 0 };
    }
  } catch (e) {
    console.warn('[oEmbed] 실패, OG 폴백 시도:', e.message);
  }

  // ── 2순위 폴백: OG 메타태그 스크래핑 ──
  console.log('[OG 폴백] Instagram 페이지 요청:', cleanUrl);
  const pageRes = await fetch(cleanUrl, {
    headers: {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  console.log('[OG 폴백] 페이지 응답 status:', pageRes.status);

  if (!pageRes.ok) throw new Error('링크 정보를 가져올 수 없어요. 잠시 후 다시 시도해주세요.');

  const html = await pageRes.text();
  console.log('[OG 폴백] HTML 앞 500자:', html.slice(0, 500));

  const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i);
  const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);

  const ogTitle = titleMatch?.[1] ?? '';
  const ogDesc = descMatch?.[1] ?? '';
  const thumbnailUrl = imgMatch?.[1] ?? '';
  console.log('[OG 폴백] og:title:', ogTitle);
  console.log('[OG 폴백] og:description:', ogDesc);
  console.log('[OG 폴백] og:image:', thumbnailUrl ? thumbnailUrl.slice(0, 60) + '...' : '없음');

  const username = ogTitle.split(/\s*(on Instagram|\(@)/i)[0].trim();
  const caption = ogDesc || ogTitle.replace(/^[^:]+:\s*"?/, '').replace(/"$/, '');

  console.log('[OG 폴백] 파싱 결과 → username:', username, '/ caption:', caption?.slice(0, 60));

  if (!username) throw new Error('계정 정보를 찾을 수 없어요.\n잠시 후 다시 시도해주세요.');

  return { username, caption, thumbnailUrl, id: shortcode, timestamp: 0 };
}

export function parsePosts(data) {
  const items = data?.latestPosts ?? [];

  return items.map(item => ({
    id: String(item.id ?? item.shortcode ?? ''),
    caption: item.caption ?? '',
    thumbnailUrl: item.displayUrl ?? item.images?.[0] ?? '',
    timestamp: item.timestamp ? new Date(item.timestamp).getTime() / 1000 : 0,
    url: item.url ?? `https://www.instagram.com/p/${item.shortcode ?? ''}/`,
  }));
}
