-- Видимость телефонов (решение пользователя 12.11.2026):
-- мастер выбирает, когда клиент видит его номер; клиент при заказе решает,
-- показывать ли свой номер мастеру. Идемпотентно.
ALTER TABLE provider ADD COLUMN IF NOT EXISTS phone_visibility text NOT NULL DEFAULT 'after_confirm'
    CHECK (phone_visibility IN ('always', 'after_booking', 'after_confirm'));
ALTER TABLE booking ADD COLUMN IF NOT EXISTS client_phone_visible boolean NOT NULL DEFAULT true;
