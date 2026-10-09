-- Применить вручную на Neon (идемпотентно).
ALTER TABLE master_user DROP CONSTRAINT IF EXISTS master_user_provider_id_key;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS price numeric(10,2);
