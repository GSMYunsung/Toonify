import { useEffect } from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Caprasimo_400Regular } from "@expo-google-fonts/caprasimo";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import HomeScreen from "./src/screens/HomeScreen";
import { getDeviceId } from "./src/services/toon-service";
import { supabase } from "./src/services/supabase";
import { ThemeProvider } from "./src/context/ThemeContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const [fontsLoaded] = useFonts({ Caprasimo_400Regular });

  useEffect(() => {
    async function setup() {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === "granted") {
        try {
          const [tokenData, deviceId] = await Promise.all([
            Notifications.getExpoPushTokenAsync({
              projectId: Constants.expoConfig?.extra?.eas?.projectId,
            }),
            getDeviceId(),
          ]);
          const token = tokenData.data;
          supabase
            .from("push_tokens")
            .upsert(
              { token, platform: Platform.OS, device_id: deviceId },
              { onConflict: "token" }
            )
            .then(({ error }) => {
              if (error)
                console.warn("[Supabase] push token 저장 실패:", error.message);
            });
        } catch (e) {
          console.warn("[Supabase] push token 가져오기 실패:", e.message);
        }
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "인스타툰 알림",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#c67139",
          sound: "default",
        });
      }
    }
    setup();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      const timer = setTimeout(() => SplashScreen.hideAsync(), 2000);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="auto" />
          <HomeScreen />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
