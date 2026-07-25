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
  // 원문자 ①-⑳ → 일반 숫자로 변환 (예: ② → 2)
  text = text.replace(/[①-⑳]/g, (c) => String(c.charCodeAt(0) - 9311));

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
  return /완결/.test(text)
    || /최종화/.test(text)
    || /마지막\s*화/.test(text)
    || /(?:^|[\s(\[「（【])완(?:$|[\s)\]」）】.,!?])/.test(text)  // 완 전후 공백·괄호·구두점
    || /[(\[「（【〔][가-힣]+[)\]」）】〕]/.test(text);            // (완), （완）, 【최종화】 등
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

// ─── OCR (OCR.space API) ──────────────────────────────────────────
async function extractTextFromImage(imageUrl) {
  try {
    const params = new URLSearchParams({
      url: imageUrl,
      language: "kor",
      apikey: OCR_SPACE_KEY,
      OCREngine: "2",
      isTable: "false",
    });
    const res = await fetch(`https://api.ocr.space/parse/imageurl?${params}`);
    if (!res.ok) return "";
    const data = await res.json();
    return data?.ParsedResults?.[0]?.ParsedText || "";
  } catch {
    return "";
  }
}

// ─── Expo Push 알림 전송 (모든 툰 결과 한 번에) ──────────────────
async function sendPushNotification(token, results) {
  // results: [{ seriesName, episodes, isComplete, unreadPosts, toonId }]
  const updates = results.map((r) => ({
    toonId: r.toonId,
    unreadPosts: r.unreadPosts,
  }));

  let title, body;
  if (results.length === 1) {
    const r = results[0];
    const eps = r.episodes.filter(Boolean).sort((a, b) => a - b);
    title = r.seriesName;
    if (r.isComplete) {
      body = eps.length ? `${eps[eps.length - 1]}화로 완결됐어요!` : "완결됐어요!";
    } else if (eps.length > 1) {
      body = `${eps[0]}화~${eps[eps.length - 1]}화가 나왔어요!`;
    } else if (eps.length === 1) {
      body = `${eps[0]}화가 나왔어요!`;
    } else {
      body = "새 편이 나왔어요!";
    }
  } else {
    // 여러 툰 — 요약
    title = "새 에피소드";
    const lines = results.map((r) => {
      const eps = r.episodes.filter(Boolean).sort((a, b) => a - b);
      if (eps.length === 0) return r.seriesName;
      if (eps.length === 1) return `${r.seriesName} ${eps[0]}화`;
      return `${r.seriesName} ${eps[0]}~${eps[eps.length - 1]}화`;
    });
    body = lines.join(", ");
  }

  const message = {
    to: token,
    title,
    body,
    sound: "default",
    data: { updates },
  };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(message),
  });
  const result = await res.json();
  console.log(`[Push] 전송 결과:`, JSON.stringify(result?.data ?? result));
}

