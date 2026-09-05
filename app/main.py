"""FastAPI app — «мастер на час», Этап 1 (docs/mvp-task.md).

Routes:
  GET   /api/availability
  POST  /api/bookings
  GET   /api/bookings                        (logged-in master only — own bookings)
  PATCH /api/bookings/{id}/status             (logged-in master only — own bookings)
  GET   /api/providers/me                     (logged-in master only)
  PATCH /api/providers/me/settings            (logged-in master only)
  GET   /api/providers/me/services            (logged-in master only)
  PUT   /api/providers/me/services            (logged-in master only)
  GET   /api/translations                     (public — approved UI strings for a lang)
  POST  /auth/login
  POST  /auth/logout
  GET   /auth/me
  POST  /admin/masters                       (ADMIN_SECRET header required)
  POST  /admin/masters/{id}/telegram-link     (ADMIN_SECRET header required)
  GET   /admin/translations                  (ADMIN_SECRET header required)
  PUT   /admin/translations                  (ADMIN_SECRET header required — upsert, does NOT go live)
  POST  /admin/translations/approve          (ADMIN_SECRET header required — the only thing that does)
  POST  /telegram/webhook                     (called by Telegram, not by us)
  POST  /push/subscribe                       (logged-in master only)
"""

from __future__ import annotations

import logging
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.db import async_session_factory, get_db
from app.models import (
    Booking,
    BookingStatus,
    MasterUser,
    Provider,
    ProviderService,
    Service,
    TelegramLinkToken,
    TranslationEntry,
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
    ProviderServicesUpdate,
    ProviderSettingsOut,
    ProviderSettingsUpdate,
    PushSubscribeRequest,
    ServiceOut,
    ServiceToggleOut,
    TelegramLinkOut,
    TranslationApproveRequest,
    TranslationEntryOut,
    TranslationUpsert,
)
from app.security import hash_password, require_master_user_id, verify_password
from app.slot_engine import SlotOut, get_availability, provider_offers_service
from app.translations import DEFAULT_LANG, SUPPORTED_LANGS, refresh_translation_cache, translation_cache

# Without this, the root logger has no handler at all: Python's implicit
# "handler of last resort" only prints WARNING+ to stderr, so anything logged
# at INFO (e.g. app/notifications.py's "channel disabled, skipping send"
# notices) would silently go nowhere in every environment, including Render's
# log stream — not just less prominent, genuinely invisible. This makes the
# configured LOG_LEVEL (app/config.py) actually take effect everywhere.
logging.basicConfig(level=settings.LOG_LEVEL, format="%(levelname)s:%(name)s:%(message)s")

logger = logging.getLogger("master_na_chas")


def _client_ip(request: Request) -> str:
    # Render (like most PaaS) terminates TLS at a reverse proxy, so
    # request.client.host is the proxy's own address for every request —
    # slowapi's default get_remote_address would rate-limit "everyone
    # combined" as one client. The proxy sets X-Forwarded-For to the real
    # client IP as the first entry; fall back to request.client for local
    # dev, where there's no proxy in front at all.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_client_ip)


@asynccontextmanager
async def _lifespan(_: FastAPI):
    # Primes the translation cache (Этап 3) so the very first request after
    # a deploy/restart doesn't serve blank UI strings until someone happens
    # to hit /admin/translations/approve. Not relied on by the test suite —
    # each test seeds/approves what it needs explicitly, see
    # tests/test_translations.py — only by the real deployed process.
    async with async_session_factory() as session:
        await refresh_translation_cache(session)
    yield


app = FastAPI(title="Мастер на час — API", lifespan=_lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    same_site=settings.SESSION_COOKIE_SAME_SITE,
    https_only=settings.SESSION_COOKIE_HTTPS_ONLY,
)
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


def _resolve_lang(lang: str) -> str:
    """Falls back silently rather than 400ing — a display concern, not a hard
    validation boundary (same "typo-safe" call as update_my_services below)."""
    return lang if lang in SUPPORTED_LANGS else DEFAULT_LANG


def _resolve_service_name(service: Service, lang: str) -> str:
    """requested lang -> ru (today's most complete/original language) -> the
    internal canonical `name` field. See Service.name_pl/_ru/_uk docstring
    in app/models.py."""
    per_lang = {"pl": service.name_pl, "ru": service.name_ru, "uk": service.name_uk}
    return per_lang.get(lang) or service.name_ru or service.name


