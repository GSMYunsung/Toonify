import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import HomeScreen from './src/screens/HomeScreen';
import { checkAllToons } from './src/services/toon-service';

const BG_TASK = 'toon-background-check';

TaskManager.defineTask(BG_TASK, async () => {
  try {
    const updated = await checkAllToons();
    return updated
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  useEffect(() => {
    async function setup() {
      await Notifications.requestPermissionsAsync();
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BG_TASK, {
          minimumInterval: 60,
        });
      }
    }
    setup();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <HomeScreen />
    </GestureHandlerRootView>
  );
}
