"""Видимость телефонов (решение 12.11.2026): мастер выбирает, когда клиент
видит его номер; клиент при заказе решает, видит ли мастер его номер."""

from __future__ import annotations

from httpx import AsyncClient

from app.models import BookingStatus, Provider, Service
from tests.test_my_booking import TOKEN, _dt, _mk


async def _set_phone(c: AsyncClient, visibility: str, phone: str = "600 111 333"):
    r = await c.put("/api/providers/me/phone", json={"phone": phone, "phone_visibility": visibility})
    assert r.status_code == 200, r.text
    return r.json()


async def test_master_sets_phone_normalized(logged_in_client: AsyncClient):
    body = await _set_phone(logged_in_client, "always")
    assert body["phone"] == "+48600111333"
    assert body["phone_visibility"] == "always"
    bad = await logged_in_client.put("/api/providers/me/phone", json={"phone": "1234", "phone_visibility": "always"})
    assert bad.status_code == 422
    bad = await logged_in_client.put("/api/providers/me/phone", json={"phone": None, "phone_visibility": "never"})
    assert bad.status_code == 422


async def test_always_shows_phone_in_the_master_list(logged_in_client: AsyncClient, provider: Provider, provider_service):
    await _set_phone(logged_in_client, "always")
    r = await logged_in_client.get("/api/providers")
    assert [p["phone"] for p in r.json() if p["id"] == str(provider.id)] == ["+48600111333"]

    await _set_phone(logged_in_client, "after_booking")
    r = await logged_in_client.get("/api/providers")
    assert [p["phone"] for p in r.json() if p["id"] == str(provider.id)] == [None]


async def test_after_confirm_hides_phone_from_a_pending_booking(
    logged_in_client: AsyncClient, db_session, provider: Provider, service: Service
):
    await _set_phone(logged_in_client, "after_confirm")
    pending = await _mk(db_session, provider, service, _dt(10), status=BookingStatus.pending)
    r = await logged_in_client.get(f"/api/my-booking/{pending.id}?token={TOKEN}")
    assert r.json()["provider_phone"] is None

    confirmed = await _mk(db_session, provider, service, _dt(12), token="tok-2", status=BookingStatus.confirmed)
    r = await logged_in_client.get(f"/api/my-booking/{confirmed.id}?token=tok-2")
    assert r.json()["provider_phone"] == "+48600111333"


async def test_after_booking_shows_phone_while_active(
    logged_in_client: AsyncClient, db_session, provider: Provider, service: Service
):
    await _set_phone(logged_in_client, "after_booking")
    pending = await _mk(db_session, provider, service, _dt(10), status=BookingStatus.pending)
    r = await logged_in_client.get(f"/api/my-booking/{pending.id}?token={TOKEN}")
    assert r.json()["provider_phone"] == "+48600111333"

    cancelled = await _mk(db_session, provider, service, _dt(12), token="tok-3", status=BookingStatus.cancelled)
    r = await logged_in_client.get(f"/api/my-booking/{cancelled.id}?token=tok-3")
    assert r.json()["provider_phone"] is None


async def test_client_can_hide_own_phone_from_the_master(
    logged_in_client: AsyncClient, db_session, provider: Provider, service: Service
):
    hidden = await _mk(db_session, provider, service, _dt(10))
    hidden.client_phone_visible = False
    await db_session.commit()
    shown = await _mk(db_session, provider, service, _dt(12), token="tok-4", phone="+48600999888")

    r = await logged_in_client.get(f"/api/providers/me/calendar?date_from={_dt(10).date()}&date_to={_dt(10).date()}")
    assert r.status_code == 200, r.text
    phones = {b["id"]: b["client_phone"] for b in r.json()["bookings"]}
    assert phones[str(hidden.id)] is None
    assert phones[str(shown.id)] == "+48600999888"
