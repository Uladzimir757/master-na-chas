"""Best-effort notification senders. Every function here MUST swallow its own
errors and log them — a failed SMS/Telegram/push/FCM must never roll back or
block booking creation (see docs/mvp-task.md #5, #6: "не должна ронять сам
POST /api/bookings")."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any

import httpx

from app.config import settings
from app.llm_text import compose_message, language_for_phone

logger = logging.getLogger("notifications")

SMS_MAX_CHARS = 300
MASTER_MAX_CHARS = 400

_background_tasks: set[asyncio.Task] = set()


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


# --- FCM (нативное приложение, docs/mobile-app-task.md §4) ------------------
# HTTP v1 API с OAuth-токеном сервисного аккаунта. JWT подписывается здесь же
# через cryptography (уже есть — её тянет pywebpush), без firebase-admin/
# google-auth ради одного запроса.

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_fcm_access_token: tuple[str, float] | None = None  # (токен, истекает в monotonic-секундах)

# Колбэк удаления мёртвых токенов (приложение удалено/переустановлено):
# notifications.py про БД не знает, main.py передаёт свой.
DeadTokensCallback = Callable[[list[str]], Awaitable[None]]


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


async def _get_fcm_access_token(client: httpx.AsyncClient, info: dict) -> str:
    global _fcm_access_token
    if _fcm_access_token and _fcm_access_token[1] > time.monotonic():
        return _fcm_access_token[0]

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    token_uri = info.get("token_uri", "https://oauth2.googleapis.com/token")
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64url(
        json.dumps(
            {"iss": info["client_email"], "scope": FCM_SCOPE, "aud": token_uri, "iat": now, "exp": now + 3600}
        ).encode()
    )
    key = serialization.load_pem_private_key(info["private_key"].encode(), password=None)
    signature = key.sign(f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256())
    response = await client.post(
        token_uri,
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": f"{header}.{claims}.{_b64url(signature)}",
        },
    )
    response.raise_for_status()
    body = response.json()
    _fcm_access_token = (body["access_token"], time.monotonic() + int(body.get("expires_in", 3600)) - 60)
    return _fcm_access_token[0]


async def send_fcm(*, token: str, title: str, body: str, data: dict[str, str] | None = None) -> bool:
    """Шлёт один пуш. False — только когда FCM ответил, что токена больше нет
    (404 UNREGISTERED): вызывающий удаляет его. Любая другая ошибка
    логируется и считается временной — токен остаётся."""
    if not settings.FCM_ENABLED:
        logger.info("fcm_disabled, skipping send")
        return True
    try:
        info = json.loads(settings.FCM_SERVICE_ACCOUNT_JSON)
        message: dict[str, Any] = {
            "token": token,
            "notification": {"title": title, "body": body},
            "android": {"priority": "high"},
            "apns": {"payload": {"aps": {"sound": "default"}}},
        }
        if data:
            message["data"] = data
        async with httpx.AsyncClient(timeout=10) as client:
            access_token = await _get_fcm_access_token(client, info)
            response = await client.post(
                f"https://fcm.googleapis.com/v1/projects/{info['project_id']}/messages:send",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"message": message},
            )
        if response.status_code == 404:
            logger.info("fcm_token_unregistered token=%s", token[:16])
            return False
        response.raise_for_status()
    except Exception:
        logger.exception("fcm_send_failed token=%s", token[:16])
    return True


async def _send_fcm_all(
    tokens: list[str], *, title: str, body: str, data: dict[str, str] | None, on_dead: DeadTokensCallback | None
) -> None:
    dead = [t for t in tokens if not await send_fcm(token=t, title=title, body=body, data=data)]
    if dead and on_dead is not None:
        try:
            await on_dead(dead)
        except Exception:
            logger.exception("fcm_prune_failed")


def run_in_background(coro: Coroutine[Any, Any, None]) -> None:
    """Уведомление не должно задерживать ответ клиенту: текст пишет LLM (секунды),
    поэтому compose+send уходят в отдельную задачу. Ссылка на задачу держится
    в множестве, иначе её может собрать GC до завершения."""
    task = asyncio.get_running_loop().create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def notify_client(
    *,
    phone: str,
    purpose: str,
    facts: dict | None = None,
    must_include: str | None = None,
    fcm_tokens: list[str] | None = None,
    on_dead_fcm_tokens: DeadTokensCallback | None = None,
) -> None:
    """Один текст на SMS и пуш в приложение (если клиент открывал в нём «мою
    запись» с этого телефона). Ссылка must_include уходит в пуш ещё и как
    data.url — тап по уведомлению открывает её в приложении."""
    sms_on = settings.SMS_ENABLED
    fcm_on = bool(fcm_tokens and settings.FCM_ENABLED)
    if not (sms_on or fcm_on):
        logger.info("client_notification_skipped: no active channel for %s", phone)
        return
    text = await compose_message(
        recipient="client",
        purpose=purpose,
        facts=facts,
        language=language_for_phone(phone),
        max_chars=SMS_MAX_CHARS,
        must_include=must_include,
    )
    if not text:
        return
    if sms_on:
        await send_sms(to_phone=phone, text=text)
    if fcm_on:
        await _send_fcm_all(
            fcm_tokens,
            title=settings.PUSH_APP_TITLE,
            body=text,
            data={"url": must_include} if must_include else None,
            on_dead=on_dead_fcm_tokens,
        )


async def notify_master(
    *,
    telegram_chat_id: str | None,
    push_subscriptions: list[dict],
    purpose: str,
    facts: dict | None = None,
    fcm_tokens: list[str] | None = None,
    on_dead_fcm_tokens: DeadTokensCallback | None = None,
    url: str = "/cabinet/",
) -> None:
    """Один текст на все каналы: первая строка — заголовок пуша (web push и
    FCM), Telegram получает сообщение целиком. url — куда ведёт тап по пушу
    (детали конкретной брони или просто кабинет)."""
    telegram_on = bool(telegram_chat_id and settings.TELEGRAM_BOT_TOKEN)
    push_on = bool(push_subscriptions and settings.WEB_PUSH_ENABLED)
    fcm_on = bool(fcm_tokens and settings.FCM_ENABLED)
    if not (telegram_on or push_on or fcm_on):
        logger.info("master_notification_skipped: no active channel")
        return
    text = await compose_message(
        recipient="master",
        purpose=purpose,
        facts=facts,
        language=settings.NOTIFICATION_MASTER_LANGUAGE,
        max_chars=MASTER_MAX_CHARS,
        with_title=True,
    )
    if not text:
        return
    if telegram_on:
        await send_telegram_message(telegram_chat_id, text)
    title, _, body = text.partition("\n")
    title, body = title.strip(), body.strip() or title.strip()
    if push_on:
        for sub in push_subscriptions:
            await send_web_push(
                endpoint=sub["endpoint"],
                p256dh=sub["p256dh"],
                auth=sub["auth"],
                payload={"title": title, "body": body, "url": url},
            )
    if fcm_on:
        await _send_fcm_all(
            fcm_tokens, title=title, body=body, data={"url": url}, on_dead=on_dead_fcm_tokens
        )


async def reply_telegram(*, chat_id: str, purpose: str) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.info("telegram_disabled: no TELEGRAM_BOT_TOKEN configured, skipping send")
        return
    text = await compose_message(
        recipient="master",
        purpose=purpose,
        language=settings.NOTIFICATION_MASTER_LANGUAGE,
        max_chars=MASTER_MAX_CHARS,
    )
    if text:
        await send_telegram_message(chat_id, text)
