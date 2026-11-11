"""Таймер подтверждения заказа и время доезда
(docs/confirm-timer-travel-cities-task.md): дедлайн 15 минут от начала
рабочих часов мастера, напоминания из тика, автоотмена, 409 после дедлайна,
обязательное время доезда при подтверждении."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.main as main_module
from app.config import settings
from app.confirm_timer import PROVIDER_TIMEOUT, confirm_deadline_for, notices_due
from app.models import Booking, BookingStatus, Provider, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY
from tests.test_bookings_api import _payload

TICK = "tick-secret-for-tests"


def _local(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm), tzinfo=BUSINESS_TZ)


@pytest.fixture
def tick_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "TICK_SECRET", TICK)
    return TICK


@pytest.fixture
def staff_notices(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    sent: list[dict] = []

    async def fake(db, provider_id, purpose, facts, url="/cabinet/"):
        sent.append({"provider_id": provider_id, "purpose": purpose, "facts": facts, "url": url})

    monkeypatch.setattr(main_module, "_notify_staff", fake)
    return sent


async def _pending(
    db: AsyncSession, provider: Provider, service: Service, *, deadline: datetime | None, sent: int = 1, hour: int = 9
) -> Booking:
    start = _local(NEXT_MONDAY, hour)
    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=service.tenant_id,
        provider_id=provider.id,
        service_id=service.id,
        client_name="Клиент",
        client_phone="+48500100200",
        start_at=start,
        end_at=start + timedelta(hours=1),
        status=BookingStatus.pending,
        manage_token=uuid.uuid4().hex,
        confirm_deadline_at=deadline,
        confirm_notices_sent=sent,
    )
    db.add(booking)
    await db.commit()
    return booking


# ----------------------------------------------------------------------------
# расчёт дедлайна
# ----------------------------------------------------------------------------


async def test_deadline_inside_working_hours_runs_from_now(db_session: AsyncSession, bookable_provider: Provider):
    now = _local(NEXT_MONDAY, 10)
    deadline = await confirm_deadline_for(db_session, bookable_provider.id, now=now, start_at=_local(NEXT_MONDAY + timedelta(days=1), 12))
    assert deadline == now + timedelta(minutes=15)


async def test_deadline_off_hours_waits_for_next_working_start(db_session: AsyncSession, bookable_provider: Provider):
    now = _local(NEXT_MONDAY, 22)
    deadline = await confirm_deadline_for(db_session, bookable_provider.id, now=now, start_at=_local(NEXT_MONDAY + timedelta(days=2), 12))
    assert deadline == _local(NEXT_MONDAY + timedelta(days=1), 9, 15)


async def test_deadline_for_first_morning_slot_starts_immediately(db_session: AsyncSession, bookable_provider: Provider):
    # ночью на первый утренний слот: ждать рабочих часов нельзя — отменился бы,
    # не дойдя до мастера
    now = _local(NEXT_MONDAY, 22)
    deadline = await confirm_deadline_for(db_session, bookable_provider.id, now=now, start_at=_local(NEXT_MONDAY + timedelta(days=1), 9))
    assert deadline == now + timedelta(minutes=15)


async def test_deadline_without_working_hours_runs_from_now(db_session: AsyncSession, provider: Provider):
    now = _local(NEXT_MONDAY, 22)
    deadline = await confirm_deadline_for(db_session, provider.id, now=now, start_at=_local(NEXT_MONDAY + timedelta(days=3), 12))
    assert deadline == now + timedelta(minutes=15)


def test_notices_due_steps_every_five_minutes():
    deadline = datetime(2026, 11, 16, 10, 15, tzinfo=timezone.utc)
    b = Booking(confirm_deadline_at=deadline)
    at = lambda m: datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc) + timedelta(minutes=m)  # noqa: E731
    assert notices_due(b, at(-1)) == 0
    assert [notices_due(b, at(m)) for m in (0, 4, 5, 9, 10, 14)] == [1, 1, 2, 2, 3, 3]


# ----------------------------------------------------------------------------
# создание брони
# ----------------------------------------------------------------------------


async def test_client_booking_gets_a_deadline(client: AsyncClient, bookable_provider: Provider, service: Service):
    resp = await client.post("/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(12, 0)))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "pending" and body["confirm_deadline_at"] is not None


async def test_auto_confirmed_booking_has_no_timer(
    client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    bookable_provider.requires_booking_confirmation = False
    await db_session.commit()
    resp = await client.post("/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(12, 0)))
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "confirmed" and resp.json()["confirm_deadline_at"] is None


# ----------------------------------------------------------------------------
# тик
# ----------------------------------------------------------------------------


async def test_tick_requires_secret(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TICK_SECRET", "")
    assert (await client.post("/internal/tick")).status_code == 403
    monkeypatch.setattr(settings, "TICK_SECRET", TICK)
    assert (await client.post("/internal/tick", headers={"X-Tick-Secret": "wrong"})).status_code == 403


async def test_tick_sends_reminder_once(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, tick_secret: str, staff_notices: list
):
    # таймер идёт 6 минут — пора первое напоминание (уведомление о заказе уже ушло)
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(minutes=9))
    for _ in range(2):
        resp = await client.post("/internal/tick", headers={"X-Tick-Secret": tick_secret})
        assert resp.status_code == 200, resp.text
    assert len(staff_notices) == 1
    assert "Remind" in staff_notices[0]["purpose"]
    assert staff_notices[0]["facts"]["minutes_left"] == 9
    assert staff_notices[0]["url"] == f"/cabinet/?booking={booking.id}"
    await db_session.refresh(booking)
    assert booking.confirm_notices_sent == 2


async def test_tick_sends_deferred_new_booking_notice_when_hours_begin(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, tick_secret: str, staff_notices: list
):
    # заказ пришёл ночью (notices_sent=0), рабочие часы начались — первое
    # сообщение мастеру именно о новом заказе, не напоминание
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(minutes=15), sent=0)
    await client.post("/internal/tick", headers={"X-Tick-Secret": tick_secret})
    assert len(staff_notices) == 1
    assert "new job" in staff_notices[0]["purpose"]
    await db_session.refresh(booking)
    assert booking.confirm_notices_sent == 1


async def test_tick_stays_quiet_before_working_hours(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, tick_secret: str, staff_notices: list
):
    await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(hours=8), sent=0)
    await client.post("/internal/tick", headers={"X-Tick-Secret": tick_secret})
    assert staff_notices == []


async def test_tick_cancels_overdue_booking(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, tick_secret: str, staff_notices: list
):
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) - timedelta(seconds=1), sent=3)
    await client.post("/internal/tick", headers={"X-Tick-Secret": tick_secret})
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.cancelled and booking.cancel_reason == PROVIDER_TIMEOUT
    assert staff_notices == []


async def test_overdue_booking_frees_its_slot_without_a_tick(
    client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service
):
    await _pending(db_session, bookable_provider, service, deadline=datetime.now(timezone.utc) - timedelta(minutes=1), hour=12)
    resp = await client.post("/api/bookings", json=_payload(service_id=service.id, provider_id=bookable_provider.id, start=time(12, 0)))
    assert resp.status_code == 201, resp.text


# ----------------------------------------------------------------------------
# подтверждение мастером
# ----------------------------------------------------------------------------


async def test_confirm_after_deadline_is_409_even_before_the_tick(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) - timedelta(seconds=5))
    resp = await logged_in_client.patch(
        f"/api/bookings/{booking.id}/status", json={"status": "confirmed", "travel_minutes": 30}
    )
    assert resp.status_code == 409
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.cancelled and booking.cancel_reason == PROVIDER_TIMEOUT


async def test_confirm_requires_travel_time(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(minutes=10))
    url = f"/api/bookings/{booking.id}/status"
    assert (await logged_in_client.patch(url, json={"status": "confirmed"})).status_code == 422
    assert (await logged_in_client.patch(url, json={"status": "confirmed", "travel_minutes": 20})).status_code == 422

    resp = await logged_in_client.patch(url, json={"status": "confirmed", "travel_minutes": 45})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "confirmed" and resp.json()["travel_minutes"] == 45


async def test_cancel_does_not_need_travel_time(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(minutes=10))
    resp = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "cancelled"})
    assert resp.status_code == 200, resp.text


async def test_confirmed_booking_stops_reminders(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service,
    tick_secret: str, staff_notices: list,
):
    booking = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) + timedelta(minutes=4))
    await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "confirmed", "travel_minutes": 15})
    await logged_in_client.post("/internal/tick", headers={"X-Tick-Secret": tick_secret})
    assert staff_notices == []


# ----------------------------------------------------------------------------
# аналитика
# ----------------------------------------------------------------------------


async def test_analytics_counts_timeouts_apart_from_cancellations(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    timed_out = await _pending(db_session, provider, service, deadline=datetime.now(timezone.utc) - timedelta(minutes=1))
    cancelled = await _pending(db_session, provider, service, deadline=None, hour=12)
    cancelled.status = BookingStatus.cancelled
    await db_session.commit()

    day = NEXT_MONDAY.isoformat()
    resp = await logged_in_client.get(f"/api/providers/me/analytics?date_from={day}&date_to={day}")
    assert resp.status_code == 200, resp.text
    [row] = resp.json()["services"]
    assert row["timed_out"] == 1 and row["cancelled"] == 1
    await db_session.refresh(timed_out)
    assert timed_out.cancel_reason == PROVIDER_TIMEOUT
