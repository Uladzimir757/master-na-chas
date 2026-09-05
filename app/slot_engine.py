"""Core reusable slot-availability logic. Nothing here knows or cares whether
the provider is a mechanic (Garage System) or a handyman (this project) —
that's entirely captured by provider.travel_buffer_minutes and by which
service_id is asked for. See docs/decisions.md for why this exists as its
own module rather than copy-pasted per project."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Booking,
    BookingStatus,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
    WorkingHoursException,
)

# working_hours.start_time/end_time are naive wall-clock (e.g. "09:00") —
# someone's actual local business hours, not UTC. Single-tenant, single
# country for now (docs/decisions.md: no multi-tenancy), so one fixed zone
# is the right-sized choice; revisit if providers ever span timezones.
# All comparisons against Booking.start_at/end_at (timestamptz, tz-aware —
# see models.TZDateTime) must go through this, or naive-vs-aware datetime
# comparisons raise TypeError (found via a live /api/availability 500 after
# the TZDateTime fix made bookings tz-aware while this stayed naive).
BUSINESS_TZ = ZoneInfo("Europe/Warsaw")


class SlotOut(BaseModel):
    provider_id: uuid.UUID
    start_at: datetime
    end_at: datetime


async def _slots_for_one_provider(
    db: AsyncSession,
    provider: Provider,
    service: Service,
    date_from: date,
    date_to: date,
    step_minutes: int = 15,
) -> list[SlotOut]:
    duration = timedelta(minutes=service.duration_minutes)
    buffer = timedelta(minutes=provider.travel_buffer_minutes)
    step = timedelta(minutes=step_minutes)

    template_rows = (
        (await db.execute(select(WorkingHours).where(WorkingHours.provider_id == provider.id)))
        .scalars()
        .all()
    )
    template_by_weekday: dict[int, list[WorkingHours]] = {}
    for row in template_rows:
        template_by_weekday.setdefault(row.weekday, []).append(row)

    exceptions = (
        (
            await db.execute(
                select(WorkingHoursException).where(
                    WorkingHoursException.provider_id == provider.id,
                    WorkingHoursException.date >= date_from,
                    WorkingHoursException.date <= date_to,
                )
            )
        )
        .scalars()
        .all()
    )
    exception_by_date = {e.date: e for e in exceptions}

    existing = (
        (
            await db.execute(
                select(Booking).where(
                    Booking.provider_id == provider.id,
                    Booking.status != BookingStatus.cancelled,
                    Booking.start_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=BUSINESS_TZ),
                    Booking.end_at > datetime.combine(date_from, time.min, tzinfo=BUSINESS_TZ),
                )
            )
        )
        .scalars()
        .all()
    )
    busy_ranges = [(b.start_at - buffer, b.end_at + buffer) for b in existing]

    def overlaps_busy(start: datetime, end: datetime) -> bool:
        return any(start < busy_end and end > busy_start for busy_start, busy_end in busy_ranges)

    slots: list[SlotOut] = []
    current_day = date_from
    while current_day <= date_to:
        exception = exception_by_date.get(current_day)
        if exception is not None:
            if not exception.is_available:
                current_day += timedelta(days=1)
                continue
            day_windows = [(exception.start_time, exception.end_time)] if exception.start_time else []
        else:
            weekday = current_day.weekday()
            day_windows = [(w.start_time, w.end_time) for w in template_by_weekday.get(weekday, [])]

        for window_start, window_end in day_windows:
            cursor = datetime.combine(current_day, window_start, tzinfo=BUSINESS_TZ)
            window_end_dt = datetime.combine(current_day, window_end, tzinfo=BUSINESS_TZ)
            while cursor + duration <= window_end_dt:
                slot_end = cursor + duration
                if not overlaps_busy(cursor, slot_end):
                    slots.append(SlotOut(provider_id=provider.id, start_at=cursor, end_at=slot_end))
                cursor += step

        current_day += timedelta(days=1)

    return slots


async def list_providers_for_service(db: AsyncSession, service: Service) -> list[Provider]:
    """Providers who can perform this service and are active — the "любой
    доступный мастер" case from docs/mvp-task.md #3. Filters on
    ProviderService.is_active, not just its existence — a master can now
    turn a service off for himself from the cabinet without an admin
    deleting the link (PUT /api/providers/me/services)."""
    stmt = (
        select(Provider)
        .join(ProviderService, ProviderService.provider_id == Provider.id)
        .where(
            ProviderService.service_id == service.id,
            ProviderService.is_active.is_(True),
            Provider.is_active.is_(True),
        )
    )
    return (await db.execute(stmt)).scalars().all()


async def provider_offers_service(db: AsyncSession, provider_id, service_id) -> bool:
    """True iff this provider currently has this service turned on. Used
    everywhere a client (or a stale booking-flow request) names both
    explicitly — GET /api/availability?provider_id=... and POST
    /api/bookings with an explicit provider_id — so that turning a service
    off in the cabinet actually stops that provider being bookable for it,
    not just stops them showing up in the "any provider" search."""
    stmt = select(ProviderService).where(
        ProviderService.provider_id == provider_id,
        ProviderService.service_id == service_id,
        ProviderService.is_active.is_(True),
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def get_availability(
    db: AsyncSession,
    service: Service,
    date_from: date,
    date_to: date,
    provider: Provider | None = None,
) -> list[SlotOut]:
    """provider=None means "any provider who can do this service" — merges
    slots from every eligible provider, each tagged with its provider_id so
    the client can show/pick who they'll actually get."""
    if provider is not None:
        if not await provider_offers_service(db, provider.id, service.id):
            return []
        return await _slots_for_one_provider(db, provider, service, date_from, date_to)

    providers = await list_providers_for_service(db, service)
    all_slots: list[SlotOut] = []
    for p in providers:
        all_slots.extend(await _slots_for_one_provider(db, p, service, date_from, date_to))
    all_slots.sort(key=lambda s: s.start_at)
    return all_slots
