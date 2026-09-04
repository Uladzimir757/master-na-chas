# Мастер на час — веб (публичная страница брони)

Next.js фронтенд для сервиса записи. Полностью статический (client-side) —
вся работа с API происходит в браузере, сервер не нужен (`output: "export"`
в `next.config.ts`).

Бэкенд: отдельный репозиторий/проект `master-na-chas` (FastAPI), см.
https://github.com/Uladzimir757/master-na-chas — деплой на Render:
https://master-na-chas-api.onrender.com

## Что здесь есть

- `components/BookingFlow.tsx` — вся логика записи: выбор услуги (если их
  больше одной) → выбор дня/слота → форма (имя, телефон) → подтверждение.
  Экран успеха показывает разный текст в зависимости от `booking.status`:
  если у мастера включено «подтверждение брони» (`requires_booking_confirmation`
  в настройках провайдера на бэкенде), бронь создаётся как `pending` и
  показывается «Мастер подтвердит запись в ближайшее время»; если выключено —
  бронь сразу `confirmed` и показывается «Запись подтверждена».
- `lib/api.ts` — типизированный клиент для `/api/services`, `/api/providers`,
  `/api/availability`, `POST /api/bookings`.
- `lib/format.ts` — форматирование дат/времени всегда в `Europe/Warsaw`
  (бизнес физически там, независимо от часового пояса посетителя).

## Локальная разработка

```bash
npm install
cp .env.local.example .env.local   # поправить NEXT_PUBLIC_API_URL при необходимости
npm run dev
```

Открыть http://localhost:3000 (именно `localhost`, не `127.0.0.1` — бэкенд
по умолчанию разрешает CORS только для `http://localhost:3000`, см.
`CORS_ALLOWED_ORIGINS` в конфиге бэкенда).

## Билд и деплой

```bash
npm run build
```

Собирает статические файлы в `out/` — их можно отдавать любым статическим
хостингом (Render Static Site, Vercel, Netlify, Cloudflare Pages и т.д.).
`NEXT_PUBLIC_API_URL` — переменная сборки (не рантайма), поэтому она должна
быть выставлена ДО `npm run build` на хостинге.

После первого деплоя не забыть добавить публичный URL фронтенда в
`CORS_ALLOWED_ORIGINS` на бэкенде (Render → Environment), иначе браузер
будет блокировать запросы к API по CORS.

## Личный кабинет мастера

Ещё не реализован во фронтенде. Бэкенд уже готов:
`GET /api/providers/me` / `PATCH /api/providers/me/settings` —
переключатель `requires_booking_confirmation`.
