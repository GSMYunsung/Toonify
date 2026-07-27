import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function sendLocalNotification(seriesName, episodes, isComplete = false) {
  const epList = Array.isArray(episodes)
    ? episodes
    : episodes != null ? [episodes] : [];

  const title = seriesName;
  let body;
  if (isComplete) {
    body = epList.length > 0
      ? `${epList[epList.length - 1]}화로 완결됐어요!`
      : `완결됐어요!`;
  } else if (epList.length > 1) {
    const sorted = [...epList].sort((a, b) => a - b);
    body = `${sorted[0]}화~${sorted[sorted.length - 1]}화가 나왔어요!`;
  } else if (epList.length === 1) {
    body = `${epList[0]}화가 나왔어요!`;
  } else {
    body = `새 편이 나왔어요!`;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === 'android' && { channelId: 'default' }),
    },
    trigger: null,
  });
}

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}
