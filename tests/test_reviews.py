"""Отзывы (Этап 3, docs/ai-and-reviews.md) — verification по завершённой
брони, не по email:
  - PATCH /api/bookings/{id}/status -> completed выпускает ReviewInvite и
    шлёт SMS (здесь просто проверяем, что приглашение создалось — реальная
    отправка покрыта test_notifications.py и выключена по умолчанию,
    SMS_ENABLED=False).
  - GET/POST /api/reviews/invite/{booking_id} — публичные, токен из ссылки.
  - GET /api/providers/{id}/reviews — публичный список.
  - Review.booking_id UNIQUE + ReviewInvite.used_at — одна бронь, один отзыв.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingStatus, Provider, Review, ReviewInvite, Service, Tenant
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY


async def _make_booking(
    db_session: AsyncSession,
    *,
    provider_id,
    service_id,
    status: BookingStatus = BookingStatus.confirmed,
    client_phone: str | None = "+48600000000",
) -> Booking:
    start_at = datetime.combine(NEXT_MONDAY, datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=9)
    row = Booking(
        id=uuid.uuid4(),
        tenant_id=(await db_session.get(Provider, provider_id)).tenant_id,
        provider_id=provider_id,
        service_id=service_id,
        client_name="Клиент",
        client_phone=client_phone,
        start_at=start_at,
        end_at=start_at + timedelta(hours=1),
        status=status,
    )
    db_session.add(row)
    await db_session.commit()
    return row


async def _invite_for(db_session: AsyncSession, booking_id) -> ReviewInvite:
    row = (
        await db_session.execute(select(ReviewInvite).where(ReviewInvite.booking_id == booking_id))
    ).scalar_one()
    return row


# ----------------------------------------------------------------------------
# Marking completed issues exactly one invite
# ----------------------------------------------------------------------------


async def test_marking_booking_completed_issues_review_invite(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id)

    resp = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert resp.status_code == 200, resp.text

    invite = await _invite_for(db_session, booking.id)
    assert invite.used_at is None
    assert invite.expires_at > datetime.now(timezone.utc)


async def test_marking_completed_again_does_not_issue_a_second_invite(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)

    resp = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert resp.status_code == 200, resp.text

    count = (
        await db_session.execute(select(ReviewInvite).where(ReviewInvite.booking_id == booking.id))
    ).scalars().all()
    assert count == []  # was already completed -> no invite issued this time


async def test_completed_cancelled_completed_again_does_not_duplicate_invite(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    """Regression: booking_id is UNIQUE on review_invite — completing a
    booking a second time (after it went completed -> cancelled -> completed
    again) must not try to insert a second invite row and 500 the PATCH."""
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id)

    first = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert first.status_code == 200, first.text

    cancelled = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "cancelled"})
    assert cancelled.status_code == 200, cancelled.text

    second = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert second.status_code == 200, second.text

    invites = (
        await db_session.execute(select(ReviewInvite).where(ReviewInvite.booking_id == booking.id))
    ).scalars().all()
    assert len(invites) == 1


async def test_no_phone_no_invite(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, client_phone=None)

    resp = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert resp.status_code == 200, resp.text

    count = (
        await db_session.execute(select(ReviewInvite).where(ReviewInvite.booking_id == booking.id))
    ).scalars().all()
    assert count == []


# ----------------------------------------------------------------------------
# GET /api/reviews/invite/{booking_id}
# ----------------------------------------------------------------------------


async def test_get_invite_with_valid_token(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    invite = ReviewInvite(
        token="tok-ok", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1)
    )
    db_session.add(invite)
    await db_session.commit()

    resp = await client.get(f"/api/reviews/invite/{booking.id}", params={"token": "tok-ok"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider_name"] == provider.name
    assert body["service_name"] == service.name


async def test_get_invite_wrong_token_404(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-real", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    )
    await db_session.commit()

    resp = await client.get(f"/api/reviews/invite/{booking.id}", params={"token": "wrong"})
    assert resp.status_code == 404


async def test_get_invite_expired_404(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-expired", booking_id=booking.id, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    )
    await db_session.commit()

    resp = await client.get(f"/api/reviews/invite/{booking.id}", params={"token": "tok-expired"})
    assert resp.status_code == 404


async def test_get_invite_already_used_409(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(
            token="tok-used",
            booking_id=booking.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            used_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/reviews/invite/{booking.id}", params={"token": "tok-used"})
    assert resp.status_code == 409


# ----------------------------------------------------------------------------
# POST /api/reviews/invite/{booking_id}
# ----------------------------------------------------------------------------


async def test_submit_review_success_updates_provider_rating(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-1", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/reviews/invite/{booking.id}",
        json={"token": "tok-1", "rating": 5, "text": "Отлично", "photos": []},
    )
    assert resp.status_code == 201, resp.text

    await db_session.refresh(provider)
    assert float(provider.rating) == 5.0
    assert provider.rating_count == 1

    reviews = (await db_session.execute(select(Review).where(Review.booking_id == booking.id))).scalars().all()
    assert len(reviews) == 1
    assert reviews[0].rating == 5

    invite = await _invite_for(db_session, booking.id)
    assert invite.used_at is not None


async def test_submit_review_twice_rejected(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-2", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    )
    await db_session.commit()

    first = await client.post(
        f"/api/reviews/invite/{booking.id}", json={"token": "tok-2", "rating": 4, "text": None, "photos": []}
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        f"/api/reviews/invite/{booking.id}", json={"token": "tok-2", "rating": 1, "text": None, "photos": []}
    )
    assert second.status_code == 409


async def test_submit_review_rejects_out_of_range_rating(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-3", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/reviews/invite/{booking.id}", json={"token": "tok-3", "rating": 6, "text": None, "photos": []}
    )
    assert resp.status_code == 422


async def test_submit_review_rejects_non_data_url_photo(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        ReviewInvite(token="tok-4", booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/reviews/invite/{booking.id}",
        json={"token": "tok-4", "rating": 3, "text": None, "photos": ["https://example.com/x.jpg"]},
    )
    assert resp.status_code == 422


# ----------------------------------------------------------------------------
# GET /api/providers/{provider_id}/reviews
# ----------------------------------------------------------------------------


async def test_list_provider_reviews_public(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    booking = await _make_booking(db_session, provider_id=provider.id, service_id=service.id, status=BookingStatus.completed)
    db_session.add(
        Review(
            tenant_id=booking.tenant_id,
            provider_id=provider.id,
            booking_id=booking.id,
            client_name="Клиент",
            rating=4,
            text="Норм",
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/providers/{provider.id}/reviews")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["rating"] == 4


async def test_list_provider_reviews_unknown_provider_404(client: AsyncClient):
    resp = await client.get(f"/api/providers/{uuid.uuid4()}/reviews")
    assert resp.status_code == 404
