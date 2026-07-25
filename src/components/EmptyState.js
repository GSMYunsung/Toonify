import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../theme";

// Decorative doodle blob for empty state
function DecoBlob() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180">
      {/* Main blob background */}
      <Path
        d="M38 26 C58 4 162 4 182 26 C202 48 202 132 182 154 C162 176 58 176 38 154 C18 132 18 48 38 26Z"
        fill="#f0fae1"
        transform="rotate(-6 110 90)"
      />
      {/* Star shape left */}
      <Path
        d="M30 56 L32 49 L34 56 L41 54 L36 59 L38 66 L32 62 L26 66 L28 59 L23 54Z"
        fill="#aebf92"
        transform="rotate(-16 32 57)"
      />
      {/* Heart shape right */}
      <Path
        d="M174 38 C174 34 170 30 166 30 C163 30 161 32 160 35 C159 32 157 30 154 30 C150 30 146 34 146 38 C146 45 160 54 160 54 C160 54 174 45 174 38Z"
        fill="#c67139"
      />
      {/* Star shape bottom-left */}
      <Path
        d="M44 118 L47 108 L50 118 L60 115 L53 122 L56 132 L47 127 L38 132 L41 122 L34 115Z"
        fill="#ffc6a5"
        transform="rotate(8 47 120)"
      />
      {/* Small circle accent */}
      <Circle cx={178} cy={126} r={8} fill="#d67f48" />
      <Circle cx={18} cy={108} r={5} fill="#8fa073" />
    </Svg>
  );
}

export default function EmptyState({ onAdd }) {
  const { theme } = useTheme();
  const st = s(theme);

  return (
    <View style={st.container}>
      <DecoBlob />
      <Text style={st.title}>구독 중인 툰이 없어요</Text>
      <Text style={st.subtitle}>
        인스타그램 인스타툰을 추가하면{"\n"}새 에피소드를 놓치지 않고 확인할 수 있어요
      </Text>
      <TouchableOpacity style={st.btn} onPress={onAdd}>
        <Text style={st.btnText}>툰 추가하기</Text>
        <View style={st.btnChip}>
          <Feather name="arrow-right" size={13} color={theme.ctaChipColor} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const s = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 40,
      paddingHorizontal: 32,
    },
    title: {
      fontFamily: FONTS.heading,
      fontSize: 20,
      color: theme.text,
      marginTop: 16,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 13.5,
      color: theme.muted,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
      maxWidth: 260,
    },
    btn: {
      backgroundColor: theme.ctaBg,
      borderRadius: 999,
      paddingVertical: 14,
      paddingLeft: 22,
      paddingRight: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    btnText: {
      color: theme.ctaText,
      fontSize: 15,
      fontWeight: "700",
    },
    btnChip: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: theme.ctaChipBg,
      justifyContent: "center",
      alignItems: "center",
    },
  });
