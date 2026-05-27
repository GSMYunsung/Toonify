// app.json 대신 app.config.js 사용 — EAS 빌드 시 process.env에서 API 키 주입
module.exports = {
  expo: {
    name: "Toonify",
    slug: "toon-notifier-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.anonymous.toonnotifierapp",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      package: "com.anonymous.toonnotifierapp",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#A594F9",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "e5379365-91ef-438c-b10c-5b3ee7bf7007",
      },
    },
  },
};
