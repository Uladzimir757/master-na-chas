# Handoff: нативное приложение (Capacitor, Android + iOS)

Дата: 2026-10-10. Задание — `docs/mobile-app-task.md`. Здесь — что сделано,
как проверено, что осталось сделать руками (аккаунты, ключи) и известные
ограничения.

> Документов `pwa-handoff.md` и `provider-location-handoff.md`, на которые
> ссылается задание, в `docs/` нет. Контракты брал из кода:
> `app/security.py` (bearer-токен), `app/main.py::_resolve_provider_location`
> (три гейта), `Provider.share_location` в `app/models.py`.

## Итог по шагам

| Шаг | Состояние | Живая проверка |
|---|---|---|
| 1. Capacitor-обёртка | готово | Android-эмулятор (API 36): сайт открывается в WebView, мост и плагины доступны странице |
| 2. Android-сборка | готово, ждёт ключа | `assembleDebug` и `bundleRelease` собираются; подпись AAB проверена на временном ключе (`jar verified`), ключ удалён |
| 3. iOS через Codemagic | конфиг готов, ждёт аккаунтов | собрать не на чем до подключения Codemagic — **не проверено** |
| 4. Push (FCM) | код готов, ждёт Firebase-проекта | бэкенд — тестами; на эмуляторе — запрос разрешения и вызов `getToken` (без `google-services.json` корректно отказывает, без падения) |
| 5. Фоновая геолокация | готово | эмулятор: экран выключен + приложение свёрнуто → точка каждые 30 с, все `200`, `location_updated_at` обновляется; «Всегда» выдаётся кнопкой из кабинета |
| 6. Сторы | чек-лист ниже | — |

Тесты: бэкенд 286 passed (из них 12 новых, `tests/test_device_push.py`),
фронт — Playwright 91 passed, `tsc` и ESLint чистые.

## Архитектура (коротко)

- `web/capacitor.config.ts`: `server.url` → `https://master-na-chas-web.onrender.com`,
  `androidScheme: "https"`. WebView грузит живой сайт; `web/mobile-shell/` —
  только заглушка «нет интернета». `CAP_SERVER_URL` переопределяет адрес для
  локальной проверки (не для сторов).
- Один и тот же веб-код работает в браузере и в приложении. Нативное —
  в `web/lib/native.ts` и `web/lib/useLocationSharing.ts`, плагины
  импортируются динамически, в браузере все функции — no-op.
- **App id / bundle id: `pl.zr.app` — временный.** Сменить можно
  безболезненно только до первой загрузки в Play/App Store. Решить вместе с
  брендом.
- Иконки и сплэш — монограмма «ZR» из PWA (`public/icons/icon-maskable-512.png`),
  фон `#C97A2E`. Замена бренда: перегенерировать `android/app/src/main/res/mipmap-*`,
  `drawable*/splash.png`, `ios/App/App/Assets.xcassets/{AppIcon,Splash}*`.

### Отклонение от задания: push-плагин

Вместо `@capacitor/push-notifications` — **`@capacitor-firebase/messaging`**.
Причина: на iOS стандартный плагин отдаёт APNs-токен, а сервер шлёт через
FCM (решение №2: единый путь FCM→APNs) — пришлось бы вручную вшивать
Firebase SDK в AppDelegate. Этот плагин отдаёт FCM-токен на обеих платформах,
Firebase SDK подтягивается через SwiftPM сам. В `AppDelegate.swift` добавлены
три обязательных метода проброса, в проект — `App.entitlements`
(`aps-environment`) и ссылка на `GoogleService-Info.plist` (сам файл
кладёт Codemagic).

### Push: сервер

- Таблица `device_push_token` (`db/schema.sql`, миграция
  `db/migrations/2026-10-device-push-token.sql`, добавлена и в `2026-10-ALL.sql`):
  владелец — **либо** `master_user_id`, **либо** `client_phone` (у клиентов нет
  аккаунтов; телефон — их идентичность, как в истории записей). Токен
  уникален — устройство, сменившее владельца, переписывает строку.
