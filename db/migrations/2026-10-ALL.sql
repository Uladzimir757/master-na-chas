-- Применить вручную на Neon (идемпотентно).
ALTER TABLE master_user DROP CONSTRAINT IF EXISTS master_user_provider_id_key;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS price numeric(10,2);
ALTER TABLE provider_service ADD COLUMN IF NOT EXISTS duration_minutes integer CHECK (duration_minutes > 0);
ALTER TABLE service ADD COLUMN IF NOT EXISTS category text;
-- Категории по точным названиям услуг из боевой БД (30 штук; проверено 2026-10-09).
-- Услуги, добавленные позже, получают 'other' — править отдельным UPDATE.
UPDATE service SET category = 'assembly' WHERE category IS NULL AND name IN (
  'Сборка мебели', 'Сборка/монтаж кухни целиком', 'Сборка детской площадки/качелей',
  'Сборка и установка когтеточки/лежанки для животных', 'Навеска полки/зеркала',
  'Навеска карниза для штор', 'Установка ТВ на кронштейн', 'Установка сушилки для белья',
  'Монтаж кухонной вытяжки');
UPDATE service SET category = 'electric' WHERE category IS NULL AND name IN (
  'Замена розетки/выключателя', 'Диагностика и замена автомата в щитке',
  'Монтаж светильника/люстры', 'Подключение варочной панели/духовки');
UPDATE service SET category = 'plumbing' WHERE category IS NULL AND name IN (
  'Замена смесителя (крана)', 'Ремонт/замена сливного бачка унитаза', 'Установка/замена унитаза',
  'Установка душевой кабины (готовый комплект)', 'Устранение засора',
  'Устранение протечки под мойкой', 'Подключение стиральной/посудомоечной машины');
UPDATE service SET category = 'repair' WHERE category IS NULL AND name IN (
  'Замена/ремонт дверного замка', 'Мелкий ремонт по дому (почасово)',
  'Мелкий ремонт стен (штукатурка, шпаклёвка)', 'Ремонт/регулировка мебельной фурнитуры',
  'Регулировка пластиковых окон/дверей', 'Утепление окон/дверей на зиму',
  'Замена нескольких треснувших плиток', 'Герметизация швов силиконом',
  'Покраска стены/двери (небольшая площадь)');
UPDATE service SET category = 'other' WHERE category IS NULL;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS manage_token text UNIQUE;
CREATE TABLE IF NOT EXISTS device_push_token (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    master_user_id  uuid REFERENCES master_user(id) ON DELETE CASCADE,
    client_phone    text,
    platform        text NOT NULL CHECK (platform IN ('android', 'ios')),
    fcm_token       text NOT NULL UNIQUE,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((master_user_id IS NULL) <> (client_phone IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_device_push_master ON device_push_token (master_user_id);
CREATE INDEX IF NOT EXISTS idx_device_push_client_phone ON device_push_token (client_phone);
ALTER TABLE service ADD COLUMN IF NOT EXISTS owner_provider_id uuid REFERENCES provider(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_service_owner ON service (owner_provider_id);
ALTER TABLE provider_service ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;

-- Города мастера, таймер подтверждения заказа, время доезда
-- (docs/confirm-timer-travel-cities-task.md). Применить вручную на Neon ДО
-- деплоя API (идемпотентно).

CREATE TABLE IF NOT EXISTS city (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    name_pl     text NOT NULL,
    name_en     text NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    sort_order  int NOT NULL DEFAULT 0
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
    ('zielona-gora', 'Zielona Góra', 'Zielona Góra', 100)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS provider_city (
    provider_id  uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    city_id      uuid NOT NULL REFERENCES city(id) ON DELETE CASCADE,
    PRIMARY KEY (provider_id, city_id)
);

-- существующие мастера — в Гдыню (поправят в кабинете)
INSERT INTO provider_city (provider_id, city_id)
SELECT p.id, c.id FROM provider p CROSS JOIN city c
WHERE c.slug = 'gdynia'
  AND NOT EXISTS (SELECT 1 FROM provider_city pc WHERE pc.provider_id = p.id);

ALTER TABLE booking ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES city(id);
ALTER TABLE booking ADD COLUMN IF NOT EXISTS confirm_deadline_at timestamptz;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS confirm_notices_sent smallint NOT NULL DEFAULT 0;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS travel_minutes smallint
    CHECK (travel_minutes IS NULL OR travel_minutes > 0);
CREATE INDEX IF NOT EXISTS idx_booking_confirm_deadline ON booking (confirm_deadline_at)
    WHERE status = 'pending' AND confirm_deadline_at IS NOT NULL;

-- Координаты городов: клиент может выбрать город «по моей локации» —
-- ближайший к точке телефона (web/components/BookingFlow.tsx). NULL = город
-- в автовыборе не участвует. Применить вручную на Neon (идемпотентно).
ALTER TABLE city ADD COLUMN IF NOT EXISTS lat numeric(9,6);
ALTER TABLE city ADD COLUMN IF NOT EXISTS lng numeric(9,6);
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
