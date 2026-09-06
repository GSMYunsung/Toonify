import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { sendLocalNotification } from "./notifications";
import { markStart, markEnd, countRender } from "../utils/perf";

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

// ── 인메모리 캐시 + 쓰기 큐 ──────────────────────────────────────
// cache: AsyncStorage의 toons 배열을 메모리에 미러링 (null = 아직 미로딩)
// queue: 모든 읽기-수정-저장 작업을 한 줄로 직렬화하는 mutex 역할
let cache = null;
let queue = Promise.resolve();

function enqueue(task) {
  const result = queue.then(task, task);
  // 이전 작업이 실패해도 큐 자체는 계속 이어지게 별도로 흡수
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// 내부 전용 — 큐 안에서만 호출할 것. 캐시가 없으면 1회 디스크에서 로드.
async function loadToons() {
  if (cache === null) {
    countRender('getToons() [cache miss — AsyncStorage 실제 읽기]');
    try {
      markStart('AsyncStorage.getItem');
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      markEnd('AsyncStorage.getItem');
      cache = JSON.parse(data || "[]");
    } catch (e) {
      console.warn('[toon-store] 목록 읽기 실패, 빈 목록으로 시작:', e.message);
      cache = [];
    }
  }
  return cache;
}

// 내부 전용 — 큐 안에서만 호출할 것.
async function persist(toons) {
  cache = toons;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toons));
  } catch (e) {
    console.warn('[toon-store] 저장 실패(메모리엔 반영됨, 앱 재시작 시 유실 가능):', e.message);
  }
}

// 테스트 전용 — AsyncStorage를 직접 조작하는 테스트(seedToon 등)가
// 이전 테스트의 인메모리 캐시를 보고 오는 걸 막기 위한 리셋 훅.
export function __resetToonCache() {
  cache = null;
  queue = Promise.resolve();
}

export async function getToons() {
  countRender('getToons()');
  return enqueue(async () => {
    const toons = await loadToons();
    // 외부에는 캐시와 독립된 복사본을 준다 — 호출부가 들고 있는 배열/객체가
    // 나중에 다른 mutation으로 캐시가 바뀔 때 같이 변해버리는 걸 방지.
    return JSON.parse(JSON.stringify(toons));
  });
}

export async function addToon(data) {
  return enqueue(async () => {
    const toons = await loadToons();
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
    await persist(toons);

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
  });
}

export async function deleteToon(id) {
  await enqueue(async () => {
    const toons = await loadToons();
    await persist(toons.filter((t) => t.id !== id));
  });

  supabase.from('toons').delete().eq('id', id)
    .then(({ error }) => { if (error) console.warn('[Supabase] deleteToon 실패:', error.message); });
}

export async function markAsRead(id) {
  const updated = await enqueue(async () => {
    const toons = await loadToons();
    const t = toons.find((t) => t.id === id);
    if (!t) return null;
    t.hasNewEpisode = false;
    t.readEpisode = t.lastEpisode || t.readEpisode || 0;
    t.updatedAt = new Date().toISOString();
    await persist(toons);
    return t;
  });

  if (updated) {
    supabase.from('toons').update({
      has_new_episode: false,
      read_episode: updated.readEpisode,
      updated_at: updated.updatedAt,
    }).eq('id', id)
      .then(({ error }) => { if (error) console.warn('[Supabase] markAsRead 실패:', error.message); });
  }
}

export async function updateToon(id, updates) {
  return enqueue(async () => {
    const toons = await loadToons();
    const idx = toons.findIndex((t) => t.id === id);
    if (idx === -1) return;
    toons[idx] = {
      ...toons[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await persist(toons);
    return toons[idx];
  });
}

export async function getSortedToons() {
  const toons = await getToons();
  return toons.sort((a, b) => {
    if (a.hasNewEpisode !== b.hasNewEpisode) return a.hasNewEpisode ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

export async function advanceEpisode(id, episode, remainingPosts) {
  const result = await enqueue(async () => {
    const toons = await loadToons();
    const t = toons.find((t) => t.id === id);
    if (!t) return null;

    // 방금 읽은 화수(episode 이하)를 unreadPosts에서 episodeHistory로 이동
    const nowRead = (t.unreadPosts || []).filter((p) => p.episode !== null && p.episode <= episode);
    const historyMap = {};
    for (const h of (t.episodeHistory || [])) historyMap[h.episode] = h;
    for (const ep of nowRead) {
      if (!(ep.episode in historyMap)) historyMap[ep.episode] = { episode: ep.episode, url: ep.url };
    }
    t.episodeHistory = Object.values(historyMap).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

    t.readEpisode = episode;
    t.unreadPosts = remainingPosts;
    t.hasNewEpisode = remainingPosts.length > 0;
    t.updatedAt = new Date().toISOString();

    // 유예됐던 완결 알림 — 마지막 화수를 읽는 순간 완결 알림 전송
    let shouldNotifyComplete = false;
    if (t.pendingComplete && remainingPosts.length === 0) {
      t.pendingComplete = false;
      shouldNotifyComplete = true;
    }

    await persist(toons);
    return { t, shouldNotifyComplete };
  });

  if (!result) return;
  const { t, shouldNotifyComplete } = result;

  if (shouldNotifyComplete) {
    sendLocalNotification(t.seriesName, episode, true);
  }

  supabase.from('toons').update({
    read_episode: episode,
    has_new_episode: remainingPosts.length > 0,
    unread_posts: remainingPosts,
    updated_at: t.updatedAt,
  }).eq('id', id).then(({ error }) => {
    if (error) console.warn('[Supabase] advanceEpisode 실패:', error.message);
  });
}

export async function applyNotificationUpdates(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return;
  await enqueue(async () => {
    const toons = await loadToons();
    let changed = false;
    for (const { toonId, unreadPosts, isComplete } of updates) {
      const t = toons.find((t) => t.id === toonId);
      if (!t || !Array.isArray(unreadPosts) || unreadPosts.length === 0) continue;
      t.hasNewEpisode = true;
      t.unreadPosts = unreadPosts;
      if (isComplete) t.isComplete = true;
      changed = true;
    }
    if (changed) await persist(toons);
  });
}

export async function syncFromSupabase() {
  try {
    const deviceId = await getDeviceId();
    const { data: remoteToons } = await supabase
      .from('toons')
      .select('id, has_new_episode, last_episode, last_post_url, unread_posts, is_complete, updated_at')
      .eq('device_id', deviceId);

    if (!remoteToons?.length) return;

    await enqueue(async () => {
      const toons = await loadToons();
      let changed = false;

      for (const remote of remoteToons) {
        const local = toons.find((t) => t.id === remote.id);
        if (!local) continue;

        const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
        const remoteIsNewer = remoteTime > localTime;

        if (remote.has_new_episode && remoteIsNewer) {
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
          if (Array.isArray(remote.unread_posts) && remote.unread_posts.length > 0) {
            local.unreadPosts = remote.unread_posts;
            changed = true;
          }
        }
        if (remote.is_complete && !local.isComplete) {
          local.isComplete = true;
          changed = true;
        }
      }

      if (changed) await persist(toons);
    });
  } catch (e) {
    console.warn('[syncFromSupabase] 실패:', e.message);
  }
}
