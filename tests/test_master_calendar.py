"""Букси-style master calendar: manual bookings, drag-and-drop reschedule,
manual time blocks, and the combined GET /api/providers/me/calendar read —
see ProviderBlock's docstring in app/models.py and CalendarOut's in
app/schemas.py for the overall design.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Provider, ProviderBlock, Service, Tenant
from app.slot_engine import BUSINESS_TZ, get_availability
from tests.conftest import NEXT_MONDAY


def _dt(hour: int, minute: int = 0, day=NEXT_MONDAY) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=BUSINESS_TZ)


@pytest_asyncio.fixture
async def other_provider(db_session: AsyncSession, tenant: Tenant) -> Provider:
    row = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Другой мастер", travel_buffer_minutes=0)
    db_session.add(row)
    await db_session.commit()
    return row


async def _make_booking(
    db_session: AsyncSession, *, provider_id, service_id, start: datetime, minutes: int = 60, status=BookingStatus.confirmed
) -> Booking:
    row = Booking(
        id=uuid.uuid4(),
        tenant_id=(await db_session.get(Provider, provider_id)).tenant_id,
        provider_id=provider_id,
        service_id=service_id,
        client_name="Клиент",
        start_at=start,
        end_at=start + timedelta(minutes=minutes),
        status=status,
    )
    db_session.add(row)
    await db_session.commit()
    return row


async def _make_block(db_session: AsyncSession, *, provider_id, start: datetime, minutes: int = 60, reason=None) -> ProviderBlock:
    row = ProviderBlock(id=uuid.uuid4(), provider_id=provider_id, start_at=start, end_at=start + timedelta(minutes=minutes), reason=reason)
    db_session.add(row)
    await db_session.commit()
    return row


# ----------------------------------------------------------------------------
# POST /api/providers/me/bookings — manual/walk-in booking
# ----------------------------------------------------------------------------


async def test_create_manual_booking_requires_login(client: AsyncClient, service: Service):
    resp = await client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": _dt(9).isoformat(), "client_name": "Клиент"},
    )
    assert resp.status_code == 401


async def test_create_manual_booking_uses_service_duration_by_default(
    logged_in_client: AsyncClient, bookable_provider: Provider, service: Service
):
    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": _dt(9).isoformat(), "client_name": "Клиент по телефону"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # `service` fixture is duration_minutes=60 (tests/conftest.py)
    assert body["start_at"].startswith(_dt(9).isoformat()[:16])
    assert datetime.fromisoformat(body["end_at"]) - datetime.fromisoformat(body["start_at"]) == timedelta(minutes=60)
    # Manual entries default to confirmed — the master is the one adding it,
    # there's no "confirm your own booking" step.
    assert body["status"] == "confirmed"


async def test_create_manual_booking_accepts_a_duration_override(
    logged_in_client: AsyncClient, bookable_provider: Provider, service: Service
):
    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={
            "service_id": str(service.id),
            "start_at": _dt(9).isoformat(),
            "duration_minutes": 25,
            "client_name": "Клиент",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert datetime.fromisoformat(body["end_at"]) - datetime.fromisoformat(body["start_at"]) == timedelta(minutes=25)


async def test_create_manual_booking_allows_a_past_start_time(
    logged_in_client: AsyncClient, bookable_provider: Provider, service: Service
):
    # Unlike the public POST /api/bookings (see test_bookings_api.py's past-
    # slot rejection test), a master logging his own walk-in from earlier
    # today is a legitimate use, not a bug — see ManualBookingCreate's
    # docstring.
    past = datetime(2020, 1, 1, 9, 0, tzinfo=BUSINESS_TZ)
    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": past.isoformat(), "client_name": "Клиент"},
    )
    assert resp.status_code == 201, resp.text


async def test_create_manual_booking_404s_on_unknown_service(logged_in_client: AsyncClient, bookable_provider: Provider):
    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(uuid.uuid4()), "start_at": _dt(9).isoformat(), "client_name": "Клиент"},
    )
    assert resp.status_code == 404


async def test_create_manual_booking_conflicts_with_an_existing_booking(
    logged_in_client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    await _make_booking(db_session, provider_id=bookable_provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": _dt(9, 30).isoformat(), "client_name": "Другой клиент"},
    )
    assert resp.status_code == 409, resp.text


async def test_create_manual_booking_conflicts_with_own_block(
    logged_in_client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    await _make_block(db_session, provider_id=bookable_provider.id, start=_dt(9), reason="Врач")

    resp = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": _dt(9, 15).isoformat(), "client_name": "Клиент"},
    )
    assert resp.status_code == 409, resp.text


# ----------------------------------------------------------------------------
# PATCH /api/bookings/{id}/reschedule — drag-and-drop
# ----------------------------------------------------------------------------


async def test_reschedule_requires_login(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))
    resp = await client.patch(
        f"/api/bookings/{booking.id}/reschedule",
        json={"start_at": _dt(11).isoformat(), "end_at": _dt(12).isoformat()},
    )
    assert resp.status_code == 401


async def test_reschedule_rejects_another_masters_booking(
    logged_in_client: AsyncClient, db_session: AsyncSession, other_provider: Provider, service: Service
):
    theirs = await _make_booking(db_session, provider_id=other_provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/bookings/{theirs.id}/reschedule",
        json={"start_at": _dt(11).isoformat(), "end_at": _dt(12).isoformat()},
    )
    assert resp.status_code == 404, resp.text
    await db_session.refresh(theirs)
    assert theirs.start_at == _dt(9)  # untouched


async def test_reschedule_moves_the_booking(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/bookings/{booking.id}/reschedule",
        json={"start_at": _dt(14).isoformat(), "end_at": _dt(15).isoformat()},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert datetime.fromisoformat(body["start_at"]) == _dt(14)
    assert datetime.fromisoformat(body["end_at"]) == _dt(15)


async def test_reschedule_rejects_end_before_start(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))
    resp = await logged_in_client.patch(
        f"/api/bookings/{booking.id}/reschedule",
        json={"start_at": _dt(14).isoformat(), "end_at": _dt(13).isoformat()},
    )
    assert resp.status_code == 422


async def test_reschedule_conflicts_with_another_booking(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(14))
    moving = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/bookings/{moving.id}/reschedule",
        json={"start_at": _dt(14, 30).isoformat(), "end_at": _dt(15, 30).isoformat()},
    )
    assert resp.status_code == 409, resp.text


async def test_reschedule_conflicts_with_a_block(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _make_block(db_session, provider_id=provider.id, start=_dt(14))
    moving = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/bookings/{moving.id}/reschedule",
        json={"start_at": _dt(14, 15).isoformat(), "end_at": _dt(15, 15).isoformat()},
    )
    assert resp.status_code == 409, resp.text


# ----------------------------------------------------------------------------
# GET /api/providers/me/calendar
# ----------------------------------------------------------------------------


async def test_get_calendar_requires_login(client: AsyncClient):
    resp = await client.get(
        "/api/providers/me/calendar",
        params={"date_from": NEXT_MONDAY.isoformat(), "date_to": NEXT_MONDAY.isoformat()},
    )
    assert resp.status_code == 401


async def test_get_calendar_returns_own_bookings_and_blocks_in_range(
    logged_in_client: AsyncClient,
    db_session: AsyncSession,
    provider: Provider,
    other_provider: Provider,
    service: Service,
):
    mine = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))
    await _make_booking(db_session, provider_id=other_provider.id, service_id=service.id, start=_dt(10))
    out_of_range = await _make_booking(
        db_session, provider_id=provider.id, service_id=service.id, start=_dt(9, day=NEXT_MONDAY + timedelta(days=30))
    )
    my_block = await _make_block(db_session, provider_id=provider.id, start=_dt(15))

    resp = await logged_in_client.get(
        "/api/providers/me/calendar",
        params={"date_from": NEXT_MONDAY.isoformat(), "date_to": NEXT_MONDAY.isoformat()},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    booking_ids = {b["id"] for b in body["bookings"]}
    assert booking_ids == {str(mine.id)}
    assert str(out_of_range.id) not in booking_ids
    block_ids = {b["id"] for b in body["blocks"]}
    assert block_ids == {str(my_block.id)}


async def test_get_calendar_excludes_cancelled_bookings(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9), status=BookingStatus.cancelled)

    resp = await logged_in_client.get(
        "/api/providers/me/calendar",
        params={"date_from": NEXT_MONDAY.isoformat(), "date_to": NEXT_MONDAY.isoformat()},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["bookings"] == []


# ----------------------------------------------------------------------------
# POST/PATCH/DELETE /api/providers/me/blocks
# ----------------------------------------------------------------------------


async def test_create_block_requires_login(client: AsyncClient):
    resp = await client.post(
        "/api/providers/me/blocks", json={"start_at": _dt(14).isoformat(), "end_at": _dt(15).isoformat()}
    )
    assert resp.status_code == 401


async def test_create_block_succeeds(logged_in_client: AsyncClient, bookable_provider: Provider):
    resp = await logged_in_client.post(
        "/api/providers/me/blocks",
        json={"start_at": _dt(14).isoformat(), "end_at": _dt(15, 30).isoformat(), "reason": "Врач"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["reason"] == "Врач"


async def test_create_block_rejects_end_before_start(logged_in_client: AsyncClient, bookable_provider: Provider):
    resp = await logged_in_client.post(
        "/api/providers/me/blocks", json={"start_at": _dt(15).isoformat(), "end_at": _dt(14).isoformat()}
    )
    assert resp.status_code == 422


async def test_create_block_rejects_naive_datetime(logged_in_client: AsyncClient, bookable_provider: Provider):
    resp = await logged_in_client.post(
        "/api/providers/me/blocks",
        json={"start_at": "2027-06-07T09:00:00", "end_at": "2027-06-07T10:00:00"},
    )
    assert resp.status_code == 422


async def test_create_block_conflicts_with_existing_booking(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _make_booking(db_session, provider_id=provider.id, service_id=service.id, start=_dt(9))

    resp = await logged_in_client.post(
        "/api/providers/me/blocks", json={"start_at": _dt(9, 30).isoformat(), "end_at": _dt(10, 30).isoformat()}
    )
    assert resp.status_code == 409, resp.text


async def test_update_block_rejects_another_masters_block(
    logged_in_client: AsyncClient, db_session: AsyncSession, other_provider: Provider
):
    theirs = await _make_block(db_session, provider_id=other_provider.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/providers/me/blocks/{theirs.id}",
        json={"start_at": _dt(14).isoformat(), "end_at": _dt(15).isoformat()},
    )
    assert resp.status_code == 404


async def test_update_block_moves_it(
    logged_in_client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider
):
    block = await _make_block(db_session, provider_id=bookable_provider.id, start=_dt(9))

    resp = await logged_in_client.patch(
        f"/api/providers/me/blocks/{block.id}",
        json={"start_at": _dt(16).isoformat(), "end_at": _dt(17).isoformat(), "reason": "Перенёс"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert datetime.fromisoformat(body["start_at"]) == _dt(16)
    assert body["reason"] == "Перенёс"


async def test_delete_block_requires_login(client: AsyncClient, db_session: AsyncSession, provider: Provider):
    block = await _make_block(db_session, provider_id=provider.id, start=_dt(9))
    resp = await client.delete(f"/api/providers/me/blocks/{block.id}")
    assert resp.status_code == 401


async def test_delete_block_rejects_another_masters_block(
    logged_in_client: AsyncClient, db_session: AsyncSession, other_provider: Provider
):
    theirs = await _make_block(db_session, provider_id=other_provider.id, start=_dt(9))
    resp = await logged_in_client.delete(f"/api/providers/me/blocks/{theirs.id}")
    assert resp.status_code == 404


async def test_delete_block_succeeds(logged_in_client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider):
    block = await _make_block(db_session, provider_id=bookable_provider.id, start=_dt(9))
    resp = await logged_in_client.delete(f"/api/providers/me/blocks/{block.id}")
    assert resp.status_code == 200, resp.text

    resp2 = await logged_in_client.get(
        "/api/providers/me/calendar",
        params={"date_from": NEXT_MONDAY.isoformat(), "date_to": NEXT_MONDAY.isoformat()},
    )
    assert resp2.json()["blocks"] == []


# ----------------------------------------------------------------------------
# A block also removes that time from PUBLIC availability — the whole point
# of it existing (see app/slot_engine.py's _slots_for_one_provider), not just
# a private calendar annotation.
# ----------------------------------------------------------------------------


async def test_block_removes_the_time_from_public_availability(
    db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    await _make_block(db_session, provider_id=bookable_provider.id, start=_dt(9), minutes=120, reason="Врач")

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=bookable_provider)

    assert not any(_dt(9) <= s.start_at < _dt(11) for s in slots)
    # hours outside the block are still offered as normal
    assert any(s.start_at == _dt(11) for s in slots)
