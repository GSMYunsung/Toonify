import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList,
  TouchableOpacity, RefreshControl, SafeAreaView,
} from 'react-native';
import { getSortedToons, checkAllToons } from '../services/toon-service';
import ToonCard from '../components/ToonCard';
import AddToonModal from '../components/AddToonModal';
import EmptyState from '../components/EmptyState';

export default function HomeScreen() {
  const [toons, setToons] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [statusText, setStatusText] = useState('');

  const loadToons = useCallback(async () => {
    const sorted = await getSortedToons();
    setToons(sorted);
  }, []);

  useEffect(() => {
    loadToons();
    const interval = setInterval(autoCheck, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const autoCheck = async () => {
    try {
      await checkAllToons(setStatusText);
      await loadToons();
    } catch (e) {
      console.warn('자동 확인 실패:', e.message);
    } finally {
      setStatusText('');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await autoCheck();
    setRefreshing(false);
  };

  const newToons = toons.filter(t => t.hasNewEpisode);
  const readToons = toons.filter(t => !t.hasNewEpisode);

  const sections = [];
  if (newToons.length) sections.push({ title: '🔔 새 에피소드', data: newToons });
  if (readToons.length) sections.push({
    title: newToons.length ? '읽은 툰' : '구독 중',
    data: readToons,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>인스타툰 알림</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {statusText ? (
        <Text style={styles.statusText}>{statusText}</Text>
      ) : null}

      {toons.length === 0 ? (
        <EmptyState onAdd={() => setModalVisible(true)} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ToonCard toon={item} onUpdate={loadToons} />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#A594F9"
            />
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      <AddToonModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdded={loadToons}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  addButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#A594F9',
    justifyContent: 'center', alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -1 },
  statusText: {
    textAlign: 'center', color: '#A594F9',
    fontSize: 13, paddingVertical: 8,
  },
  sectionHeader: {
    fontSize: 13, fontWeight: '600', color: '#888',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  listContent: { paddingBottom: 24 },
});
