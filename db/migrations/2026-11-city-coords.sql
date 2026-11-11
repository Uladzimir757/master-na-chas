-- Координаты городов: клиент может выбрать город «по моей локации» —
-- ближайший к точке телефона (web/components/BookingFlow.tsx). NULL = город
-- в автовыборе не участвует. Применить вручную на Neon (идемпотентно).
ALTER TABLE city ADD COLUMN IF NOT EXISTS lat numeric(9,6);
ALTER TABLE city ADD COLUMN IF NOT EXISTS lng numeric(9,6);
UPDATE city SET lat = 54.5189, lng = 18.5305 WHERE slug = 'gdynia' AND lat IS NULL;
UPDATE city SET lat = 54.4416, lng = 18.5601 WHERE slug = 'sopot' AND lat IS NULL;
UPDATE city SET lat = 54.352, lng = 18.6466 WHERE slug = 'gdansk' AND lat IS NULL;
UPDATE city SET lat = 53.1325, lng = 23.1688 WHERE slug = 'bialystok' AND lat IS NULL;
UPDATE city SET lat = 53.1235, lng = 18.0084 WHERE slug = 'bydgoszcz' AND lat IS NULL;
UPDATE city SET lat = 52.7368, lng = 15.2288 WHERE slug = 'gorzow-wielkopolski' AND lat IS NULL;
UPDATE city SET lat = 50.2649, lng = 19.0238 WHERE slug = 'katowice' AND lat IS NULL;
UPDATE city SET lat = 50.8661, lng = 20.6286 WHERE slug = 'kielce' AND lat IS NULL;
UPDATE city SET lat = 50.0647, lng = 19.945 WHERE slug = 'krakow' AND lat IS NULL;
UPDATE city SET lat = 51.2465, lng = 22.5684 WHERE slug = 'lublin' AND lat IS NULL;
UPDATE city SET lat = 51.7592, lng = 19.456 WHERE slug = 'lodz' AND lat IS NULL;
UPDATE city SET lat = 53.7784, lng = 20.4801 WHERE slug = 'olsztyn' AND lat IS NULL;
UPDATE city SET lat = 50.6751, lng = 17.9213 WHERE slug = 'opole' AND lat IS NULL;
UPDATE city SET lat = 52.4064, lng = 16.9252 WHERE slug = 'poznan' AND lat IS NULL;
UPDATE city SET lat = 50.0412, lng = 21.9991 WHERE slug = 'rzeszow' AND lat IS NULL;
UPDATE city SET lat = 53.4285, lng = 14.5528 WHERE slug = 'szczecin' AND lat IS NULL;
UPDATE city SET lat = 53.0138, lng = 18.5984 WHERE slug = 'torun' AND lat IS NULL;
UPDATE city SET lat = 52.2297, lng = 21.0122 WHERE slug = 'warszawa' AND lat IS NULL;
UPDATE city SET lat = 51.1079, lng = 17.0385 WHERE slug = 'wroclaw' AND lat IS NULL;
UPDATE city SET lat = 51.9356, lng = 15.5062 WHERE slug = 'zielona-gora' AND lat IS NULL;
