"""Публичная страница «Моя запись»: просмотр, отмена/перенос по manage_token,
окно изменений, история по телефону."""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Provider, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

TOKEN = "tok-123"


def _dt(h: int, day=NEXT_MONDAY) -> datetime:
    return datetime.combine(day, time(h, 0), tzinfo=BUSINESS_TZ)


async def _mk(db: AsyncSession, provider: Provider, service: Service, start: datetime, *, token=TOKEN, phone="+48600111222",
              status=BookingStatus.confirmed) -> Booking:
    b = Booking(
        id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
        client_name="Клиент", client_phone=phone, start_at=start, end_at=start + timedelta(hours=1),
        status=status, manage_token=token,
    )
    db.add(b)
    await db.commit()
    return b


async def test_wrong_token_or_id_is_404(client: AsyncClient, db_session, bookable_provider: Provider, service: Service):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    assert (await client.get(f"/api/my-booking/{b.id}?token=bad")).status_code == 404
    assert (await client.get(f"/api/my-booking/{uuid.uuid4()}?token={TOKEN}")).status_code == 404


async def test_view_and_cancel(client: AsyncClient, db_session, bookable_provider: Provider, service: Service):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    r = await client.get(f"/api/my-booking/{b.id}?token={TOKEN}")
    assert r.status_code == 200 and r.json()["can_change"] is True
    r = await client.post(f"/api/my-booking/{b.id}/cancel?token={TOKEN}")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert r.json()["can_change"] is False
    # повторная отмена невозможна
    assert (await client.post(f"/api/my-booking/{b.id}/cancel?token={TOKEN}")).status_code == 409


async def test_cannot_change_inside_window(client: AsyncClient, db_session, bookable_provider: Provider, service: Service):
    soon = datetime.now(timezone.utc) + timedelta(hours=1)
    b = await _mk(db_session, bookable_provider, service, soon)
    r = await client.get(f"/api/my-booking/{b.id}?token={TOKEN}")
    assert r.json()["can_change"] is False
    assert (await client.post(f"/api/my-booking/{b.id}/cancel?token={TOKEN}")).status_code == 409


async def test_reschedule_to_free_slot_and_reject_unavailable(
    client: AsyncClient, db_session, bookable_provider: Provider, service: Service
):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    ok = await client.post(f"/api/my-booking/{b.id}/reschedule", json={"token": TOKEN, "start_at": _dt(14).isoformat()})
    assert ok.status_code == 200, ok.text
    assert datetime.fromisoformat(ok.json()["start_at"]) == _dt(14)
    # вне рабочих часов — не слот
    bad = await client.post(f"/api/my-booking/{b.id}/reschedule", json={"token": TOKEN, "start_at": _dt(22).isoformat()})
    assert bad.status_code == 409


async def test_reschedule_onto_other_booking_rejected(
    client: AsyncClient, db_session, bookable_provider: Provider, service: Service
):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    await _mk(db_session, bookable_provider, service, _dt(14), token="other")
    r = await client.post(f"/api/my-booking/{b.id}/reschedule", json={"token": TOKEN, "start_at": _dt(14).isoformat()})
    assert r.status_code == 409


async def test_history_by_phone(client: AsyncClient, db_session, bookable_provider: Provider, service: Service):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    await _mk(db_session, bookable_provider, service, _dt(12), token="t2", status=BookingStatus.completed)
    await _mk(db_session, bookable_provider, service, _dt(15), token="t3", phone="+48999999999")
    r = await client.get(f"/api/my-booking/{b.id}/history?token={TOKEN}")
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_service_name_follows_the_page_language(
    client: AsyncClient, db_session, bookable_provider: Provider, service: Service
):
    # было: «моя запись» отдавала внутреннее (русское) Service.name при
    # польской странице — половина текста по-русски
    service.name_pl, service.name_en = "Montaż mebli", "Furniture assembly"
    await db_session.commit()
    b = await _mk(db_session, bookable_provider, service, _dt(10))

    assert (await client.get(f"/api/my-booking/{b.id}?token={TOKEN}&lang=pl")).json()["service_name"] == "Montaż mebli"
    assert (await client.get(f"/api/my-booking/{b.id}?token={TOKEN}&lang=en")).json()["service_name"] == "Furniture assembly"
    history = (await client.get(f"/api/my-booking/{b.id}/history?token={TOKEN}&lang=pl")).json()
    assert {h["service_name"] for h in history} == {"Montaż mebli"}


async def test_tracking_window_is_reported(client: AsyncClient, db_session, bookable_provider: Provider, service: Service):
    b = await _mk(db_session, bookable_provider, service, _dt(10))
    body = (await client.get(f"/api/my-booking/{b.id}?token={TOKEN}")).json()
    assert datetime.fromisoformat(body["tracking_from"]) == _dt(8)


# ----------------------------------------------------------------------------
# Лимит отмены/переноса клиентом — настройка мастера (15.11.2026, макс. 3 ч)
# ----------------------------------------------------------------------------


