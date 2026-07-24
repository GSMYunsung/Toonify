// GitHub Actions에서 10분마다 실행되는 배치 스크립트
// toon-service.js의 checkToon 로직을 Node.js로 재작성

const { createClient } = require("@supabase/supabase-js");
if (!globalThis.WebSocket) globalThis.WebSocket = require("ws");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HASDATA_KEY = process.env.HASDATA_KEY;
const OCR_SPACE_KEY = process.env.OCR_SPACE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── 화수 추출 (캡션용) ───────────────────────────────────────────
function extractEpisodeNumber(text) {
  const patterns = [
    /(\d+)\s*화/,
    /(\d+)\s*편/,
    /ep\.?\s*(\d+)/i,
    /(?:^|\n)(\d{1,3})\s*(?:\n|$)/,  // 줄 단독 숫자 ("남미새\n3\n" 형태)
    /#(\d+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// ─── 화수 추출 (OCR용, 더 관대한 패턴 추가) ─────────────────────
function extractEpisodeNumberFromOCR(text) {
  const ep = extractEpisodeNumber(text);
  if (ep !== null) return ep;

  const bracketMatch = text.match(/\((\d+)[,)]/);
  if (bracketMatch) return parseInt(bracketMatch[1], 10);

  const lineMatch = text.match(/(?:^|\n)\s*(\d{1,3})\s*(?:\n|$)/);
  if (lineMatch) return parseInt(lineMatch[1], 10);

  return null;
}

function isCompleteEpisode(text) {
  return /완결|완\b/.test(text);
}

// ─── Instagram 게시물 가져오기 ────────────────────────────────────
async function fetchLatestPosts(username) {
  const res = await fetch(
    `https://api.hasdata.com/scrape/instagram/profile?handle=${encodeURIComponent(username)}`,
    {
      headers: { "x-api-key": HASDATA_KEY, "Content-Type": "application/json" },
    },
  );
  if (!res.ok) throw new Error(`hasdata API 오류 (${res.status})`);
  const data = await res.json();
  return (data?.latestPosts ?? []).map((item) => ({
    id: String(item.id ?? item.shortcode ?? ""),
    caption: item.caption ?? "",
    thumbnailUrl: item.displayUrl ?? item.images?.[0] ?? "",
    timestamp: item.timestamp ? new Date(item.timestamp).getTime() / 1000 : 0,
    url: item.url ?? `https://www.instagram.com/p/${item.shortcode ?? ""}/`,
  }));
}

// ─── OCR ─────────────────────────────────────────────────────────
async function extractTextFromImage(imageUrl) {
  try {
    const params = new URLSearchParams({
      apikey: OCR_SPACE_KEY,
      url: imageUrl,
      language: "kor",
      isOverlayRequired: "false",
      OCREngine: "3",
    });
    const res = await fetch(`https://api.ocr.space/parse/imageurl?${params}`);
    const data = await res.json();
    return data?.ParsedResults?.[0]?.ParsedText ?? "";
  } catch {
    return "";
  }
}

// ─── Expo Push 알림 전송 ──────────────────────────────────────────
async function sendPushNotification(tokens, seriesName, episodes, isComplete) {
  const episode = Array.isArray(episodes) ? Math.max(...episodes) : episodes;
  const title = isComplete
    ? `📚 ${seriesName} 완결!`
    : `📚 ${seriesName} 새 편!`;
  let body;
  if (isComplete) {
    body = episode != null ? `${episode}화로 완결됐어요!` : "완결됐어요!";
  } else if (Array.isArray(episodes) && episodes.length > 1) {
    const sorted = [...episodes].sort((a, b) => a - b);
    body = `${sorted[0]}화~${sorted[sorted.length - 1]}화가 올라왔어요!`;
  } else if (episode != null) {
    body = `${episode}화가 올라왔어요!`;
  } else {
    body = "새 게시물이 올라왔어요!";
  }

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: "default",
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const result = await res.json();
  console.log(`[Push] 전송 결과:`, JSON.stringify(result?.data ?? result));
}

// ─── 툰 하나 확인 ────────────────────────────────────────────────
async function checkToon(toon) {
  const allPosts = await fetchLatestPosts(toon.username);
  const posts = [...allPosts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  if (!toon.last_post_id && posts.length > 0) {
    await supabase
      .from("toons")
      .update({ last_post_id: posts[0].id })
      .eq("id", toon.id);
    console.log(`[${toon.username}] 첫 체크 — 기준점 저장`);
    return false;
  }

  console.log(`[${toon.username}] 게시물 ${posts.length}개 확인`);

  const collected = [];
  const seenEps = new Set();
  let maxEp = toon.last_episode || 0;
  let lastPost = null;
  let anyComplete = false;

  for (const post of posts) {
    const caption = post.caption || "";
    const allWords = toon.series_name.split(/\s+/).filter((w) => w.length >= 2);
    const keyWords = [...allWords]
      .sort((a, b) => b.length - a.length)
      .slice(0, 2);
    const captionMatched = keyWords.some((w) => caption.includes(w));

    let analysisText = caption;

    if (!captionMatched) {
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      const ocrMatched = allWords.some((w) => ocrText.includes(w));
      if (!ocrMatched) continue;
      analysisText = ocrText;
    }

    const isOCR = analysisText !== caption;
    let ep = isOCR
      ? extractEpisodeNumberFromOCR(analysisText)
      : extractEpisodeNumber(analysisText);

    if (captionMatched && ep === null) {
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      const ocrEp = extractEpisodeNumberFromOCR(ocrText);
      if (ocrEp !== null) {
        ep = ocrEp;
        analysisText = ocrText;
      }
    }

    const isComplete = isCompleteEpisode(analysisText);
    if (isComplete && ep === null) ep = maxEp + 1;
    if (ep !== null && ep > maxEp) maxEp = ep;

    // read_episode 기준 — 3화 먼저 감지돼도 2화가 unread면 수집
    const isNewEpisode = ep !== null && ep > (toon.read_episode || 0) && !seenEps.has(ep);
    const isNewPost = ep === null && post.id && post.id !== toon.last_post_id;

    console.log(
      `[${toon.username}] ep=${ep} isComplete=${isComplete} isNewEpisode=${isNewEpisode} isNewPost=${isNewPost}`,
    );

    if (isNewEpisode) {
      seenEps.add(ep);
      collected.push({ ep, post, isComplete });
      if (isComplete) anyComplete = true;
      lastPost = post;
    } else if (isNewPost && collected.length === 0) {
      lastPost = post;
      collected.push({ ep: null, post, isComplete: false });
    }
  }

  if (collected.length === 0) return { found: false };

  const highestEp = collected.reduce((max, c) => c.ep !== null && c.ep > max ? c.ep : max, toon.last_episode || 0);
  const representativePost = lastPost || collected[0].post;

  await supabase
    .from("toons")
    .update({
      has_new_episode: true,
      last_episode: highestEp > (toon.last_episode || 0) ? highestEp : toon.last_episode,
      last_post_id: representativePost.id,
      last_episode_title: representativePost.caption?.slice(0, 80) ?? "",
      last_thumbnail_url: representativePost.thumbnailUrl,
      last_post_url: representativePost.url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", toon.id);

  const episodes = collected.map((c) => c.ep).filter((e) => e !== null);
  return { found: true, episode: highestEp || null, episodes, isComplete: anyComplete };
}

// ─── 메인 ────────────────────────────────────────────────────────
async function main() {
  console.log("=== 인스타툰 배치 체크 시작 ===");

  const { data: toons, error: toonsError } = await supabase
    .from("toons")
    .select("*");
  if (toonsError) {
    console.error("toons 읽기 실패:", toonsError.message);
    process.exit(1);
  }
  if (!toons || toons.length === 0) {
    console.log("등록된 툰 없음");
    return;
  }

  const { data: tokenRows } = await supabase
    .from("push_tokens")
    .select("token, device_id");
  // device_id → token 맵 생성
  const tokenByDevice = {};
  for (const row of tokenRows ?? []) {
    if (row.device_id) tokenByDevice[row.device_id] = row.token;
  }
  console.log(
    `툰 ${toons.length}개, 디바이스 ${Object.keys(tokenByDevice).length}개`,
  );

  for (const toon of toons) {
    if (toon.has_new_episode) {
      console.log(`[${toon.username}] 이미 새 편 있음 — 건너뜀`);
      continue;
    }
    try {
      const result = await checkToon(toon);
      if (result?.found) {
        const token = tokenByDevice[toon.device_id];
        if (token) {
          await sendPushNotification(
            [token],
            toon.series_name,
            result.episodes?.length > 0 ? result.episodes : result.episode,
            result.isComplete,
          );
        } else {
          console.warn(
            `[${toon.username}] device_id(${toon.device_id})에 해당하는 토큰 없음`,
          );
        }
      }
    } catch (err) {
      console.warn(`[${toon.username}] 확인 실패:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }

  console.log("=== 완료 ===");
}

main().catch((err) => {
  console.error("배치 오류:", err);
  process.exit(1);
});