@app.get("/api/services", response_model=list[ServiceOut])
async def list_services(lang: str = Query(default=DEFAULT_LANG), db: AsyncSession = Depends(get_db)) -> list[ServiceOut]:
    lang = _resolve_lang(lang)
    stmt = select(Service).where(Service.is_active.is_(True)).order_by(Service.name)
    services = (await db.execute(stmt)).scalars().all()
    return [
        ServiceOut(
            id=s.id,
            name=_resolve_service_name(s, lang),
            duration_minutes=s.duration_minutes,
            price_min=s.price_min,
            price_max=s.price_max,
        )
        for s in services
    ]


@app.get("/api/providers", response_model=list[ProviderOut])
async def list_providers(db: AsyncSession = Depends(get_db)) -> list[Provider]:
    stmt = select(Provider).where(Provider.is_active.is_(True)).order_by(Provider.name)
    return (await db.execute(stmt)).scalars().all()


@app.get("/api/translations")
async def get_translations(
    lang: str = Query(default=DEFAULT_LANG), namespace: str = Query(default="ui")
) -> dict[str, str]:
    """Approved UI strings for one lang, straight from the in-memory cache —
    see app/translations.py. Never touches the DB on the request path."""
    return translation_cache.get_all(namespace, _resolve_lang(lang))


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
@limiter.limit("5/minute")
async def create_booking(request: Request, payload: BookingCreate, db: AsyncSession = Depends(get_db)) -> Booking:
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
        # An explicit provider_id normally comes straight from an
        # /api/availability slot the client just fetched, so this should
        # always already be true — but nothing stops a client from posting
        # a stale/hand-crafted provider_id for a service that provider has
        # since turned off in his cabinet (see ProviderService.is_active).
        # Without this check that booking would still go through: the
        # EXCLUDE constraint only guards against double-booking a *time*,
        # it says nothing about whether this provider does this service.
        if not await provider_offers_service(db, provider.id, service.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider does not offer this service")

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
async def list_my_bookings(
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    master_user_id: str = Depends(require_master_user_id),
) -> list[Booking]:
    # A master's own bookings — never anyone else's. provider_id used to be a
    # client-supplied query param with no auth at all, which meant anyone on
    # the internet could pull any client's name and phone number for any
    # provider just by guessing/incrementing nothing (the endpoint was
    # completely open). It's resolved from the session now, the same as
    # /api/providers/me, so there's no parameter to pass that could ever
    # return someone else's data.
    provider = await _get_own_provider(master_user_id, db)
    stmt = select(Booking).where(Booking.provider_id == provider.id)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter)
    stmt = stmt.order_by(Booking.start_at)
    return (await db.execute(stmt)).scalars().all()


@app.patch("/api/bookings/{booking_id}/status", response_model=BookingOut)
async def update_booking_status(
    booking_id: uuid.UUID,
    payload: BookingStatusUpdate,
    db: AsyncSession = Depends(get_db),
    master_user_id: str = Depends(require_master_user_id),
) -> Booking:
    # require_master_user_id only proves *someone* is logged in — without the
    # provider_id check below, any logged-in master could confirm or cancel
    # any OTHER master's bookings just by knowing (or listing) the booking's
    # id. Same 404 for "doesn't exist" and "exists but isn't yours": telling
    # the two apart would confirm that some other provider's booking id is
    # real.
    provider = await _get_own_provider(master_user_id, db)
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.provider_id != provider.id:
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
    provider.call_out_fee = payload.call_out_fee
    await db.commit()
    await db.refresh(provider)
    return provider


