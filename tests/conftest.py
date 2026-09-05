"""Shared fixtures for the whole test suite.

Why a real Postgres and not sqlite/mocks: the no-double-booking guarantee
(app/main.py's create_booking 409 path) is enforced by an EXCLUDE USING gist
constraint in db/schema.sql, not by application code — see test_bookings_api.py
for the test that specifically exercises it. Nothing lighter than Postgres
with btree_gist can stand in for that.

TEST_DATABASE_URL (required, asyncpg URL, e.g.
"postgresql+asyncpg://postgres:postgres@localhost:5433/master_na_chas_test")
must point at a scratch database you don't mind wiping — the session-scoped
`engine` fixture below runs `DROP SCHEMA public CASCADE` on it before loading
db/schema.sql fresh. It must NOT be the same database as your real
DATABASE_URL (see the guard below, which refuses to run otherwise).

Per-test isolation: each test gets its own SAVEPOINT (SQLAlchemy's
join_transaction_mode="create_savepoint", the pattern from SQLAlchemy's own
docs for "joining a Session into an external transaction for test suites")
that's rolled back at teardown — so every test starts from an empty schema
regardless of what earlier tests committed, without re-running schema.sql
per test.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, time, timedelta
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.db import get_db
from app.main import app, limiter
from app.models import Provider, ProviderService, Service, Tenant, WorkingHours

SCHEMA_SQL_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

# Always a Monday, always strictly in the future — deterministic regardless
# of what day the suite happens to run on. Shared by every test module that
# needs a fixed date to hang working_hours/bookings off of.
NEXT_MONDAY: date = date.today() + timedelta(days=((7 - date.today().weekday()) % 7) or 7)
assert NEXT_MONDAY.weekday() == 0


def _to_asyncpg_dsn(sqlalchemy_url: str) -> str:
    # asyncpg.connect() wants a plain "postgresql://" URL, not SQLAlchemy's
    # "postgresql+asyncpg://" dialect-qualified one.
    return sqlalchemy_url.replace("postgresql+asyncpg://", "postgresql://", 1)


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncEngine:
    if not TEST_DATABASE_URL:
        pytest.exit(
            "TEST_DATABASE_URL is not set. Point it at a throwaway Postgres database "
            "(with the btree_gist extension available) before running the test suite — "
            "see tests/README.md.",
            returncode=1,
        )
    if TEST_DATABASE_URL == settings.DATABASE_URL:
        pytest.exit(
            "TEST_DATABASE_URL is identical to DATABASE_URL (your real database). Refusing "
            "to run — this fixture drops and recreates the entire public schema.",
            returncode=1,
        )

    schema_sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")
    conn = await asyncpg.connect(_to_asyncpg_dsn(TEST_DATABASE_URL))
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        await conn.execute(schema_sql)
    finally:
        await conn.close()

    # NullPool: every db_session fixture gets a brand-new physical connection
    # instead of a pooled/reused one. Reusing asyncpg connections across the
    # create_savepoint join-transaction-mode pattern below is exactly the
    # scenario SQLAlchemy's own docs warn produces spurious driver-level
    # errors ("another operation is in progress") between tests — not worth
    # the pooling performance for a test suite.
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_conn(engine: AsyncEngine):
    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        yield conn
        await outer_tx.rollback()


@pytest_asyncio.fixture
async def db_session(db_conn):
    """One session, for fixture setup (seeding tenant/service/provider rows).
    Kept separate from the per-request sessions `client` hands the app below —
    a real Postgres error (e.g. the EXCLUDE-constraint 409) leaves a session's
    savepoint stack unable to cleanly start a new one afterwards, so the app
    always gets its own fresh session per request, exactly like production's
    get_db() does. This one only ever runs straight-line fixture setup, which
    never hits that path."""
    session_factory = async_sessionmaker(
        bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_conn):
    session_factory = async_sessionmaker(
        bind=db_conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    limiter.reset()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ----------------------------------------------------------------------------
# Common seed data. Each fixture makes just its own row(s) — compose them in
# a test/fixture as needed rather than one big "everything" fixture, so a
# test's dependencies say exactly what it needs.
# ----------------------------------------------------------------------------


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession) -> Tenant:
    row = Tenant(id=uuid.uuid4(), slug=f"test-{uuid.uuid4().hex[:8]}", name="Test Tenant")
    db_session.add(row)
    await db_session.commit()
    return row


@pytest_asyncio.fixture
async def service(db_session: AsyncSession, tenant: Tenant) -> Service:
    row = Service(id=uuid.uuid4(), tenant_id=tenant.id, name="Стрижка", duration_minutes=60)
    db_session.add(row)
    await db_session.commit()
    return row


@pytest_asyncio.fixture
async def provider(db_session: AsyncSession, tenant: Tenant) -> Provider:
    """requires_booking_confirmation=True (the schema default) — matches the
    model's own default, most tests want this unless testing the flag itself."""
    row = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Мастер", travel_buffer_minutes=0)
    db_session.add(row)
    await db_session.commit()
    return row


@pytest_asyncio.fixture
async def provider_service(db_session: AsyncSession, provider: Provider, service: Service) -> None:
    db_session.add(ProviderService(provider_id=provider.id, service_id=service.id))
    await db_session.commit()


@pytest_asyncio.fixture
async def working_hours_all_week_9_18(db_session: AsyncSession, provider: Provider) -> None:
    for weekday in range(7):
        db_session.add(
            WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=weekday, start_time=time(9, 0), end_time=time(18, 0))
        )
    await db_session.commit()


@pytest_asyncio.fixture
async def bookable_provider(
    provider: Provider, provider_service: None, working_hours_all_week_9_18: None
) -> Provider:
    """A provider that can actually receive bookings for `service`: linked to
    it and with working hours every day. Depend on this (not bare `provider`)
    in any test that calls POST /api/bookings or GET /api/availability."""
    return provider
