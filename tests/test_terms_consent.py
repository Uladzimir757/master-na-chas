"""Согласие с регламентом: клиент — в заказе, мастер — в master_user."""

from datetime import datetime, time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY


async def test_master_accepts_terms(logged_in_client: AsyncClient):
    assert (await logged_in_client.get("/auth/me")).json()["terms_accepted"] is False
    assert (await logged_in_client.post("/auth/accept-terms")).status_code == 200
    assert (await logged_in_client.get("/auth/me")).json()["terms_accepted"] is True
    assert (await logged_in_client.post("/auth/accept-terms")).status_code == 200  # повтор безвреден


async def test_booking_records_client_consent(client: AsyncClient, db_session: AsyncSession, bookable_provider, service):
    def body(hour: int, **extra) -> dict:
        start = datetime.combine(NEXT_MONDAY, time(hour, 0), tzinfo=BUSINESS_TZ)
        return {
            "service_id": str(service.id), "provider_id": str(bookable_provider.id),
            "start_at": start.isoformat(), "client_name": "Jan", **extra,
        }

    a = await client.post("/api/bookings", json=body(9, terms_accepted=True))
    b = await client.post("/api/bookings", json=body(11))
    assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
    rows = {str(x.id): x for x in (await db_session.execute(select(Booking))).scalars()}
    assert rows[a.json()["id"]].terms_accepted_at is not None
    assert rows[b.json()["id"]].terms_accepted_at is None
