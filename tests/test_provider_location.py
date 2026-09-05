"""Live location dot on the public booking page (Этап 4).

Two layers: app/slot_engine.py's is_within_working_hours (pure business
logic over working_hours/working_hours_exception, tested directly against
db_session — same style as tests/test_slot_engine.py), and the three-gate
publication rule in app/main.py's _resolve_provider_location (share_location
on, fix still fresh, currently working hours), tested through the HTTP API
since that's where the gates actually compose.

Working-hours fixtures here deliberately track *today's real weekday*
(unlike NEXT_MONDAY elsewhere) — the gating tests need "is it currently
working hours" to be true or false regardless of what wall-clock time the
suite happens to run at, without mocking datetime.now().
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Provider, WorkingHours, WorkingHoursException
from app.slot_engine import BUSINESS_TZ, LOCATION_FRESHNESS, is_within_working_hours
from tests.conftest import NEXT_MONDAY

# NEXT_MONDAY at noon — a fixed, always-in-the-future instant to hang the
# is_within_working_hours unit tests off, exactly like test_slot_engine.py
# does for slot generation.
NOON_MONDAY = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)


@pytest_asyncio.fixture
async def working_hours_today_all_day(db_session: AsyncSession, provider: Provider) -> None:
    """00:00-23:59:59 for *today's* real weekday — makes "currently within
    working hours" deterministically true for the HTTP-level gating tests
    below, regardless of when the suite runs."""
    weekday = datetime.now(BUSINESS_TZ).weekday()
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=weekday, start_time=time(0, 0), end_time=time(23, 59, 59))
    )
    await db_session.commit()


# ----------------------------------------------------------------------------
# is_within_working_hours
# ----------------------------------------------------------------------------


async def test_within_working_hours_template_window(db_session: AsyncSession, provider: Provider):
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=NEXT_MONDAY.weekday(), start_time=time(9, 0), end_time=time(18, 0))
    )
    await db_session.commit()

    assert await is_within_working_hours(db_session, provider.id, NOON_MONDAY) is True


async def test_outside_working_hours_template_window(db_session: AsyncSession, provider: Provider):
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=NEXT_MONDAY.weekday(), start_time=time(9, 0), end_time=time(18, 0))
    )
    await db_session.commit()

    before_open = datetime.combine(NEXT_MONDAY, time(7, 0), tzinfo=BUSINESS_TZ)
    after_close = datetime.combine(NEXT_MONDAY, time(20, 0), tzinfo=BUSINESS_TZ)
    assert await is_within_working_hours(db_session, provider.id, before_open) is False
    assert await is_within_working_hours(db_session, provider.id, after_close) is False


async def test_no_working_hours_at_all_means_never_within(db_session: AsyncSession, provider: Provider):
    assert await is_within_working_hours(db_session, provider.id, NOON_MONDAY) is False


async def test_exception_marking_day_unavailable_overrides_the_template(db_session: AsyncSession, provider: Provider):
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=NEXT_MONDAY.weekday(), start_time=time(9, 0), end_time=time(18, 0))
    )
    db_session.add(
        WorkingHoursException(
            id=uuid.uuid4(), provider_id=provider.id, date=NEXT_MONDAY, is_available=False, start_time=None, end_time=None
        )
    )
    await db_session.commit()

    # 12:00 is well inside the weekday template's 9-18 window, but the
    # day-off exception for this specific date wins.
    assert await is_within_working_hours(db_session, provider.id, NOON_MONDAY) is False


async def test_exception_with_custom_hours_overrides_the_template_window(db_session: AsyncSession, provider: Provider):
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=NEXT_MONDAY.weekday(), start_time=time(9, 0), end_time=time(18, 0))
    )
    db_session.add(
        WorkingHoursException(
            id=uuid.uuid4(), provider_id=provider.id, date=NEXT_MONDAY, is_available=True, start_time=time(20, 0), end_time=time(22, 0)
        )
    )
    await db_session.commit()

    # Inside the *exception's* window, not the (overridden) template's.
    late = datetime.combine(NEXT_MONDAY, time(21, 0), tzinfo=BUSINESS_TZ)
    assert await is_within_working_hours(db_session, provider.id, late) is True
    assert await is_within_working_hours(db_session, provider.id, NOON_MONDAY) is False


# ----------------------------------------------------------------------------
# PUT /api/providers/me/location
# ----------------------------------------------------------------------------


async def test_update_my_location_requires_login(client: AsyncClient):
    resp = await client.put("/api/providers/me/location", json={"lat": 54.5189, "lng": 18.5305})
    assert resp.status_code == 401


async def test_update_my_location_persists(logged_in_client: AsyncClient, provider: Provider, db_session: AsyncSession):
    resp = await logged_in_client.put("/api/providers/me/location", json={"lat": 54.5189, "lng": 18.5305})
    assert resp.status_code == 200, resp.text

    await db_session.refresh(provider)
    assert float(provider.location_lat) == 54.5189
    assert float(provider.location_lng) == 18.5305
    assert provider.location_updated_at is not None


async def test_update_my_location_rejects_out_of_range_coordinates(logged_in_client: AsyncClient):
    resp = await logged_in_client.put("/api/providers/me/location", json={"lat": 154.0, "lng": 18.5})
    assert resp.status_code == 422


async def test_update_my_location_is_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient, provider: Provider, db_session: AsyncSession
):
    other_provider = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    await db_session.commit()

    resp = await logged_in_client.put("/api/providers/me/location", json={"lat": 54.5189, "lng": 18.5305})
    assert resp.status_code == 200, resp.text

    await db_session.refresh(other_provider)
    assert other_provider.location_lat is None


# ----------------------------------------------------------------------------
# GET /api/providers — the three-gate public rule
# ----------------------------------------------------------------------------


async def test_location_hidden_when_share_location_is_off(
    client: AsyncClient, provider: Provider, db_session: AsyncSession, working_hours_today_all_day: None
):
    provider.share_location = False
    provider.location_lat = 54.5189
    provider.location_lng = 18.5305
    provider.location_updated_at = datetime.now(timezone.utc)
    await db_session.commit()

    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["location"] is None


async def test_location_hidden_when_stale(
    client: AsyncClient, provider: Provider, db_session: AsyncSession, working_hours_today_all_day: None
):
    provider.share_location = True
    provider.location_lat = 54.5189
    provider.location_lng = 18.5305
    provider.location_updated_at = datetime.now(timezone.utc) - LOCATION_FRESHNESS - timedelta(minutes=1)
    await db_session.commit()

    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["location"] is None


async def test_location_hidden_outside_working_hours(client: AsyncClient, provider: Provider, db_session: AsyncSession):
    # No working_hours rows at all for `provider` — never "within hours".
    provider.share_location = True
    provider.location_lat = 54.5189
    provider.location_lng = 18.5305
    provider.location_updated_at = datetime.now(timezone.utc)
    await db_session.commit()

    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["location"] is None


async def test_location_visible_when_all_three_gates_pass(
    client: AsyncClient, provider: Provider, db_session: AsyncSession, working_hours_today_all_day: None
):
    provider.share_location = True
    provider.location_lat = 54.5189
    provider.location_lng = 18.5305
    provider.location_updated_at = datetime.now(timezone.utc)
    await db_session.commit()

    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["location"] is not None
    assert row["location"]["lat"] == 54.5189
    assert row["location"]["lng"] == 18.5305


async def test_location_absent_by_default(client: AsyncClient, provider: Provider, working_hours_today_all_day: None):
    # provider never set a location or turned sharing on — default state.
    resp = await client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    row = next(p for p in resp.json() if p["id"] == str(provider.id))
    assert row["location"] is None
