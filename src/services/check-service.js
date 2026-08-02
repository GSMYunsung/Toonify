import { fetchLatestPosts } from "./instagram-api";
import { extractTextFromImage } from "./ocr-service";
import { getToons, updateToon } from "./toon-store";
import { sendLocalNotification } from "./notifications";
import { supabase } from "./supabase";
import {
  buildSeriesKeys,
  captionMatches,
  ocrMatches,
  isSeriesAbandoned,
  isCompleteEpisode,
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
} from "../utils/matchingUtils";

export function buildEpisodeHistory(toon, allPosts) {
  const existing = {};
  for (const h of toon.episodeHistory || []) {
    existing[h.episode] = h;
  }
  const { keyWords, minMatch } = buildSeriesKeys(toon.seriesName);
  for (const post of allPosts) {
    const cap = post.caption || "";
    const { ok } = captionMatches(keyWords, minMatch, cap);
    if (!ok) continue;
    const ep = extractEpisodeNumber(cap);
    if (ep !== null && !existing[ep]) {
      existing[ep] = { episode: ep, url: post.url };
    }
  }
  return Object.values(existing).sort((a, b) => a.episode - b.episode);
}

export function buildUnreadPosts(toon, allPosts) {
  const readEp = toon.readEpisode || 0;
  const { keyWords, minMatch } = buildSeriesKeys(toon.seriesName);
  const seen = new Set();
  const result = [];
  let maxFoundEp = toon.lastEpisode || 0;

  const sorted = [...allPosts].sort((a, b) => a.timestamp - b.timestamp);

  for (const post of sorted) {
    const cap = post.caption || "";
    const { ok } = captionMatches(keyWords, minMatch, cap);
    if (!ok) continue;

    const captionIsComplete = isCompleteEpisode(cap);
    let ep = extractEpisodeNumber(cap);
    if (ep === null && captionIsComplete) ep = maxFoundEp + 1;
    if (ep !== null && ep > maxFoundEp) maxFoundEp = ep;

    if (ep !== null && ep > readEp && !seen.has(ep)) {
      seen.add(ep);
      result.push({ episode: ep, url: post.url });
    }
  }

  return result.sort((a, b) => a.episode - b.episode);
}

