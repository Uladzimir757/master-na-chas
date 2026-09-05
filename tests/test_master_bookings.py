"""GET /api/bookings and PATCH /api/bookings/{id}/status — master-only, and
scoped to the caller's own provider (app/main.py's list_my_bookings and
update_booking_status).

Regression coverage for two real bugs found while building the master's
personal cabinet on top of this API:
  - GET /api/bookings had no auth at all and took an arbitrary provider_id —
    anyone could pull any client's name and phone number for any provider.
  - PATCH .../status required login but never checked the booking actually
    belonged to the logged-in master's own provider — one master could
    confirm/cancel another master's bookings.
Both are now resolved from the session (_get_own_provider), same as
/api/providers/me — there's no parameter a client can pass that reaches
another provider's data.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, MasterUser, Provider, Tenant
from app.security import hash_password
from app.slot_engine import BUSINESS_TZ
from tests.conftest import MASTER_PASSWORD, NEXT_MONDAY


@pytest_asyncio.fixture
async def other_provider(db_session: AsyncSession, tenant: Tenant) -> Provider:
    row = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Другой мастер", travel_buffer_minutes=0)
    db_session.add(row)
    await db_session.commit()
    return row


@pytest_asyncio.fixture
async def other_master_user(db_session: AsyncSession, other_provider: Provider) -> MasterUser:
    row = MasterUser(
        id=uuid.uuid4(),
        provider_id=other_provider.id,
        email="other@example.com",
        password_hash=hash_password(MASTER_PASSWORD),
    )
    db_session.add(row)
    await db_session.commit()
    return row


async def _make_booking(
    db_session: AsyncSession, *, provider_id, service_id, hour: int, status: BookingStatus = BookingStatus.pending
) -> Booking:
    start_at = datetime.combine(NEXT_MONDAY, datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=hour)
    row = Booking(
        id=uuid.uuid4(),
        tenant_id=(await db_session.get(Provider, provider_id)).tenant_id,
        provider_id=provider_id,
        service_id=service_id,
        client_name="Клиент",
        start_at=start_at,
        end_at=start_at + timedelta(hours=1),
        status=status,
    )
    db_session.add(row)
    await db_session.commit()
    return row


# ----------------------------------------------------------------------------
# GET /api/bookings
# ----------------------------------------------------------------------------


async def test_list_bookings_requires_login(client: AsyncClient):
    resp = await client.get("/api/bookings")
    assert resp.status_code == 401


async def test_list_bookings_only_returns_own_providers_bookings(
    client: AsyncClient,
    logged_in_client: AsyncClient,
    db_session: AsyncSession,
    provider: Provider,
    other_provider: Provider,
    service,
):
    mine = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, hour=9)
    await _make_booking(db_session, provider_id=other_provider.id, service_id=service.id, hour=10)

    resp = await logged_in_client.get("/api/bookings")

    assert resp.status_code == 200, resp.text
    ids = [b["id"] for b in resp.json()]
    assert ids == [str(mine.id)]


async def test_list_bookings_ignores_a_client_supplied_provider_id(
    client: AsyncClient,
    logged_in_client: AsyncClient,
    db_session: AsyncSession,
    provider: Provider,
    other_provider: Provider,
    service,
):
    # Passing someone else's provider_id used to be all it took to read their
    # clients' names and phone numbers. The endpoint no longer even has a
    # provider_id parameter, so this is just an unrecognized query string —
    # FastAPI ignores it, and scoping still comes entirely from the session.
    await _make_booking(db_session, provider_id=other_provider.id, service_id=service.id, hour=9)

    resp = await logged_in_client.get("/api/bookings", params={"provider_id": str(other_provider.id)})

    assert resp.status_code == 200, resp.text
    assert resp.json() == []


async def test_list_bookings_status_filter(
    client: AsyncClient, logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service
):
    pending = await _make_booking(
        db_session, provider_id=provider.id, service_id=service.id, hour=9, status=BookingStatus.pending
    )
    await _make_booking(
        db_session, provider_id=provider.id, service_id=service.id, hour=11, status=BookingStatus.confirmed
    )

    resp = await logged_in_client.get("/api/bookings", params={"status": "pending"})

    assert resp.status_code == 200, resp.text
    ids = [b["id"] for b in resp.json()]
    assert ids == [str(pending.id)]


# ----------------------------------------------------------------------------
# PATCH /api/bookings/{id}/status
# ----------------------------------------------------------------------------


async def test_update_booking_status_requires_login(client: AsyncClient, db_session: AsyncSession, provider: Provider, service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, hour=9)

    resp = await client.patch(f"/api/bookings/{booking.id}/status", json={"status": "confirmed"})

    assert resp.status_code == 401


async def test_update_booking_status_rejects_another_masters_booking(
    client: AsyncClient,
    logged_in_client: AsyncClient,
    db_session: AsyncSession,
    other_provider: Provider,
    service,
):
    theirs = await _make_booking(
        db_session, provider_id=other_provider.id, service_id=service.id, hour=9, status=BookingStatus.pending
    )

    resp = await logged_in_client.patch(f"/api/bookings/{theirs.id}/status", json={"status": "confirmed"})

    assert resp.status_code == 404, resp.text

    # and it really wasn't touched — not "rejected but applied anyway"
    await db_session.refresh(theirs)
    assert theirs.status == BookingStatus.pending


async def test_update_booking_status_succeeds_for_own_booking(
    client: AsyncClient, logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service
):
    mine = await _make_booking(
        db_session, provider_id=provider.id, service_id=service.id, hour=9, status=BookingStatus.pending
    )

    resp = await logged_in_client.patch(f"/api/bookings/{mine.id}/status", json={"status": "confirmed"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "confirmed"