- Регистрация: мастер — `PUT /api/push/device-token` при открытии кабинета;
  клиент — `PUT /api/my-booking/{id}/device-token?token=…` при открытии
  «моей записи» по ссылке из SMS; выход мастера —
  `POST /api/push/device-token/unregister`.
- Отправка встроена в существующие точки (`_notify_staff`, подтверждение
  записи клиенту, приглашение к отзыву): `notify_master`/`notify_client`
  (бывш. `notify_client_sms`) получили канал FCM рядом с Telegram/web push/SMS.
  Текст тот же (LLM), отдельной системы уведомлений нет.
- FCM HTTP v1, OAuth-токен сервисного аккаунта подписывается через уже
  установленную `cryptography` — новых зависимостей нет. Ответ 404
  (UNREGISTERED) → токен удаляется.
- Тап по уведомлению открывает `data.url` (клиенту — ссылка «моя запись»,
  мастеру — `/cabinet/`).

### Фоновая геолокация

- Плагин `@capgo/background-geolocation` 8.4 (бесплатный, MPL-2.0;
  альтернативы на сегодня: `@capacitor-community/background-geolocation` —
  менее точный, Transistorsoft — платный).
- Ключевое: координаты POST'ит **нативный код плагина** напрямую в
  `/api/providers/me/location` с `Authorization: Bearer …`, а не JS —
  WebView в фоне засыпает (iOS) или режется по сети (Android).
- Сервер: тот же эндпоинт и те же три гейта. Добавлен только `POST`
  (рядом с `PUT`) и приём тела плагина `{latitude, longitude, …}` в
  `ProviderLocationUpdate`.
- Каждые 30 с даже на месте (`distanceFilter: 0` + `minIntervalMs: 30000`) —
  иначе на долгой работе у клиента точка протухла бы через 15 мин.
- Android: `ACCESS_BACKGROUND_LOCATION` в манифесте, foreground-сервис с
  уведомлением «Udostępniasz lokalizację». С Android 11 «Всегда» из диалога
  не выдаётся — в кабинете после включения появляется «Zezwól „Zawsze”»,
  открывающая системный экран (проверено).
- iOS: `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` (по-английски, аналогия с
  такси — для App Review), `UIBackgroundModes: location, remote-notification`.

## Известные ограничения / что проверить

1. **После убийства процесса Android-сервис сам не поднимается.** На эмуляторе
   `kill -9` процесса → точки прекратились, рестарта нет. Причина в плагине:
   при первом `onStartCommand` его настройки ещё не сохранены, и он возвращает
   `START_NOT_STICKY`. Пока экран выключен и приложение просто свёрнуто — всё
   работает (проверено). Варианты: issue/PR в Cap-go, или локальный патч
   (`patch-package`). Свайп из «недавних» на реальном телефоне — проверить.
2. Эмулятор игнорировал `adb emu geo fix` и отдавал дефолтную точку
   (Googleplex) — сама доставка проверена, правильность координат на живом
   телефоне не проверялась.
3. Тексты системных диалогов iOS — только английские. Локализация
   (`pl.lproj/InfoPlist.strings`) — отдельной задачей.
4. iOS-сборка не запускалась ни разу (нет Mac). Первый прогон Codemagic
   может потребовать правок `codemagic.yaml` / подписи.
5. Push целиком (сервер → FCM → телефон) не проверен — нет Firebase-проекта.
6. `@capacitor/app` нужен для штатной кнопки «назад» на Android (история
   WebView), в коде напрямую не используется.
7. Новые тексты (`shareLocationHintApp`, `locationSharingDeniedApp`,
   `locationNotificationTitle/Text`, `locationAlwaysHint/Button`) — в
   `scripts/seed_translations.py`, en-версии — первый проход ИИ, как и
   остальные.

## Выкатка (по порядку)

