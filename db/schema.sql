-- ============================================================================
-- Reusable slot/booking engine — shared between "мастер на час" and Garage System
--
-- Design principle: business type (auto shop vs handyman crew) is DATA
-- (tenant + provider config), never a branch in the schema or in the code
-- that reads it. The only thing that differs between the two businesses is:
--   - what services are in the `service` table
--   - provider.travel_buffer_minutes (0 for a shop mechanic who stays in one
--     bay; >0 for a handyman who drives between client addresses)
-- Everything else — working hours, exceptions, availability computation,
-- booking creation, double-booking prevention — is identical code.
--
-- Target: PostgreSQL 14+ (Neon). Requires btree_gist for the exclusion
-- constraint that guarantees no double-booking at the database level.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- EXCLUDE USING gist with uuid =

-- ----------------------------------------------------------------------------
-- tenant — one row per business using the engine (Garage System's shop,
-- "мастер на час"). Everything else is scoped by tenant_id.
-- ----------------------------------------------------------------------------
CREATE TABLE tenant (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,              -- 'garage-system', 'master-na-chas'
    name        text NOT NULL,
    timezone    text NOT NULL DEFAULT 'Europe/Warsaw',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- provider — a mechanic in a shop, or a handyman on the crew. Same table.
-- ----------------------------------------------------------------------------
CREATE TABLE provider (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name                   text NOT NULL,
    phone                  text,
    email                  text,
    -- gap Postgres enforces around every booking of this provider, e.g. to
    -- cover drive time between jobs. 0 for a shop mechanic.
    travel_buffer_minutes  int NOT NULL DEFAULT 0 CHECK (travel_buffer_minutes >= 0),
    is_active              boolean NOT NULL DEFAULT true,
    -- master's own toggle (Этап 2): true = new bookings start 'pending' and
    -- need his confirmation; false = auto-confirm on creation. Per-provider.
    requires_booking_confirmation boolean NOT NULL DEFAULT true,
    -- Flat "выезд" (call-out) fee, shown as its own line once a client has
    -- picked a slot with this specific provider — see provider_service
    -- below for why this lives per-provider, not on service. NULL/0 = no
    -- separate line shown. Purely a display value: no billing/payment flow
    -- exists yet, so nothing here is actually charged anywhere.
    call_out_fee           numeric(10,2) CHECK (call_out_fee IS NULL OR call_out_fee >= 0),
    -- Live location dot on the public booking page (Этап 4). share_location
    -- is the master's own on/off switch (default off). location_lat/lng are
    -- the last fix received from PUT /api/providers/me/location, updated by
    -- the cabinet's foreground geolocation watch (see Provider.share_location
    -- in app/models.py for why this can't be a background feature on the
    -- web). Publicly surfaced only when share_location is on AND
    -- location_updated_at is fresh enough AND it's currently this provider's
    -- working hours — see app/main.py's _resolve_provider_location.
    share_location          boolean NOT NULL DEFAULT false,
    -- когда клиент видит телефон мастера: всегда / после заказа / после подтверждения
    phone_visibility        text NOT NULL DEFAULT 'after_confirm'
        CHECK (phone_visibility IN ('always', 'after_booking', 'after_confirm')),
    location_lat            numeric(9,6) CHECK (location_lat IS NULL OR (location_lat >= -90 AND location_lat <= 90)),
    location_lng            numeric(9,6) CHECK (location_lng IS NULL OR (location_lng >= -180 AND location_lng <= 180)),
    location_updated_at     timestamptz,
    -- "Занят сейчас" manual override on top of actual bookings — see
    -- Provider.busy_started_at in app/models.py and slot_engine.py's
    -- provider_busy_range for how it blocks slots. NULL = not busy.
    busy_started_at         timestamptz,
    busy_estimated_minutes  int CHECK (busy_estimated_minutes IS NULL OR busy_estimated_minutes > 0),
    -- Foundation for the planned reviews system (rating+text+photos, not
    -- built yet) — set by hand from the admin panel for now. NULL = no
    -- rating, sorts after every rated master on the public picker screen.
    rating                  numeric(2,1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
    rating_count            int NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_tenant ON provider (tenant_id);

-- ----------------------------------------------------------------------------
-- service — a repair type (Garage System) or a handyman task, same shape.
-- ----------------------------------------------------------------------------
CREATE TABLE service (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name              text NOT NULL,
    duration_minutes  int NOT NULL CHECK (duration_minutes > 0),
    -- Reference range only — a client now sees the offering master's OWN
    -- price (provider_service.price_min/max below); these are the seeded
    -- starting point / cabinet prefill, not what's actually shown to book.
    price_min         numeric(10,2),
    price_max         numeric(10,2),
    is_active         boolean NOT NULL DEFAULT true,
    category          text,   -- electric | plumbing | assembly | repair | other
    -- Per-locale display name (Этап 3) — dedicated columns, not
    -- translation_entry below: domain data, not a UI string. `name` above
    -- stays the internal/canonical (Russian) value used in notifications to
    -- the two masters; these are what a client sees, resolved by requested
    -- lang with name_ru -> name as the fallback chain.
    name_pl           text,
    name_ru           text,
    name_uk           text,
    -- en (this segment) — ru/uk are turned off (SUPPORTED_LANGS in
    -- app/translations.py) but kept, unused, rather than dropped.
    name_en           text,
    -- NULL = standard catalog service (seeded, every master sees it).
    -- Set = a master's own service, created from his cabinet — visible and
    -- bookable only for that master (docs: «редактирование, выбрать и
    -- удалить услуги»). Also the result of a master renaming a standard
    -- service: that forks a copy owned by him.
    owner_provider_id uuid REFERENCES provider(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_tenant ON service (tenant_id);
CREATE INDEX idx_service_owner ON service (owner_provider_id);

-- ----------------------------------------------------------------------------
-- city — where masters work (docs/confirm-timer-travel-cities-task.md). The
-- client picks a city first and only sees masters of that city. Managed by
-- the superadmin; names live here, not in translation_entry.
-- ----------------------------------------------------------------------------
CREATE TABLE city (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    name_pl     text NOT NULL,
    name_en     text NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    sort_order  int NOT NULL DEFAULT 0,
    -- центр города: выбор «по моей локации» (ближайший); NULL = не участвует
    lat         numeric(9,6),
    lng         numeric(9,6)
);

INSERT INTO city (slug, name_pl, name_en, sort_order) VALUES
    ('gdynia', 'Gdynia', 'Gdynia', 10),
    ('sopot', 'Sopot', 'Sopot', 20),
    ('gdansk', 'Gdańsk', 'Gdańsk', 30),
    ('bialystok', 'Białystok', 'Białystok', 100),
    ('bydgoszcz', 'Bydgoszcz', 'Bydgoszcz', 100),
    ('gorzow-wielkopolski', 'Gorzów Wielkopolski', 'Gorzów Wielkopolski', 100),
    ('katowice', 'Katowice', 'Katowice', 100),
    ('kielce', 'Kielce', 'Kielce', 100),
    ('krakow', 'Kraków', 'Kraków', 100),
    ('lublin', 'Lublin', 'Lublin', 100),
    ('lodz', 'Łódź', 'Łódź', 100),
    ('olsztyn', 'Olsztyn', 'Olsztyn', 100),
    ('opole', 'Opole', 'Opole', 100),
    ('poznan', 'Poznań', 'Poznań', 100),
    ('rzeszow', 'Rzeszów', 'Rzeszów', 100),
    ('szczecin', 'Szczecin', 'Szczecin', 100),
    ('torun', 'Toruń', 'Toruń', 100),
    ('warszawa', 'Warszawa', 'Warsaw', 100),
    ('wroclaw', 'Wrocław', 'Wrocław', 100),
    ('zielona-gora', 'Zielona Góra', 'Zielona Góra', 100);
UPDATE city SET lat = 54.5189, lng = 18.5305 WHERE slug = 'gdynia' AND lat IS NULL;
UPDATE city SET lat = 54.4416, lng = 18.5601 WHERE slug = 'sopot' AND lat IS NULL;
UPDATE city SET lat = 54.352, lng = 18.6466 WHERE slug = 'gdansk' AND lat IS NULL;
UPDATE city SET lat = 53.1325, lng = 23.1688 WHERE slug = 'bialystok' AND lat IS NULL;
UPDATE city SET lat = 53.1235, lng = 18.0084 WHERE slug = 'bydgoszcz' AND lat IS NULL;
UPDATE city SET lat = 52.7368, lng = 15.2288 WHERE slug = 'gorzow-wielkopolski' AND lat IS NULL;
UPDATE city SET lat = 50.2649, lng = 19.0238 WHERE slug = 'katowice' AND lat IS NULL;
UPDATE city SET lat = 50.8661, lng = 20.6286 WHERE slug = 'kielce' AND lat IS NULL;
UPDATE city SET lat = 50.0647, lng = 19.945 WHERE slug = 'krakow' AND lat IS NULL;
UPDATE city SET lat = 51.2465, lng = 22.5684 WHERE slug = 'lublin' AND lat IS NULL;
UPDATE city SET lat = 51.7592, lng = 19.456 WHERE slug = 'lodz' AND lat IS NULL;
UPDATE city SET lat = 53.7784, lng = 20.4801 WHERE slug = 'olsztyn' AND lat IS NULL;
UPDATE city SET lat = 50.6751, lng = 17.9213 WHERE slug = 'opole' AND lat IS NULL;
UPDATE city SET lat = 52.4064, lng = 16.9252 WHERE slug = 'poznan' AND lat IS NULL;
UPDATE city SET lat = 50.0412, lng = 21.9991 WHERE slug = 'rzeszow' AND lat IS NULL;
UPDATE city SET lat = 53.4285, lng = 14.5528 WHERE slug = 'szczecin' AND lat IS NULL;
UPDATE city SET lat = 53.0138, lng = 18.5984 WHERE slug = 'torun' AND lat IS NULL;
UPDATE city SET lat = 52.2297, lng = 21.0122 WHERE slug = 'warszawa' AND lat IS NULL;
UPDATE city SET lat = 51.1079, lng = 17.0385 WHERE slug = 'wroclaw' AND lat IS NULL;
UPDATE city SET lat = 51.9356, lng = 15.5062 WHERE slug = 'zielona-gora' AND lat IS NULL;

-- the cities a master works in (several). A master with none is not listed
-- publicly at all.
CREATE TABLE provider_city (
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    city_id      uuid NOT NULL REFERENCES city(id) ON DELETE CASCADE,
    PRIMARY KEY (provider_id, city_id)
);

-- which providers can perform which services (a shop mechanic might only do
-- diesel injection work; a handyman might do everything on the menu).
-- is_active toggles from the master's own cabinet (PUT /api/providers/me/services)
-- — the row stays, only the flag flips, so a master flicking a checkbox on
-- and off doesn't churn insert/delete. Every place that decides whether a
-- provider is actually bookable for a service must filter on this.
CREATE TABLE provider_service (
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    service_id   uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
    is_active    boolean NOT NULL DEFAULT true,
    -- This master's own approximate price + note for this service — see
    -- ProviderService in app/models.py for why per-provider, not per-service.
    price_min    numeric(10,2),
    price_max    numeric(10,2),
    description  text,
    duration_minutes integer CHECK (duration_minutes > 0),  -- NULL = service default
    -- This master removed a standard service from his own list (it stays in
    -- the catalog for everyone else; he can restore it). Always is_active=false.
    is_removed   boolean NOT NULL DEFAULT false,
    PRIMARY KEY (provider_id, service_id)
);

-- ----------------------------------------------------------------------------
-- working_hours — recurring weekly template per provider.
-- Multiple rows per weekday are allowed (e.g. 9-13 and 15-19, lunch gap).
-- ----------------------------------------------------------------------------
CREATE TABLE working_hours (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    weekday      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Monday
    start_time   time NOT NULL,
    end_time     time NOT NULL CHECK (end_time > start_time)
);

CREATE INDEX idx_working_hours_provider ON working_hours (provider_id, weekday);

-- ----------------------------------------------------------------------------
-- working_hours_exception — one-off override for a specific date: a day off,
-- a holiday, sick day, or extra/reduced hours that day.
-- ----------------------------------------------------------------------------
CREATE TABLE working_hours_exception (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    date          date NOT NULL,
    is_available  boolean NOT NULL,   -- false = fully unavailable that date
    start_time    time,               -- null when is_available=false
    end_time      time,
    reason        text,
    UNIQUE (provider_id, date)
);

-- ----------------------------------------------------------------------------
-- provider_block — a manual time-off block the master carves out directly in
-- his calendar ("заблокировать время прямо в календаре", Букси-style): a
-- doctor's appointment, an errand, anything that isn't a booking but should
-- still stop new slots landing there. NOT the same thing as
-- working_hours_exception (that overrides an ENTIRE day — day off, or
-- different hours for the whole day) or provider.busy_started_at (real-time
-- only, "занят сейчас", no future scheduling, no sub-day granularity) — this
-- is an arbitrary start/end range, anywhere inside an otherwise-normal
-- working day, that the master sets ahead of time from the calendar UI.
--
-- No EXCLUDE constraint here (unlike booking below): two blocks overlapping
-- each other is harmless (still just "no availability"), so there's nothing
-- to guard against at the DB level the way double-booking a provider needs
-- guarding. Overlap against active bookings is checked at the application
-- layer instead (app/main.py's create_provider_block/update_provider_block)
-- since that's a cross-table check Postgres EXCLUDE can't express directly.
-- ----------------------------------------------------------------------------
CREATE TABLE provider_block (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    start_at     timestamptz NOT NULL,
    end_at       timestamptz NOT NULL CHECK (end_at > start_at),
    reason       text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_block_provider_time ON provider_block (provider_id, start_at);

-- ----------------------------------------------------------------------------
-- client — optional. Bookings work fine as pure guest bookings
-- (client_name/client_phone on the booking row); this table exists for
-- repeat-client history once that matters (e.g. Garage System's vehicle
-- history, or a handyman's returning customers).
-- ----------------------------------------------------------------------------
CREATE TABLE client (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name        text NOT NULL,
    phone       text,
    email       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tenant ON client (tenant_id);

-- ----------------------------------------------------------------------------
-- booking — the actual reserved slot.
-- ----------------------------------------------------------------------------
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');

CREATE TABLE booking (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    provider_id   uuid NOT NULL REFERENCES provider(id),
    service_id    uuid NOT NULL REFERENCES service(id),
    client_id     uuid REFERENCES client(id),

    -- denormalized snapshot so a guest booking never needs a client account,
    -- and so the record survives even if the client row is later edited/deleted
    client_name   text NOT NULL,
    client_phone  text,

    start_at      timestamptz NOT NULL,
    end_at        timestamptz NOT NULL CHECK (end_at > start_at),
    status        booking_status NOT NULL DEFAULT 'pending',
    notes         text,
    price         numeric(10,2),         -- итоговая цена работы (аналитика)
    manage_token  text UNIQUE,           -- секрет ссылки «моя запись» из SMS клиенту
    city_id       uuid REFERENCES city(id),  -- город заказа (выбор клиента)
    -- Таймер подтверждения (app/confirm_timer.py): до какого момента мастер
    -- должен подтвердить pending-заказ; NULL = таймера нет (ручные брони,
    -- старые брони). confirm_notices_sent: 0 = уведомление о заказе ещё не
    -- ушло (заказ ночью ждёт рабочих часов), 1 = ушло, 2/3 = напоминания.
    confirm_deadline_at   timestamptz,
    confirm_notices_sent  smallint NOT NULL DEFAULT 0,
    cancel_reason         text,      -- 'provider_timeout' = мастер не ответил вовремя
    travel_minutes        smallint CHECK (travel_minutes IS NULL OR travel_minutes > 0),  -- время доезда, мастер при подтверждении
    client_phone_visible  boolean NOT NULL DEFAULT true,  -- клиент разрешил показать свой номер мастеру
    created_at    timestamptz NOT NULL DEFAULT now(),

    -- THE important line: Postgres itself refuses to let two active bookings
    -- for the same provider overlap in time. Not an application-level check
    -- (which races under concurrent requests) — a database guarantee.
    EXCLUDE USING gist (
        provider_id WITH =,
        tstzrange(start_at, end_at) WITH &&
    ) WHERE (status <> 'cancelled')
);

CREATE INDEX idx_booking_provider_time ON booking (provider_id, start_at);
CREATE INDEX idx_booking_tenant ON booking (tenant_id);
CREATE INDEX idx_booking_client ON booking (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_booking_confirm_deadline ON booking (confirm_deadline_at)
    WHERE status = 'pending' AND confirm_deadline_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- master_user — login for a provider (mvp-task.md #4). Deliberately minimal:
-- roles live in app/permissions.py; several staff per provider.
-- telegram_chat_id is filled by the deep-link flow below, never by hand.
-- ----------------------------------------------------------------------------
CREATE TABLE master_user (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id        uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    email              text NOT NULL UNIQUE,
    password_hash      text NOT NULL,
    telegram_chat_id   text,              -- nullable, filled via telegram_link_token flow
    name               text,
    role               text NOT NULL DEFAULT 'owner',  -- worker_limited | worker | manager | owner
    permissions        jsonb,             -- NULL = права роли по умолчанию (app/permissions.py)
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- telegram_link_token — one-shot token so a master's Telegram chat_id gets
-- into the DB through a deep-link handshake, never typed into a config file.
-- Superadmin creates a row, hands the master `t.me/<bot>?start=<token>`.
-- ----------------------------------------------------------------------------
CREATE TABLE telegram_link_token (
    token         text PRIMARY KEY,       -- opaque random token, the deep-link payload
    master_user_id  uuid NOT NULL REFERENCES master_user(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    used_at       timestamptz             -- null until consumed by /start
);

-- ----------------------------------------------------------------------------
-- web_push_subscription — a master's browser push subscription. A master can
-- have more than one (phone + desktop), so this is its own table, not a
-- column on master_user.
-- ----------------------------------------------------------------------------
CREATE TABLE web_push_subscription (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_user_id  uuid NOT NULL REFERENCES master_user(id) ON DELETE CASCADE,
    endpoint        text NOT NULL UNIQUE,
    p256dh          text NOT NULL,
    auth            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_web_push_master ON web_push_subscription (master_user_id);

-- ----------------------------------------------------------------------------
-- device_push_token — FCM token of the native app (Capacitor, docs/
-- mobile-app-task.md §4). Separate from web_push_subscription: different
-- transport (FCM HTTP v1, not VAPID) and the recipient may be a client, not
-- only a master. Exactly one owner: a logged-in master, or a client phone
-- (clients have no accounts — the phone from the SMS-linked "my booking" page
-- is their identity, same as the booking history there).
-- ----------------------------------------------------------------------------
CREATE TABLE device_push_token (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_user_id  uuid REFERENCES master_user(id) ON DELETE CASCADE,
    client_phone    text,
    platform        text NOT NULL CHECK (platform IN ('android', 'ios')),
    fcm_token       text NOT NULL UNIQUE,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((master_user_id IS NULL) <> (client_phone IS NULL))
);

CREATE INDEX idx_device_push_master ON device_push_token (master_user_id);
CREATE INDEX idx_device_push_client_phone ON device_push_token (client_phone);

-- ----------------------------------------------------------------------------
-- translation_entry — UI-string translations (Этап 3, docs/ai-and-reviews.md
-- §1). Only status='approved' rows are ever served to a visitor, via the
-- in-memory TranslationCache in app/translations.py — populated at app
-- startup, refreshed ONLY by POST /admin/translations/approve, never by a
-- plain PUT /admin/translations upsert (see that table's ORM docstring in
-- app/models.py for why this split matters). Domain data (service names)
-- is NOT here — see service.name_pl/name_ru/name_uk above.
-- ----------------------------------------------------------------------------
CREATE TABLE translation_entry (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace   text NOT NULL,
    key         text NOT NULL,
    -- Deliberately WIDER than SUPPORTED_LANGS in app/translations.py (which
    -- is 'pl'/'en' only, ru/uk turned off there) — this is just a garbage-
    -- value backstop, not the "is this lang currently offered" gate. Kept
    -- listing 'ru'/'uk' too so this ALTER doesn't have to validate (and
    -- risk failing on) prod's existing approved ru/uk rows when this ships;
    -- narrowing it later is a separate, non-urgent cleanup.
    lang        text NOT NULL CHECK (lang IN ('pl', 'ru', 'uk', 'en')),
    text        text NOT NULL,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved')),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (namespace, key, lang)
);

CREATE INDEX idx_translation_entry_lookup ON translation_entry (namespace, lang, status);

-- ----------------------------------------------------------------------------
-- review_invite / review — отзывы по SMS-ссылке после завершённой брони
-- (Этап 3, docs/ai-and-reviews.md "Не-AI: рейтинги и отзывы с фото"). Не
-- email-верификация (как у Review/ReviewVerification в Garage System), а
-- факт завершённой брони: когда мастер переводит бронь в status='completed'
-- (PATCH /api/bookings/{id}/status), клиенту на тот же номер уходит
-- одноразовая SMS-ссылка (тот же канал Twilio, что и подтверждение брони) —
-- без регистрации и пароля. Токен хранится как открытый текст, как и
-- telegram_link_token выше — тот же уровень доверия (одноразовый,
-- недолгоживущий, не учётные данные).
-- ----------------------------------------------------------------------------
CREATE TABLE review_invite (
    token         text PRIMARY KEY,
    booking_id    uuid NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
    expires_at    timestamptz NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    used_at       timestamptz
);

-- Один отзыв на одну завершённую бронь (booking_id UNIQUE) — то же самое
-- "подтверждённый визит = одна возможность оценить", которое и было целью
-- верификации по брони, а не просто ограничение API-уровня.
CREATE TABLE review (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id),
    provider_id   uuid NOT NULL REFERENCES provider(id),
    booking_id    uuid NOT NULL UNIQUE REFERENCES booking(id),
    client_name   text,
    rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text          text,
    -- До 3 фото (docs/ai-and-reviews.md), сжатых на клиенте перед отправкой.
    -- Хранятся как data-URL (base64) прямо в колонке — в проекте нет
    -- файлового хранилища (S3/Cloudinary и т.п.), заводить его только под
    -- эту фичу для MVP на 2 мастеров избыточно. Если объём отзывов/фото
    -- вырастет — перенести на внешнее хранилище, см. handoff этой задачи.
    photos        jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_provider ON review (provider_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Seed example: two tenants sharing the same engine
-- ----------------------------------------------------------------------------
-- INSERT INTO tenant (slug, name) VALUES
--   ('garage-system', 'Garage System'),
--   ('master-na-chas', 'Мастер на час — Gdynia');
