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
