"""Запас времени до слота (задание 15.11.2026, часть B): клиент не может
заказать слот, который мастер не успеет подтвердить (CONFIRM_WINDOW, 15 мин)
и до которого не успеет доехать (provider.travel_buffer_minutes). В 13:51 при
буфере 30 мин первый слот — 14:45, а не 14:00. Ручные брони мастера — без
запаса. Время заморожено: app.slot_engine.utcnow (и его копия в app.main).
"""

from __future__ import annotations

from datetime import datetime, time

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.main as main
import app.slot_engine as slot_engine
from app.models import Provider, Service
from app.slot_engine import BUSINESS_TZ, get_availability
from tests.conftest import NEXT_MONDAY


def _at(h: int, m: int) -> datetime:
    return datetime.combine(NEXT_MONDAY, time(h, m), tzinfo=BUSINESS_TZ)


@pytest.fixture
def freeze(monkeypatch: pytest.MonkeyPatch):
    def _freeze(h: int, m: int) -> None:
        now = _at(h, m)
        monkeypatch.setattr(slot_engine, "utcnow", lambda: now)
        monkeypatch.setattr(main, "slot_utcnow", lambda: now)

    return _freeze


async def _first_slot(db: AsyncSession, service: Service, provider: Provider) -> datetime:
    slots = await get_availability(db, service, NEXT_MONDAY, NEXT_MONDAY, provider)
    return min(s.start_at for s in slots).astimezone(BUSINESS_TZ)


async def test_first_slot_leaves_time_to_confirm_and_travel(
    db_session: AsyncSession, bookable_provider: Provider, service: Service, freeze
):
    freeze(13, 51)
    bookable_provider.travel_buffer_minutes = 30
    await db_session.commit()
    # 13:51 + 15 + 30 = 14:36 -> next 15-min grid value 14:45
    assert (await _first_slot(db_session, service, bookable_provider)).time() == time(14, 45)

    bookable_provider.travel_buffer_minutes = 0
    await db_session.commit()
    # 13:51 + 15 = 14:06 -> 14:15
    assert (await _first_slot(db_session, service, bookable_provider)).time() == time(14, 15)


def _booking(service: Service, provider: Provider, start: datetime) -> dict:
    return {
        "service_id": str(service.id),
        "provider_id": str(provider.id),
        "start_at": start.isoformat(),
        "client_name": "Klient",
        "client_phone": "+48600111222",
    }


async def test_booking_inside_the_lead_is_refused_and_the_boundary_is_ok(
    client: AsyncClient, db_session: AsyncSession, bookable_provider: Provider, service: Service, freeze
):
    freeze(13, 45)
    bookable_provider.travel_buffer_minutes = 30
    await db_session.commit()
    # earliest = 13:45 + 15 + 30 = 14:30
    early = await client.post("/api/bookings", json=_booking(service, bookable_provider, _at(14, 15)))
    assert early.status_code == 409, early.text
    on_edge = await client.post("/api/bookings", json=_booking(service, bookable_provider, _at(14, 30)))
    assert on_edge.status_code == 201, on_edge.text


async def test_masters_own_booking_has_no_lead(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, freeze
):
    freeze(13, 51)
    provider.travel_buffer_minutes = 30
    await db_session.commit()
    r = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={"service_id": str(service.id), "start_at": _at(14, 0).isoformat(), "client_name": "Klient"},
    )
    assert r.status_code == 201, r.text
