"""Защита рейтинга от накрутки (21.11.2026):
  - заказ, внесённый мастером в календаре, не получает приглашение на отзыв;
  - суперадмин видит отзывы с подсказками и может скрыть отзыв — он пропадает
    из публичного списка и из рейтинга;
  - рейтинг публично виден только от MIN_REVIEWS_FOR_RATING отзывов.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_reviews import MIN_REVIEWS_FOR_RATING
from app.config import settings
from app.models import Booking, BookingStatus, Provider, Review, ReviewInvite, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

ADMIN = {"x-admin-secret": "test-admin-secret"}


@pytest.fixture(autouse=True)
def _known_admin_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ADMIN_SECRET", "test-admin-secret")


async def _booking_with_review(
    db: AsyncSession, provider: Provider, service: Service, *, hour: int, phone: str, rating: int = 5,
    by_master: bool = False, created_ago: timedelta | None = None,
) -> tuple[Booking, Review]:
    start = datetime.combine(NEXT_MONDAY - timedelta(days=14), datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=hour)
    b = Booking(
        id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
        client_name="Klient", client_phone=phone, start_at=start, end_at=start + timedelta(hours=1),
        status=BookingStatus.completed, created_by_master=by_master,
    )
    if created_ago is not None:
        b.created_at = datetime.now(timezone.utc) - created_ago
    db.add(b)
    await db.flush()
    r = Review(tenant_id=b.tenant_id, provider_id=provider.id, booking_id=b.id, client_name="Klient", rating=rating)
    db.add(r)
    await db.commit()
    return b, r


async def test_master_entered_booking_gets_no_review_invite(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    start = datetime.combine(NEXT_MONDAY - timedelta(days=14), datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=9)
    created = await logged_in_client.post(
        "/api/providers/me/bookings",
        json={
            "service_id": str(service.id), "client_name": "Znajomy", "client_phone": "+48600111222",
            "start_at": start.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    booking_id = created.json()["id"]
    resp = await logged_in_client.patch(f"/api/bookings/{booking_id}/status", json={"status": "completed"})
    assert resp.status_code == 200, resp.text

    invites = (await db_session.execute(select(ReviewInvite).where(ReviewInvite.booking_id == uuid.UUID(booking_id)))).scalars().all()
    assert invites == []


async def test_admin_reviews_need_admin(client: AsyncClient):
    assert (await client.get("/admin/reviews")).status_code == 403
    assert (await client.post(f"/admin/reviews/{uuid.uuid4()}/hidden", json={"hidden": True})).status_code == 403


async def test_admin_review_flags(client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service):
    provider.phone = "+48 777 000 111"
    await db_session.commit()
    # тот же номер — два отзыва; один из них быстрый цикл
    await _booking_with_review(db_session, provider, service, hour=9, phone="+48600000001", created_ago=timedelta(minutes=10))
    await _booking_with_review(db_session, provider, service, hour=11, phone="+48600000001", created_ago=timedelta(days=2))
    # номер самого мастера
    await _booking_with_review(db_session, provider, service, hour=13, phone="+48777000111", created_ago=timedelta(days=2))
    # чистый
    await _booking_with_review(db_session, provider, service, hour=15, phone="+48600000002", created_ago=timedelta(days=2))

    rows = (await client.get(f"/admin/reviews?provider_id={provider.id}", headers=ADMIN)).json()
    assert len(rows) == 4
    by_tail = {}
    for r in rows:
        by_tail.setdefault(r["phone_tail"], []).append(r)
    assert all("repeat_phone" in r["flags"] for r in by_tail["0001"])
    assert sum("quick_cycle" in r["flags"] for r in by_tail["0001"]) == 1
    assert by_tail["0111"][0]["flags"] == ["master_phone"]
    assert by_tail["0002"][0]["flags"] == []
    assert "+48" not in str(rows)  # полный номер наружу не уходит


async def test_hiding_a_review_removes_it_from_public_list_and_rating(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    _, good = await _booking_with_review(db_session, provider, service, hour=9, phone="+48600000011", rating=4)
    _, fake = await _booking_with_review(db_session, provider, service, hour=11, phone="+48600000012", rating=5)

    resp = await client.post(f"/admin/reviews/{fake.id}/hidden", json={"hidden": True}, headers=ADMIN)
    assert resp.status_code == 200, resp.text

    public = (await client.get(f"/api/providers/{provider.id}/reviews")).json()
    assert [r["id"] for r in public] == [str(good.id)]
    await db_session.refresh(provider)
    assert provider.rating_count == 1 and float(provider.rating) == 4.0
    # в админке скрытый виден и помечен
    admin_rows = (await client.get("/admin/reviews", headers=ADMIN)).json()
    assert {r["id"]: r["hidden"] for r in admin_rows}[str(fake.id)] is True

    # возврат
    await client.post(f"/admin/reviews/{fake.id}/hidden", json={"hidden": False}, headers=ADMIN)
    await db_session.refresh(provider)
    assert provider.rating_count == 2
    assert (await client.post(f"/admin/reviews/{uuid.uuid4()}/hidden", json={"hidden": True}, headers=ADMIN)).status_code == 404


async def test_rating_is_public_only_from_the_minimum_review_count(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    async def listed():
        from app.public_cache import public_cache

        public_cache.clear()  # публичный список кэшируется
        rows = (await client.get("/api/providers")).json()
        return next(p for p in rows if p["id"] == str(provider.id))

    for i in range(MIN_REVIEWS_FOR_RATING - 1):
        await _booking_with_review(db_session, provider, service, hour=8 + i, phone=f"+4860000010{i}")
    provider.rating, provider.rating_count = 5.0, MIN_REVIEWS_FOR_RATING - 1
    await db_session.commit()
    p = await listed()
    assert p["rating"] is None and p["rating_count"] == MIN_REVIEWS_FOR_RATING - 1

    provider.rating_count = MIN_REVIEWS_FOR_RATING
    await db_session.commit()
    assert (await listed())["rating"] == 5.0
