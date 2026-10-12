import type { CapacitorConfig } from "@capacitor/cli";

// Нативная обёртка (docs/mobile-app-task.md): WebView грузит живой сайт, а не
// собранный бандл — тот же рецепт, что в Garage System (docs/decisions.md).
// Нативные плагины (push, фоновая геолокация) доступны странице через мост
// Capacitor, который инжектится в server.url.
//
// CAP_SERVER_URL — только для локальной проверки на эмуляторе
// (http://10.0.2.2:3000 = `npm run dev` на этой машине); в сторовую сборку
// уходит боевой адрес.
const serverUrl = process.env.CAP_SERVER_URL || "https://master-na-chas-web.onrender.com";

const config: CapacitorConfig = {
  // Временный id до выбора бренда — после первой публикации в сторе его уже
  // не сменить, решить до загрузки первого билда.
  appId: "pl.zr.app",
  appName: "ZR",
  // Сайт приходит с server.url; здесь только заглушка на случай, если сеть
  // недоступна при старте.
  webDir: "mobile-shell",
  server: {
    url: serverUrl,
    androidScheme: "https",
    cleartext: serverUrl.startsWith("http://"),
  },
  android: {
    // @capgo/background-geolocation: без этого Android останавливает
    // обновления координат через ~5 минут в фоне.
    useLegacyBridge: true,
  },
  plugins: {
    // @capacitor-firebase/messaging, а не @capacitor/push-notifications: на
    // iOS последний отдаёт APNs-токен, а сервер шлёт через FCM (единый путь
    // FCM→APNs) — без ручной правки AppDelegate под Firebase SDK его токен
    // бесполезен. Этот плагин отдаёт FCM-токен на обеих платформах.
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  experimental: {
    ios: {
      spm: {
        // Обход коллизии имён SwiftPM-пакетов (README плагина).
        packageOptions: {
          "@capacitor-firebase/messaging": { symlink: true },
        },
      },
    },
  },
};

export default config;