export async function checkToon(toonInput) {
  const stored = await getToons();
  const toon = stored.find((t) => t.id === toonInput.id) ?? toonInput;

  const allPosts = await fetchLatestPosts(toon.username);
  const posts = [...allPosts].sort((a, b) => b.timestamp - a.timestamp);

  console.log(`[checkToon] @${toon.username} — 검사대상 ${posts.length}개 (최신 순)`);

  const isAbandoned = isSeriesAbandoned(allPosts);
  if (isAbandoned) console.log(`[checkToon] 최신 포스트 3주 이상 경과`);

  const { allWords, keyWords, minMatch } = buildSeriesKeys(toon.seriesName);
  const collected = [];
  let runningMaxEp = toon.lastEpisode || 0;

  for (const post of posts) {
    const caption = post.caption || "";
    const { ok: captionMatched, matched: matchedWords } = captionMatches(keyWords, minMatch, caption);
    const captionIsComplete = isCompleteEpisode(caption);

    let analysisText = caption;

    if (!captionMatched && !toon.isComplete) {
      console.log(`[checkToon] 캡션 키워드 부족(${matchedWords.length}/${minMatch}) → OCR 시도`);
      const ocrText = await extractTextFromImage(post.thumbnailUrl, post.id);
      const { ok: ocrOk, matched: ocrMatchedWords } = ocrMatches(keyWords, minMatch, ocrText);
      if (!ocrOk) {
        console.log(`[checkToon] OCR 키워드 부족(${ocrMatchedWords.length}/${minMatch}) → 건너뜀`);
        continue;
      }
      analysisText = ocrText;
      console.log(`[checkToon] OCR 통과 — 매칭단어: (${ocrMatchedWords.join(', ')}) | OCR결과: "${ocrText.slice(0, 80)}"`);
    } else if (!captionMatched) {
      continue;
    } else {
      console.log(`[checkToon] 캡션 매칭 — 키워드(${matchedWords.join(', ')})${captionIsComplete ? ' +완결' : ''} | caption: "${caption.slice(0, 60)}"`);
    }

    const isViaOCR = analysisText !== caption;
    let ep = isViaOCR
      ? extractEpisodeNumberFromOCR(analysisText)
      : extractEpisodeNumber(analysisText);

    if (!isViaOCR && ep === null && !toon.isComplete) {
      console.log(`[checkToon] 캡션에 화수 없음 → OCR 폴백 시도`);
      const ocrText = await extractTextFromImage(post.thumbnailUrl, post.id);
      const ocrEp = extractEpisodeNumberFromOCR(ocrText);
      if (ocrEp !== null) {
        ep = ocrEp;
        analysisText = ocrText;
      }
    }

    const isComplete = isCompleteEpisode(analysisText);
    if (isComplete && ep === null) {
      ep = runningMaxEp + 1;
      console.log(`[checkToon] 완결 감지 → 가상 화수: ${ep}`);
    }

    if (ep !== null && ep > runningMaxEp) runningMaxEp = ep;

    if (ep !== null && ep <= (toon.readEpisode || 0)) {
      console.log(`[checkToon] ep=${ep} <= readEpisode=${toon.readEpisode || 0} → 중단`);
      break;
    }

    const alreadyCollected = collected.some((c) => c.ep === ep);
    const alreadyInUnread = (toon.unreadPosts || []).some((p) => p.episode === ep);
    const isNewEpisode =
      ep !== null &&
      ep > (toon.readEpisode || 0) &&
      !alreadyCollected &&
      !alreadyInUnread;

    console.log(`[checkToon] ep=${ep} isComplete=${isComplete} isNewEpisode=${isNewEpisode}`);

    if (isNewEpisode) {
      collected.push({ ep, url: post.url, post, isComplete });
    }
  }

  if (collected.length > 0) {
    const maxEp = runningMaxEp;
    const lastEntry = collected[0];
    const anyComplete = collected.some((e) => e.isComplete) || isAbandoned;

    let episodeHistory = buildEpisodeHistory(toon, allPosts);
    for (const { ep, url } of collected) {
      if (!episodeHistory.find((h) => h.episode === ep)) {
        episodeHistory.push({ episode: ep, url });
      }
    }
    episodeHistory.sort((a, b) => a.episode - b.episode);

    const unreadPosts = buildUnreadPosts(toon, allPosts);
    for (const { ep, url } of collected) {
      if (!unreadPosts.find((p) => p.episode === ep)) {
        unreadPosts.push({ episode: ep, url });
      }
    }
    unreadPosts.sort((a, b) => a.episode - b.episode);

    const deferComplete = anyComplete && unreadPosts.length > 0;

    await updateToon(toon.id, {
      hasNewEpisode: true,
      lastEpisode: maxEp,
      ...(anyComplete ? { isComplete: true } : {}),
      pendingComplete: deferComplete,
      lastPostId: lastEntry.post.id,
      lastEpisodeTitle: (lastEntry.post.caption || "").slice(0, 80),
      lastThumbnailUrl: lastEntry.post.thumbnailUrl,
      lastPostUrl: lastEntry.post.url,
      unreadPosts,
      episodeHistory,
    });

    if (!toon.hasNewEpisode) {
      supabase
        .from("toons")
        .update({
          has_new_episode: true,
          last_episode: maxEp,
          last_post_url: lastEntry.post.url,
          unread_posts: unreadPosts.map((p) => ({ episode: p.episode, url: p.url })),
          updated_at: new Date().toISOString(),
        })
        .eq("id", toon.id)
        .then(({ error }) => {
          if (error) console.warn("[checkToon] Supabase 업데이트 실패:", error.message);
        });

      await sendLocalNotification(
        toon.seriesName,
        collected.map((e) => e.ep),
        anyComplete && !deferComplete,
      );
    }

    return { found: true, episodes: collected.map((e) => e.ep) };
  }

  const historyUpdates = buildEpisodeHistory(toon, allPosts);
  const historyGrew = historyUpdates.length > (toon.episodeHistory || []).length;
  const newestPost = posts[posts.length - 1];

  const anySeriesPost = allPosts.some((p) =>
    allWords.some((w) => (p.caption || "").includes(w)),
  );
  const shouldBeUndetectable = !anySeriesPost && allPosts.length > 0;
  if (shouldBeUndetectable !== !!toon.undetectable) {
    await updateToon(toon.id, { undetectable: shouldBeUndetectable });
  }

  await updateToon(toon.id, {
    ...(newestPost && !toon.lastPostId ? { lastPostId: newestPost.id } : {}),
    ...(historyGrew ? { episodeHistory: historyUpdates } : {}),
    ...(isAbandoned && !toon.isComplete ? { isComplete: true } : {}),
  });
  if (isAbandoned && !toon.isComplete) {
    console.log(`[checkToon] @${toon.username} 3주 이상 업데이트 없음 → 완결 처리`);
  }
  return { found: false, undetectable: shouldBeUndetectable };
}

export async function checkAllToons(onProgress, { forceAll = false } = {}) {
  const toons = await getToons();
  let updated = false;

  for (const toon of toons) {
    if (toon.isComplete) continue;
    if (toon.undetectable && !forceAll) continue;
    try {
      onProgress?.(`@${toon.username} 확인 중...`);
      const result = await checkToon(toon);
      if (result.found) updated = true;
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    } catch (err) {
      console.warn(`@${toon.username} 확인 실패:`, err.message);
    }
  }

  return updated;
}
