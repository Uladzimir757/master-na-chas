"""FCM-пуши нативного приложения (docs/mobile-app-task.md §4).

Два слоя: app/notifications.py (send_fcm/notify_* с FCM-каналом — сеть
замокана, как в tests/test_notifications.py) и HTTP-эндпоинты регистрации
токенов (мастер по сессии, клиент по manage_token из SMS-ссылки) против
настоящего Postgres. Плюс приём координат от нативного плагина фоновой
геолокации — тот же эндпоинт, что и для браузера, другое тело.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, time, timedelta

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import notifications
from app.config import settings
from app.models import Booking, BookingStatus, DevicePushToken, MasterUser, Provider, Service
from app.slot_engine import BUSINESS_TZ
from tests.conftest import NEXT_MONDAY

FCM_TOKEN = "fcm-token-" + "x" * 40


# ----------------------------------------------------------------------------
# app/notifications.py
# ----------------------------------------------------------------------------


@pytest.fixture
def fcm_enabled(monkeypatch: pytest.MonkeyPatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    monkeypatch.setattr(settings, "FCM_ENABLED", True)
    monkeypatch.setattr(
        settings,
        "FCM_SERVICE_ACCOUNT_JSON",
        json.dumps({"project_id": "zr-test", "client_email": "sa@zr-test.iam", "private_key": pem}),
    )
    monkeypatch.setattr(notifications, "_fcm_access_token", None)


def _mock_fcm(monkeypatch: pytest.MonkeyPatch, send_status: int) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at", "expires_in": 3600})
        return httpx.Response(send_status, json={})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        notifications.httpx, "AsyncClient", lambda *a, **kw: real_client(transport=httpx.MockTransport(handler))
    )
    return seen


async def test_fcm_disabled_does_not_touch_network(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "FCM_ENABLED", False)
    seen = _mock_fcm(monkeypatch, 200)

    assert await notifications.send_fcm(token=FCM_TOKEN, title="t", body="b") is True
    assert seen == []


async def test_fcm_sends_v1_message_with_oauth_token(fcm_enabled, monkeypatch: pytest.MonkeyPatch):
    seen = _mock_fcm(monkeypatch, 200)

    assert await notifications.send_fcm(token=FCM_TOKEN, title="T", body="B", data={"url": "/x"}) is True

    token_req, send_req = seen
    assert token_req.url.host == "oauth2.googleapis.com"
    assert send_req.url.path == "/v1/projects/zr-test/messages:send"
    assert send_req.headers["authorization"] == "Bearer at"
    message = json.loads(send_req.content)["message"]
    assert message["token"] == FCM_TOKEN
    assert message["notification"] == {"title": "T", "body": "B"}
    assert message["data"] == {"url": "/x"}


async def test_fcm_unregistered_token_reported_dead(fcm_enabled, monkeypatch: pytest.MonkeyPatch):
    _mock_fcm(monkeypatch, 404)

    assert await notifications.send_fcm(token=FCM_TOKEN, title="T", body="B") is False


async def test_fcm_other_failure_is_swallowed_and_token_kept(fcm_enabled, monkeypatch: pytest.MonkeyPatch):
    _mock_fcm(monkeypatch, 500)

    assert await notifications.send_fcm(token=FCM_TOKEN, title="T", body="B") is True


async def test_notify_master_fcm_only_channel_and_prunes_dead(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", False)
    monkeypatch.setattr(settings, "FCM_ENABLED", True)
    sent: list[tuple] = []
    pruned: list[list[str]] = []

    async def fake_compose(**kwargs):
        return "Tytuł\n\nTreść"

    async def fake_send_fcm(*, token, title, body, data=None):
        sent.append((token, title, body, data))
        return token != "dead"

    async def on_dead(tokens):
        pruned.append(tokens)

    monkeypatch.setattr(notifications, "compose_message", fake_compose)
    monkeypatch.setattr(notifications, "send_fcm", fake_send_fcm)

    await notifications.notify_master(
        telegram_chat_id=None, push_subscriptions=[], purpose="p", fcm_tokens=["alive", "dead"], on_dead_fcm_tokens=on_dead
    )

    assert [s[:3] for s in sent] == [("alive", "Tytuł", "Treść"), ("dead", "Tytuł", "Treść")]
    assert pruned == [["dead"]]


async def test_notify_client_push_carries_link(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", False)
    monkeypatch.setattr(settings, "FCM_ENABLED", True)
    sent: list[tuple] = []

    async def fake_compose(**kwargs):
        return "Text https://zr/booking"

    async def fake_send_fcm(*, token, title, body, data=None):
        sent.append((token, title, body, data))
        return True

    monkeypatch.setattr(notifications, "compose_message", fake_compose)
    monkeypatch.setattr(notifications, "send_fcm", fake_send_fcm)

    await notifications.notify_client(
        phone="+48600111222", purpose="p", must_include="https://zr/booking", fcm_tokens=[FCM_TOKEN]
    )

    assert sent == [(FCM_TOKEN, settings.PUSH_APP_TITLE, "Text https://zr/booking", {"url": "https://zr/booking"})]


# ----------------------------------------------------------------------------
# HTTP: регистрация токенов
# ----------------------------------------------------------------------------


async def _tokens(db: AsyncSession) -> list[DevicePushToken]:
    return list((await db.execute(select(DevicePushToken))).scalars().all())


async def test_master_registers_and_reregisters_same_device(
    logged_in_client: AsyncClient, db_session: AsyncSession, master_user: MasterUser
):
    body = {"fcm_token": FCM_TOKEN, "platform": "android"}
    assert (await logged_in_client.put("/api/push/device-token", json=body)).status_code == 200
    assert (await logged_in_client.put("/api/push/device-token", json={**body, "platform": "ios"})).status_code == 200

    rows = await _tokens(db_session)
    assert len(rows) == 1
    assert rows[0].master_user_id == master_user.id and rows[0].client_phone is None and rows[0].platform == "ios"


async def test_master_token_requires_login(client: AsyncClient):
    r = await client.put("/api/push/device-token", json={"fcm_token": FCM_TOKEN, "platform": "android"})
    assert r.status_code == 401


async def test_unregister_removes_token(logged_in_client: AsyncClient, db_session: AsyncSession):
    await logged_in_client.put("/api/push/device-token", json={"fcm_token": FCM_TOKEN, "platform": "android"})
    r = await logged_in_client.post("/api/push/device-token/unregister", json={"fcm_token": FCM_TOKEN})
    assert r.status_code == 200
    assert await _tokens(db_session) == []


async def test_client_registers_by_booking_link_and_device_moves_owner(
    logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider, service: Service
):
    start = datetime.combine(NEXT_MONDAY, time(10, 0), tzinfo=BUSINESS_TZ)
    booking = Booking(
        id=uuid.uuid4(), tenant_id=provider.tenant_id, provider_id=provider.id, service_id=service.id,
        client_name="K", client_phone="+48600111222", start_at=start, end_at=start + timedelta(hours=1),
        status=BookingStatus.confirmed, manage_token="tok-1",
    )
    db_session.add(booking)
    await db_session.commit()
    body = {"fcm_token": FCM_TOKEN, "platform": "android"}

    bad = await logged_in_client.put(f"/api/my-booking/{booking.id}/device-token?token=wrong", json=body)
    assert bad.status_code == 404

    # тот же телефон сначала был у мастера — токен переходит клиенту
    await logged_in_client.put("/api/push/device-token", json=body)
    r = await logged_in_client.put(f"/api/my-booking/{booking.id}/device-token?token=tok-1", json=body)
    assert r.status_code == 200

    rows = await _tokens(db_session)
    assert len(rows) == 1
    assert rows[0].master_user_id is None and rows[0].client_phone == "+48600111222"


# ----------------------------------------------------------------------------
# Координаты от нативного плагина фоновой геолокации
# ----------------------------------------------------------------------------


async def test_native_plugin_location_post_is_stored(logged_in_client: AsyncClient, db_session: AsyncSession, provider: Provider):
    r = await logged_in_client.post(
        "/api/providers/me/location",
        json={"latitude": 52.23, "longitude": 21.01, "accuracy": 12.5, "time": 1, "source": "native"},
    )
    assert r.status_code == 200, r.text

    await db_session.refresh(provider)
    assert float(provider.location_lat) == pytest.approx(52.23)
    assert float(provider.location_lng) == pytest.approx(21.01)


async def test_native_plugin_location_out_of_range_rejected(logged_in_client: AsyncClient):
    r = await logged_in_client.post("/api/providers/me/location", json={"latitude": 123, "longitude": 21})
    assert r.status_code == 422
