-- Клиент подтверждает выполнение заказа (решение пользователя 14.11.2026):
-- после «выполнено» от мастера клиенту уходит ссылка — «Potwierdzam» или
-- «Jest problem» (+ текст). Идемпотентно.
ALTER TABLE booking ADD COLUMN IF NOT EXISTS client_confirmation text
    CHECK (client_confirmation IN ('confirmed', 'problem'));
ALTER TABLE booking ADD COLUMN IF NOT EXISTS client_confirmation_at timestamptz;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS client_problem text;
