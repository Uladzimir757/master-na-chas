"""Обзорная аналитика для суперадмина (страница /admin/analytics).

Считается по ВСЕМ заказам, чьё время начала попало в период (в отличие от
`_collect_analytics` в main.py, которая берёт только завершённые/отменённые):
воронка статусов, динамика по дням, часы и дни недели, города, клиенты,
отзывы и сравнение с предыдущим периодом такой же длины.
Данные только читаются; тексты клиентов и телефоны наружу не отдаются.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.confirm_timer import PROVIDER_TIMEOUT
from app.models import Booking, BookingStatus, City, Review
from app.slot_engine import BUSINESS_TZ


class OverviewTotals(BaseModel):
    orders: int = 0          # все заказы периода
    pending: int = 0         # ещё ждут мастера
    confirmed: int = 0       # подтверждены, ещё не выполнены
    completed: int = 0
    cancelled: int = 0       # отмена клиентом/мастером (без автоотмен)
    timed_out: int = 0       # автоотмена: мастер не ответил вовремя
    no_show: int = 0
    revenue: Decimal = Decimal(0)
    priced_jobs: int = 0
    avg_price: Decimal | None = None
    hours: float = 0.0       # часы выполненных работ
    clients: int = 0         # уникальных телефонов
    repeat_clients: int = 0  # из них с 2+ заказами за период
    problems: int = 0        # клиент нажал «Jest problem»
    reviews: int = 0
    avg_rating: float | None = None
    # доли, % от заказов, по которым уже есть исход (без pending/confirmed)
    completion_rate: float | None = None
    cancel_rate: float | None = None
    timeout_rate: float | None = None


class DayPoint(BaseModel):
    day: date
    orders: int
    completed: int
    cancelled: int  # вместе с автоотменами
    revenue: Decimal


class BucketPoint(BaseModel):
    key: int      # час 0–23 или день недели 0=пн..6=вс
    orders: int   # без отменённых


class CityStat(BaseModel):
    name: str
    orders: int
    completed: int
    revenue: Decimal


class AdminOverviewOut(BaseModel):
    date_from: date
    date_to: date
    totals: OverviewTotals
    previous: OverviewTotals  # тот же период длины, что и выбранный, перед ним
    days: list[DayPoint]
    hours: list[BucketPoint]
    weekdays: list[BucketPoint]
    cities: list[CityStat]


def _pct(part: int, whole: int) -> float | None:
    return round(part * 100 / whole, 1) if whole else None


def _bounds(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    return (
        datetime.combine(d_from, time.min, tzinfo=BUSINESS_TZ),
        datetime.combine(d_to + timedelta(days=1), time.min, tzinfo=BUSINESS_TZ),
    )


async def _load(db: AsyncSession, d_from: date, d_to: date, provider_id: uuid.UUID | None):
    start, end = _bounds(d_from, d_to)
    conds = [Booking.start_at >= start, Booking.start_at < end]
    if provider_id is not None:
        conds.append(Booking.provider_id == provider_id)
    bookings = (await db.execute(select(Booking).where(*conds))).scalars().all()
    rev_conds = [Review.created_at >= start, Review.created_at < end]
    if provider_id is not None:
        rev_conds.append(Review.provider_id == provider_id)
    r_count, r_avg = (
        await db.execute(select(func.count(Review.id), func.avg(Review.rating)).where(*rev_conds))
    ).one()
    return bookings, int(r_count or 0), (float(r_avg) if r_avg is not None else None)


def _totals(bookings: list[Booking], r_count: int, r_avg: float | None) -> OverviewTotals:
    t = OverviewTotals(orders=len(bookings), reviews=r_count)
    t.avg_rating = round(r_avg, 2) if r_avg is not None else None
    minutes = 0
    per_phone: dict[str, int] = defaultdict(int)
    for b in bookings:
        if b.client_phone:
            per_phone[b.client_phone] += 1
        if b.client_confirmation == "problem":
            t.problems += 1
        if b.status == BookingStatus.pending:
            t.pending += 1
        elif b.status == BookingStatus.confirmed:
            t.confirmed += 1
        elif b.status == BookingStatus.completed:
            t.completed += 1
            minutes += int((b.end_at - b.start_at).total_seconds() // 60)
            if b.price is not None:
                t.revenue += b.price
                t.priced_jobs += 1
        elif b.status == BookingStatus.no_show:
            t.no_show += 1
        elif b.cancel_reason == PROVIDER_TIMEOUT:
            t.timed_out += 1
        else:
            t.cancelled += 1
    t.hours = round(minutes / 60, 1)
    if t.priced_jobs:
        t.avg_price = (t.revenue / t.priced_jobs).quantize(Decimal("0.01"))
    t.clients = len(per_phone)
    t.repeat_clients = sum(1 for n in per_phone.values() if n > 1)
    decided = t.completed + t.cancelled + t.timed_out + t.no_show
    t.completion_rate = _pct(t.completed, decided)
    t.cancel_rate = _pct(t.cancelled, decided)
    t.timeout_rate = _pct(t.timed_out, decided)
    return t


async def build_overview(
    db: AsyncSession, d_from: date, d_to: date, provider_id: uuid.UUID | None
) -> AdminOverviewOut:
    bookings, r_count, r_avg = await _load(db, d_from, d_to, provider_id)
    span = (d_to - d_from).days + 1
    prev_to = d_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=span - 1)
    p_bookings, p_count, p_avg = await _load(db, prev_from, prev_to, provider_id)

    days: dict[date, dict] = {
        d_from + timedelta(days=i): {"orders": 0, "completed": 0, "cancelled": 0, "revenue": Decimal(0)}
        for i in range(span)
    }
    hours = {h: 0 for h in range(24)}
    weekdays = {w: 0 for w in range(7)}
    cities: dict[uuid.UUID | None, dict] = {}
    for b in bookings:
        local = b.start_at.astimezone(BUSINESS_TZ)
        day = days.get(local.date())
        if day is not None:
            day["orders"] += 1
            if b.status == BookingStatus.completed:
                day["completed"] += 1
                if b.price is not None:
                    day["revenue"] += b.price
            elif b.status == BookingStatus.cancelled:
                day["cancelled"] += 1
        if b.status != BookingStatus.cancelled:
            hours[local.hour] += 1
            weekdays[local.weekday()] += 1
        c = cities.setdefault(b.city_id, {"orders": 0, "completed": 0, "revenue": Decimal(0)})
        c["orders"] += 1
        if b.status == BookingStatus.completed:
            c["completed"] += 1
            if b.price is not None:
                c["revenue"] += b.price

    names = {
        cid: name
        for cid, name in (await db.execute(select(City.id, City.name_pl))).all()
    }
    city_stats = sorted(
        (
            CityStat(name=names.get(cid, "—"), **vals)
            for cid, vals in cities.items()
        ),
        key=lambda x: (-x.orders, x.name),
    )
    return AdminOverviewOut(
        date_from=d_from,
        date_to=d_to,
        totals=_totals(bookings, r_count, r_avg),
        previous=_totals(p_bookings, p_count, p_avg),
        days=[DayPoint(day=d, **v) for d, v in days.items()],
        hours=[BucketPoint(key=k, orders=v) for k, v in hours.items()],
        weekdays=[BucketPoint(key=k, orders=v) for k, v in weekdays.items()],
        cities=city_stats,
    )
