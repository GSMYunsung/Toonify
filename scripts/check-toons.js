// GitHub Actions에서 10분마다 실행되는 배치 스크립트
// toon-service.js의 checkToon 로직을 Node.js로 재작성

const { createClient } = require("@supabase/supabase-js");
if (!globalThis.WebSocket) globalThis.WebSocket = require("ws");
const {
  buildSeriesKeys,
  captionMatches,
  ocrMatches,
  isSeriesAbandoned,
  isCompleteEpisode,
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  filterNewPosts,
} = require("../src/utils/matchingUtils");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HASDATA_KEY = process.env.HASDATA_KEY;
const OCR_SPACE_KEY = process.env.OCR_SPACE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
    isComplete: r.isComplete ?? false,
  }));

  let title, body;
  if (results.length === 1) {
    const r = results[0];
    const eps = r.episodes.filter(Boolean).sort((a, b) => a - b);
    title = r.seriesName;
    if (r.isComplete) {
      body = eps.length
        ? `${eps[eps.length - 1]}화로 완결됐어요!`
        : "완결됐어요!";
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
  // 최신 6개를 추린 뒤 오래된 순으로 처리 — 완결 합성 화수가 실제 화수와 충돌 방지
  const posts = [...allPosts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!toon.last_post_id && posts.length > 0) {
    // 가장 오래된 포스트를 기준점으로 — 다음 실행 때 그 이후 포스트(기등록 화수 이후)를 처리
    const oldestPost = posts[0];
    await supabase
      .from("toons")
      .update({ last_post_id: oldestPost.id })
      .eq("id", toon.id);
    console.log(`[${toon.username}] 첫 체크 — 기준점 저장 (${oldestPost.id})`);
    return { found: false };
  }

  // last_post_id 이후 새 포스트만 추림 — 이미 처리한 포스트 OCR 재호출 방지
  const newPosts = filterNewPosts(posts, toon.last_post_id);

  if (newPosts.length === 0) {
    console.log(`[${toon.username}] 새 포스트 없음 — 스킵`);
    return { found: false };
  }

  console.log(
    `[${toon.username}] 새 포스트 ${newPosts.length}개 확인 (전체 ${posts.length}개 중)`,
  );

  const collected = [];
  const seenEps = new Set();
  let maxEp = toon.last_episode || 0;
  let lastPost = null;
  let anyComplete = isSeriesAbandoned(allPosts);
  if (anyComplete) console.log(`[${toon.username}] 최신 포스트 3주 이상 경과`);

  const { allWords, keyWords, minMatch } = buildSeriesKeys(toon.series_name);

  for (const post of newPosts) {
    const caption = post.caption || "";

    console.log(`\n[${toon.username}] ── 포스트 분석 시작 ──`);
    console.log(`[${toon.username}] post.id: ${post.id}`);
    console.log(`[${toon.username}] caption: "${caption.slice(0, 80)}"`);
    console.log(`[${toon.username}] keyWords: [${keyWords.join(", ")}] minMatch: ${minMatch}`);

    const { ok: capMatched, matched: capMatchedWords } = captionMatches(keyWords, minMatch, caption);
    const captionIsComplete = isCompleteEpisode(caption);

    console.log(`[${toon.username}] captionMatched: ${capMatched} (${capMatchedWords.join(', ')})${captionIsComplete ? ' +완결' : ''}`);

    let analysisText = caption;

    if (!capMatched) {
      console.log(`[${toon.username}] → 캡션 매칭 실패 — OCR 폴백 시도`);
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      console.log(`[${toon.username}] OCR 결과: "${ocrText.slice(0, 80)}"`);
      const { ok: ocrOk, matched: ocrMatchedWords } = ocrMatches(keyWords, minMatch, ocrText);
      console.log(`[${toon.username}] OCR 매칭: ${ocrOk} (${ocrMatchedWords.join(', ')})`);
      if (!ocrOk) {
        console.log(`[${toon.username}] ✗ 스킵 — 캡션/OCR 모두 키워드 없음`);
        continue;
      }
      analysisText = ocrText;
      console.log(`[${toon.username}] → OCR 텍스트로 분석 계속`);
    }

    const isOCR = analysisText !== caption;
    let ep = isOCR
      ? extractEpisodeNumberFromOCR(analysisText)
      : extractEpisodeNumber(analysisText);

    console.log(
      `[${toon.username}] 화수 추출 (${isOCR ? "OCR" : "캡션"}): ep=${ep}`,
    );

    if (capMatched && ep === null) {
      console.log(
        `[${toon.username}] → 캡션 매칭됐지만 화수 없음 — OCR로 화수 재시도`,
      );
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      console.log(
        `[${toon.username}] OCR 결과(화수 재시도): "${ocrText.slice(0, 80)}"`,
      );
      const ocrEp = extractEpisodeNumberFromOCR(ocrText);
      console.log(`[${toon.username}] OCR 화수 추출: ep=${ocrEp}`);
      if (ocrEp !== null) {
        ep = ocrEp;
        analysisText = ocrText;
      }
    }

    const isComplete = isCompleteEpisode(analysisText);
    if (isComplete && ep === null) {
      ep = maxEp + 1;
      console.log(
        `[${toon.username}] 완결 감지 — 화수 null이라 maxEp+1 할당: ep=${ep}`,
      );
    }
    if (ep !== null && ep > maxEp) maxEp = ep;

    const isNewEpisode =
      ep !== null && ep > (toon.read_episode || 0) && !seenEps.has(ep);
    const isNewPost = ep === null && post.id && post.id !== toon.last_post_id;

    console.log(`[${toon.username}] isComplete: ${isComplete}`);
    console.log(
      `[${toon.username}] isNewEpisode: ${isNewEpisode} (ep=${ep}, read_episode=${toon.read_episode || 0}, 중복=${seenEps.has(ep)})`,
    );
    console.log(`[${toon.username}] isNewPost: ${isNewPost}`);

    if (isNewEpisode) {
      seenEps.add(ep);
      collected.push({ ep, post, isComplete });
      if (isComplete) anyComplete = true;
      lastPost = post;
      console.log(`[${toon.username}] ✓ collected에 추가 — ep=${ep}`);
    } else if (isNewPost && collected.length === 0) {
      lastPost = post;
      collected.push({ ep: null, post, isComplete: false });
      console.log(
        `[${toon.username}] ✓ collected에 추가 — ep=null (화수불명 새 포스트)`,
      );
    } else {
      console.log(`[${toon.username}] ✗ 수집 안 함 (이미 읽었거나 중복)`);
    }
  }

  if (collected.length === 0) {
    // 새 포스트는 봤지만 새 에피소드 없음 — 기준점을 최신 포스트로 전진
    const newestSeen = newPosts[newPosts.length - 1];
    const updatePayload = { last_post_id: newestSeen.id };
    if (anyComplete && !toon.is_complete) {
      updatePayload.is_complete = true;
      console.log(`[${toon.username}] 3주 이상 업데이트 없음 → 완결 처리`);
    }
    await supabase.from("toons").update(updatePayload).eq("id", toon.id);
    return { found: false };
  }

  const highestEp = collected.reduce(
    (max, c) => (c.ep !== null && c.ep > max ? c.ep : max),
    toon.last_episode || 0,
  );
  const representativePost = lastPost || collected[0].post;

  // 기존 unread_posts + 이번에 발견한 것 병합 (읽은 화수 기준 필터)
  const existingUnread = Array.isArray(toon.unread_posts)
    ? toon.unread_posts
    : [];
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

  console.log(
    `[${toon.username}] unread_posts 저장 시도:`,
    JSON.stringify(mergedUnread),
  );
  console.log(`[${toon.username}] toon.id:`, toon.id);

  const { data: updateData, error: updateError } = await supabase
    .from("toons")
    .update({
      has_new_episode: true,
      last_episode:
        highestEp > (toon.last_episode || 0) ? highestEp : toon.last_episode,
      last_post_id: representativePost.id,
      last_episode_title: representativePost.caption?.slice(0, 80) ?? "",
      last_thumbnail_url: representativePost.thumbnailUrl,
      last_post_url: representativePost.url,
      unread_posts: mergedUnread,
      updated_at: new Date().toISOString(),
    })
    .eq("id", toon.id)
    .select();

  console.log(
    `[${toon.username}] Supabase 업데이트 결과: rows=${updateData?.length ?? 0}, error=${updateError?.message ?? "없음"}`,
  );

  if (updateError) {
    console.error(
      `[${toon.username}] Supabase 업데이트 실패:`,
      updateError.message,
    );
    return { found: false };
  }

  if (!updateData || updateData.length === 0) {
    console.error(`[${toon.username}] 업데이트된 행 없음 — id 불일치 가능성`);
    return { found: false };
  }

  const episodes = collected.map((c) => c.ep).filter((e) => e !== null);
  return {
    found: true,
    episode: highestEp || null,
    episodes,
    isComplete: anyComplete,
    unreadPosts: mergedUnread,
  };
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
      const hasUnread =
        Array.isArray(toon.unread_posts) && toon.unread_posts.length > 0;
      if (!hasUnread && toon.last_post_url) {
        const ep =
          (toon.last_episode || 0) > (toon.read_episode || 0)
            ? toon.last_episode
            : null;
        const fallback = [{ episode: ep, url: toon.last_post_url }];
        await supabase
          .from("toons")
          .update({ unread_posts: fallback })
          .eq("id", toon.id);
        console.log(`[${toon.username}] unread_posts 보정:`, fallback);
      }
      console.log(`[${toon.username}] 이미 새 편 있음 — 건너뜀`);
      continue;
    }
    try {
      const result = await checkToon(toon);
      if (result?.found) {
        if (!resultsByDevice[toon.device_id])
          resultsByDevice[toon.device_id] = [];
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
