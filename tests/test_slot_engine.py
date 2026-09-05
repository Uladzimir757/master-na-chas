"""app/slot_engine.py — the availability-generation core. These go straight
through db_session/get_availability (no HTTP layer): this is pure business
logic over working_hours/booking rows that's cheaper and clearer to test
directly than through the API.

Every test also depends on `provider_service` — get_availability(provider=...)
now returns [] outright for a provider that isn't linked to the service
(ProviderService.is_active — see tests/test_provider_services.py for that
behavior itself); without the link these tests would get an empty list for
the wrong reason and their real assertions (working hours, buffers, timezone)
would never actually run.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Provider, Service, WorkingHours
from app.slot_engine import BUSINESS_TZ, get_availability
from tests.conftest import NEXT_MONDAY


async def _add_working_hours(db_session: AsyncSession, provider: Provider, weekday: int, start: time, end: time) -> None:
    db_session.add(
        WorkingHours(id=uuid.uuid4(), provider_id=provider.id, weekday=weekday, start_time=start, end_time=end)
    )
    await db_session.commit()


async def _add_booking(
    db_session: AsyncSession, provider: Provider, service: Service, start: time, end: time, status: BookingStatus
) -> None:
    db_session.add(
        Booking(
            id=uuid.uuid4(),
            tenant_id=provider.tenant_id,
            provider_id=provider.id,
            service_id=service.id,
            client_name="Busy",
            start_at=datetime.combine(NEXT_MONDAY, start, tzinfo=BUSINESS_TZ),
            end_at=datetime.combine(NEXT_MONDAY, end, tzinfo=BUSINESS_TZ),
            status=status,
        )
    )
    await db_session.commit()


async def test_slots_respect_working_hours_window(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(12, 0))

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)

    assert len(slots) > 0
    for s in slots:
        assert s.start_at.time() >= time(9, 0)
        assert s.end_at.time() <= time(12, 0)
    assert min(s.start_at for s in slots).time() == time(9, 0)
    assert max(s.end_at for s in slots).time() == time(12, 0)


async def test_no_working_hours_means_no_slots(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    # deliberately: no WorkingHours row at all for this provider/weekday
    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)
    assert slots == []


async def test_existing_booking_blocks_its_own_time(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    await _add_booking(db_session, provider, service, time(12, 0), time(13, 0), BookingStatus.confirmed)

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)

    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    busy_end = datetime.combine(NEXT_MONDAY, time(13, 0), tzinfo=BUSINESS_TZ)
    for s in slots:
        assert s.end_at <= busy_start or s.start_at >= busy_end
    # sanity: slots do exist both before and after the busy window — the
    # window isn't just empty for some unrelated reason
    assert any(s.end_at <= busy_start for s in slots)
    assert any(s.start_at >= busy_end for s in slots)


async def test_travel_buffer_extends_the_blocked_range(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    provider.travel_buffer_minutes = 30
    await db_session.commit()
    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(18, 0))
    await _add_booking(db_session, provider, service, time(12, 0), time(13, 0), BookingStatus.confirmed)

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)

    busy_start = datetime.combine(NEXT_MONDAY, time(12, 0), tzinfo=BUSINESS_TZ)
    busy_end = datetime.combine(NEXT_MONDAY, time(13, 0), tzinfo=BUSINESS_TZ)
    buffer = timedelta(minutes=30)
    for s in slots:
        assert s.end_at <= busy_start - buffer or s.start_at >= busy_end + buffer
    # without the buffer, a slot ending exactly at busy_start (e.g. 11:00-12:00)
    # would be allowed (touching endpoints don't overlap) — the buffer must
    # exclude it too, since it now falls inside the buffered range
    assert not any(busy_start - buffer < s.end_at <= busy_start for s in slots)


async def test_cancelled_booking_does_not_block_slots(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(12, 0))
    await _add_booking(db_session, provider, service, time(9, 0), time(10, 0), BookingStatus.cancelled)

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)

    busy_start = datetime.combine(NEXT_MONDAY, time(9, 0), tzinfo=BUSINESS_TZ)
    assert any(s.start_at == busy_start for s in slots)


async def test_slots_are_tagged_with_business_timezone(db_session: AsyncSession, provider: Provider, service: Service, provider_service: None):
    await _add_working_hours(db_session, provider, NEXT_MONDAY.weekday(), time(9, 0), time(10, 0))

    slots = await get_availability(db_session, service, NEXT_MONDAY, NEXT_MONDAY, provider=provider)

    assert len(slots) == 1
    s = slots[0]
    assert s.start_at.tzinfo is not None
    assert s.start_at.hour == 9  # wall-clock hour, not shifted to UTC
    # CET (+1) or CEST (+2) depending on time of year — either way, confirms
    # this is really Europe/Warsaw and not e.g. UTC (+0) by accident
    assert s.start_at.utcoffset() in (timedelta(hours=1), timedelta(hours=2))
