import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { sendLocalNotification } from "./notifications";

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

export async function updateToon(id, updates) {
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

export async function advanceEpisode(id, episode, remainingPosts) {
  const toons = await getToons();
  const t = toons.find((t) => t.id === id);
  if (!t) return;

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
  if (t.pendingComplete && remainingPosts.length === 0) {
    t.pendingComplete = false;
    sendLocalNotification(t.seriesName, episode, true);
  }

  await save(toons);

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
  const toons = await getToons();
  let changed = false;
  for (const { toonId, unreadPosts, isComplete } of updates) {
    const t = toons.find((t) => t.id === toonId);
    if (!t || !Array.isArray(unreadPosts) || unreadPosts.length === 0) continue;
    t.hasNewEpisode = true;
    t.unreadPosts = unreadPosts;
    if (isComplete) t.isComplete = true;
    changed = true;
  }
  if (changed) await save(toons);
}

export async function syncFromSupabase() {
  try {
    const deviceId = await getDeviceId();
    const { data: remoteToons } = await supabase
      .from('toons')
      .select('id, has_new_episode, last_episode, last_post_url, unread_posts, is_complete, updated_at')
      .eq('device_id', deviceId);

    if (!remoteToons?.length) return;

    const toons = await getToons();
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

    if (changed) await save(toons);
  } catch (e) {
    console.warn('[syncFromSupabase] 실패:', e.message);
  }
}