async def test_master_sets_the_client_change_limit(logged_in_client: AsyncClient):
    ok = await logged_in_client.put("/api/providers/me/client-change-limit", json={"minutes": 30})
    assert ok.status_code == 200, ok.text
    assert ok.json()["client_change_min_minutes"] == 30
    too_long = await logged_in_client.put("/api/providers/me/client-change-limit", json={"minutes": 181})
    assert too_long.status_code == 422


async def test_avatar_is_saved_and_shown_publicly(logged_in_client: AsyncClient, client: AsyncClient):
    img = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    r = await logged_in_client.put("/api/providers/me/avatar", json={"avatar": img})
    assert r.status_code == 200, r.text
    assert r.json()["avatar"] == img
    public = await client.get("/api/providers")
    assert any(p.get("avatar") == img for p in public.json())
    bad = await logged_in_client.put("/api/providers/me/avatar", json={"avatar": "https://evil.example/x.png"})
    assert bad.status_code == 422
    cleared = await logged_in_client.put("/api/providers/me/avatar", json={"avatar": None})
    assert cleared.json()["avatar"] is None


async def test_the_masters_limit_decides_until_when_the_client_can_change(
    client: AsyncClient, db_session, bookable_provider: Provider, service: Service
):
    b = await _mk(db_session, bookable_provider, service, datetime.now(timezone.utc) + timedelta(minutes=60))
    bookable_provider.client_change_min_minutes = 30
    await db_session.commit()
    assert (await client.get(f"/api/my-booking/{b.id}?token={TOKEN}")).json()["can_change"] is True
    bookable_provider.client_change_min_minutes = 90
    await db_session.commit()
    assert (await client.get(f"/api/my-booking/{b.id}?token={TOKEN}")).json()["can_change"] is False
    assert (await client.post(f"/api/my-booking/{b.id}/cancel?token={TOKEN}")).status_code == 409


async def test_a_client_with_a_booking_today_still_sees_the_exact_point(
    client: AsyncClient, db_session, provider: Provider, service: Service
):
    # вариант 2 (15.11.2026): из публичного списка точка убрана, но клиент
    # с заказом на сегодня видит мастера на карте страницы заказа
    from app.models import WorkingHours

    db_session.add(WorkingHours(id=uuid.uuid4(), provider_id=provider.id,
                                weekday=datetime.now(BUSINESS_TZ).weekday(),
                                start_time=time(0, 0), end_time=time(23, 59, 59)))
    provider.share_location = True
    provider.location_lat = 54.5189
    provider.location_lng = 18.5305
    provider.location_updated_at = datetime.now(timezone.utc)
    await db_session.commit()
    b = await _mk(db_session, provider, service, datetime.now(timezone.utc) + timedelta(minutes=30), token="mt-loc")

    mine = (await client.get(f"/api/my-booking/{b.id}?token=mt-loc")).json()
    assert mine["location"]["lat"] == 54.5189 and mine["location"]["lng"] == 18.5305
    public = (await client.get("/api/providers")).json()
    assert all(p["location"] is None for p in public)


async def test_master_writes_about_and_it_shows_publicly(logged_in_client: AsyncClient, client: AsyncClient):
    r = await logged_in_client.put("/api/providers/me/about", json={"about": "  20 lat w zawodzie, hydraulika i elektryka.  "})
    assert r.status_code == 200, r.text
    assert r.json()["about"] == "20 lat w zawodzie, hydraulika i elektryka."
    public = (await client.get("/api/providers")).json()
    assert any(p.get("about") == "20 lat w zawodzie, hydraulika i elektryka." for p in public)
    too_long = await logged_in_client.put("/api/providers/me/about", json={"about": "x" * 601})
    assert too_long.status_code == 422
    cleared = await logged_in_client.put("/api/providers/me/about", json={"about": "   "})
    assert cleared.json()["about"] is None


async def test_booking_description_reaches_the_master(
    client: AsyncClient, logged_in_client: AsyncClient, db_session, bookable_provider: Provider, service: Service
):
    # «Opisz, co trzeba zrobić» (20.11.2026) — trimmed, capped, shown to the master
    payload = {
        "service_id": str(service.id),
        "provider_id": str(bookable_provider.id),
        "start_at": _dt(10).isoformat(),
        "client_name": "Klient",
        "client_phone": "+48600111222",
        "notes": "  Cieknie kran w kuchni, mam część zamienną.  ",
    }
    r = await client.post("/api/bookings", json=payload)
    assert r.status_code == 201, r.text
    cal = await logged_in_client.get(
        "/api/providers/me/calendar", params={"date_from": NEXT_MONDAY.isoformat(), "date_to": NEXT_MONDAY.isoformat()}
    )
    mine = [b for b in cal.json()["bookings"] if b["id"] == r.json()["id"]]
    assert mine and mine[0]["notes"] == "Cieknie kran w kuchni, mam część zamienną."

    too_long = await client.post("/api/bookings", json={**payload, "start_at": _dt(14).isoformat(), "notes": "x" * 1001})
    assert too_long.status_code == 422
