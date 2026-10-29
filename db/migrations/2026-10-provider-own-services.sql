-- Свои услуги мастера + удаление стандартных из своего списка. Применить вручную на Neon (идемпотентно).
ALTER TABLE service ADD COLUMN IF NOT EXISTS owner_provider_id uuid REFERENCES provider(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_service_owner ON service (owner_provider_id);
ALTER TABLE provider_service ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;
