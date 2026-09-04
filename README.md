# Мастер на час — букинг-платформа

Своя букинг-платформа для «мастер на час» (2 мастера, Trójmiasto) — слоты и
календарь, а не лид-маркетплейс (не как Fixly.pl). Спроектирована так, чтобы
тот же движок позже переиспользовался в Garage System при необходимости —
сущности (`tenant` / `provider` / `service` / `booking`) одинаковы для обоих
продуктов, разница только в данных (`provider.travel_buffer_minutes`, набор
услуг), не в коде. Отдельный проект/репозиторий от Garage System намеренно
(см. docs/decisions.md) — не 2-в-1, при необходимости склеим позже.

## Статус — Этап 1 (API)

Реализовано и живьём протестировано (реальный Postgres 16, EXCLUDE-констрейнт
против двойного бронирования подтверждён рабочим тестом — не заглушка):

- `GET /api/availability`, `POST /api/bookings`, `GET /api/bookings`,
  `PATCH /api/bookings/{id}/status`
- «Любой доступный мастер» — бронирование/доступность без явного `provider_id`
- Сессионная авторизация мастера (cookie, не JWT — намеренно минимально для
  2 пользователей, см. docs/mvp-task.md #4)
- Регистрация мастеров только через суперадмина (`X-Admin-Secret`), без
  публичной формы регистрации
- Уведомления: Telegram + Web Push мастеру, SMS (Twilio) клиенту — без
  хардкода per-master секретов (Telegram chat_id пишется через одноразовый
  deep-link токен, см. `/telegram/webhook`)

Не начинали, но заказы принимаем — реальный первый заказ можно вести и
вручную/по телефону, пока идёт Этап 2 (интерфейс).

## Структура

```
db/
  schema.sql        — схема Postgres (EXCLUDE constraint против
                       двойного бронирования, btree_gist)
app/
  main.py           — FastAPI роуты
  models.py         — SQLAlchemy 2.0 async модели (зеркало schema.sql)
  slot_engine.py     — доступность/слоты, таймзона Europe/Warsaw
  schemas.py        — Pydantic request/response
  security.py       — пароли, сессия
  notifications.py  — Telegram / Web Push / SMS (best-effort, не роняют запрос)
  config.py, db.py
scripts/
  seed.py           — тенант + стартовая услуга + 2 мастера + рабочие часы
docs/
  decisions.md      — архитектурные решения (почему отдельный проект и т.д.)
  mvp-task.md       — техзадание Этапа 1
  ai-and-reviews.md — техзадание Этапа 3 (AI, мультиязычность, отзывы)
requirements.txt
.env.example        — скопировать в .env и заполнить
```

## Стек

FastAPI + SQLAlchemy 2.0 async + asyncpg + PostgreSQL (Neon), тот же стек,
что в Garage System. UUID первичные ключи (а не int, как в Garage System) —
осознанно, чтобы можно было безопасно слить базы позже без коллизий id.
Без Alembic пока — 3-4 таблицы, миграционный инструмент не оправдан на этом
масштабе.

## Как запустить локально

```
pip install -r requirements.txt
cp .env.example .env   # заполнить DATABASE_URL как минимум
psql $DATABASE_URL -f db/schema.sql
python -m scripts.seed
uvicorn app.main:app --reload
```

## Следующие шаги

- **Этап 2** — интерфейс: React/Next.js (решение принято, см. docs/decisions.md
  — API уже отдаёт JSON, HTMX потребовал бы параллельных HTML-роутов) +
  Capacitor-обёртка под Android сразу после веб-интерфейса (не «вне скоупа»,
  мобильное с самого начала — см. docs/mvp-task.md)
- **Этап 3** — см. docs/ai-and-reviews.md: мультиязычность (как в Garage
  System), AI-рецепшен (запрос → уточнение → цена «от»), AI-консультант для
  мастера (поиск тех. данных с веб-поиском и кэшем), отзывы+фото
