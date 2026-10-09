ALTER TABLE provider_service ADD COLUMN IF NOT EXISTS duration_minutes integer CHECK (duration_minutes > 0);
