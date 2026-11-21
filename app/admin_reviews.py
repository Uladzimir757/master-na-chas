"""Модерация отзывов суперадмином и защита рейтинга от накрутки.

Решения 21.11.2026: (1) заказ, внесённый самим мастером в календаре, не
получает приглашение на отзыв; (2) отзыв можно скрыть — он пропадает из
публичного списка и из рейтинга; (3) рейтинг показывается только от
MIN_REVIEWS_FOR_RATING отзывов. Здесь — порог и список для админки с
подсказками «подозрительно» (подсказки, а не приговор: решает человек).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Provider, Review

# Пока отзывов меньше — рейтинг мастера публично не показывается и в сортировке
# он «без рейтинга»: один-два отзыва ничего не доказывают и легко накручиваются.
MIN_REVIEWS_FOR_RATING = 3

# От создания заказа до отзыва меньше этого — слишком быстрый цикл.
QUICK_CYCLE = timedelta(minutes=60)


def public_rating(provider: Provider):
    """Рейтинг для публичных ответов: None, пока отзывов меньше порога."""
    if provider.rating is None or (provider.rating_count or 0) < MIN_REVIEWS_FOR_RATING:
        return None
    return provider.rating


class AdminReviewOut(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    provider_name: str
    rating: int
    text: str | None
    photos: int
    client_name: str | None
    phone_tail: str | None  # последние 4 цифры, полный номер админке не нужен
    created_at: datetime
    booking_created_at: datetime | None
    booking_start_at: datetime
    hidden: bool
    # repeat_phone — тот же номер оставил этому мастеру 2+ отзыва;
    # quick_cycle — отзыв пришёл < часа после создания заказа;
    # master_phone — клиентский номер совпал с номером самого мастера;
    # by_master — заказ внёс мастер (старые отзывы, до запрета приглашений).
    flags: list[str]


def _digits(phone: str | None) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


async def list_admin_reviews(
    db: AsyncSession, provider_id: uuid.UUID | None, limit: int = 200
) -> list[AdminReviewOut]:
    stmt = (
        select(Review, Booking, Provider)
        .join(Booking, Booking.id == Review.booking_id)
        .join(Provider, Provider.id == Review.provider_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    if provider_id is not None:
        stmt = stmt.where(Review.provider_id == provider_id)
    rows = (await db.execute(stmt)).all()

    # сколько отзывов у каждого (мастер, номер) — по всей базе, а не по странице
    repeats = {
        (pid, phone)
        for pid, phone, n in (
            await db.execute(
                select(Review.provider_id, Booking.client_phone, func.count(Review.id))
                .join(Booking, Booking.id == Review.booking_id)
                .where(Booking.client_phone.is_not(None))
                .group_by(Review.provider_id, Booking.client_phone)
                .having(func.count(Review.id) > 1)
            )
        ).all()
    }

    out: list[AdminReviewOut] = []
    for review, booking, provider in rows:
        flags: list[str] = []
        if (review.provider_id, booking.client_phone) in repeats:
            flags.append("repeat_phone")
        if booking.created_at is not None and review.created_at - booking.created_at < QUICK_CYCLE:
            flags.append("quick_cycle")
        client, master = _digits(booking.client_phone), _digits(provider.phone)
        if client and master and client[-9:] == master[-9:]:
            flags.append("master_phone")
        if booking.created_by_master:
            flags.append("by_master")
        digits = _digits(booking.client_phone)
        out.append(
            AdminReviewOut(
                id=review.id,
                provider_id=provider.id,
                provider_name=provider.name,
                rating=review.rating,
                text=review.text,
                photos=len(review.photos or []),
                client_name=review.client_name,
                phone_tail=digits[-4:] if digits else None,
                created_at=review.created_at,
                booking_created_at=booking.created_at,
                booking_start_at=booking.start_at,
                hidden=review.hidden,
                flags=flags,
            )
        )
    return out
