import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  ActivityIndicator,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import {
  getSortedToons,
  checkAllToons,
  syncFromSupabase,
  applyNotificationUpdates,
} from "../services/toon-service";
import ToonCard from "../components/ToonCard";
import AddToonModal from "../components/AddToonModal";
import EmptyState from "../components/EmptyState";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../theme";

function relativeTime(ts) {
  if (!ts) return "동기화 전";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return "방금 전";
  if (diff < 60) return diff + "초 전";
  if (diff < 3600) return Math.floor(diff / 60) + "분 전";
  return Math.floor(diff / 3600) + "시간 전";
}

export default function HomeScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const [toons, setToons] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingToon, setEditingToon] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [toast, setToast] = useState(null);
  const toastTO = useRef(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);
  const lastProcessedNotifId = useRef(null);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTO.current);
    setToast(msg);
    toastTO.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const loadToons = useCallback(async () => {
    const sorted = await getSortedToons();
    setToons(sorted);
  }, []);

  useEffect(() => {
    const handleNotification = async (notification) => {
      const notifId = notification?.request?.identifier;
      if (notifId && lastProcessedNotifId.current === notifId) return;
      if (notifId) lastProcessedNotifId.current = notifId;

      const updates = notification?.request?.content?.data?.updates;
      if (updates) {
        await applyNotificationUpdates(updates);
        await loadToons();
      }
    };

    const init = async () => {
      try {
        // 앱 실행 시 알림 payload가 있으면 로컬에 바로 반영 — 네트워크 없음
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const notifTime = lastResponse.notification?.date ?? 0;
          const isFresh = Date.now() - notifTime * 1000 < 5 * 60 * 1000;
          const updates = lastResponse.notification?.request?.content?.data?.updates;
          if (isFresh && updates) {
            lastProcessedNotifId.current = lastResponse.notification?.request?.identifier;
            await applyNotificationUpdates(updates);
          }
        }
      } catch (e) {
        console.warn('[init] 알림 처리 실패 (무시):', e.message);
      } finally {
        await loadToons();
        setInitialLoading(false);
      }
    };
    init();

    const notifReceived = Notifications.addNotificationReceivedListener(
      (n) => handleNotification(n),
    );
    const notifResponse = Notifications.addNotificationResponseReceivedListener(
      (r) => handleNotification(r.notification),
    );

    // 백그라운드 → 포그라운드 복귀 시 툰 목록 재로드
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') loadToons();
    });

    return () => {
      notifReceived.remove();
      notifResponse.remove();
      appStateSub.remove();
      clearTimeout(toastTO.current);
    };
  }, []);

  // Spinner for syncing
  const isSpinning = isSyncing || refreshing;
  useEffect(() => {
    if (isSpinning) {
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        })
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
    }
  }, [isSpinning]);

  const spinRotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setIsSyncing(true);
      await syncFromSupabase();
      await checkAllToons(setStatusText, { forceAll: true });
      await loadToons();
      setLastSyncedAt(Date.now());
    } catch (e) {
      console.warn("수동 확인 실패:", e.message);
    } finally {
      setIsSyncing(false);
      setStatusText("");
    }
    setRefreshing(false);
    showToast("모든 툰의 새 에피소드를 확인했어요");
  };

  const syncStatusText = isSpinning
    ? statusText || "동기화 중..."
    : "마지막 확인: " + relativeTime(lastSyncedAt);

  const newToons = toons.filter((t) => t.hasNewEpisode);
  const readToons = toons.filter((t) => !t.hasNewEpisode);
  const newCount = newToons.length;

  const sections = [];
  if (newToons.length)
    sections.push({ title: "새 에피소드", data: newToons, count: newCount });
  if (readToons.length)
    sections.push({
      title: newToons.length ? "읽은 툰" : "구독 중",
      data: readToons,
    });

  const s = styles(theme);

  if (initialLoading) {
    return (
      <SafeAreaView style={[s.container, s.loadingContainer]}>
        <Text style={s.title}>Toonify</Text>
        <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 14 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <View style={s.titleRow}>
            <Text style={s.title}>Toonify</Text>
            {newCount > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{newCount}</Text>
              </View>
            )}
          </View>
          <View style={s.syncRow}>
            {isSpinning && (
              <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                <Feather name="rotate-cw" size={10} color={theme.muted} />
              </Animated.View>
            )}
            <Text style={s.syncText}>{syncStatusText}</Text>
          </View>
        </View>

        <View style={s.headerActions}>
          <TouchableOpacity style={s.iconBtn} onPress={toggleTheme}>
            <Feather
              name={isDark ? "sun" : "moon"}
              size={17}
              color={theme.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Feather name="plus" size={20} color={theme.ctaText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── List / Empty ── */}
      {toons.length === 0 ? (
        <EmptyState onAdd={() => setModalVisible(true)} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ToonCard toon={item} onUpdate={loadToons} onEdit={setEditingToon} onMessage={showToast} />
          )}
          renderSectionHeader={({ section: { title, count } }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{title}</Text>
              {count != null && (
                <View style={s.sectionBadge}>
                  <Text style={s.sectionBadgeText}>{count}</Text>
                </View>
              )}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          contentContainerStyle={s.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* ── Toast ── */}
      {toast ? (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ── Modals ── */}
      <AddToonModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdded={() => {
          loadToons();
          showToast("새로운 툰을 추가했어요");
        }}
        onUpdate={loadToons}
      />
      <AddToonModal
        visible={editingToon !== null}
        editToon={editingToon}
        onClose={() => setEditingToon(null)}
        onAdded={() => {
          loadToons();
          showToast("수정 내용을 저장했어요");
        }}
      />
    </SafeAreaView>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    loadingContainer: { justifyContent: "center", alignItems: "center" },

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 22,
      paddingTop: 14,
      paddingBottom: 12,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: {
      fontFamily: FONTS.heading,
      fontSize: 26,
      color: theme.text,
      lineHeight: 30,
    },
    countBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 999,
      backgroundColor: theme.ctaBg,
      justifyContent: "center",
      alignItems: "center",
    },
    countBadgeText: {
      color: theme.ctaText,
      fontSize: 11,
      fontWeight: "700",
    },
    syncRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
    syncText: { fontSize: 11.5, color: theme.muted },

    headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.divider,
      backgroundColor: theme.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      backgroundColor: theme.ctaBg,
      justifyContent: "center",
      alignItems: "center",
    },

    // Section headers
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 10,
    },
    sectionTitle: {
      fontFamily: FONTS.heading,
      fontSize: 17,
      color: theme.text,
    },
    sectionBadge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 999,
      backgroundColor: theme.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    sectionBadgeText: {
      color: theme.accentText,
      fontSize: 11.5,
      fontWeight: "700",
    },

    listContent: { paddingBottom: 32 },

    // Toast
    toast: {
      position: "absolute",
      left: 20,
      right: 20,
      bottom: 30,
      backgroundColor: theme.text,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 999,
      alignItems: "center",
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 8,
    },
    toastText: { color: theme.bg, fontSize: 13, fontWeight: "500" },
  });
