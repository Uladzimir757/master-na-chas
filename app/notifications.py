"""Best-effort notification senders. Every function here MUST swallow its own
errors and log them — a failed SMS/Telegram/push must never roll back or
block booking creation (see docs/mvp-task.md #5, #6: "не должна ронять сам
POST /api/bookings")."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger("notifications")


async def send_telegram_message(chat_id: str, text: str) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        # expected state whenever the platform bot token genuinely isn't
        # configured (local dev without .env, mainly) — not an error, so
        # not `warning`: that level should mean "something needs attention".
        logger.info("telegram_disabled: no TELEGRAM_BOT_TOKEN configured, skipping send")
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json={"chat_id": chat_id, "text": text})
            response.raise_for_status()
    except Exception:
        logger.exception("telegram_send_failed chat_id=%s", chat_id)


async def send_web_push(*, endpoint: str, p256dh: str, auth: str, payload: dict) -> None:
    if not settings.WEB_PUSH_ENABLED:
        # expected — WEB_PUSH_ENABLED is off by default until the VAPID
        # keypair is actually wired up; this fires on every booking with a
        # push subscription until then, so it must not read as an error.
        logger.info("web_push_disabled, skipping send")
        return
    try:
        # imported lazily, same reasoning as Garage System's WebPushSenderService:
        # pywebpush pulls in cryptography, no need to pay that import cost when disabled
        import json

        from pywebpush import webpush

        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps(payload),
            vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.WEB_PUSH_SUBJECT},
        )
    except Exception:
        logger.exception("web_push_send_failed endpoint=%s", endpoint[:60])


async def send_sms(*, to_phone: str, text: str) -> None:
    if not settings.SMS_ENABLED:
        # expected — SMS_ENABLED is off until Twilio is actually configured
        # (see config.py); this fires on every booking with a phone number,
        # so it must not read as an error each time it does.
        logger.info("sms_disabled: skipping send to %s", to_phone)
        return
    try:
        from twilio.rest import Client as TwilioClient

        client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(to=to_phone, from_=settings.TWILIO_SENDER_ID, body=text)
    except Exception:
        logger.exception("sms_send_failed to=%s", to_phone)
