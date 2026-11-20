-- Один телефон — и мастер, и клиент (приложение одно на обе роли): строка
-- FCM-токена может нести и master_user_id, и client_phone. Раньше было
-- «ровно одно из двух», и клиентская регистрация отнимала токен у мастера
-- (20.11.2026: пуш мастеру о переносе клиентом не пришёл). Теперь — «хотя бы
-- одно». Старая проверка без имени, Postgres назвал её device_push_token_check.
-- Идемпотентно.
ALTER TABLE device_push_token DROP CONSTRAINT IF EXISTS device_push_token_check;
DO $$ BEGIN
    ALTER TABLE device_push_token ADD CONSTRAINT device_push_token_has_owner
        CHECK (master_user_id IS NOT NULL OR client_phone IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
