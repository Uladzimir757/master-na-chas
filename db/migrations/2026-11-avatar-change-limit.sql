-- Фото мастера (data: URL, ~30 КБ, сжимается на телефоне) и за сколько
-- минут до начала клиент ещё может сам отменить/перенести заказ — мастер
-- выбирает сам, максимум 3 часа (решения пользователя 15.11.2026).
-- Идемпотентно.
ALTER TABLE provider ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE provider ADD COLUMN IF NOT EXISTS client_change_min_minutes smallint NOT NULL DEFAULT 120;
DO $$ BEGIN
    ALTER TABLE provider ADD CONSTRAINT provider_client_change_min_minutes_range
        CHECK (client_change_min_minutes BETWEEN 0 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
