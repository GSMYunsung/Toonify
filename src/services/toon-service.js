import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { fetchLatestPosts } from "./instagram-api";
import {
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  isCompleteEpisode,
} from "../hooks/useKeywordDetector";
import { extractTextFromImage } from "./ocr-service";
import { supabase } from "./supabase";

const STORAGE_KEY = "toon_notifier_v2";
const DEVICE_ID_KEY = "device_id";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getDeviceId() {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const newId = uuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return uuid();
  }
}

export async function getToons() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return JSON.parse(data || "[]");
  } catch {
    return [];
  }
}

async function save(toons) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toons));
}

export async function addToon(data) {
  const toons = await getToons();
  const newToon = {
    id: uuid(),
    ...data,
    readEpisode: data.lastEpisode || 0,
    hasNewEpisode: false,
    episodeHistory: data.episodeHistory || [],
    lastThumbnailUrl: null,
    lastPostId: null,
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  toons.push(newToon);
  await save(toons);

  getDeviceId().then(deviceId => {
    supabase.from('toons').insert({
      id: newToon.id,
      username: newToon.username,
      series_name: newToon.seriesName,
      last_episode: newToon.lastEpisode || 0,
      read_episode: newToon.readEpisode || 0,
      has_new_episode: false,
      device_id: deviceId,
      added_at: newToon.addedAt,
      updated_at: newToon.updatedAt,
    }).then(({ error }) => { if (error) console.warn('[Supabase] addToon 실패:', error.message); });
  });

  return newToon;
}

export async function updateToonInfo(id, { seriesName, lastEpisode }) {
  const toons = await getToons();
  const t = toons.find((t) => t.id === id);
  if (!t) return;
  t.seriesName = seriesName;
  t.lastEpisode = lastEpisode;
  t.readEpisode = lastEpisode;
  t.updatedAt = new Date().toISOString();
  await save(toons);

  supabase.from('toons').update({
    series_name: seriesName,
    last_episode: lastEpisode,
    read_episode: lastEpisode,
    updated_at: t.updatedAt,
  }).eq('id', id).then(({ error }) => {
    if (error) console.warn('[Supabase] updateToonInfo 실패:', error.message);
  });
}

export async function deleteToon(id) {
  const toons = await getToons();
  await save(toons.filter((t) => t.id !== id));

  supabase.from('toons').delete().eq('id', id)
    .then(({ error }) => { if (error) console.warn('[Supabase] deleteToon 실패:', error.message); });
}

export async function markAsRead(id) {
  const toons = await getToons();
  const t = toons.find((t) => t.id === id);
  if (t) {
    t.hasNewEpisode = false;
    t.readEpisode = t.lastEpisode || t.readEpisode || 0;
    t.updatedAt = new Date().toISOString();
    await save(toons);

    supabase.from('toons').update({
      has_new_episode: false,
      read_episode: t.readEpisode,
      updated_at: t.updatedAt,
    }).eq('id', id)
      .then(({ error }) => { if (error) console.warn('[Supabase] markAsRead 실패:', error.message); });
  }
}

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

  for (const post of allPosts) {
    const cap = post.caption || '';
    const matched = allWords.some((w) => cap.includes(w));
    if (!matched) continue;
    const ep = extractEpisodeNumber(cap);
    if (ep !== null && ep > readEp && !seen.has(ep)) {
      seen.add(ep);
      result.push({ episode: ep, url: post.url });
    }
  }

  return result.sort((a, b) => a.episode - b.episode);
}

export async function advanceEpisode(id, episode, remainingPosts) {
  const toons = await getToons();
  const t = toons.find((t) => t.id === id);
  if (!t) return;
  t.readEpisode = episode;
  t.unreadPosts = remainingPosts;
  t.hasNewEpisode = remainingPosts.length > 0;
  t.updatedAt = new Date().toISOString();

  // 유예됐던 완결 알림 — 마지막 화수를 읽는 순간 완결 알림 전송
  if (t.pendingComplete && remainingPosts.length === 0) {
    t.pendingComplete = false;
    sendLocalNotification(t.seriesName, episode, true);
  }

  await save(toons);

  supabase.from('toons').update({
    read_episode: episode,
    has_new_episode: remainingPosts.length > 0,
    unread_posts: remainingPosts,   // 읽은 화 제거된 목록으로 동기화
    updated_at: t.updatedAt,
  }).eq('id', id).then(({ error }) => {
    if (error) console.warn('[Supabase] advanceEpisode 실패:', error.message);
  });
}