// ─── 툰 하나 확인 ────────────────────────────────────────────────
async function checkToon(toon) {
  const allPosts = await fetchLatestPosts(toon.username);
  const posts = [...allPosts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

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
    // 완결 표시가 캡션에 있으면 시리즈명 키워드 체크 없이 통과
    const captionIsComplete = isCompleteEpisode(caption);
    const captionMatched = captionIsComplete || keyWords.some((w) => caption.includes(w));

    let analysisText = caption;

    if (!captionMatched) {
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      const ocrMatched = allWords.some((w) => ocrText.includes(w)) || isCompleteEpisode(ocrText);
      if (!ocrMatched) {
        console.log(`[${toon.username}] 스킵 — 캡션/OCR 키워드 없음 | caption: "${(post.caption || "").slice(0, 40)}" | ocr: "${ocrText.slice(0, 40)}"`);
        continue;
      }
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

  // 기존 unread_posts + 이번에 발견한 것 병합 (읽은 화수 기준 필터)
  const existingUnread = Array.isArray(toon.unread_posts) ? toon.unread_posts : [];
  const newUnread = collected
    .filter((c) => c.ep !== null)
    .map((c) => ({ episode: c.ep, url: c.post.url }));
  const mergedUnread = [...existingUnread];
  for (const item of newUnread) {
    if (!mergedUnread.find((u) => u.episode === item.episode)) {
      mergedUnread.push(item);
    }
  }
  // ep가 null인 항목(화수 불명)은 대표 포스트 URL로 fallback
  if (mergedUnread.length === 0 && representativePost) {
    mergedUnread.push({ episode: null, url: representativePost.url });
  }
  mergedUnread.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

  console.log(`[${toon.username}] unread_posts 저장 시도:`, JSON.stringify(mergedUnread));
  console.log(`[${toon.username}] toon.id:`, toon.id);

  const { data: updateData, error: updateError } = await supabase
    .from("toons")
    .update({
      has_new_episode: true,
      last_episode: highestEp > (toon.last_episode || 0) ? highestEp : toon.last_episode,
      last_post_id: representativePost.id,
      last_episode_title: representativePost.caption?.slice(0, 80) ?? "",
      last_thumbnail_url: representativePost.thumbnailUrl,
      last_post_url: representativePost.url,
      unread_posts: mergedUnread,
      updated_at: new Date().toISOString(),
    })
    .eq("id", toon.id)
    .select();

  console.log(`[${toon.username}] Supabase 업데이트 결과: rows=${updateData?.length ?? 0}, error=${updateError?.message ?? "없음"}`);

  if (updateError) {
    console.error(`[${toon.username}] Supabase 업데이트 실패:`, updateError.message);
    return { found: false };
  }

  if (!updateData || updateData.length === 0) {
    console.error(`[${toon.username}] 업데이트된 행 없음 — id 불일치 가능성`);
    return { found: false };
  }

  const episodes = collected.map((c) => c.ep).filter((e) => e !== null);
  return { found: true, episode: highestEp || null, episodes, isComplete: anyComplete, unreadPosts: mergedUnread };
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

  // device_id → 새 에피소드 결과 누적
  const resultsByDevice = {};

  for (const toon of toons) {
    if (toon.has_new_episode) {
      // unread_posts가 비어있으면 기존 데이터로 채우기 (컬럼 신규 추가 시 일회성 보정)
      const hasUnread = Array.isArray(toon.unread_posts) && toon.unread_posts.length > 0;
      if (!hasUnread && toon.last_post_url) {
        const ep = (toon.last_episode || 0) > (toon.read_episode || 0) ? toon.last_episode : null;
        const fallback = [{ episode: ep, url: toon.last_post_url }];
        await supabase.from("toons").update({ unread_posts: fallback }).eq("id", toon.id);
        console.log(`[${toon.username}] unread_posts 보정:`, fallback);
      }
      console.log(`[${toon.username}] 이미 새 편 있음 — 건너뜀`);
      continue;
    }
    try {
      const result = await checkToon(toon);
      if (result?.found) {
        if (!resultsByDevice[toon.device_id]) resultsByDevice[toon.device_id] = [];
        resultsByDevice[toon.device_id].push({
          toonId: toon.id,
          seriesName: toon.series_name,
          episodes: result.episodes ?? [],
          isComplete: result.isComplete ?? false,
          unreadPosts: result.unreadPosts ?? [],
        });
      }
    } catch (err) {
      console.warn(`[${toon.username}] 확인 실패:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }

  // 모든 툰 체크 완료 후 디바이스별 알림 한 번씩 전송
  for (const [deviceId, results] of Object.entries(resultsByDevice)) {
    const token = tokenByDevice[deviceId];
    if (token) {
      await sendPushNotification(token, results);
    } else {
      console.warn(`device_id(${deviceId})에 해당하는 토큰 없음`);
    }
  }

  console.log("=== 완료 ===");
}

main().catch((err) => {
  console.error("배치 오류:", err);
  process.exit(1);
});
