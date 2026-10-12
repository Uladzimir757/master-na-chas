# Задание: нативное приложение (Capacitor, Android + iOS)

Контекст решений и контракты уже есть в `decisions.md` (bearer-токен
вместо cookie, `app/security.py::make_token`/`read_token`) и
`provider-location-handoff.md` (три гейта видимости геометки мастера,
`app/main.py::_resolve_provider_location`) — не пересматривать, только
переиспользовать.

## Что уже готово (не переписывать)

- PWA (`manifest.json`, service worker, иконки-заглушки) — см.
  `pwa-handoff.md`, уже сделан отдельно от этой задачи.
- Bearer-токен авторизация — решает проблему cookie между доменами
  (ITP на Safari), подходит и для WebView без изменений.
- Мобильная вёрстка: 16px поля (iOS не зумит), `viewport-fit=cover`,
  мобильный календарь (лента дней, «Сегодня», переключатель
  день/неделя/месяц).
- Гейты видимости геометки мастера (тумблер + свежесть + рабочие часы) —
  логика на сервере не меняется, меняется только способ доставки координат.

## Решения (зафиксированы 10.10.2026, не открыты для пересмотра без причины)

1. **Обе платформы сразу: Android и iOS** (пересматривает более раннее
   «Android first» — у многих клиентов/мастеров iPhone).
2. **Push-уведомления — делать в этом же этапе**, не откладывать. Через
   Capacitor Push Notifications + Firebase Cloud Messaging (единый путь:
   Android — напрямую FCM, iOS — FCM→APNs). Это НЕ та же таблица
   `web_push_subscription` (она под web push) — нужна отдельная
   таблица/поле под FCM device token, привязанное к master/client.
3. **Фоновая геолокация мастера — делать в этом же этапе**, не
   foreground-only (как было раньше в вебе из-за отсутствия нативного
   приложения). Нужен нативный плагин с background-режимом (простого
   `@capacitor/geolocation` для разового запроса недостаточно) +
   OS-разрешение «Always» на обеих платформах.
4. **Иконки — временная монограмма «ZR»** (та же, что в PWA), на обеих
   платформах. Не блокируемся на финальном выборе бренда
   (Kunszt/Wprawa/Staranność) — заменим один раз, когда он определится.
5. **iOS-сборка — через Codemagic**, не через свой/арендованный Mac и не
   через голый GitHub Actions macOS-раннер. Выбран, т.к. заточен под
   Capacitor (готовый YAML-шаблон), бесплатной квоты (500 мин/мес)
   достаточно на весь цикл до первого релиза, умеет сам грузить билд в
   App Store Connect через API-ключ Apple.

## Что нужно сделать

### 1. Базовая Capacitor-обёртка

В `web/` (это Next.js-пакет) добавить `@capacitor/core`, `@capacitor/cli`,
`@capacitor/android`, `@capacitor/ios`. `capacitor.config.ts`:
`server.url` → `https://master-na-chas-web.onrender.com`,
`androidScheme: "https"`. `npx cap add android`, `npx cap add ios`,
`npx cap sync`.

### 2. Android-сборка (локально, Windows)

`./gradlew bundleRelease` → AAB (обязателен для Play Store, не APK).
Подпись: keystore + Play App Signing.

### 3. iOS через Codemagic

Завести аккаунт Codemagic, подключить этот репозиторий, настроить
code signing (сертификат + provisioning profile через встроенный UI
Codemagic — не руками через Xcode, т.к. физического Mac нет). CI уже
есть в `.github/workflows/tests.yml` — Codemagic встаёт рядом, не
заменяет.

### 4. Push-уведомления (FCM)

- `@capacitor/push-notifications` на фронте.
- Новая таблица (например `device_push_token`: provider_id/client_id,
  platform, fcm_token, updated_at) — отдельно от `web_push_subscription`.
- Серверная отправка: расширить существующие точки, где уже уходят
  Telegram/SMS-уведомления мастеру/клиенту (те же события-триггеры,
  добавить канал FCM), не создавать параллельную систему уведомлений.
- Firebase-проект, `google-services.json` (Android), APNs-ключ,
  загруженный в Firebase (iOS — требует Apple Developer аккаунт).

### 5. Фоновая геолокация мастера

- Нативный плагин с background-режимом (например
  `@capgo/capacitor-background-geolocation` — оценить актуальные
  альтернативы на момент реализации).
- Android: разрешение `ACCESS_BACKGROUND_LOCATION` в
  `AndroidManifest.xml`.
- iOS: `NSLocationAlwaysAndWhenInUseUsageDescription` в `Info.plist` —
  текст обоснования важен для App Store Review (прямая аналогия с
  такси-приложениями: клиент должен видеть, когда приедет мастер).
- Серверная часть (эндпоинт приёма координат, гейты видимости) не
  меняется — меняется только источник координат на клиенте (нативный
  плагин вместо `navigator.geolocation.watchPosition()`).

### 6. Публикация в сторах (чек-лист, не блокирует разработку)

- Google Play: аккаунт разработчика ($25 разово), privacy policy
  (RODO + Data Safety форма), package name, скриншоты.
- App Store: Apple Developer аккаунт ($99/год), App Privacy
  "nutrition label" в App Store Connect (отдельно описать фоновую
  геолокацию и push), обоснование Always-геолокации для Review,
  bundle id, скриншоты.

## Порядок работы

Как обычно — после каждого шага живая проверка (запуск сборки/эмулятора,
не только компиляция), handoff-документ с итогами перед переходом к
следующему шагу.
