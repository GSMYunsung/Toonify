import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function EmptyState({ onAdd }) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📚</Text>
      <Text style={styles.title}>구독 중인 툰이 없어요</Text>
      <Text style={styles.subtitle}>
        좋아하는 인스타툰을 추가하면{'\n'}새 편이 올라올 때 알려드릴게요!
      </Text>
      <TouchableOpacity style={styles.button} onPress={onAdd}>
        <Text style={styles.buttonText}>+ 툰 추가하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  subtitle: {
    fontSize: 14, color: '#999',
    textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },
  button: {
    backgroundColor: '#A594F9',
    borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
