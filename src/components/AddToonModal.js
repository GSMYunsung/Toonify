import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  ActivityIndicator,
} from "react-native";
import { addToon, updateToonInfo } from "../services/toon-service";
import * as Clipboard from "expo-clipboard";
import { fetchPostByUrl } from "../services/instagram-api";
import { extractTextFromImage } from "../services/ocr-service";
import {
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  extractSeriesName,
} from "../hooks/useKeywordDetector";
import { useTheme } from "../context/ThemeContext";

export default function AddToonModal({ visible, onClose, onAdded, editToon }) {
  const { theme } = useTheme();
  const isEditMode = !!editToon;

  const [username, setUsername] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [lastEpisode, setLastEpisode] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  // 수정 모드 진입 시 기존 값 채우기
  useEffect(() => {
    if (editToon) {
      setUsername(editToon.username || "");
      setSeriesName(editToon.seriesName || "");
      setLastEpisode(
        String(editToon.readEpisode || editToon.lastEpisode || ""),
      );
    } else {
      setUsername("");
      setSeriesName("");
      setLastEpisode("");
    }
    setUrlInput("");
    setUrlError("");
    setUrlLoading(false);

    if (visible && !editToon) {
      Clipboard.getStringAsync().then((text) => {
        if (/instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/.test(text)) {
          Alert.alert(
            "인스타 링크 감지",
            "클립보드에 인스타그램 링크가 있어요.\n자동으로 불러올까요?",
            [
              { text: "아니요", style: "cancel" },
              { text: "불러오기", onPress: () => handleUrlChange(text) },
            ],
          );
        }
      });
    }
  }, [editToon, visible]);

  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, { dy }) => dy > 5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.5) {
          Animated.timing(translateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const handleUrlChange = async (text) => {
    setUrlInput(text);
    setUrlError("");

    const isInstagramUrl = /instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/.test(
      text,
    );
    console.log(
      "[handleUrlChange] 입력:",
      text,
      "/ Instagram URL 감지:",
      isInstagramUrl,
    );
    if (!isInstagramUrl) return;

    setUrlLoading(true);
    try {
      const post = await fetchPostByUrl(text.trim());
      console.log("[handleUrlChange] fetchPostByUrl 결과:", post);

      if (post.username) setUsername(post.username);

      let name = extractSeriesName(post.caption);
      let ep = extractEpisodeNumber(post.caption);
      console.log("[handleUrlChange] caption 파싱 → name:", name, "/ ep:", ep);

      if (ep === null && post.thumbnailUrl) {
        console.log(
          "[handleUrlChange] 캡션에 화수 없음 → OCR 시도:",
          post.thumbnailUrl.slice(0, 60),
        );
        const ocrText = await extractTextFromImage(post.thumbnailUrl);
        console.log("[handleUrlChange] OCR 결과:", ocrText?.slice(0, 100));
        if (ocrText) {
          ep = extractEpisodeNumberFromOCR(ocrText);
          name = ocrText.trim();
          console.log("[handleUrlChange] OCR 파싱 → name:", name, "/ ep:", ep);
        }
      }

      if (name) setSeriesName(name);
      if (ep !== null) setLastEpisode(String(ep));
    } catch (e) {
      console.error("[handleUrlChange] 에러:", e.message);
      setUrlError(e.message);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleAdd = async () => {
    const cleanUsername = username.trim().replace(/^@+/, "");
    if (!cleanUsername || !seriesName.trim()) {
      Alert.alert("입력 오류", "인스타 계정과 시리즈 이름을 입력해주세요.");
      return;
    }
    if (isEditMode) {
      await updateToonInfo(editToon.id, {
        seriesName: seriesName.trim(),
        lastEpisode: parseInt(lastEpisode) || 0,
      });
    } else {
      await addToon({
        username: cleanUsername,
        seriesName: seriesName.trim(),
        lastEpisode: parseInt(lastEpisode) || 0,
      });
    }
    setUsername("");
    setSeriesName("");
    setLastEpisode("");
    onAdded();
    onClose();
  };

  const s = styles(theme);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.container} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
        >
          <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
            <View style={s.dragArea}>
              <View style={s.handle} />
              <Text style={s.title}>
                {isEditMode ? "툰 수정하기" : "툰 추가하기"}
              </Text>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!isEditMode && (
                <>
                  <Text style={s.label}>인스타그램 링크</Text>
                  <View style={s.urlRow}>
                    <TextInput
                      style={[s.input, s.urlInput, !urlInput && s.urlInputHint]}
                      placeholder="인스타툰 게시물 링크를 복사 붙여넣기해보세요"
                      placeholderTextColor={theme.textSub}
                      value={urlInput}
                      editable={false}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {urlLoading && (
                      <ActivityIndicator
                        style={s.urlSpinner}
                        color={theme.accent}
                        size="small"
                      />
                    )}
                  </View>
                  {urlError ? <Text style={s.urlError}>{urlError}</Text> : null}
                  <View style={s.divider} />
                </>
              )}

              <Text style={s.label}>인스타 계정</Text>
              <TextInput
                style={[s.input, isEditMode && s.inputDisabled]}
                placeholder="@username"
                placeholderTextColor={theme.textSub}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isEditMode}
              />

              <Text style={s.label}>시리즈 이름</Text>
              <TextInput
                style={s.input}
                placeholder="예: 하루방툰"
                placeholderTextColor={theme.textSub}
                value={seriesName}
                onChangeText={setSeriesName}
              />

              <Text style={s.label}>마지막으로 본 화수</Text>
              <TextInput
                style={s.input}
                placeholder="처음이면 0"
                placeholderTextColor={theme.textSub}
                value={lastEpisode}
                onChangeText={setLastEpisode}
                keyboardType="number-pad"
              />

              <TouchableOpacity style={s.addButton} onPress={handleAdd}>
                <Text style={s.addButtonText}>
                  {isEditMode ? "수정하기" : "추가하기"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelButton} onPress={onClose}>
                <Text style={s.cancelButtonText}>취소</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: "flex-end" },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      backgroundColor: theme.sheet,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      paddingBottom: 40,
    },
    dragArea: { alignItems: "center", marginBottom: 16, paddingBottom: 4 },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.handle,
      marginBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.text,
      alignSelf: "flex-start",
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.sectionText,
      letterSpacing: 1,
      marginBottom: 8,
      textTransform: "uppercase",
    },
    input: {
      borderWidth: 1.5,
      borderColor: theme.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: theme.text,
      backgroundColor: theme.card,
      marginBottom: 16,
    },
    inputDisabled: {
      opacity: 0.4,
    },
    addButton: {
      backgroundColor: theme.accent,
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: "center",
      marginBottom: 10,
    },
    addButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    cancelButton: { alignItems: "center", paddingVertical: 10 },
    cancelButtonText: { color: theme.textSub, fontSize: 15 },
    urlRow: { position: "relative" },
    urlInput: { paddingRight: 44, marginBottom: 4 },
    urlInputHint: { opacity: 0.5, borderStyle: "dashed" },
    urlSpinner: { position: "absolute", right: 14, top: 14 },
    urlError: {
      fontSize: 12,
      color: theme.delete,
      marginBottom: 12,
      marginTop: 2,
    },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 16 },
  });
