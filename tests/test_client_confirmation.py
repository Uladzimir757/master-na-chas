"""Клиент после «выполнено» (решения 14.11.2026):
  - POST /api/reviews/invite/{id}/confirm — «Potwierdzam» / «Jest problem»
    по токену из SMS, один раз; о проблеме узнаёт мастер;
  - POST /api/my-bookings/link — ссылка на заказы по SMS на введённый номер,
    ответ одинаковый, есть заказы или нет.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.main as main
from app.models import Booking, BookingStatus, Provider, ReviewInvite, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

PHONE = "+48600111222"


async def _completed_with_invite(db: AsyncSession, provider: Provider, service: Service, token: str = "tok-c") -> Booking:
    start_at = datetime.combine(NEXT_MONDAY, datetime.min.time(), tzinfo=BUSINESS_TZ).replace(hour=9)
    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=provider.tenant_id,
        provider_id=provider.id,
        service_id=service.id,
        client_name="Klient",
        client_phone=PHONE,
        start_at=start_at,
        end_at=start_at + timedelta(hours=1),
        status=BookingStatus.completed,
        manage_token=f"manage-{token}",
    )
    db.add(booking)
    await db.flush()
    db.add(ReviewInvite(token=token, booking_id=booking.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1)))
    await db.commit()
    return booking


@pytest.fixture
def staff_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    calls: list[tuple] = []

    async def fake_notify_staff(db, provider_id, purpose, facts, url="/cabinet/"):
        calls.append((provider_id, purpose, facts, url))

    monkeypatch.setattr(main, "_notify_staff", fake_notify_staff)
    return calls


@pytest.fixture
def client_sms(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    sent: list[dict] = []

    async def fake_notify_client(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(main, "notify_client", fake_notify_client)
    main._my_bookings_link_sent.clear()
    return sent


async def test_confirm_ok_then_page_goes_to_review(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, staff_calls
):
    booking = await _completed_with_invite(db_session, provider, service)
    r = await client.post(f"/api/reviews/invite/{booking.id}/confirm", json={"token": "tok-c", "ok": True})
    assert r.status_code == 200, r.text
    assert r.json()["client_confirmation"] == "confirmed"
    assert staff_calls == []
    again = await client.get(f"/api/reviews/invite/{booking.id}", params={"token": "tok-c"})
    assert again.json()["client_confirmation"] == "confirmed"


async def test_problem_is_saved_and_master_is_told(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, staff_calls
):
    booking = await _completed_with_invite(db_session, provider, service)
    r = await client.post(
        f"/api/reviews/invite/{booking.id}/confirm",
        json={"token": "tok-c", "ok": False, "problem": "  Kran dalej cieknie  "},
    )
    assert r.status_code == 200, r.text
    await db_session.refresh(booking)
    assert booking.client_confirmation == "problem"
    assert booking.client_problem == "Kran dalej cieknie"
    assert len(staff_calls) == 1
    assert staff_calls[0][2]["client_words"] == "Kran dalej cieknie"
    assert str(booking.id) in staff_calls[0][3]


async def test_answer_only_once_and_token_checked(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, staff_calls
):
    booking = await _completed_with_invite(db_session, provider, service)
    wrong = await client.post(f"/api/reviews/invite/{booking.id}/confirm", json={"token": "nope", "ok": True})
    assert wrong.status_code == 404
    first = await client.post(f"/api/reviews/invite/{booking.id}/confirm", json={"token": "tok-c", "ok": True})
    assert first.status_code == 200
    second = await client.post(f"/api/reviews/invite/{booking.id}/confirm", json={"token": "tok-c", "ok": False})
    assert second.status_code == 409


async def test_master_sees_the_answer(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, staff_calls
):
    booking = await _completed_with_invite(db_session, provider, service)
    await logged_in_client.post(
        f"/api/reviews/invite/{booking.id}/confirm", json={"token": "tok-c", "ok": False, "problem": "Brud"}
    )
    r = await logged_in_client.patch(f"/api/bookings/{booking.id}/status", json={"status": "completed"})
    assert r.status_code == 200, r.text
    assert r.json()["client_confirmation"] == "problem"
    assert r.json()["client_problem"] == "Brud"


async def test_link_sms_goes_only_to_a_phone_with_bookings(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, client_sms
):
    booking = await _completed_with_invite(db_session, provider, service)
    known = await client.post("/api/my-bookings/link", json={"phone": "600 111 222"})
    unknown = await client.post("/api/my-bookings/link", json={"phone": "600 999 888"})
    await asyncio.sleep(0)
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(client_sms) == 1
    assert client_sms[0]["phone"] == PHONE
    assert booking.manage_token in client_sms[0]["must_include"]


async def test_link_sms_not_repeated_within_ten_minutes(
    client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service, client_sms
):
    await _completed_with_invite(db_session, provider, service)
    for _ in range(2):
        assert (await client.post("/api/my-bookings/link", json={"phone": PHONE})).status_code == 202
    await asyncio.sleep(0)
    assert len(client_sms) == 1


async def test_link_rejects_a_non_phone(client: AsyncClient, client_sms):
    r = await client.post("/api/my-bookings/link", json={"phone": "1234"})
    assert r.status_code == 422
