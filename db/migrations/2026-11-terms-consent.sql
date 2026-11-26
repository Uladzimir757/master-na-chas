-- Согласие с регламентом и политикой (26.11.2026): клиент — галочкой в форме
-- заказа, мастер — экраном при входе в кабинет. Идемпотентно.
ALTER TABLE booking ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
