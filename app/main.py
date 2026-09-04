"""FastAPI app — «мастер на час», Этап 1 (docs/mvp-task.md).

Routes:
  GET   /api/availability
  POST  /api/bookings
  GET   /api/bookings
  PATCH /api/bookings/{id}/status
  POST  /auth/login
  POST  /auth/logout
  GET   /auth/me
  POST  /admin/masters                       (ADMIN_SECRET header required)
  POST  /admin/masters/{id}/telegram-link     (ADMIN_SECRET header required)
  POST  /telegram/webhook                     (called by Telegram, not by us)
  POST  /push/subscribe                       (logged-in master only)
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.db import get_db
from app.models import (
    Booking,
    BookingStatus,
    MasterUser,
    Provider,
    Service,
    TelegramLinkToken,
    WebPushSubscription,
)
from app.notifications import send_sms, send_telegram_message, send_web_push
from app.schemas import (
    AvailabilityQuery,
    BookingCreate,
    BookingOut,
    BookingStatusUpdate,
    LoginRequest,
    ProviderOut,
    ProviderSettingsOut,
    ProviderSettingsUpdate,
    PushSubscribeRequest,
    ServiceOut,
    TelegramLinkOut,
)
from app.security import hash_password, require_master_user_id, verify_password
from app.slot_engine import SlotOut, get_availability

logger = logging.getLogger("master_na_chas")

app = FastAPI(title="Мастер на час — API")
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET)
# Этап 2: browser-side fetch() from the separately-deployed Next.js frontend
# needs this or every request just fails silently in the browser (no server
# log, no obvious error — CORS failures are enforced client-side). Origins
# come from settings, not hardcoded, so adding the deployed frontend URL
# later is an env var change, not a redeploy-the-code change.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_admin(x_admin_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_admin_secret, settings.ADMIN_SECRET):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not admin")


# ============================================================================
# Public catalog — what the booking page needs before it can even show a
# calendar: which services exist, and (to label a slot) which providers.
# Single-tenant (docs/decisions.md), so "all active services/providers" is
# unambiguous — no tenant filter needed from the client.
# ============================================================================


@app.get("/api/services", response_model=list[ServiceOut])
async def list_services(db: AsyncSession = Depends(get_db)) -> list[Service]:
    stmt = select(Service).where(Service.is_active.is_(True)).order_by(Service.name)
    return (await db.execute(stmt)).scalars().all()


@app.get("/api/providers", response_model=list[ProviderOut])
async def list_providers(db: AsyncSession = Depends(get_db)) -> list[Provider]:
    stmt = select(Provider).where(Provider.is_active.is_(True)).order_by(Provider.name)
    return (await db.execute(stmt)).scalars().all()


# ============================================================================
# Availability + bookings
# ============================================================================


@app.get("/api/availability", response_model=list[SlotOut])
async def get_availability_endpoint(
    query: AvailabilityQuery = Depends(),
    db: AsyncSession = Depends(get_db),
) -> list[SlotOut]:
    if query.date_to < query.date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to must be >= date_from")
    if (query.date_to - query.date_from).days > 60:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too large, max 60 days")

    service = await db.get(Service, query.service_id)
    if service is None or not service.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    provider = None
    if query.provider_id is not None:
        provider = await db.get(Provider, query.provider_id)
        if provider is None or not provider.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")

    return await get_availability(db, service, query.date_from, query.date_to, provider=provider)


@app.post("/api/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(payload: BookingCreate, db: AsyncSession = Depends(get_db)) -> Booking:
    service = await db.get(Service, payload.service_id)
    if service is None or not service.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    if payload.provider_id is None:
        # "любой доступный мастер" — re-check the slot is still free for at
        # least one eligible provider right now, pick the first one; the
        # EXCLUDE constraint is still the real guarantee against a race.
        from app.slot_engine import list_providers_for_service

        candidates = await list_providers_for_service(db, service)
        if not candidates:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No provider offers this service")
        provider = candidates[0]
    else:
        provider = await db.get(Provider, payload.provider_id)
        if provider is None or not provider.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")

    end_at = payload.start_at + timedelta(minutes=service.duration_minutes)

    # each master's own switch (mvp-task.md / Этап 2): confirmed straight
    # away if he's turned off manual confirmation, pending (needs his
    # PATCH .../status) otherwise — see Provider.requires_booking_confirmation.
    initial_status = (
        BookingStatus.pending if provider.requires_booking_confirmation else BookingStatus.confirmed
    )

    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=service.tenant_id,
        provider_id=provider.id,
        service_id=payload.service_id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        start_at=payload.start_at,
        end_at=end_at,
        notes=payload.notes,
        status=initial_status,
    )
    db.add(booking)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "exclusion constraint" in str(exc.orig).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "Slot was just booked by someone else") from exc
        raise
    await db.refresh(booking)

    await _notify_new_booking(db, booking, service)

    return booking


async def _notify_new_booking(db: AsyncSession, booking: Booking, service: Service) -> None:
    """Best-effort — never raises into the request (see notifications.py docstring)."""
    master_user = (
        await db.execute(select(MasterUser).where(MasterUser.provider_id == booking.provider_id))
    ).scalar_one_or_none()

    text = (
        f"Новая бронь: {service.name}\n"
        f"{booking.start_at.strftime('%d.%m %H:%M')}\n"
        f"Клиент: {booking.client_name} {booking.client_phone or ''}"
    )

    if master_user is not None:
        if master_user.telegram_chat_id:
            await send_telegram_message(master_user.telegram_chat_id, text)

        subs = (
            await db.execute(
                select(WebPushSubscription).where(WebPushSubscription.master_user_id == master_user.id)
            )
        ).scalars().all()
        for sub in subs:
            await send_web_push(
                endpoint=sub.endpoint,
                p256dh=sub.p256dh,
                auth=sub.auth,
                payload={"title": "Новая бронь", "body": text},
            )

    if booking.client_phone:
        await send_sms(
            to_phone=booking.client_phone,
            text=f"Заявка принята: {service.name} {booking.start_at.strftime('%d.%m %H:%M')}. Мастер на час.",
        )


@app.get("/api/bookings", response_model=list[BookingOut])
async def list_bookings(
    provider_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Booking]:
    stmt = select(Booking)
    if provider_id is not None:
        stmt = stmt.where(Booking.provider_id == provider_id)
    stmt = stmt.order_by(Booking.start_at)
    return (await db.execute(stmt)).scalars().all()


@app.patch("/api/bookings/{booking_id}/status", response_model=BookingOut)
async def update_booking_status(
    booking_id: uuid.UUID,
    payload: BookingStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _master_user_id: str = Depends(require_master_user_id),
) -> Booking:
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    booking.status = payload.status
    await db.commit()
    await db.refresh(booking)
    return booking


# ============================================================================
# Auth
# ============================================================================


@app.post("/auth/login")
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    master_user = (
        await db.execute(select(MasterUser).where(MasterUser.email == payload.email))
    ).scalar_one_or_none()
    if master_user is None or not verify_password(payload.password, master_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    request.session["master_user_id"] = str(master_user.id)
    return {"ok": True}


@app.post("/auth/logout")
async def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@app.get("/auth/me")
async def whoami(master_user_id: str = Depends(require_master_user_id)) -> dict:
    return {"master_user_id": master_user_id}


# ============================================================================
# Provider settings — a master's own on/off switches. Currently just
# requires_booking_confirmation (Этап 2); resolved from the session, never
# from a provider_id in the URL, so a master can only ever touch his own row.
# ============================================================================


async def _get_own_provider(master_user_id: str, db: AsyncSession) -> Provider:
    master_user = await db.get(MasterUser, uuid.UUID(master_user_id))
    if master_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")
    provider = await db.get(Provider, master_user.provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    return provider


@app.get("/api/providers/me", response_model=ProviderSettingsOut)
async def get_my_provider_settings(
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> Provider:
    return await _get_own_provider(master_user_id, db)


@app.patch("/api/providers/me/settings", response_model=ProviderSettingsOut)
async def update_my_provider_settings(
    payload: ProviderSettingsUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> Provider:
    provider = await _get_own_provider(master_user_id, db)
    provider.requires_booking_confirmation = payload.requires_booking_confirmation
    await db.commit()
    await db.refresh(provider)
    return provider


# ============================================================================
# Admin (superadmin-only — see docs/decisions.md: no public self-registration)
# ============================================================================


@app.post("/admin/masters", dependencies=[Depends(require_admin)])
async def create_master(
    name: str,
    email: str,
    password: str,
    travel_buffer_minutes: int = 30,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # single-tenant setup (docs/decisions.md) — the one tenant row is expected
    # to already exist, created by scripts/seed.py before the first master
    from app.models import Tenant

    tenant_row = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
    if tenant_row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No tenant seeded yet — run scripts/seed.py first")

    provider = Provider(
        id=uuid.uuid4(),
        tenant_id=tenant_row.id,
        name=name,
        travel_buffer_minutes=travel_buffer_minutes,
    )
    db.add(provider)
    await db.flush()

    master_user = MasterUser(
        id=uuid.uuid4(),
        provider_id=provider.id,
        email=email,
        password_hash=hash_password(password),
    )
    db.add(master_user)
    await db.commit()
    return {"provider_id": str(provider.id), "master_user_id": str(master_user.id)}


@app.post(
    "/admin/masters/{master_user_id}/telegram-link",
    response_model=TelegramLinkOut,
    dependencies=[Depends(require_admin)],
)
async def create_telegram_link(master_user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> TelegramLinkOut:
    master_user = await db.get(MasterUser, master_user_id)
    if master_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")

    token = secrets.token_urlsafe(24)
    db.add(TelegramLinkToken(token=token, master_user_id=master_user.id))
    await db.commit()

    bot_username = settings.TELEGRAM_BOT_USERNAME or "<bot_username>"
    return TelegramLinkOut(deep_link=f"https://t.me/{bot_username}?start={token}", token=token)


# ============================================================================
# Telegram webhook — this is what actually fills master_user.telegram_chat_id.
# No manual chat_id copy-paste anywhere (docs/mvp-task.md #5).
# ============================================================================


@app.post("/telegram/webhook")
async def telegram_webhook(update: dict, db: AsyncSession = Depends(get_db)) -> dict:
    message = update.get("message") or {}
    text = message.get("text", "")
    chat = message.get("chat", {})
    chat_id = chat.get("id")

    if not text.startswith("/start ") or chat_id is None:
        return {"ok": True}  # ignore anything that isn't a /start <token> deep-link open

    token = text.removeprefix("/start ").strip()
    link = await db.get(TelegramLinkToken, token)
    if link is None or link.used_at is not None:
        await send_telegram_message(str(chat_id), "Ссылка недействительна или уже использована.")
        return {"ok": True}

    master_user = await db.get(MasterUser, link.master_user_id)
    master_user.telegram_chat_id = str(chat_id)
    link.used_at = datetime.now(timezone.utc)
    await db.commit()

    await send_telegram_message(str(chat_id), "Готово — уведомления о бронях теперь приходят сюда.")
    return {"ok": True}


# ============================================================================
# Web Push subscription — logged-in master registers their browser/device
# ============================================================================


@app.post("/push/subscribe")
async def push_subscribe(
    payload: PushSubscribeRequest,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    existing = (
        await db.execute(
            select(WebPushSubscription).where(WebPushSubscription.endpoint == payload.endpoint)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return {"ok": True, "already_subscribed": True}

    db.add(
        WebPushSubscription(
            id=uuid.uuid4(),
            master_user_id=uuid.UUID(master_user_id),
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
        )
    )
    await db.commit()
    return {"ok": True}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
