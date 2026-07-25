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
  Animated,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { addToon, updateToonInfo, checkToon } from "../services/toon-service";
import * as Clipboard from "expo-clipboard";
import { fetchPostByUrl } from "../services/instagram-api";
import { extractTextFromImage } from "../services/ocr-service";
import {
  extractEpisodeNumber,
  extractEpisodeNumberFromOCR,
  extractSeriesName,
} from "../hooks/useKeywordDetector";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../theme";

export default function AddToonModal({ visible, onClose, onAdded, onUpdate, editToon }) {
  const { theme } = useTheme();
  const isEdit = !!editToon;

  const [username, setUsername] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [lastEpisode, setLastEpisode] = useState("");

  const [linkUrl, setLinkUrl] = useState("");
  const [imported, setImported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrDetected, setOcrDetected] = useState(false);

  const sheetY = useRef(new Animated.Value(0)).current;
  const sheetDragging = useRef(false);
  const sheetStartY = useRef(0);

  useEffect(() => {
    if (editToon) {
      setUsername(editToon.username || "");
      setSeriesName(editToon.seriesName || "");
      setLastEpisode(String(editToon.readEpisode || editToon.lastEpisode || ""));
    } else {
      setUsername(""); setSeriesName(""); setLastEpisode("");
    }
    setLinkUrl("");
    setImported(false);
    setImporting(false);
    setImportError("");
    setOcrRunning(false);
    setOcrDetected(false);
    sheetY.setValue(0);
  }, [visible, editToon]);

  const handleImportFromUrl = async (url) => {
    if (!url || importing) return;
    setImporting(true);
    setImportError("");
    try {
      const post = await fetchPostByUrl(url);
      if (post.username) setUsername(post.username);

      let name = extractSeriesName(post.caption || "");
      let ep = extractEpisodeNumber(post.caption || "");

      if (ep === null && post.thumbnailUrl) {
        setOcrRunning(true);
        const ocrText = await extractTextFromImage(post.thumbnailUrl);
        setOcrRunning(false);
        if (ocrText) {
          const ocrEp = extractEpisodeNumberFromOCR(ocrText);
          if (ocrEp !== null) { ep = ocrEp; setOcrDetected(true); }
          name = extractSeriesName(ocrText) || name;
        }
      }

      if (name) setSeriesName(name);
      if (ep !== null) setLastEpisode(String(ep));
      setImported(true);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (/instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/.test(text)) {
      setLinkUrl(text);
      handleImportFromUrl(text);
    } else {
      setImportError("클립보드에 인스타그램 링크가 없어요");
    }
  };

  const handleSave = async () => {
    const clean = username.trim().replace(/^@+/, "");
    if (!clean || !seriesName.trim()) return;

    if (isEdit) {
      await updateToonInfo(editToon.id, {
        seriesName: seriesName.trim(),
        lastEpisode: parseInt(lastEpisode) || 0,
      });
      onAdded();
    } else {
      const ep = parseInt(lastEpisode) || 0;
      const initialHistory = (ep > 0 && linkUrl) ? [{ episode: ep, url: linkUrl.trim() }] : [];
      const newToon = await addToon({
        username: clean,
        seriesName: seriesName.trim(),
        lastEpisode: ep,
        episodeHistory: initialHistory,
      });
      // background episode check — only refresh list, no toast
      checkToon(newToon).then(() => onUpdate?.()).catch(() => {});
      onAdded();
    }
    onClose();
  };

  // Handle drag to dismiss
  const sheetCurrentY = useRef(0);
  const onHandlePointerDown = (e) => {
    sheetDragging.current = true;
    sheetStartY.current = e.nativeEvent.pageY;
  };
  const onHandlePointerMove = (e) => {
    if (!sheetDragging.current) return;
    const dy = Math.max(0, e.nativeEvent.pageY - sheetStartY.current);
    sheetCurrentY.current = dy;
    sheetY.setValue(dy);
  };
  const onHandlePointerUp = () => {
    sheetDragging.current = false;
    if (sheetCurrentY.current > 90) {
      Animated.timing(sheetY, { toValue: 600, duration: 180, useNativeDriver: true }).start(onClose);
    } else {
      Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
    }
    sheetCurrentY.current = 0;
  };

  const saveDisabled = !username.trim() || !seriesName.trim() || (!isEdit && !imported);

  const st = s(theme);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={st.keyboardView}
      >
        <Animated.View style={[st.sheet, { transform: [{ translateY: sheetY }] }]}>
          {/* Drag handle */}
          <View
            style={st.dragArea}
            onStartShouldSetResponder={() => true}
            onResponderGrant={onHandlePointerDown}
            onResponderMove={onHandlePointerMove}
            onResponderRelease={onHandlePointerUp}
          >
            <View style={st.handle} />
          </View>

          {/* Title row */}
          <View style={st.titleRow}>
            <Text style={st.title}>{isEdit ? "툰 수정" : "툰 추가"}</Text>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <Feather name="x" size={20} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Link paste button (add mode only) */}
            {!isEdit && (
              <>
                {!imported && !importing && (
                  <TouchableOpacity style={st.pasteBtn} onPress={handlePasteFromClipboard} activeOpacity={0.75}>
                    <Feather name="clipboard" size={15} color={theme.ctaText} />
                    <Text style={st.pasteBtnText}>링크 붙여넣기</Text>
                  </TouchableOpacity>
                )}
                {importing && (
                  <View style={st.loadingRow}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={st.loadingText}>
                      {ocrRunning ? "이미지에서 화수 읽는 중..." : "게시물 정보 불러오는 중..."}
                    </Text>
                  </View>
                )}
                {imported && !importing && (
                  <View style={st.importedRow}>
                    <Feather name="check-circle" size={13} color={theme.tagCompleteColor} />
                    <Text style={st.importedText} numberOfLines={1}>{linkUrl}</Text>
                    <TouchableOpacity onPress={() => {
                      setLinkUrl(""); setImported(false); setImportError("");
                      setUsername(""); setSeriesName(""); setLastEpisode("");
                    }}>
                      <Feather name="x" size={14} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                )}
                {importError ? (
                  <Text style={st.errorText}>{importError}</Text>
                ) : null}
              </>
            )}

            {/* Account */}
            <View style={st.fieldLabelRow}>
              <Text style={st.label}>
                {isEdit ? (
                  <>계정명 <Feather name="lock" size={10} color={theme.muted} /></>
                ) : "계정명"}
              </Text>
            </View>
            <TextInput
              style={[st.input, (!imported || importing || isEdit) && st.inputLocked]}
              value={username}
              onChangeText={setUsername}
              placeholder={imported ? "@instagram_id" : "링크를 먼저 붙여넣어 주세요"}
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={imported && !isEdit && !importing}
            />

            {/* Series name */}
            <View style={st.fieldLabelRow}>
              <Text style={st.label}>시리즈명</Text>
            </View>
            <TextInput
              style={[st.input, (!imported || importing) && st.inputLocked]}
              value={seriesName}
              onChangeText={setSeriesName}
              placeholder={imported ? "예: 오늘의 하루" : "링크를 먼저 붙여넣어 주세요"}
              placeholderTextColor={theme.muted}
              editable={imported && !importing}
            />

            {/* Episode */}
            <View style={st.fieldLabelRow}>
              <Text style={st.label}>마지막 본 화수</Text>
              {ocrDetected && (
                <View style={st.ocrBadge}>
                  <Text style={st.ocrBadgeText}>OCR로 인식됨</Text>
                </View>
              )}
            </View>
            <TextInput
              style={[st.input, (!imported || importing || ocrRunning) && st.inputLocked]}
              value={lastEpisode}
              onChangeText={(v) => { setLastEpisode(v); setOcrDetected(false); }}
              placeholder={imported ? "예: 24" : "링크를 먼저 붙여넣어 주세요"}
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              editable={imported && !importing && !ocrRunning}
            />

            {/* Buttons */}
            <View style={st.btnRow}>
              <TouchableOpacity style={st.cancelBtn} onPress={onClose}>
                <Text style={st.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.saveBtn, saveDisabled && st.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saveDisabled}
              >
                <Text style={st.saveText}>{isEdit ? "저장" : "추가"}</Text>
                <View style={st.saveChip}>
                  <Feather name="arrow-right" size={12} color={theme.ctaChipColor} />
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = (theme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlayBg,
    },
    keyboardView: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
      paddingBottom: 40,
      maxHeight: "88%",
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 12,
    },
    dragArea: { alignItems: "center", paddingVertical: 10 },
    handle: {
      width: 38,
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.divider,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    title: {
      fontFamily: FONTS.heading,
      fontSize: 19,
      color: theme.text,
    },
    closeBtn: { padding: 4 },

    // Clipboard banner
    clipboardBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.tagNewBg,
      borderRadius: 16,
      padding: 12,
      marginBottom: 14,
    },
    clipboardText: {
      flex: 1,
      fontSize: 12.5,
      color: theme.tagNewColor,
      lineHeight: 18,
    },
    importBtn: {
      backgroundColor: theme.ctaBg,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
    },
    importBtnText: {
      color: theme.ctaText,
      fontSize: 12.5,
      fontWeight: "700",
    },

    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    loadingText: {
      fontSize: 13,
      color: theme.muted,
      flex: 1,
    },
    anchorBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: -8,
      marginBottom: 14,
      paddingHorizontal: 4,
    },
    anchorText: {
      fontSize: 11.5,
      color: theme.tagCompleteColor,
      flex: 1,
    },
    importingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
    },
    importingText: { fontSize: 12.5, color: theme.muted },
    errorText: { fontSize: 12, color: theme.deleteBg, marginBottom: 10 },

    // Paste button
    pasteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.ctaBg,
      borderRadius: 999,
      paddingVertical: 14,
      marginBottom: 14,
    },
    pasteBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.ctaText,
    },
    importedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    importedText: {
      flex: 1,
      fontSize: 12,
      color: theme.muted,
    },

    fieldLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 5,
    },
    label: {
      fontSize: 11.5,
      color: theme.muted,
    },
    fieldSpin: { marginLeft: 6 },
    ocrBadge: {
      marginLeft: 6,
      backgroundColor: theme.accent2_100,
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: 999,
    },
    ocrBadgeText: {
      fontSize: 10,
      color: theme.accent2_500,
      fontWeight: "700",
    },
    input: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.surface,
      marginBottom: 14,
    },
    inputLocked: { opacity: 0.45 },

    btnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: "center",
    },
    cancelText: { fontSize: 14, color: theme.text, fontWeight: "600" },
    saveBtn: {
      flex: 1,
      backgroundColor: theme.ctaBg,
      borderRadius: 999,
      paddingVertical: 14,
      paddingRight: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveText: { color: theme.ctaText, fontSize: 14, fontWeight: "700" },
    saveChip: {
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor: theme.ctaChipBg,
      justifyContent: "center",
      alignItems: "center",
    },
  });
