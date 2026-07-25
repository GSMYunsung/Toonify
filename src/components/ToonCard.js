import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import Svg, { Path, Circle, Polygon } from "react-native-svg";

import { Feather } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import {
  deleteToon,
  checkToon,
  advanceEpisode,
} from "../services/toon-service";
import { useTheme } from "../context/ThemeContext";

// ── Shape icon ──────────────────────────────────────
const SHAPE_COLORS = ["#aebf92", "#ffc6a5", "#c67139", "#d67f48", "#8fa073", "#9ba8cc", "#f5c0a0", "#b8cfa8"];

function h(id, seed) {
  let n = seed * 7;
  for (let i = 0; i < Math.min((id || "").length, 8); i++) {
    n = (n * 31 + id.charCodeAt(i)) % 97;
  }
  return n;
}

function blobIndex(id) { return h(id, 1) % 3; }

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function CardShape({ id }) {
  const type  = h(id, 0) % 3;
  const color = SHAPE_COLORS[h(id, 2) % SHAPE_COLORS.length];
  if (type === 0) {
    return (
      <Svg width={34} height={34} viewBox="0 0 44 44">
        <Polygon points={starPoints(22, 22, 19, 9)} fill={color} stroke={color} strokeWidth={6} strokeLinejoin="round" />
      </Svg>
    );
  }
  if (type === 1) {
    return (
      <Svg width={34} height={34} viewBox="0 0 44 44">
        <Path d="M22 37 C22 37 4 25 4 14 C4 7.5 9 4 14 4 C17.5 4 20 6 22 9 C24 6 26.5 4 30 4 C35 4 40 7.5 40 14 C40 25 22 37 22 37Z" fill={color} stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={34} height={34} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={18} fill={color} />
    </Svg>
  );
}

// ── ToonCard ─────────────────────────────────────────
export default function ToonCard({ toon, onUpdate, onEdit, onMessage }) {
  const { theme } = useTheme();
  const swipeableRef = useRef(null);
  const [isChecking, setIsChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);
  const chevronAnim = useRef(new Animated.Value(0)).current;
  const episodeAnimsRef = useRef({});

  useEffect(() => {
    if (isChecking) {
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
    }
  }, [isChecking]);

  // 에피소드 행 stagger 애니메이션
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();

    if (expanded) {
      const episodes = allEpisodes();
      const anims = episodes.map((ep) => {
        const a = getEpAnim(ep.episode);
        a.setValue(0);
        return Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 80, friction: 9 });
      });
      Animated.stagger(40, anims).start();
    }
  }, [expanded]);

  const getEpAnim = (ep) => {
    if (!episodeAnimsRef.current[ep]) {
      episodeAnimsRef.current[ep] = new Animated.Value(0);
    }
    return episodeAnimsRef.current[ep];
  };

  // episodeHistory + unreadPosts 병합, 오름차순
  const allEpisodes = () => {
    const map = {};
    for (const h of (toon.episodeHistory || [])) map[h.episode] = h;
    for (const p of (toon.unreadPosts || [])) {
      if (!map[p.episode]) map[p.episode] = p;
    }
    return Object.values(map).sort((a, b) => a.episode - b.episode);
  };

  const spinRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  const idx = blobIndex(toon.id);
  const cardBg = theme.cardTints[idx];
  const isNew = toon.hasNewEpisode;

  const metaText = toon.username
    ? `@${toon.username} · ${toon.lastEpisode || 0}화`
    : `${toon.lastEpisode || 0}화`;

  const toggleExpand = () => {
    setExpanded((v) => !v);
  };

  const handleEpisodeTap = async (ep) => {
    await Linking.openURL(ep.url);
    if (ep.episode > (toon.readEpisode || 0)) {
      const remaining = (toon.unreadPosts || []).filter((p) => p.episode > ep.episode);
      await advanceEpisode(toon.id, ep.episode, remaining);
      onUpdate();
    }
  };

  const handleCheck = async (e) => {
    e.stopPropagation?.();
    if (isChecking) return;
    if (toon.isComplete) {
      onMessage?.(`${toon.seriesName} — 완결된 작품이에요`);
      return;
    }
    setIsChecking(true);
    try {
      await checkToon(toon);
      onUpdate();
    } catch (_) {}
    setIsChecking(false);
  };

  const handleDelete = async () => {
    swipeableRef.current?.close();
    await deleteToon(toon.id);
    onUpdate();
  };

  const renderRightActions = () => (
    <TouchableOpacity style={st.deleteReveal} onPress={handleDelete} activeOpacity={0.75}>
      <Feather name="trash-2" size={20} color={theme.deleteText} />
      <Text style={st.deleteTxt}>삭제</Text>
    </TouchableOpacity>
  );

  const st = s(theme);
  const episodes = allEpisodes();

  return (
    <View style={st.wrapper}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        enabled={!isChecking}
      >
        {/* 카드 컨테이너 — 헤더 + 에피소드 목록 */}
        <View
          style={[st.cardContainer, { backgroundColor: cardBg }, isNew && { borderWidth: 1.5, borderColor: theme.accent }]}
        >
          {/* 헤더 행 — 탭하면 펼치기/접기 */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={toggleExpand}
            onLongPress={() => onEdit?.(toon)}
            style={st.header}
          >
            <View style={st.iconWrap}>
              <CardShape id={toon.id} />
            </View>

            <View style={st.info}>
              <Text style={st.seriesName} numberOfLines={1}>{toon.seriesName}</Text>
              <Text style={st.meta} numberOfLines={1}>{metaText}</Text>
            </View>

            <View style={st.right}>
              {/* 배지 */}
              {toon.undetectable ? (
                <View style={[st.tag, { backgroundColor: theme.surface }]}>
                  <Text style={[st.tagText, { color: theme.muted }]}>직접 확인</Text>
                </View>
              ) : isNew ? (
                <View style={[st.tag, { backgroundColor: (toon.isComplete && !toon.pendingComplete) ? theme.tagCompleteBg : theme.tagNewBg }]}>
                  <Text style={[st.tagText, { color: (toon.isComplete && !toon.pendingComplete) ? theme.tagCompleteColor : theme.tagNewColor }]}>
                    {(toon.isComplete && !toon.pendingComplete) ? "완결됨!" : "새 에피소드"}
                  </Text>
                </View>
              ) : toon.isComplete ? (
                <View style={[st.tag, { backgroundColor: theme.tagCompleteBg }]}>
                  <Text style={[st.tagText, { color: theme.tagCompleteColor }]}>완결</Text>
                </View>
              ) : (
                <View style={[st.tag, { backgroundColor: theme.tagReadBg }]}>
                  <Feather name="check" size={10} color={theme.tagReadColor} style={{ marginRight: 3 }} />
                  <Text style={[st.tagText, { color: theme.tagReadColor }]}>읽음</Text>
                </View>
              )}

              {/* 버튼 행 */}
              <View style={st.btnRow}>
                <TouchableOpacity onPress={handleCheck} style={st.iconBtn} testID="refresh-btn">
                  <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
                    <Feather name="rotate-cw" size={15} color={theme.muted} />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(`https://www.instagram.com/${toon.username}/`)} style={st.iconBtn}>
                  <Ionicons name="logo-instagram" size={15} color={theme.muted} />
                </TouchableOpacity>
                <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                  <Feather name="chevron-down" size={15} color={theme.muted} />
                </Animated.View>
              </View>
            </View>
          </TouchableOpacity>

          {/* 에피소드 목록 (expanded) */}
          {expanded && (
            <View style={st.episodeList}>
              <View style={st.divider} />
              {episodes.length === 0 ? (
                <Text style={st.emptyText}>저장된 화수가 없어요</Text>
              ) : (
                [...episodes].reverse().map((ep) => {
                  const isUnread = ep.episode > (toon.readEpisode || 0);
                  const anim = getEpAnim(ep.episode);
                  return (
                    <Animated.View
                      key={ep.episode}
                      style={{
                        opacity: anim,
                        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                      }}
                    >
                      <TouchableOpacity
                        style={[st.epRow, isUnread && { backgroundColor: theme.tagNewBg + "55" }]}
                        onPress={() => handleEpisodeTap(ep)}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.epRowNum, isUnread && { color: theme.tagNewColor, fontWeight: "700" }]}>
                          {ep.episode}화
                        </Text>
                        {isUnread && <View style={[st.unreadDot, { backgroundColor: theme.tagNewColor }]} />}
                        <Feather
                          name="arrow-right"
                          size={13}
                          color={isUnread ? theme.tagNewColor : theme.muted}
                          style={{ marginLeft: "auto" }}
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })
              )}
            </View>
          )}
        </View>
      </Swipeable>
    </View>
  );
}

