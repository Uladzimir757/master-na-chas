-- FCM-токены нативного приложения (docs/mobile-app-task.md §4). Применить вручную на Neon (идемпотентно).
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
