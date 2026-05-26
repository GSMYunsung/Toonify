import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function EmptyState({ onAdd }) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.container}>
      <Text style={s.emoji}>📚</Text>
      <Text style={s.title}>구독 중인 툰이 없어요</Text>
      <Text style={s.subtitle}>
        좋아하는 인스타툰을 추가하면{'\n'}새 편이 올라올 때 알려드릴게요
      </Text>
      <TouchableOpacity style={s.button} onPress={onAdd}>
        <Text style={s.buttonText}>툰 추가하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emoji: { fontSize: 52, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 10 },
  subtitle: {
    fontSize: 14, color: theme.textSub,
    textAlign: 'center', lineHeight: 22, marginBottom: 32,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