async function updateToon(id, updates) {
  const toons = await getToons();
  const idx = toons.findIndex((t) => t.id === id);
  if (idx === -1) return;
  toons[idx] = {
    ...toons[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await save(toons);
  return toons[idx];
}

export async function getSortedToons() {
  const toons = await getToons();
  return toons.sort((a, b) => {
    if (a.hasNewEpisode !== b.hasNewEpisode) return a.hasNewEpisode ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

export async function checkToon(toonInput) {
  // 항상 최신 저장 데이터로 비교 (stale props 방지)
  const stored = await getToons();
  const toon = stored.find((t) => t.id === toonInput.id) ?? toonInput;

  const ocr = (imageUrl) => extractTextFromImage(imageUrl);

  const allPosts = await fetchLatestPosts(toon.username);
  const allPostsOldestFirst = [...allPosts].sort((a, b) => a.timestamp - b.timestamp);

  // 12개 전체를 오래된 순으로 검사 — ep > lastEpisode 비교가 필터 역할
  const posts = allPostsOldestFirst;

  console.log(`[checkToon] @${toon.username} — 검사대상 ${posts.length}개 (오래된 순)`);

  // 이번 체크에서 발견한 새 에피소드 목록 { ep, url, post, isComplete }
  const collected = [];
  // 루프 내에서 누적 최고 화수 추적 (synthetic ep 계산에 사용)
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
    // 완결 표시가 캡션에 있으면 시리즈명 키워드 없어도 통과
    const captionIsComplete = isCompleteEpisode(caption);
    const captionMatched = captionIsComplete || matchCount >= minMatch;
    const strongMatch = matchCount >= matchThreshold;

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

    // runningMaxEp는 완결 synthetic ep 계산용으로만 사용 (lastEpisode 포함 최댓값 추적)
    if (ep !== null && ep > runningMaxEp) runningMaxEp = ep;

    const alreadyCollected = collected.some((c) => c.ep === ep);
    const alreadyInUnread = (toon.unreadPosts || []).some((p) => p.episode === ep);
    // readEpisode 기준 비교 — 3화 먼저 감지 후 2화도 unread면 true
    const isNewEpisode = ep !== null && ep > (toon.readEpisode || 0) && !alreadyCollected && !alreadyInUnread;

    console.log(`[checkToon] ep=${ep} isComplete=${isComplete} isNewEpisode=${isNewEpisode}`);

    if (isNewEpisode) {
      collected.push({ ep, url: post.url, post, isComplete });
    }
  }

  // ── 새 화수가 하나라도 발견된 경우 ──
  if (collected.length > 0) {
    const maxEp = runningMaxEp;
    const lastEntry = collected[collected.length - 1];
    const anyComplete = collected.some((e) => e.isComplete);

    // episodeHistory: 기존 + 이번에 발견한 모든 화수 병합
    let episodeHistory = buildEpisodeHistory(toon, allPosts);
    for (const { ep, url } of collected) {
      if (!episodeHistory.find((h) => h.episode === ep)) {
        episodeHistory.push({ episode: ep, url });
      }
    }
    episodeHistory.sort((a, b) => a.episode - b.episode);

    // unreadPosts: 캡션 기반 + OCR 감지분 병합
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
      await sendLocalNotification(
        toon.seriesName,
        collected.map((e) => e.ep),
        anyComplete && !deferComplete,
      );
    }

    return { found: true, episodes: collected.map((e) => e.ep) };
  }

  // ── 새 화수 없음 ──
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

// 배치가 Supabase를 업데이트했지만 로컬에 반영 안 된 경우 동기화
// 알림 data 페이로드로 로컬 스토어 즉시 업데이트 (네트워크 호출 없음)
export async function applyNotificationUpdates(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return;
  const toons = await getToons();
  let changed = false;
  for (const { toonId, unreadPosts } of updates) {
    const t = toons.find((t) => t.id === toonId);
    if (!t || !Array.isArray(unreadPosts) || unreadPosts.length === 0) continue;
    t.hasNewEpisode = true;
    t.unreadPosts = unreadPosts;
    changed = true;
  }
  if (changed) await save(toons);
}

export async function syncFromSupabase() {
  try {
    const deviceId = await getDeviceId();
    const { data: remoteToons } = await supabase
      .from('toons')
      .select('id, has_new_episode, last_episode, last_post_url, unread_posts')
      .eq('device_id', deviceId);

    if (!remoteToons?.length) return;

    const toons = await getToons();
    let changed = false;

    for (const remote of remoteToons) {
      const local = toons.find((t) => t.id === remote.id);
      if (!local) continue;
      if (remote.has_new_episode) {
        if (!local.hasNewEpisode) {
          local.hasNewEpisode = true;
          changed = true;
        }
        if (remote.last_episode > (local.lastEpisode || 0)) {
          local.lastEpisode = remote.last_episode;
          changed = true;
        }
        if (remote.last_post_url && remote.last_post_url !== local.lastPostUrl) {
          local.lastPostUrl = remote.last_post_url;
          changed = true;
        }
        // 서버가 만들어준 unread_posts가 있으면 바로 반영
        if (Array.isArray(remote.unread_posts) && remote.unread_posts.length > 0) {
          local.unreadPosts = remote.unread_posts;
          changed = true;
        }
      }
    }

    if (changed) await save(toons);
  } catch (e) {
    console.warn('[syncFromSupabase] 실패:', e.message);
  }
}

// unreadPosts가 없는 툰만 채우기 — 이미 있으면 덮어쓰지 않음
export async function fillMissingUnreadPosts() {
  const toons = await getToons();
  const needsFill = toons.filter((t) => t.hasNewEpisode && !(t.unreadPosts?.length > 0));

  for (const toon of needsFill) {
    try {
      const allPosts = await fetchLatestPosts(toon.username);
      let unreadPosts = buildUnreadPosts(toon, allPosts);

      // 캡션 매칭 실패 시 — 서버가 감지한 마지막 게시물 URL로 fallback
      if (unreadPosts.length === 0 && toon.lastPostUrl) {
        const ep = toon.lastEpisode && toon.lastEpisode > (toon.readEpisode || 0)
          ? toon.lastEpisode
          : null;
        unreadPosts = [{ episode: ep, url: toon.lastPostUrl }];
      }

      if (unreadPosts.length > 0) {
        await updateToon(toon.id, { unreadPosts });
      }
    } catch (e) {
      console.warn(`[fillMissingUnreadPosts] @${toon.username} 실패:`, e.message);
    }
  }
}

export async function checkAllToons(onProgress, { forceAll = false } = {}) {
  const toons = await getToons();
  let updated = false;

  for (const toon of toons) {
    // 완결 툰은 항상 제외. undetectable은 자동확인 시만 제외(수동 새로고침이면 재시도)
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

async function sendLocalNotification(seriesName, episodes, isComplete = false) {
  const epList = Array.isArray(episodes)
    ? episodes
    : episodes != null ? [episodes] : [];

  const title = seriesName;
  let body;
  if (isComplete) {
    body = epList.length > 0
      ? `${epList[epList.length - 1]}화로 완결됐어요!`
      : `완결됐어요!`;
  } else if (epList.length > 1) {
    const sorted = [...epList].sort((a, b) => a - b);
    body = `${sorted[0]}화~${sorted[sorted.length - 1]}화가 나왔어요!`;
  } else if (epList.length === 1) {
    body = `${epList[0]}화가 나왔어요!`;
  } else {
    body = `새 편이 나왔어요!`;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' && { channelId: 'default' }),
    },
    trigger: null,
  });
}

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}
