import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { deleteToon, markAsRead, checkToon, advanceEpisode } from "../services/toon-service";
import { getEmoji } from "../utils/emoji-icon";
import { useTheme } from "../context/ThemeContext";

export default function ToonCard({ toon, onUpdate, onEdit }) {
  const { theme } = useTheme();
  const swipeableRef = useRef(null);
  const emoji = getEmoji(toon.seriesName);

  const episodeLabel =
    toon.hasNewEpisode && toon.lastEpisode
      ? `${toon.lastEpisode}화까지 나옴 · ${toon.readEpisode || 0}화까지 봄`
      : toon.readEpisode || toon.lastEpisode
        ? `${toon.readEpisode || toon.lastEpisode}화까지 봄`
        : `${toon.lastEpisode}화까지 나옴 · 아직 읽은 편 없음`;

  const handleCardPress = async () => {
    if (!toon.hasNewEpisode) return;
    const unreadPosts = toon.unreadPosts || [];
    if (unreadPosts.length > 0) {
      const next = unreadPosts[0];
      await Linking.openURL(next.url);
      await advanceEpisode(toon.id, next.episode, unreadPosts.slice(1));
    } else if (toon.lastPostUrl) {
      await Linking.openURL(toon.lastPostUrl);
      await markAsRead(toon.id);
    }
    onUpdate();
  };

  const handleCheckNow = async () => {
    try {
      const result = await checkToon(toon);
      if (result.found) {
        Alert.alert("새 에피소드!", `${toon.seriesName} ${result.episode}화가 올라왔어요!`);
      } else {
        Alert.alert("확인 완료", "새 에피소드가 없습니다.");
      }
      onUpdate();
    } catch (e) {
      Alert.alert("오류", e.message);
    }
  };

  const handleDelete = async () => {
    swipeableRef.current?.close();
    await deleteToon(toon.id);
    onUpdate();
  };

  const renderRightActions = () => (
    <TouchableOpacity style={styles(theme).deleteAction} onPress={handleDelete}>
      <Text style={{ fontSize: 20 }}>🗑️</Text>
    </TouchableOpacity>
  );

  const s = styles(theme);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <TouchableOpacity
        style={[s.card, toon.hasNewEpisode && s.cardNew]}
        onPress={handleCardPress}
        onLongPress={() => onEdit?.(toon)}
        activeOpacity={0.7}
      >
        <View style={s.iconContainer}>
          {toon.lastThumbnailUrl ? (
            <Image source={{ uri: toon.lastThumbnailUrl }} style={s.thumbnail} />
          ) : (
            <Text style={s.iconEmoji}>{emoji}</Text>
          )}
        </View>

        <View style={s.info}>
          <View style={s.titleRow}>
            <Text style={s.title} numberOfLines={1}>{toon.seriesName}</Text>
            {toon.hasNewEpisode && (
              <View style={s.badgeNew}>
                <Text style={s.badgeText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={s.author}>@{toon.username}</Text>
          <Text style={s.episode}>{episodeLabel}</Text>
          {toon.hasNewEpisode && (
            <Text style={s.hint}>
              {toon.unreadPosts?.length > 0
                ? `${toon.unreadPosts[0].episode}화 보러가기 →`
                : '탭해서 보러가기 →'}
            </Text>
          )}
        </View>

        <TouchableOpacity style={s.checkButton} onPress={handleCheckNow}>
          <Text style={s.checkIcon}>↻</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = (theme) => StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 16,
    padding: 16,
  },
  cardNew: {
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
  },
  iconContainer: {
    width: 52, height: 52,
    borderRadius: 14,
    backgroundColor: theme.accentBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    overflow: 'hidden',
  },
  iconEmoji: { fontSize: 24 },
  thumbnail: { width: 52, height: 52 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  title: { fontSize: 15, fontWeight: "700", color: theme.text, flexShrink: 1 },
  author: { fontSize: 12, color: theme.textSub, marginBottom: 3 },
  episode: { fontSize: 12, color: theme.textSub },
  hint: { fontSize: 12, color: theme.accent, marginTop: 4, fontWeight: '600' },
  badgeNew: {
    backgroundColor: theme.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  checkButton: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: theme.accentBg,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  checkIcon: { fontSize: 18, color: theme.accent },
  deleteAction: {
    backgroundColor: theme.delete,
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    marginVertical: 4,
    marginRight: 16,
    borderRadius: 16,
  },
});