1. Neon: применить `db/migrations/2026-10-device-push-token.sql`.
2. Прод: `python -m scripts.seed_translations` (новые ключи; API подхватит
   после рестарта — он и так будет при деплое).
3. Деплой API и веба (Render). Пока не задеплоено — приложение показывает
   старый сайт без нативных функций (это нормально: нативная часть
   включается со стороны веб-кода).
4. Render env (API), когда будет Firebase: `FCM_SERVICE_ACCOUNT_JSON`
   (JSON-ключ целиком), `FCM_ENABLED=true`.

## Что сделать руками (нужны аккаунты — не мог сам)

**Firebase** (бесплатно):
1. Создать проект, добавить Android-приложение `pl.zr.app` → скачать
   `google-services.json` в `web/android/app/` (не секрет, можно коммитить).
2. Добавить iOS-приложение `pl.zr.app` → `GoogleService-Info.plist` → base64 →
   переменная `GOOGLE_SERVICE_INFO_PLIST` в Codemagic (группа `firebase`).
3. Project settings → Service accounts → Generate key → JSON в Render
   (`FCM_SERVICE_ACCOUNT_JSON`).
4. Cloud Messaging → загрузить APNs Auth Key (.p8 из Apple Developer).

**Android / Google Play**:
1. `powershell -ExecutionPolicy Bypass -File web\android\create-upload-key.ps1`
   — создаёт upload-ключ и `keystore.properties` (в git не попадают;
   сохранить .jks и пароль в менеджере паролей).
2. `cd web && npm run android:bundle` → `web/android/app/build/outputs/bundle/release/app-release.aab`
   (нужен `JAVA_HOME` на JDK 21: `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`).
3. Play Console ($25): создать приложение, включить Play App Signing,
   загрузить AAB во внутреннее тестирование.

**iOS / Codemagic**:
1. Apple Developer Program ($99/год), App Store Connect API key (роль App Manager).
2. Codemagic: войти через GitHub, подключить репозиторий, Teams →
   Integrations → Developer Portal (интеграция с именем как в
   `codemagic.yaml`), Code signing → сгенерировать Apple Distribution
   сертификат и App Store профиль для `pl.zr.app` (Push включён в App ID).
3. Создать запись приложения в App Store Connect, вписать её Apple ID в
   `APP_STORE_APPLE_ID` в `codemagic.yaml`.
4. Запуск: тег `ios-v0.1.0` (или вручную из UI) → TestFlight.

## Чек-лист сторов (не блокирует разработку)

- Google Play: privacy policy (RODO), Data Safety: точная геолокация
  (собирается, в т.ч. в фоне, только у мастеров, цель — показ клиенту
  времени прибытия), идентификаторы устройства (FCM-токен), телефон клиента.
  **Декларация фоновой геолокации** (ACCESS_BACKGROUND_LOCATION) — форма
  + видео, показывающее включение тумблера и уведомление; без неё Play
  отклонит сборку.
- App Store: App Privacy — Precise Location (App Functionality, linked to
  user), Device ID (push); в Review Notes — объяснение «Always» (аналогия с
  такси, только по тумблеру мастера и в рабочие часы) + тестовый аккаунт
  мастера; скриншоты 6.7" и 6.5".

## Как повторить локальную проверку

1. API на отдельной БД (не боевой Neon из `.env`!): задать `DATABASE_URL`
   на локальный Postgres, `python -m scripts.seed`, `seed_services`,
   `seed_translations`, мастер — через `POST /admin/masters`.
2. `cd web && NEXT_PUBLIC_API_URL=http://localhost:8010 npx next dev`.
3. `CAP_SERVER_URL=http://localhost:3000 npx cap sync android`, затем
   `gradlew assembleDebug`, `adb install`, `adb reverse tcp:3000 tcp:3000`
   и `adb reverse tcp:8010 tcp:8010`.
4. **После проверки — `npx cap sync android` без `CAP_SERVER_URL`**, иначе
   следующая сборка будет смотреть в localhost.
