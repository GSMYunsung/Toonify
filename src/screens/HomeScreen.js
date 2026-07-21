import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSortedToons, checkAllToons, syncFromSupabase, fillMissingUnreadPosts } from "../services/toon-service";
import ToonCard from "../components/ToonCard";
import AddToonModal from "../components/AddToonModal";
import EmptyState from "../components/EmptyState";
import { useTheme } from "../context/ThemeContext";

export default function HomeScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const [toons, setToons] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingToon, setEditingToon] = useState(null);
  const [statusText, setStatusText] = useState("");

  const loadToons = useCallback(async () => {
    const sorted = await getSortedToons();
    setToons(sorted);
  }, []);

  const syncAndFill = useCallback(async () => {
    await syncFromSupabase();
    await fillMissingUnreadPosts();
    await loadToons();
  }, [loadToons]);

  useEffect(() => {
    const init = async () => {
      await loadToons();
      await syncAndFill(); // 최초 1회만 fillMissingUnreadPosts 포함 실행
    };
    init();

    // 60 * 1000 (60초) → 30 * 60 * 1000 (30분): API 한도 초과 방지
    const interval = setInterval(autoCheck, 30 * 60 * 1000);

    // 포그라운드 복귀 시: Supabase 동기화만 (API 호출 없음)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncFromSupabase().then(loadToons);
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, []);

  const autoCheck = async () => {
    try {
      await checkAllToons(setStatusText);
      await loadToons();
    } catch (e) {
      console.warn("자동 확인 실패:", e.message);
    } finally {
      setStatusText("");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await autoCheck();
    setRefreshing(false);
  };

  const newToons = toons.filter((t) => t.hasNewEpisode);
  const readToons = toons.filter((t) => !t.hasNewEpisode);

  const sections = [];
  if (newToons.length) sections.push({ title: "새 에피소드", data: newToons });
  if (readToons.length)
    sections.push({
      title: newToons.length ? "읽은 툰" : "구독 중",
      data: readToons,
    });

  const s = styles(theme);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>
          <Text style={{ color: theme.accent }}>T</Text>oonify
        </Text>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.iconButton} onPress={toggleTheme}>
            <Text style={s.iconButtonText}>{isDark ? "☀️" : "🌙"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Text style={s.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {statusText ? <Text style={s.statusText}>{statusText}</Text> : null}

      {toons.length === 0 ? (
        <EmptyState onAdd={() => setModalVisible(true)} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ToonCard toon={item} onUpdate={loadToons} onEdit={setEditingToon} />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View style={s.sectionHeaderRow}>
              {title === '새 에피소드' && <View style={s.sectionDot} />}
              <Text style={s.sectionHeader}>{title.toUpperCase()}</Text>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
          contentContainerStyle={s.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      <AddToonModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdded={loadToons}
      />
      <AddToonModal
        visible={editingToon !== null}
        editToon={editingToon}
        onClose={() => setEditingToon(null)}
        onAdded={loadToons}
      />
    </SafeAreaView>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 16,
      backgroundColor: theme.header,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 22, fontWeight: "700", color: theme.text },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.card,
      justifyContent: "center",
      alignItems: "center",
    },
    iconButtonText: { fontSize: 16 },
    addButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    addButtonText: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "300",
      marginTop: -1,
    },
    statusText: {
      textAlign: "center",
      color: theme.accent,
      fontSize: 13,
      paddingVertical: 8,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 10,
    },
    sectionDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: theme.accent,
    },
    sectionHeader: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.sectionText,
      letterSpacing: 2,
    },
    listContent: { paddingBottom: 24 },
  });
