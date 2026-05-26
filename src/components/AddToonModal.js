import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, Alert,
  Animated, PanResponder,
} from 'react-native';
import { addToon } from '../services/toon-service';
import { useTheme } from '../context/ThemeContext';

export default function AddToonModal({ visible, onClose, onAdded }) {
  const { theme } = useTheme();
  const [username, setUsername] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [lastEpisode, setLastEpisode] = useState('');

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
            toValue: 600, duration: 200, useNativeDriver: true,
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

  const s = styles(theme);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.container} {...panResponder.panHandlers}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
          <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
            <View style={s.dragArea}>
              <View style={s.handle} />
              <Text style={s.title}>툰 추가하기</Text>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.label}>인스타 계정</Text>
              <TextInput
                style={s.input}
                placeholder="@username"
                placeholderTextColor={theme.textSub}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
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
                <Text style={s.addButtonText}>추가하기</Text>
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

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: theme.sheet,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  dragArea: { alignItems: 'center', marginBottom: 16, paddingBottom: 4 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.handle,
    marginBottom: 18,
  },
  title: { fontSize: 18, fontWeight: '700', color: theme.text, alignSelf: 'flex-start' },
  label: { fontSize: 13, fontWeight: '600', color: theme.textSub, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: theme.inputBorder,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: theme.text,
    backgroundColor: theme.card,
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: theme.accent,
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 10,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 10 },
  cancelButtonText: { color: theme.textSub, fontSize: 15 },
});
