"""app/notifications.py — every sender must (a) return immediately without
touching its underlying transport when its channel is disabled, and (b)
never let a transport failure propagate — see the module's own docstring:
this must never block or fail POST /api/bookings. No real network calls in
either case: httpx/pywebpush/twilio are all mocked.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import pywebpush
import twilio.rest

from app import notifications
from app.config import settings


class _RaisingAsyncClient:
    """Stand-in for httpx.AsyncClient whose .post() always raises — proves
    send_telegram_message swallows the error instead of propagating it."""

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, *args, **kwargs):
        raise RuntimeError("simulated network failure")


async def test_telegram_disabled_does_not_call_httpx(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")
    fake_client_cls = MagicMock(side_effect=AssertionError("httpx.AsyncClient must not be constructed when disabled"))
    monkeypatch.setattr(notifications.httpx, "AsyncClient", fake_client_cls)

    await notifications.send_telegram_message("123", "hello")  # must not raise

    fake_client_cls.assert_not_called()


async def test_telegram_send_failure_is_swallowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "fake-token")
    monkeypatch.setattr(notifications.httpx, "AsyncClient", _RaisingAsyncClient)

    await notifications.send_telegram_message("123", "hello")  # must not raise


async def test_web_push_disabled_does_not_call_pywebpush(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", False)
    fake_webpush = MagicMock(side_effect=AssertionError("webpush() must not be called when disabled"))
    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)

    await notifications.send_web_push(endpoint="https://example.com/ep", p256dh="k", auth="a", payload={"x": 1})

    fake_webpush.assert_not_called()


async def test_web_push_send_failure_is_swallowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", "fake-key")
    monkeypatch.setattr(pywebpush, "webpush", MagicMock(side_effect=RuntimeError("simulated push failure")))

    await notifications.send_web_push(endpoint="https://example.com/ep", p256dh="k", auth="a", payload={"x": 1})


async def test_sms_disabled_does_not_call_twilio(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", False)
    fake_client_cls = MagicMock(side_effect=AssertionError("twilio Client must not be constructed when disabled"))
    monkeypatch.setattr(twilio.rest, "Client", fake_client_cls)

    await notifications.send_sms(to_phone="+48123456789", text="hi")

    fake_client_cls.assert_not_called()


async def test_sms_send_failure_is_swallowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "SMS_ENABLED", True)
    fake_client = MagicMock()
    fake_client.messages.create.side_effect = RuntimeError("simulated Twilio failure")
    monkeypatch.setattr(twilio.rest, "Client", MagicMock(return_value=fake_client))

    await notifications.send_sms(to_phone="+48123456789", text="hi")
