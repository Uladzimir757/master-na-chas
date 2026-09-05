# Бэкенд-тесты

`pytest tests/` — 25 тестов, покрывают: слот-движок (`app/slot_engine.py`),
`POST /api/bookings` (happy path, EXCLUDE-констрейнт против двойного
бронирования, rate limit, `requires_booking_confirmation`), `/admin/*`
(`X-Admin-Secret`), `/auth/*` (сессия), CORS, `app/notifications.py`
(Telegram/Web Push/SMS — с моками, без реальных вызовов).

## Нужен настоящий Postgres

`db/schema.sql` держит гарантию "нет двойного бронирования" в **EXCLUDE
USING gist**-констрейнте на таблице `booking`, а не в коде — см.
`test_bookings_api.py::test_create_booking_conflict_is_enforced_by_db_constraint`.
Ни sqlite, ни моки такое не воспроизведут: нужен реальный Postgres 14+ с
расширением `btree_gist`.

Поднять одноразовый Postgres в Docker (не трогает никакие другие
контейнеры/базы — свой порт, своё имя):

```bash
docker run -d --name master_na_chas_test_pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=master_na_chas_test \
  -p 5439:5432 postgres:16
```

(Если 5439 у тебя занят — глянь `docker ps` / `netstat`, на этой машине
такое уже встречалось: локальный нативный Postgres-сервис Windows тоже может
слушать нестандартный порт.)

## Запуск

```bash
pip install -r requirements-dev.txt
TEST_DATABASE_URL="postgresql+asyncpg://postgres:postgres@127.0.0.1:5439/master_na_chas_test" pytest tests/ -q
```

(Windows PowerShell: `$env:TEST_DATABASE_URL = "..."`, затем `pytest tests/ -q`.)

`tests/conftest.py`'s сессионная фикстура `engine` при первом запуске делает
`DROP SCHEMA public CASCADE` и заново прогоняет `db/schema.sql` — так что
`TEST_DATABASE_URL` обязателен и **не должен** совпадать с реальным
`DATABASE_URL` (фикстура сама откажется работать, если совпадает, но лишняя
осторожность не помешает: используй отдельную одноразовую базу).

Каждый тест дальше идёт в своём SAVEPOINT (SQLAlchemy
`join_transaction_mode="create_savepoint"`), который откатывается в конце —
повторный прогон `db/schema.sql` не нужен между тестами, только один раз в
начале сессии.

## CI

`.github/workflows/tests.yml` поднимает `postgres:16` как service-контейнер
и гоняет этот же набор — см. файл, если нужно повторить его локально.