@app.get("/api/providers/me/services", response_model=list[ServiceToggleOut])
async def get_my_services(
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Every active tenant service, each tagged with whether *this* provider
    currently offers it — the source for the cabinet's checklist. Services
    the tenant has fully retired (Service.is_active=False) don't appear at
    all; that's an admin-only decision, not something a master toggles."""
    lang = _resolve_lang(lang)
    provider = await _get_own_provider(master_user_id, db)

    services = (
        (await db.execute(select(Service).where(Service.is_active.is_(True)).order_by(Service.name)))
        .scalars()
        .all()
    )
    offered_ids = {
        row.service_id
        for row in (
            await db.execute(
                select(ProviderService).where(
                    ProviderService.provider_id == provider.id, ProviderService.is_active.is_(True)
                )
            )
        )
        .scalars()
        .all()
    }
    return [
        ServiceToggleOut(
            service_id=s.id,
            name=_resolve_service_name(s, lang),
            duration_minutes=s.duration_minutes,
            price_min=s.price_min,
            price_max=s.price_max,
            is_offered=s.id in offered_ids,
        )
        for s in services
    ]


@app.put("/api/providers/me/services", response_model=list[ServiceToggleOut])
async def update_my_services(
    payload: ProviderServicesUpdate,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Replace semantics: payload.service_ids is the FULL set this provider
    now offers — anything active-but-not-listed gets turned off. Silently
    ignores ids that don't name an active tenant service (typo-safe rather
    than a hard 404 on a bulk checklist save); the response reflects exactly
    what was actually applied, so the client always ends up rendering truth,
    not what it optimistically posted."""
    provider = await _get_own_provider(master_user_id, db)

    valid_service_ids = {
        row[0]
        for row in (
            await db.execute(select(Service.id).where(Service.is_active.is_(True)))
        ).all()
    }
    desired_ids = set(payload.service_ids) & valid_service_ids

    existing_links = {
        row.service_id: row
        for row in (
            await db.execute(select(ProviderService).where(ProviderService.provider_id == provider.id))
        )
        .scalars()
        .all()
    }

    for service_id in desired_ids:
        link = existing_links.get(service_id)
        if link is None:
            db.add(ProviderService(provider_id=provider.id, service_id=service_id, is_active=True))
        elif not link.is_active:
            link.is_active = True

    for service_id, link in existing_links.items():
        if service_id not in desired_ids and link.is_active:
            link.is_active = False

    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


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
# Translations admin (Этап 3, docs/ai-and-reviews.md §1) — draft/approve
# split. PUT upserts a row but never touches the live cache; only
# POST .../approve does. See app/translations.py's module docstring for why
# that split exists — it's the Garage System /update-forgets-to-refresh trap,
# made structurally impossible here instead of relied on to remember.
# ============================================================================


@app.get(
    "/admin/translations",
    response_model=list[TranslationEntryOut],
    dependencies=[Depends(require_admin)],
)
async def list_translations(
    namespace: str | None = Query(default=None),
    lang: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> list[TranslationEntry]:
    stmt = select(TranslationEntry)
    if namespace is not None:
        stmt = stmt.where(TranslationEntry.namespace == namespace)
    if lang is not None:
        stmt = stmt.where(TranslationEntry.lang == lang)
    if status_filter is not None:
        stmt = stmt.where(TranslationEntry.status == status_filter)
    stmt = stmt.order_by(TranslationEntry.namespace, TranslationEntry.key, TranslationEntry.lang)
    return (await db.execute(stmt)).scalars().all()


@app.put(
    "/admin/translations",
    response_model=TranslationEntryOut,
    dependencies=[Depends(require_admin)],
)
async def upsert_translation(payload: TranslationUpsert, db: AsyncSession = Depends(get_db)) -> TranslationEntry:
    """Deliberately does NOT touch translation_cache — see app/translations.py.
    A draft/reviewed edit here is invisible to real visitors until a separate
    POST /admin/translations/approve names this exact (namespace, key, lang)."""
    existing = (
        await db.execute(
            select(TranslationEntry).where(
                TranslationEntry.namespace == payload.namespace,
                TranslationEntry.key == payload.key,
                TranslationEntry.lang == payload.lang,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = TranslationEntry(
            id=uuid.uuid4(), namespace=payload.namespace, key=payload.key, lang=payload.lang
        )
        db.add(existing)
    existing.text = payload.text
    existing.status = payload.status
    existing.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(existing)
    return existing


@app.post(
    "/admin/translations/approve",
    response_model=list[TranslationEntryOut],
    dependencies=[Depends(require_admin)],
)
async def approve_translations(
    payload: TranslationApproveRequest, db: AsyncSession = Depends(get_db)
) -> list[TranslationEntry]:
    """The only thing that ever refreshes the live cache — see
    app/translations.py. Explicit list of (namespace, key, lang), not
    "approve everything draft": a batch call can't accidentally publish
    something nobody actually reviewed."""
    approved: list[TranslationEntry] = []
    for ref in payload.entries:
        entry = (
            await db.execute(
                select(TranslationEntry).where(
                    TranslationEntry.namespace == ref.namespace,
                    TranslationEntry.key == ref.key,
                    TranslationEntry.lang == ref.lang,
                )
            )
        ).scalar_one_or_none()
        if entry is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"No such entry: {ref.namespace}/{ref.key}/{ref.lang}"
            )
        entry.status = "approved"
        entry.updated_at = datetime.now(timezone.utc)
        approved.append(entry)
    await db.commit()
    await refresh_translation_cache(db)
    return approved


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
