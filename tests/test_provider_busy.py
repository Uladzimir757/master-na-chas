"""app/slot_engine.py's provider_busy_range/overlaps_provider_busy_range and
the three /api/providers/me/busy/* endpoints — the master's manual "занят
сейчас" override on top of whatever his actual bookings say (a job running
long, or off-app work never booked through the site at all)."""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Provider, Service
from app.slot_engine import BUSINESS_TZ, BUSY_ESTIMATE_BUFFER, get_availability, overlaps_provider_busy_range, provider_busy_range
from tests.conftest import NEXT_MONDAY

# ----------------------------------------------------------------------------
# provider_busy_range / overlaps_provider_busy_range — pure functions, no DB.
# ----------------------------------------------------------------------------


def _provider(busy_started_at=None, busy_estimated_minutes=None) -> Provider:
    return Provider(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        name="Мастер",
        busy_started_at=busy_started_at,
        busy_estimated_minutes=busy_estimated_minutes,
    )


def test_provider_busy_range_is_none_when_not_busy():
    assert provider_busy_range(_provider()) is None


def test_provider_busy_range_is_open_ended_without_an_estimate():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    result = provider_busy_range(_provider(busy_started_at=start))
    assert result == (start, datetime.max.replace(tzinfo=timezone.utc))


def test_provider_busy_range_ends_at_estimate_plus_fixed_buffer():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    result = provider_busy_range(_provider(busy_started_at=start, busy_estimated_minutes=90))
    assert result == (start, start + timedelta(minutes=90) + BUSY_ESTIMATE_BUFFER)


def test_overlaps_provider_busy_range_false_when_not_busy():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    assert overlaps_provider_busy_range(_provider(), start, start + timedelta(hours=1)) is False


def test_overlaps_provider_busy_range_true_arbitrarily_far_out_without_an_estimate():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    p = _provider(busy_started_at=start)
    far_future = datetime(2030, 1, 1, tzinfo=timezone.utc)
    assert overlaps_provider_busy_range(p, far_future, far_future + timedelta(hours=1)) is True


def test_overlaps_provider_busy_range_false_before_busy_started():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    p = _provider(busy_started_at=start)
    assert overlaps_provider_busy_range(p, start - timedelta(hours=1), start - timedelta(minutes=30)) is False


def test_overlaps_provider_busy_range_true_inside_estimate_plus_buffer_window():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    p = _provider(busy_started_at=start, busy_estimated_minutes=60)
    just_before_end = start + timedelta(minutes=60) + BUSY_ESTIMATE_BUFFER - timedelta(minutes=10)
    assert overlaps_provider_busy_range(p, just_before_end, just_before_end + timedelta(minutes=20)) is True


def test_overlaps_provider_busy_range_false_after_estimate_plus_buffer_window():
    start = datetime(2027, 6, 7, 10, 0, tzinfo=timezone.utc)
    p = _provider(busy_started_at=start, busy_estimated_minutes=60)
    end_of_window = start + timedelta(minutes=60) + BUSY_ESTIMATE_BUFFER
    assert overlaps_provider_busy_range(p, end_of_window, end_of_window + timedelta(minutes=30)) is False


# ----------------------------------------------------------------------------
# get_availability integration — the actual payoff: a busy master's slots
# disappear from what a client can book.
# ----------------------------------------------------------------------------


async def test_busy_with_no_estimate_blocks_every_slot_from_then_on(
    db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    bookable_provider.busy_started_at = busy_start
    db_session.add(bookable_provider)
    await db_session.commit()

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=bookable_provider)

    assert slots, "some slots before noon should still be free"
    assert all(s.start_at < busy_start for s in slots)


async def test_busy_with_estimate_unblocks_after_estimate_plus_buffer(
    db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    bookable_provider.busy_started_at = busy_start
    bookable_provider.busy_estimated_minutes = 60
    db_session.add(bookable_provider)
    await db_session.commit()

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=bookable_provider)
    busy_until = busy_start + timedelta(minutes=60) + BUSY_ESTIMATE_BUFFER  # 13:30

    assert any(s.start_at == busy_until for s in slots), "a slot right at the unblock point should be free again"
    assert all(s.start_at < busy_start or s.start_at >= busy_until for s in slots)


