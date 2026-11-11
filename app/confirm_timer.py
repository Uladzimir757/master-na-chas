"""Таймер подтверждения заказа (docs/confirm-timer-travel-cities-task.md).

Клиентский заказ в статусе pending мастер должен подтвердить за
CONFIRM_WINDOW (15 мин). Таймер стартует с момента создания, если мастер
сейчас в рабочих часах, иначе — с начала его ближайших рабочих часов (ночью
мастера не будим). Напоминания — на 5-й и 10-й минуте, на 15-й — автоотмена.

Источник истины — Booking.confirm_deadline_at в БД, не планировщик:
  - expire_overdue_bookings() ленивая и идемпотентная, её зовут перед
    выдачей слотов/календаря/брони и из тика — отмена не зависит от того,
    дошёл ли тик (Render free tier засыпает);
  - claim_due_notices() отдаёт тику уведомления, которые пора отправить.
    Каждое «забирается» условным UPDATE по confirm_notices_sent, поэтому два
    тика в одну минуту ничего не дублируют.

Здесь только работа с БД; тексты и отправку делает app/main.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus
from app.slot_engine import CONFIRM_REMINDER_STEP, CONFIRM_WINDOW, next_working_start

# Booking.cancel_reason автоотмены: мастер не ответил за CONFIRM_WINDOW.
PROVIDER_TIMEOUT = "provider_timeout"

# confirm_notices_sent: 1 = уведомление о новом заказе, 2 и 3 — напоминания.
LAST_NOTICE = 1 + int((CONFIRM_WINDOW - CONFIRM_REMINDER_STEP) / CONFIRM_REMINDER_STEP)


async def confirm_deadline_for(db: AsyncSession, provider_id: uuid.UUID, *, now: datetime, start_at: datetime) -> datetime:
    """Дедлайн подтверждения нового pending-заказа.

    Если дедлайн от начала рабочих часов выходит не раньше начала самого
    слота (заказ ночью на первый утренний слот), таймер идёт сразу с `now` —
    иначе заказ отменился бы, не успев дойти до мастера."""
    timer_start = await next_working_start(db, provider_id, now) or now
    deadline = timer_start + CONFIRM_WINDOW
    if deadline >= start_at:
        deadline = now + CONFIRM_WINDOW
    return deadline


def timer_start(booking: Booking) -> datetime | None:
    if booking.confirm_deadline_at is None:
        return None
    return booking.confirm_deadline_at - CONFIRM_WINDOW


def notices_due(booking: Booking, now: datetime) -> int:
    """Сколько уведомлений мастеру должно уйти к `now` (0..LAST_NOTICE)."""
    start = timer_start(booking)
    if start is None or now < start:
        return 0
    return min(LAST_NOTICE, 1 + int((now - start) / CONFIRM_REMINDER_STEP))


async def expire_overdue_bookings(db: AsyncSession, now: datetime) -> list[Booking]:
    """Отменяет pending-заказы с истёкшим дедлайном; возвращает отменённые
    (каждый ровно один раз — повторный вызов их уже не найдёт)."""
    expired = (
        (
            await db.execute(
                update(Booking)
                .where(
                    Booking.status == BookingStatus.pending,
                    Booking.confirm_deadline_at.is_not(None),
                    Booking.confirm_deadline_at <= now,
                )
                .values(status=BookingStatus.cancelled, cancel_reason=PROVIDER_TIMEOUT)
                .returning(Booking)
                .execution_options(synchronize_session="fetch")
            )
        )
        .scalars()
        .all()
    )
    if expired:
        await db.commit()
    return list(expired)


async def claim_due_notices(db: AsyncSession, now: datetime) -> list[tuple[Booking, int, int]]:
    """Уведомления мастеру, которые пора отправить: (бронь, сколько уже
    ушло, сколько должно уйти). Отметка ставится здесь же, до отправки, —
    пропущенный шаг (тик опоздал) не догоняется пачкой, уходит одно
    сообщение."""
    candidates = (
        (
            await db.execute(
                select(Booking).where(
                    Booking.status == BookingStatus.pending,
                    Booking.confirm_deadline_at.is_not(None),
                    Booking.confirm_deadline_at > now,
                    Booking.confirm_notices_sent < LAST_NOTICE,
                )
            )
        )
        .scalars()
        .all()
    )
    claimed: list[tuple[Booking, int, int]] = []
    for booking in candidates:
        sent = booking.confirm_notices_sent
        due = notices_due(booking, now)
        if due <= sent:
            continue
        won = (
            await db.execute(
                update(Booking)
                .where(
                    Booking.id == booking.id,
                    Booking.status == BookingStatus.pending,
                    Booking.confirm_notices_sent == sent,
                )
                .values(confirm_notices_sent=due)
                .returning(Booking.id)
                .execution_options(synchronize_session=False)
            )
        ).scalar_one_or_none()
        if won is not None:
            claimed.append((booking, sent, due))
    await db.commit()
    return claimed
