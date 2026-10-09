-- Применить вручную на Neon (идемпотентно).
ALTER TABLE master_user DROP CONSTRAINT IF EXISTS master_user_provider_id_key;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';
ALTER TABLE master_user ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS price numeric(10,2);
ALTER TABLE provider_service ADD COLUMN IF NOT EXISTS duration_minutes integer CHECK (duration_minutes > 0);
ALTER TABLE service ADD COLUMN IF NOT EXISTS category text;
-- Категории по точным названиям услуг из боевой БД (30 штук; проверено 2026-10-09).
-- Услуги, добавленные позже, получают 'other' — править отдельным UPDATE.
UPDATE service SET category = 'assembly' WHERE category IS NULL AND name IN (
  'Сборка мебели', 'Сборка/монтаж кухни целиком', 'Сборка детской площадки/качелей',
  'Сборка и установка когтеточки/лежанки для животных', 'Навеска полки/зеркала',
  'Навеска карниза для штор', 'Установка ТВ на кронштейн', 'Установка сушилки для белья',
  'Монтаж кухонной вытяжки');
UPDATE service SET category = 'electric' WHERE category IS NULL AND name IN (
  'Замена розетки/выключателя', 'Диагностика и замена автомата в щитке',
  'Монтаж светильника/люстры', 'Подключение варочной панели/духовки');
UPDATE service SET category = 'plumbing' WHERE category IS NULL AND name IN (
  'Замена смесителя (крана)', 'Ремонт/замена сливного бачка унитаза', 'Установка/замена унитаза',
  'Установка душевой кабины (готовый комплект)', 'Устранение засора',
  'Устранение протечки под мойкой', 'Подключение стиральной/посудомоечной машины');
UPDATE service SET category = 'repair' WHERE category IS NULL AND name IN (
  'Замена/ремонт дверного замка', 'Мелкий ремонт по дому (почасово)',
  'Мелкий ремонт стен (штукатурка, шпаклёвка)', 'Ремонт/регулировка мебельной фурнитуры',
  'Регулировка пластиковых окон/дверей', 'Утепление окон/дверей на зиму',
  'Замена нескольких треснувших плиток', 'Герметизация швов силиконом',
  'Покраска стены/двери (небольшая площадь)');
UPDATE service SET category = 'other' WHERE category IS NULL;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS manage_token text UNIQUE;
