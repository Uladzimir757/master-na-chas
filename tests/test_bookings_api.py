"""POST /api/bookings — happy path, the double-booking guarantee, the rate
limit, and the requires_booking_confirmation branch (app/main.py's
create_booking)."""

from __future__ import annotations

from datetime import datetime, time

from httpx import AsyncClient

from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY


def _payload(*, service_id, provider_id, start: time, client_name: str = "Клиент") -> dict:
    start_at = datetime.combine(NEXT_MONDAY, start, tzinfo=BUSINESS_TZ)
    return {
        "service_id": str(service_id),
        "provider_id": str(provider_id),
        "start_at": start_at.isoformat(),
        "client_name": client_name,
    }


async def test_create_booking_happy_path(client: AsyncClient, bookable_provider, service):
    payload = _payload(service_id=service.id, provider_id=bookable_provider.id, start=time(9, 0))

    resp = await client.post("/api/bookings", json=payload)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["provider_id"] == str(bookable_provider.id)
    assert body["service_id"] == str(service.id)
    assert body["status"] in ("pending", "confirmed")


async def test_create_booking_conflict_is_enforced_by_db_constraint(client: AsyncClient, bookable_provider, service):
    # app/main.py's create_booking has NO application-level "is this slot
    # free" check before the INSERT — only db/schema.sql's
    # `EXCLUDE USING gist (provider_id WITH =, tstzrange(...) WITH &&)`
    # stands between this and a double-booking, so a 409 here can only come
    # from that constraint (via the IntegrityError branch), not from code.
    first = _payload(service_id=service.id, provider_id=bookable_provider.id, start=time(10, 0))
    second = _payload(
        service_id=service.id, provider_id=bookable_provider.id, start=time(10, 30), client_name="Другой клиент"
    )  # overlaps the first booking's 10:00-11:00 (duration_minutes=60)

    ok = await client.post("/api/bookings", json=first)
    assert ok.status_code == 201, ok.text

    conflict = await client.post("/api/bookings", json=second)
    assert conflict.status_code == 409, conflict.text

    # and the DB really does hold only the one booking — the conflicting
    # request's transaction was rolled back, not partially applied
    listed = await client.get("/api/bookings", params={"provider_id": str(bookable_provider.id)})
    assert len(listed.json()) == 1


async def test_rate_limit_allows_five_then_blocks_the_sixth(client: AsyncClient, bookable_provider, service):
    # 5 distinct, non-overlapping slots so all 5 succeed on their own merits —
    # the 6th must be blocked by the rate limiter itself (before even
    # reaching the handler), not by an incidental business-logic rejection.
    hours = [9, 11, 13, 15, 17]
    for hour in hours:
        payload = _payload(service_id=service.id, provider_id=bookable_provider.id, start=time(hour, 0))
        resp = await client.post("/api/bookings", json=payload)
        assert resp.status_code == 201, resp.text

    sixth = _payload(service_id=service.id, provider_id=bookable_provider.id, start=time(19, 0))
    resp = await client.post("/api/bookings", json=sixth)
    assert resp.status_code == 429, resp.text


async def test_booking_starts_pending_when_provider_requires_confirmation(
    client: AsyncClient, bookable_provider, service, db_session
):
    bookable_provider.requires_booking_confirmation = True
    await db_session.commit()

    resp = await client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(9, 0))
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "pending"


async def test_booking_auto_confirms_when_provider_does_not_require_confirmation(
    client: AsyncClient, bookable_provider, service, db_session
):
    bookable_provider.requires_booking_confirmation = False
    await db_session.commit()

    resp = await client.post(
        "/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(9, 0))
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "confirmed"
