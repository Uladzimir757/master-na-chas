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