async def test_not_busy_leaves_availability_unaffected(
    db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    slots_before = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=bookable_provider)
    assert bookable_provider.busy_started_at is None
    assert len(slots_before) > 0


# ----------------------------------------------------------------------------
# POST /api/bookings — defense-in-depth against a client whose cached slot
# predates the master pressing "начать".
# ----------------------------------------------------------------------------


async def test_create_booking_rejects_a_slot_inside_the_busy_window(
    client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    bookable_provider.busy_started_at = busy_start
    db_session.add(bookable_provider)
    await db_session.commit()

    resp = await client.post(
        "/api/bookings",
        json={
            "service_id": str(service.id),
            "provider_id": str(bookable_provider.id),
            "start_at": datetime.combine(NEXT_MONDAY, time(12, 30), tzinfo=BUSINESS_TZ).isoformat(),
            "client_name": "Клиент",
        },
    )
    assert resp.status_code == 409


async def test_create_booking_still_works_before_the_busy_window(
    client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    bookable_provider.busy_started_at = busy_start
    db_session.add(bookable_provider)
    await db_session.commit()

    resp = await client.post(
        "/api/bookings",
        json={
            "service_id": str(service.id),
            "provider_id": str(bookable_provider.id),
            "start_at": datetime.combine(NEXT_MONDAY, time(9, 0), tzinfo=BUSINESS_TZ).isoformat(),
            "client_name": "Клиент",
        },
    )
    assert resp.status_code == 201, resp.text


# ----------------------------------------------------------------------------
# HTTP endpoints — POST .../busy/start, PATCH .../busy, POST .../busy/finish.
# ----------------------------------------------------------------------------


async def test_start_busy_requires_login(client: AsyncClient):
    resp = await client.post("/api/providers/me/busy/start")
    assert resp.status_code == 401


async def test_start_busy_sets_state(logged_in_client: AsyncClient):
    resp = await logged_in_client.post("/api/providers/me/busy/start")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["busy_started_at"] is not None
    assert body["busy_estimated_minutes"] is None


async def test_start_busy_twice_is_a_conflict(logged_in_client: AsyncClient):
    first = await logged_in_client.post("/api/providers/me/busy/start")
    assert first.status_code == 200

    second = await logged_in_client.post("/api/providers/me/busy/start")
    assert second.status_code == 409


async def test_update_busy_estimate_requires_being_busy(logged_in_client: AsyncClient):
    resp = await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 60})
    assert resp.status_code == 409


async def test_update_busy_estimate_sets_value(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")

    resp = await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 90})
    assert resp.status_code == 200, resp.text
    assert resp.json()["busy_estimated_minutes"] == 90


async def test_update_busy_estimate_can_clear_back_to_open_ended(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")
    await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 90})

    resp = await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["busy_estimated_minutes"] is None


async def test_update_busy_estimate_rejects_zero_and_negative(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")

    resp = await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 0})
    assert resp.status_code == 422


async def test_update_busy_estimate_rejects_more_than_24_hours(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")

    resp = await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 24 * 60 + 1})
    assert resp.status_code == 422


async def test_finish_busy_requires_being_busy(logged_in_client: AsyncClient):
    resp = await logged_in_client.post("/api/providers/me/busy/finish")
    assert resp.status_code == 409


async def test_finish_busy_clears_state(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")
    await logged_in_client.patch("/api/providers/me/busy", json={"estimated_minutes": 60})

    resp = await logged_in_client.post("/api/providers/me/busy/finish")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["busy_started_at"] is None
    assert body["busy_estimated_minutes"] is None

    # Finished, so starting again must be allowed rather than still 409ing.
    restart = await logged_in_client.post("/api/providers/me/busy/start")
    assert restart.status_code == 200


async def test_start_busy_is_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient, provider: Provider, db_session: AsyncSession
):
    other_provider = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    await db_session.commit()

    resp = await logged_in_client.post("/api/providers/me/busy/start")
    assert resp.status_code == 200

    await db_session.refresh(other_provider)
    assert other_provider.busy_started_at is None


async def test_my_settings_includes_busy_state(logged_in_client: AsyncClient):
    await logged_in_client.post("/api/providers/me/busy/start")

    resp = await logged_in_client.get("/api/providers/me")
    assert resp.status_code == 200, resp.text
    assert resp.json()["busy_started_at"] is not None