const s = (theme) =>
  StyleSheet.create({
    wrapper: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 28,
      overflow: "hidden",
      backgroundColor: theme.deleteBg,
    },
    deleteReveal: {
      width: 110,
      alignSelf: "stretch",
      justifyContent: "center",
      alignItems: "center",
      gap: 5,
      backgroundColor: theme.deleteBg,
      borderTopRightRadius: 28,
      borderBottomRightRadius: 28,
    },
    deleteTxt: { color: theme.deleteText, fontSize: 12, fontWeight: "700" },

    cardContainer: {
      borderRadius: 28,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
    },
    iconWrap: { width: 34, height: 34, flexShrink: 0, justifyContent: "center", alignItems: "center" },
    info: { flex: 1, minWidth: 0 },
    seriesName: { fontWeight: "700", fontSize: 15, color: theme.text, marginBottom: 3 },
    meta: { fontSize: 12.5, color: theme.muted },
    right: { alignItems: "flex-end", gap: 8, flexShrink: 0 },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    tagText: { fontSize: 11, fontWeight: "700" },
    btnRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    iconBtn: { padding: 2 },

    // 에피소드 목록
    episodeList: { paddingHorizontal: 14, paddingBottom: 12 },
    divider: { height: 1, backgroundColor: theme.divider, marginBottom: 8, opacity: 0.5 },
    epRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 12,
      marginBottom: 2,
    },
    epRowNum: { fontSize: 13.5, color: theme.text, flex: 1 },
    unreadDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
    emptyText: { fontSize: 12.5, color: theme.muted, textAlign: "center", paddingVertical: 12 },
  });
