-- Защита рейтинга от накрутки (21.11.2026): отзыв можно скрыть, а заказы,
-- внесённые самим мастером в календаре, не получают приглашение на отзыв.
-- Идемпотентно.
ALTER TABLE booking ADD COLUMN IF NOT EXISTS created_by_master boolean NOT NULL DEFAULT false;
ALTER TABLE review  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
