import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { deleteToon, markAsRead, checkToon } from "../services/toon-service";
import { getEmoji } from "../utils/emoji-icon";

export default function ToonCard({ toon, onUpdate }) {
  const swipeableRef = useRef(null);
  const emoji = getEmoji(toon.seriesName);

  const episodeLabel =
    toon.hasNewEpisode && toon.lastEpisode
      ? `${toon.lastEpisode}화까지 나옴 / ${toon.readEpisode || 0}화까지 봄`
      : toon.readEpisode || toon.lastEpisode
        ? `${toon.readEpisode || toon.lastEpisode}화까지 봄`
        : `${toon.lastEpisode}화까지 나옴 / 아직 읽은 편 없음`;

  const handleCardPress = async () => {
    if (!toon.hasNewEpisode) return;
    await markAsRead(toon.id);
    onUpdate();
  };

  const handleCheckNow = async () => {
    try {
      const result = await checkToon(toon);
      if (result.found) {
        Alert.alert(
          "새 에피소드!",
          `${toon.seriesName} ${result.episode}화가 올라왔어요!`,
        );
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
    <TouchableOpacity style={styles.deleteAction} onPress={handleDelete}>
      <Text style={styles.deleteIcon}>🗑️</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <TouchableOpacity
        style={[styles.card, toon.hasNewEpisode && styles.cardNew]}
        onPress={handleCardPress}
        activeOpacity={toon.hasNewEpisode ? 0.7 : 1}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.iconEmoji}>{emoji}</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {toon.seriesName}
          </Text>
          <Text style={styles.author}>@{toon.username}</Text>
          <Text style={styles.episode}>{episodeLabel}</Text>
        </View>

        <View style={styles.actions}>
          {toon.hasNewEpisode && (
            <View style={styles.badgeNew}>
              <Text style={styles.badgeText}>NEW</Text>
            </View>
          )}
          <TouchableOpacity style={styles.checkButton} onPress={handleCheckNow}>
            <Text style={styles.checkIcon}>↻</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardNew: {
    borderLeftWidth: 3,
    borderLeftColor: "#A594F9",
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F0EDFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconEmoji: { fontSize: 26 },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600", color: "#1A1A2E", marginBottom: 2 },
  author: { fontSize: 12, color: "#999", marginBottom: 3 },
  episode: { fontSize: 12, color: "#666" },
  actions: { alignItems: "flex-end", gap: 6 },
  badgeNew: {
    backgroundColor: "#FF4D6D",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  checkButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F0EDFF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkIcon: { fontSize: 18, color: "#A594F9" },
  deleteAction: {
    backgroundColor: "#FF4D6D",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    marginVertical: 5,
    marginRight: 16,
    borderRadius: 16,
  },
  deleteIcon: { fontSize: 22 },
});
