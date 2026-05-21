import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
  Animated, PanResponder,
} from 'react-native';
import { addToon } from '../services/toon-service';

export default function AddToonModal({ visible, onClose, onAdded }) {
  const [username, setUsername] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [lastEpisode, setLastEpisode] = useState('');

  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      // 캡처 단계에서 아래 드래그 선점 → 배경·핸들·타이틀 전부 적용
      // TextInput 타이핑(dy≈0)은 가로채지 않음
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
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const handleAdd = async () => {
    const cleanUsername = username.trim().replace(/^@+/, '');
    if (!cleanUsername || !seriesName.trim()) {
      Alert.alert('입력 오류', '인스타 계정과 시리즈 이름을 입력해주세요.');
      return;
    }
    await addToon({
      username: cleanUsername,
      seriesName: seriesName.trim(),
      lastEpisode: parseInt(lastEpisode) || 0,
    });
    setUsername('');
    setSeriesName('');
    setLastEpisode('');
    onAdded();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* 전체 컨테이너에 panHandlers — 배경 + 시트 모두 드래그 가능 */}
      <View style={styles.container} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.dragArea}>
              <View style={styles.handle} />
              <Text style={styles.title}>툰 추가하기</Text>
            </View>

            <Text style={styles.label}>인스타 계정</Text>
            <TextInput
              style={styles.input}
              placeholder="@username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>시리즈 이름</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 하루방툰"
              value={seriesName}
              onChangeText={setSeriesName}
            />

            <Text style={styles.label}>마지막으로 본 화수</Text>
            <TextInput
              style={styles.input}
              placeholder="처음이면 0"
              value={lastEpisode}
              onChangeText={setLastEpisode}
              keyboardType="number-pad"
            />

            <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
              <Text style={styles.addButtonText}>추가하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  dragArea: {
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', alignSelf: 'flex-start' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E8E8E8',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1A1A2E', marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#A594F9',
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 10 },
  cancelButtonText: { color: '#999', fontSize: 15 },
});
