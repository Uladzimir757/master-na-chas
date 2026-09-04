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
    price_min         numeric(10,2),
    price_max         numeric(10,2),
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_tenant ON service (tenant_id);

-- which providers can perform which services (a shop mechanic might only do
-- diesel injection work; a handyman might do everything on the menu)
CREATE TABLE provider_service (
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    service_id   uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
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

-- ----------------------------------------------------------------------------
-- master_user — login for a provider (mvp-task.md #4). Deliberately minimal:
-- no roles, no permission table — two people, cookie session, not JWT.
-- telegram_chat_id is filled by the deep-link flow below, never by hand.
-- ----------------------------------------------------------------------------
CREATE TABLE master_user (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id        uuid NOT NULL UNIQUE REFERENCES provider(id) ON DELETE CASCADE,
    email              text NOT NULL UNIQUE,
    password_hash      text NOT NULL,
    telegram_chat_id   text,              -- nullable, filled via telegram_link_token flow
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
-- Seed example: two tenants sharing the same engine
-- ----------------------------------------------------------------------------
-- INSERT INTO tenant (slug, name) VALUES
--   ('garage-system', 'Garage System'),
--   ('master-na-chas', 'Мастер на час — Gdynia');
