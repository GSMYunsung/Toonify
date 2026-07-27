import { fetchLatestPosts } from "./instagram-api";
import {
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  isCompleteEpisode,
} from "../hooks/useKeywordDetector";
import { extractTextFromImage } from "./ocr-service";
import { getToons, updateToon } from "./toon-store";
import { sendLocalNotification } from "./notifications";
import { supabase } from "./supabase";

export function buildEpisodeHistory(toon, allPosts) {
  const existing = {};
  for (const h of (toon.episodeHistory || [])) {
    existing[h.episode] = h;
  }
  const allWords = toon.seriesName.split(/\s+/).filter((w) => w.length >= 2);
  for (const post of allPosts) {
    const cap = post.caption || '';
    if (!allWords.some((w) => cap.includes(w))) continue;
    const ep = extractEpisodeNumber(cap);
    if (ep !== null && !existing[ep]) {
      existing[ep] = { episode: ep, url: post.url };
    }
  }
  return Object.values(existing).sort((a, b) => a.episode - b.episode);
}

export function buildUnreadPosts(toon, allPosts) {
  const readEp = toon.readEpisode || 0;
  const allWords = toon.seriesName.split(/\s+/).filter((w) => w.length >= 2);
  const seen = new Set();
  const result = [];
  let maxFoundEp = toon.lastEpisode || 0;

  const sorted = [...allPosts].sort((a, b) => a.timestamp - b.timestamp);

  for (const post of sorted) {
    const cap = post.caption || '';
    const captionIsComplete = isCompleteEpisode(cap);
    const matched = captionIsComplete || allWords.some((w) => cap.includes(w));
    if (!matched) continue;

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

  const ocr = (imageUrl) => extractTextFromImage(imageUrl);

  const allPosts = await fetchLatestPosts(toon.username);
  const allPostsOldestFirst = [...allPosts].sort((a, b) => a.timestamp - b.timestamp);
  const posts = allPostsOldestFirst;

  console.log(`[checkToon] @${toon.username} — 검사대상 ${posts.length}개 (오래된 순)`);

  const collected = [];
  let runningMaxEp = toon.lastEpisode || 0;

  for (const post of posts) {
    const caption = post.caption || "";
    const allWords = toon.seriesName.split(/\s+/).filter((w) => w.length >= 2);
    const words3up = allWords.filter((w) => w.length >= 3);
    const keyWords = words3up.length >= 1
      ? words3up
      : [...allWords].sort((a, b) => b.length - a.length).slice(0, 2);
    const captionTokens = new Set(
      caption.split(/\s+/).map((t) => t.replace(/^[^가-힣a-zA-Z0-9]+|[^가-힣a-zA-Z0-9]+$/g, ""))
    );
    const minMatch = Math.min(2, keyWords.length);
    const matchThreshold = Math.min(3, keyWords.length);
    const matchCount = keyWords.filter((w) => captionTokens.has(w)).length;
    const captionIsComplete = isCompleteEpisode(caption);
    const captionMatched = captionIsComplete || matchCount >= minMatch;

    let analysisText = caption;

    if (!captionMatched && !toon.isComplete) {
      console.log(`[checkToon] 캡션에 키워드 부족(${matchCount}/${minMatch}) → OCR 시도`);
      const ocrText = await ocr(post.thumbnailUrl);
      const ocrMatched = allWords.some((w) => ocrText.includes(w)) || isCompleteEpisode(ocrText);
      if (!ocrMatched) {
        console.log(`[checkToon] OCR에도 키워드 없음 → 건너뜀`);
        continue;
      }
      analysisText = ocrText;
      console.log(`[checkToon] OCR에서 키워드 확인됨`);
    } else if (!captionMatched) {
      continue;
    }

    const isOCR = analysisText !== caption;
    let ep = isOCR
      ? extractEpisodeNumberFromOCR(analysisText)
      : extractEpisodeNumber(analysisText);

    if (captionMatched && ep === null && !toon.isComplete) {
      console.log(`[checkToon] 캡션에 화수 없음 → OCR 폴백 시도`);
      const ocrText = await ocr(post.thumbnailUrl);
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

    const alreadyCollected = collected.some((c) => c.ep === ep);
    const alreadyInUnread = (toon.unreadPosts || []).some((p) => p.episode === ep);
    const isNewEpisode = ep !== null && ep > (toon.readEpisode || 0) && !alreadyCollected && !alreadyInUnread;

    console.log(`[checkToon] ep=${ep} isComplete=${isComplete} isNewEpisode=${isNewEpisode}`);

    if (isNewEpisode) {
      collected.push({ ep, url: post.url, post, isComplete });
    }
  }

  if (collected.length > 0) {
    const maxEp = runningMaxEp;
    const lastEntry = collected[collected.length - 1];
    const anyComplete = collected.some((e) => e.isComplete);

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
      supabase.from('toons').update({
        has_new_episode: true,
        last_episode: maxEp,
        last_post_url: lastEntry.post.url,
        unread_posts: unreadPosts.map((p) => ({ episode: p.episode, url: p.url })),
        updated_at: new Date().toISOString(),
      }).eq('id', toon.id).then(({ error }) => {
        if (error) console.warn('[checkToon] Supabase 업데이트 실패:', error.message);
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
  const newestPost = allPostsOldestFirst[allPostsOldestFirst.length - 1];

  const allSeriesWords = toon.seriesName.split(/\s+/).filter((w) => w.length >= 2);
  const anySeriesPost = allPosts.some((p) =>
    allSeriesWords.some((w) => (p.caption || '').includes(w))
  );
  const shouldBeUndetectable = !anySeriesPost && allPosts.length > 0;
  if (shouldBeUndetectable !== !!toon.undetectable) {
    await updateToon(toon.id, { undetectable: shouldBeUndetectable });
  }

  await updateToon(toon.id, {
    ...(newestPost && !toon.lastPostId ? { lastPostId: newestPost.id } : {}),
    ...(historyGrew ? { episodeHistory: historyUpdates } : {}),
  });
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
