"""GET/PUT /api/providers/me/services — the per-master services checklist
(app/main.py's get_my_services/update_my_services), and the knock-on effect
of ProviderService.is_active on availability + booking creation.

Regression coverage for a real gap found while building this feature: before
this, an explicit provider_id in GET /api/availability or POST /api/bookings
was never checked against ProviderService at all — a provider always looked
"eligible" for any service as long as he had working hours, even one he'd
never been linked to (or has since turned off). See
app/slot_engine.py's provider_offers_service.
"""

from __future__ import annotations

from datetime import time

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Provider, ProviderService, Service, Tenant
from app.slot_engine import BUSINESS_TZ, get_availability
from tests.conftest import NEXT_MONDAY
from tests.test_bookings_api import _payload


@pytest_asyncio.fixture
async def other_service(db_session: AsyncSession, tenant: Tenant) -> Service:
    import uuid

    row = Service(id=uuid.uuid4(), tenant_id=tenant.id, name="Электрика", duration_minutes=45)
    db_session.add(row)
    await db_session.commit()
    return row


# ----------------------------------------------------------------------------
# GET/PUT /api/providers/me/services
# ----------------------------------------------------------------------------


async def test_get_my_services_requires_login(client: AsyncClient):
    resp = await client.get("/api/providers/me/services")
    assert resp.status_code == 401


async def test_get_my_services_reports_current_offer_state(
    logged_in_client: AsyncClient, provider_service: None, service: Service, other_service: Service
):
    # provider_service links `provider` to `service` only — other_service is
    # untouched, so it must come back is_offered=False.
    resp = await logged_in_client.get("/api/providers/me/services")

    assert resp.status_code == 200, resp.text
    by_id = {row["service_id"]: row for row in resp.json()}
    assert by_id[str(service.id)]["is_offered"] is True
    assert by_id[str(other_service.id)]["is_offered"] is False


async def test_put_my_services_turns_a_service_on(
    logged_in_client: AsyncClient, provider: Provider, service: Service, db_session: AsyncSession
):
    # deliberately no provider_service fixture — provider offers nothing yet
    resp = await logged_in_client.put("/api/providers/me/services", json={"service_ids": [str(service.id)]})

    assert resp.status_code == 200, resp.text
    body = {row["service_id"]: row["is_offered"] for row in resp.json()}
    assert body[str(service.id)] is True

    link = (
        await db_session.execute(
            select(ProviderService).where(
                ProviderService.provider_id == provider.id, ProviderService.service_id == service.id
            )
        )
    ).scalar_one()
    assert link.is_active is True


async def test_put_my_services_turns_a_service_off_without_deleting_the_row(
    logged_in_client: AsyncClient, provider: Provider, provider_service: None, service: Service, db_session: AsyncSession
):
    # provider_service fixture already links provider->service (active).
    # PUT with an empty set turns it off.
    resp = await logged_in_client.put("/api/providers/me/services", json={"service_ids": []})

    assert resp.status_code == 200, resp.text
    body = {row["service_id"]: row["is_offered"] for row in resp.json()}
    assert body[str(service.id)] is False

    # the row itself is still there, just flipped — not deleted (see
    # ProviderService's docstring: is_active over delete/recreate)
    link = (
        await db_session.execute(
            select(ProviderService).where(
                ProviderService.provider_id == provider.id, ProviderService.service_id == service.id
            )
        )
    ).scalar_one()
    assert link.is_active is False


async def test_put_my_services_is_scoped_to_the_caller_own_provider(
    logged_in_client: AsyncClient,
    provider: Provider,
    provider_service: None,
    service: Service,
    db_session: AsyncSession,
    tenant: Tenant,
):
    import uuid

    other_provider = Provider(id=uuid.uuid4(), tenant_id=tenant.id, name="Другой", travel_buffer_minutes=0)
    db_session.add(other_provider)
    db_session.add(ProviderService(provider_id=other_provider.id, service_id=service.id, is_active=True))
    await db_session.commit()

    # caller (provider) turns his own link off — other_provider's must be untouched
    resp = await logged_in_client.put("/api/providers/me/services", json={"service_ids": []})
    assert resp.status_code == 200, resp.text

    other_link = (
        await db_session.execute(
            select(ProviderService).where(
                ProviderService.provider_id == other_provider.id, ProviderService.service_id == service.id
            )
        )
    ).scalar_one()
    assert other_link.is_active is True


async def test_put_my_services_silently_ignores_unknown_ids(logged_in_client: AsyncClient, service: Service):
    import uuid

    resp = await logged_in_client.put(
        "/api/providers/me/services", json={"service_ids": [str(service.id), str(uuid.uuid4())]}
    )

    assert resp.status_code == 200, resp.text
    ids = {row["service_id"] for row in resp.json()}
    assert ids == {str(service.id)}


# ----------------------------------------------------------------------------
# Knock-on effect: availability + booking creation must respect is_active
# ----------------------------------------------------------------------------


async def test_availability_excludes_a_provider_who_turned_the_service_off(
    db_session: AsyncSession, provider: Provider, service: Service
):
    from tests.test_slot_engine import _add_working_hours

    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    db_session.add(ProviderService(provider_id=provider.id, service_id=service.id, is_active=False))
    await db_session.commit()

    # "любой доступный мастер" — provider=None merges eligible providers;
    # none are eligible here
    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=None)
    assert slots == []


async def test_availability_returns_empty_for_an_explicit_provider_not_offering_the_service(
    db_session: AsyncSession, provider: Provider, service: Service
):
    from tests.test_slot_engine import _add_working_hours

    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    # deliberately no ProviderService row at all

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)
    assert slots == []


async def test_create_booking_rejects_a_provider_not_offering_the_service(
    client: AsyncClient, provider: Provider, service: Service, db_session: AsyncSession
):
    from tests.test_slot_engine import _add_working_hours

    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    # no ProviderService link — provider has working hours but doesn't do
    # this service; a hand-crafted/stale request naming both explicitly
    # must still be rejected, not silently accepted

    resp = await client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=provider.id, start=time(9, 0))
    )

    assert resp.status_code == 404, resp.text


async def test_create_booking_rejects_a_provider_who_turned_the_service_off(
    client: AsyncClient, provider: Provider, service: Service, db_session: AsyncSession
):
    from tests.test_slot_engine import _add_working_hours

    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    db_session.add(ProviderService(provider_id=provider.id, service_id=service.id, is_active=False))
    await db_session.commit()

    resp = await client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=provider.id, start=time(9, 0))
    )

    assert resp.status_code == 404, resp.text


async def test_create_booking_succeeds_for_a_provider_offering_the_service(
    client: AsyncClient, bookable_provider: Provider, service: Service
):
    resp = await client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(9, 0))
    )
    assert resp.status_code == 201, resp.text
