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

function buildUnreadPosts(toon, allPosts) {
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
  await save(toons);

  supabase.from('toons').update({
    read_episode: episode,
    has_new_episode: remainingPosts.length > 0,
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

  const allPosts = await fetchLatestPosts(toon.username);
  const posts = [...allPosts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  // 첫 체크(lastPostId 없음)는 기준점만 저장하고 알림 안 보냄
  if (!toon.lastPostId && posts.length > 0) {
    await updateToon(toon.id, { lastPostId: posts[0].id });
    return { found: false };
  }
  console.log(
    `[checkToon] @${toon.username} — 포스트 ${allPosts.length}개 중 최신 ${posts.length}개 확인`,
  );

  for (const post of posts) {
    const caption = post.caption || "";
    const allWords = toon.seriesName.split(/\s+/).filter((w) => w.length >= 2);
    // 캡션 매칭엔 가장 긴 단어 최대 2개만 사용 (변별력 강화, 흔한 짧은 단어 오탐 방지)
    const keyWords = [...allWords].sort((a, b) => b.length - a.length).slice(0, 2);
    const captionMatched = keyWords.some((w) => caption.includes(w));

    let analysisText = caption;

    if (!captionMatched) {
      console.log(`[checkToon] 캡션에 키워드 없음 → OCR 시도`);
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      // OCR은 노이즈가 많으므로 모든 단어로 관대하게 매칭
      const ocrMatched = allWords.some((w) => ocrText.includes(w));
      if (!ocrMatched) {
        console.log(`[checkToon] OCR에도 키워드 없음 → 건너뜀`);
        continue;
      }
      analysisText = ocrText;
      console.log(`[checkToon] OCR에서 키워드 확인됨`);
    }

    const isOCR = analysisText !== caption;
    let ep = isOCR
      ? extractEpisodeNumberFromOCR(analysisText)
      : extractEpisodeNumber(analysisText);

    // 캡션에 키워드는 있지만 화수가 없을 때 → OCR로 재시도
    if (captionMatched && ep === null) {
      console.log(`[checkToon] 캡션에 화수 없음 → OCR 폴백 시도`);
      const ocrText = await extractTextFromImage(post.thumbnailUrl);
      const ocrEp = extractEpisodeNumberFromOCR(ocrText);
      if (ocrEp !== null) {
        ep = ocrEp;
        analysisText = ocrText;
      }
    }

    const isComplete = isCompleteEpisode(analysisText);

    // "완"/"완결"만 있고 숫자가 없을 때 → 마지막화 + 1로 처리
    if (isComplete && ep === null) {
      ep = (toon.lastEpisode || 0) + 1;
      console.log(`[checkToon] 완결 감지 → 가상 화수: ${ep}`);
    }

    const isNewEpisode = ep !== null && ep > (toon.lastEpisode || 0);
    const isNewPost = ep === null && post.id && post.id !== toon.lastPostId;

    console.log(
      `[checkToon] ep=${ep} isComplete=${isComplete} isNewEpisode=${isNewEpisode} isNewPost=${isNewPost}`,
    );

    if (isNewEpisode || isNewPost) {
      const unreadPosts = buildUnreadPosts(toon, allPosts);
      await updateToon(toon.id, {
        hasNewEpisode: true,
        ...(isNewEpisode ? { lastEpisode: ep } : {}),
        lastPostId: post.id,
        lastEpisodeTitle: caption.slice(0, 80),
        lastThumbnailUrl: post.thumbnailUrl,
        lastPostUrl: post.url,
        unreadPosts,
      });
      if (!toon.hasNewEpisode) {
        await sendLocalNotification(
          toon.seriesName,
          isNewEpisode ? ep : null,
          isComplete,
        );
      }
      return { found: true, episode: ep, post };
    }
  }

  return { found: false };
}

// 배치가 Supabase를 업데이트했지만 로컬에 반영 안 된 경우 동기화
export async function syncFromSupabase() {
  try {
    const deviceId = await getDeviceId();
    const { data: remoteToons } = await supabase
      .from('toons')
      .select('id, has_new_episode, last_episode')
      .eq('device_id', deviceId);

    if (!remoteToons?.length) return;

    const toons = await getToons();
    let changed = false;

    for (const remote of remoteToons) {
      const local = toons.find((t) => t.id === remote.id);
      if (!local) continue;
      if (remote.has_new_episode && !local.hasNewEpisode) {
        local.hasNewEpisode = true;
        if (remote.last_episode > (local.lastEpisode || 0)) {
          local.lastEpisode = remote.last_episode;
        }
        changed = true;
      }
    }

    if (changed) await save(toons);
  } catch (e) {
    console.warn('[syncFromSupabase] 실패:', e.message);
  }
}

// hasNewEpisode는 있는데 unreadPosts가 없는 툰의 링크 목록 채우기
export async function fillMissingUnreadPosts() {
  const toons = await getToons();
  const needsFill = toons.filter(
    (t) => t.hasNewEpisode && (!t.unreadPosts || t.unreadPosts.length === 0)
  );

  for (const toon of needsFill) {
    try {
      const allPosts = await fetchLatestPosts(toon.username);
      const unreadPosts = buildUnreadPosts(toon, allPosts);
      if (unreadPosts.length > 0) {
        await updateToon(toon.id, { unreadPosts });
      }
    } catch (e) {
      console.warn(`[fillMissingUnreadPosts] @${toon.username} 실패:`, e.message);
    }
  }
}

export async function checkAllToons(onProgress) {
  const toons = await getToons();
  let updated = false;

  for (const toon of toons) {
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

async function sendLocalNotification(seriesName, episode, isComplete = false) {
  const title = isComplete
    ? `📚 ${seriesName} 완결!`
    : `📚 ${seriesName} 새 편!`;
  let body;
  if (isComplete) {
    body =
      episode != null
        ? `${episode}화로 완결됐어요. 지금 확인해보세요!`
        : `완결됐어요. 지금 확인해보세요!`;
  } else if (episode != null) {
    body = `${episode}화가 올라왔어요. 지금 확인해보세요!`;
  } else {
    body = `새 게시물이 올라왔어요. 지금 확인해보세요!`;
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
