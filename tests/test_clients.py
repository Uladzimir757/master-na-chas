"""Карта клиента у мастера: история, заметки, личный чёрный список
(app/clients.py). Чёрный список только предупреждает — заказы не блокирует.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Provider, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY
from tests.test_staff_analytics import _login_as

PHONE = "+48600100200"


async def _booking(
    db: AsyncSession, provider: Provider, service: Service, *, hour: int, phone: str | None = PHONE,
    status: BookingStatus = BookingStatus.completed, price=100, name: str = "Jan Kowalski",
    visible: bool = True, day=None,
) -> Booking:
    start = datetime.combine(day or NEXT_MONDAY, datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=hour)
    b = Booking(
        id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
        client_name=name, client_phone=phone, start_at=start, end_at=start + timedelta(hours=1),
        status=status, price=price, client_phone_visible=visible,
    )
    db.add(b)
    await db.commit()
    return b


async def test_client_list_aggregates_history(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _booking(db_session, provider, service, hour=9, price=100)
    await _booking(db_session, provider, service, hour=11, price=50)
    await _booking(db_session, provider, service, hour=13, status=BookingStatus.no_show, price=None)
    await _booking(db_session, provider, service, hour=15, status=BookingStatus.cancelled, price=None)
    await _booking(db_session, provider, service, hour=16, phone="+48600999888", name="Anna")
    await _booking(db_session, provider, service, hour=17, phone=None, name="Bez numeru")
    await _booking(db_session, provider, service, hour=8, phone="+48600777666", name="Ukryty", visible=False)

    rows = (await logged_in_client.get("/api/providers/me/clients")).json()
    by_phone = {r["phone"]: r for r in rows}
    assert set(by_phone) == {PHONE, "+48600999888"}  # без номера и со скрытым номером — не попадают
    jan = by_phone[PHONE]
    assert (jan["orders"], jan["completed"], jan["no_show"], jan["cancelled"]) == (4, 2, 1, 1)
    assert float(jan["revenue"]) == 150

    found = (await logged_in_client.get("/api/providers/me/clients?q=anna")).json()
    assert [r["name"] for r in found] == ["Anna"]
    assert len((await logged_in_client.get("/api/providers/me/clients?q=600100")).json()) == 1


async def test_card_note_and_history(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    await _booking(db_session, provider, service, hour=9)
    r = await logged_in_client.put("/api/providers/me/clients/note", json={"phone": PHONE, "note": "  Pies w domu  "})
    assert r.status_code == 200, r.text

    card = (await logged_in_client.get("/api/providers/me/clients/card", params={"phone": PHONE})).json()
    assert card["note"] == "Pies w domu"
    assert card["orders"] == 1 and len(card["history"]) == 1 and card["blocked"] is False
    # пустая заметка очищает
    await logged_in_client.put("/api/providers/me/clients/note", json={"phone": PHONE, "note": " "})
    card = (await logged_in_client.get("/api/providers/me/clients/card", params={"phone": PHONE})).json()
    assert card["note"] is None


async def test_blacklist_warns_in_calendar_and_does_not_block(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    b = await _booking(db_session, provider, service, hour=9, status=BookingStatus.pending, price=None)
    r = await logged_in_client.put(
        "/api/providers/me/clients/blacklist",
        json={"phone": PHONE, "blocked": True, "reason": "no_payment", "comment": "Nie zapłacił za montaż"},
    )
    assert r.status_code == 200, r.text

    card = (await logged_in_client.get("/api/providers/me/clients/card", params={"phone": PHONE})).json()
    assert card["blocked"] is True and card["block_reason"] == "no_payment"
    assert card["block_comment"] == "Nie zapłacił za montaż"
    rows = (await logged_in_client.get("/api/providers/me/clients")).json()
    assert rows[0]["blocked"] is True

    day = NEXT_MONDAY.isoformat()
    cal = (await logged_in_client.get(f"/api/providers/me/calendar?date_from={day}&date_to={day}")).json()
    ev = next(x for x in cal["bookings"] if x["id"] == str(b.id))
    assert ev["client_blacklisted"] is True and ev["client_blacklist_reason"] == "no_payment"

    # заказ не заблокирован: мастер по-прежнему может подтвердить
    conf = await logged_in_client.patch(f"/api/bookings/{b.id}/status", json={"status": "confirmed", "travel_minutes": 30})
    assert conf.status_code == 200, conf.text
    assert conf.json()["client_blacklisted"] is True  # отметка не пропадает после смены статуса

    # снятие с чёрного списка стирает причину
    await logged_in_client.put("/api/providers/me/clients/blacklist", json={"phone": PHONE, "blocked": False})
    card = (await logged_in_client.get("/api/providers/me/clients/card", params={"phone": PHONE})).json()
    assert card["blocked"] is False and card["block_reason"] is None


async def test_marks_are_private_to_each_master(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    other = Provider(id=uuid.uuid4(), tenant_id=provider.tenant_id, name="Inny mistrz", travel_buffer_minutes=0)
    db_session.add(other)
    await db_session.flush()
    await _booking(db_session, other, service, hour=9)  # тот же номер у другого мастера
    await logged_in_client.put(
        "/api/providers/me/clients/blacklist", json={"phone": PHONE, "blocked": True, "reason": "rude"}
    )
    # у мастера other отметок нет, а у нас нет чужих заказов
    assert (await logged_in_client.get("/api/providers/me/clients")).json() == []
    card = (await logged_in_client.get("/api/providers/me/clients/card", params={"phone": PHONE})).json()
    assert card["orders"] == 0 and card["history"] == []


async def test_client_cards_need_permission_and_valid_phone(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider
):
    assert (
        await logged_in_client.get("/api/providers/me/clients/card", params={"phone": "1234"})
    ).status_code == 422
    assert (
        await logged_in_client.put("/api/providers/me/clients/note", json={"phone": "abc", "note": "x"})
    ).status_code == 422

    await _login_as(logged_in_client, db_session, provider, "worker")  # у работника права на карты нет
    assert (await logged_in_client.get("/api/providers/me/clients")).status_code == 403
    assert (
        await logged_in_client.put("/api/providers/me/clients/blacklist", json={"phone": PHONE, "blocked": True})
    ).status_code == 403
    await _login_as(logged_in_client, db_session, provider, "manager")
    assert (await logged_in_client.get("/api/providers/me/clients")).status_code == 200


async def test_new_order_notification_warns_about_blacklisted_client(
    db_session: AsyncSession, provider: Provider, service: Service, master_user, monkeypatch
):
    """Мастеру о новом заказе от клиента из его чёрного списка уходит
    предупреждение с причиной; от обычного клиента — без него."""
    import asyncio
    from datetime import timezone

    import app.main as main_mod
    from app.clients import set_blocked

    seen: list[dict] = []

    async def fake_notify_master(**kwargs):
        seen.append(kwargs)

    monkeypatch.setattr(main_mod, "notify_master", fake_notify_master)
    monkeypatch.setattr(main_mod, "run_in_background", lambda coro: asyncio.ensure_future(coro))

    b = await _booking(db_session, provider, service, hour=9, status=BookingStatus.pending, price=None)
    now = datetime.now(timezone.utc)

    await main_mod._notify_master_of_booking(db_session, b, "Montaż", now)
    await asyncio.sleep(0)
    assert seen and "client_warning" not in seen[-1]["facts"]

    await set_blocked(db_session, provider.id, PHONE, True, "no_access", None)
    seen.clear()
    await main_mod._notify_master_of_booking(db_session, b, "Montaż", now)
    await asyncio.sleep(0)
    assert seen[-1]["facts"]["client_warning"] == "was not home / did not open the door"
    assert "blacklist" in seen[-1]["purpose"]
