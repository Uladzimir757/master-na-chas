"""FastAPI app — «мастер на час», Этап 1 (docs/mvp-task.md).

Routes:
  GET   /api/availability
  POST  /api/bookings
  GET   /api/bookings                        (logged-in master only — own bookings)
  PATCH /api/bookings/{id}/status             (logged-in master only — own bookings)
  POST  /api/providers/me/bookings            (logged-in master only — manual/walk-in booking, Букси-calendar)
  PATCH /api/bookings/{id}/reschedule         (logged-in master only — move/resize, drag-and-drop)
  GET   /api/providers/me/calendar            (logged-in master only — bookings+blocks for a date range)
  POST  /api/providers/me/blocks              (logged-in master only — block time on the calendar)
  PATCH /api/providers/me/blocks/{id}         (logged-in master only — move/resize a block)
  DELETE /api/providers/me/blocks/{id}        (logged-in master only)
  GET   /api/providers/me                     (logged-in master only)
  PATCH /api/providers/me/settings            (logged-in master only)
  GET   /api/providers/me/services            (logged-in master only)
  PUT   /api/providers/me/services            (logged-in master only)
  GET   /api/providers/me/working-hours       (logged-in master only)
  PUT   /api/providers/me/working-hours       (logged-in master only — replaces the weekly template)
  PUT   /api/providers/me/working-hours/exceptions/{date}    (logged-in master only — upsert a day override)
  DELETE /api/providers/me/working-hours/exceptions/{date}   (logged-in master only)
  PUT   /api/providers/me/location            (logged-in master only — foreground GPS ping, Этап 4)
  POST  /api/providers/me/location            (same — native background-geolocation POST, mobile app)
  POST  /api/providers/me/busy/start          (logged-in master only — "занят сейчас" on)
  PATCH /api/providers/me/busy                (logged-in master only — set/clear estimate)
  POST  /api/providers/me/busy/finish         (logged-in master only — "занят сейчас" off)
  GET   /api/translations                     (public — approved UI strings for a lang)
  GET   /api/dispatcher/masters               (public — masters for the dispatcher project's results)
  POST  /auth/login
  POST  /auth/logout
  GET   /auth/me
  POST  /admin/login                          (ADMIN_SECRET as a password — starts an admin session)
  POST  /admin/logout
  GET   /admin/me                             (ADMIN_SECRET header OR admin session required)
  GET   /admin/masters                        (ADMIN_SECRET header OR admin session required)
  POST  /admin/masters                       (ADMIN_SECRET header OR admin session required)
  PATCH /admin/masters/{id}                  (ADMIN_SECRET header OR admin session required — rating/rating_count, phone)
  DELETE /admin/masters/{id}                 (ADMIN_SECRET header OR admin session required — blocked if bookings exist)
  POST  /admin/masters/{id}/telegram-link     (ADMIN_SECRET header OR admin session required)
  GET   /admin/translations                  (ADMIN_SECRET header OR admin session required)
  PUT   /admin/translations                  (ADMIN_SECRET header OR admin session required — upsert, does NOT go live)
  POST  /admin/translations/approve          (ADMIN_SECRET header OR admin session required — the only thing that does)
  POST  /telegram/webhook                     (called by Telegram, not by us)
  POST  /push/subscribe                       (logged-in master only)
  PUT   /api/push/device-token               (logged-in master only — FCM token of the native app)
  POST  /api/push/device-token/unregister    (public — knowing the FCM token is enough to drop it)
  PUT   /api/my-booking/{id}/device-token    (public — token from the SMS link; FCM token of the client's app)
  GET   /api/reviews/invite/{booking_id}       (public — token from the SMS link)
  POST  /api/reviews/invite/{booking_id}       (public — token from the SMS link, submits the review)
  GET   /api/providers/{provider_id}/reviews   (public)
"""

from __future__ import annotations

import logging
import time as _time
import math
import secrets
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from datetime import date, datetime, time, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.db import async_session_factory, get_db
from app.confirm_timer import (
    PROVIDER_TIMEOUT,
    claim_due_notices,
    confirm_deadline_for,
    expire_overdue_bookings,
    timer_start,
)
from app.models import (
    Booking,
    BookingStatus,
    City,
    ProviderCity,
    MasterUser,
    Provider,
    ProviderBlock,
    ProviderService,
    Review,
    ReviewInvite,
    Service,
    TelegramLinkToken,
    TranslationEntry,
    WebPushSubscription,
    DevicePushToken,
    WorkingHours,
    WorkingHoursException,
)
from app.notifications import notify_client, notify_master, reply_telegram, run_in_background
from app.public_cache import cache_control, is_missing, public_cache, write_invalidates
from app.schemas import (
    AdminAnalyticsOut,
    AdminCityCreate,
    AdminCityOut,
    AdminCityUpdate,
    AdminMasterCitiesUpdate,
    MyCitiesUpdate,
    MyCityOut,
    ArrivalPreviewOut,
    PublicCityOut,
    MasterStatOut,
    MyBookingHistoryItem,
    MyBookingOut,
    MyBookingReschedule,
    AnalyticsOut,
    RolesMetaOut,
    ServiceStatOut,
    StaffCreate,
    StaffOut,
    StaffUpdate,
    AdminLoginRequest,
    AdminMasterUpdate,
    AvailabilityQuery,
    BookingCreate,
    BookingCreatedOut,
    BookingOut,
    BookingRescheduleUpdate,
    BookingStatusUpdate,
    BusyEstimateUpdate,
    CalendarOut,
    ChangePasswordRequest,
    CreateMasterRequest,
    LoginRequest,
    ManualBookingCreate,
    MasterOut,
    ProviderBlockCreate,
    ProviderBlockOut,
    ProviderBlockUpdate,
    ProviderBusyOut,
    ProviderLocationOut,
    ProviderLocationUpdate,
    ProviderOut,
    DispatcherMasterOut,
    ProviderServiceOut,
    ProviderServicesUpdate,
    ProviderSettingsOut,
    ProviderSettingsUpdate,
    PushSubscribeRequest,
    OwnServiceCreate,
    OwnServiceUpdate,
    RemovedServiceOut,
    DeviceTokenRequest,
    DeviceTokenUnregister,
    ReviewCreate,
    ReviewInviteOut,
    ReviewOut,
    ServiceOut,
    ServiceToggleOut,
    TelegramLinkOut,
    TranslationApproveRequest,
    TranslationEntryOut,
    TranslationUpsert,
    WorkingHoursExceptionOut,
    WorkingHoursExceptionUpsert,
    WorkingHoursOut,
    WorkingHoursSlot,
    WorkingHoursUpdate,
)
from app.permissions import PERMISSIONS, ROLE_DEFAULTS, ROLE_OWNER, ROLES, effective_permissions
from app.security import (
    ADMIN_TOKEN_MAX_AGE,
    hash_password,
    make_token,
    read_token,
    require_master_user_id,
    verify_password,
)
from app.slot_engine import (
    BUSINESS_TZ,
    CONFIRM_WINDOW,
    LOCATION_FRESHNESS,
    SlotOut,
    get_availability,
    is_within_working_hours,
    overlaps_any_provider_block,
    overlaps_provider_busy_range,
    provider_busy_range,
    provider_offers_service,
    provider_service_duration,
)
from app.translations import DEFAULT_LANG, SUPPORTED_LANGS, refresh_translation_cache, translation_cache

# Without this, the root logger has no handler at all: Python's implicit
# "handler of last resort" only prints WARNING+ to stderr, so anything logged
# at INFO (e.g. app/notifications.py's "channel disabled, skipping send"
# notices) would silently go nowhere in every environment, including Render's
# log stream — not just less prominent, genuinely invisible. This makes the
# configured LOG_LEVEL (app/config.py) actually take effect everywhere.
logging.basicConfig(level=settings.LOG_LEVEL, format="%(levelname)s:%(name)s:%(message)s")

logger = logging.getLogger("master_na_chas")
# httpx пишет каждый запрос с полным URL на INFO, а в URL Telegram Bot API
# лежит токен бота — в логах Render его быть не должно.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpx2").setLevel(logging.WARNING)


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


@app.middleware("http")
async def _timing_and_cache(request: Request, call_next):
    """Время ответа по эндпоинтам (docs/load-readiness.md, п.6): заголовок
    Server-Timing на каждом ответе, медленные — в лог WARNING с шаблоном
    маршрута, чтобы их можно было сгруппировать. Плюс сброс кэша публичного
    каталога после записей, которые могли его изменить (app/public_cache.py)."""
    started = _time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (_time.perf_counter() - started) * 1000
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.0f}"
    if elapsed_ms >= settings.SLOW_REQUEST_MS:
        route = request.scope.get("route")
        logger.warning(
            "slow_request %s %s %s %.0fms",
            request.method,
            getattr(route, "path", request.url.path),
            response.status_code,
            elapsed_ms,
        )
    if response.status_code < 400 and write_invalidates(request.method, request.url.path):
        public_cache.clear()
    _maybe_sweep_confirm_timer()
    return response


def require_admin(request: Request, x_admin_secret: str = Header(default="")) -> None:
    """Two ways in, same gate: an X-Admin-Secret header (scripts/curl, the
    original shape) or an admin session cookie set by POST /admin/login (the
    admin panel — web/app/admin/page.tsx). Checking the session first means
    the panel never has to hold the raw ADMIN_SECRET in browser JS beyond the
    single login request."""
    if request.session.get("is_admin") is True:
        return
    if read_token(request, "admin", ADMIN_TOKEN_MAX_AGE) is not None:
        return
    # compare_digest(str, str) бросает TypeError на не-ASCII -> 500; сравниваем байты.
    if not x_admin_secret or not secrets.compare_digest(
        x_admin_secret.encode("utf-8"), settings.ADMIN_SECRET.encode("utf-8")
    ):
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
    """requested lang (pl/en — see SUPPORTED_LANGS) -> the internal
    canonical `name` field (Russian text, historically — see
    Service.name_pl/_ru/_uk/_en's docstring in app/models.py) as the last
    resort, e.g. for a service missing a name in the requested lang."""
    per_lang = {"pl": service.name_pl, "en": service.name_en}
    return per_lang.get(lang) or service.name


@app.get("/api/services", response_model=list[ServiceOut])
async def list_services(lang: str = Query(default=DEFAULT_LANG), db: AsyncSession = Depends(get_db)) -> list[ServiceOut]:
    lang = _resolve_lang(lang)
    stmt = (
        select(Service)
        .where(Service.is_active.is_(True), Service.owner_provider_id.is_(None))
        .order_by(Service.name)
    )
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


async def _resolve_provider_location(db: AsyncSession, provider: Provider, now: datetime) -> ProviderLocationOut | None:
    """The public location dot (Этап 4) only ever appears when all three
    hold: the master has share_location on, the last fix is still within
    LOCATION_FRESHNESS of `now`, and it's currently his working hours — see
    Provider.share_location's docstring in app/models.py. Any one missing
    and this returns None; the client never sees a stale or off-hours
    point."""
    if not provider.share_location:
        return None
    if provider.location_lat is None or provider.location_lng is None or provider.location_updated_at is None:
        return None
    if now - provider.location_updated_at > LOCATION_FRESHNESS:
        return None
    if not await is_within_working_hours(db, provider.id, now):
        return None
    return ProviderLocationOut(
        lat=float(provider.location_lat), lng=float(provider.location_lng), updated_at=provider.location_updated_at
    )


def _providers_in_city(slug: str):
    """provider_id of masters working in this (active) city — a subquery."""
    return (
        select(ProviderCity.provider_id)
        .join(City, City.id == ProviderCity.city_id)
        .where(City.slug == slug, City.is_active.is_(True))
    )


@app.get("/api/providers", response_model=list[ProviderOut])
async def list_providers(
    response: Response, city: str | None = None, db: AsyncSession = Depends(get_db)
) -> list[ProviderOut]:
    """Sorted by rating (best first, unrated last — nulls_last, not a 0)
    for the master-picker screen; name as the tiebreaker so unrated masters
    still list in a stable order rather than shuffling on every request.

    `city` (slug) — only masters of that city; a master with no cities is
    never in a city's list. Without it — every active master, for an older
    cached page that doesn't ask for a city yet.

    Кэшируется на PUBLIC_CACHE_SECONDS вместе с живой точкой мастера: она
    и так «свежая» в пределах LOCATION_FRESHNESS (15 мин)."""
    response.headers["Cache-Control"] = cache_control()
    cached = public_cache.get(("providers", city))
    if not is_missing(cached):
        return cached
    stmt = (
        select(Provider)
        .where(Provider.is_active.is_(True))
        .order_by(Provider.rating.desc().nulls_last(), Provider.name)
    )
    if city is not None:
        stmt = stmt.where(Provider.id.in_(_providers_in_city(city)))
    providers = (await db.execute(stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    offer_rows = (
        await db.execute(
            select(ProviderService, Service)
            .join(Service, Service.id == ProviderService.service_id)
            .where(ProviderService.is_active.is_(True), Service.is_active.is_(True))
        )
    ).all()
    price_from: dict[uuid.UUID, float] = {}
    cats: dict[uuid.UUID, set[str]] = {}
    for link, svc in offer_rows:
        price = link.price_min if link.price_min is not None else svc.price_min
        if price is not None:
            price_from[link.provider_id] = min(float(price), price_from.get(link.provider_id, float(price)))
        if svc.category:
            cats.setdefault(link.provider_id, set()).add(svc.category)
    return public_cache.set(("providers", city), [
        ProviderOut(
            id=p.id,
            name=p.name,
            rating=p.rating,
            rating_count=p.rating_count,
            call_out_fee=p.call_out_fee,
            location=await _resolve_provider_location(db, p, now),
            price_from=price_from.get(p.id),
            categories=sorted(cats.get(p.id, set())),
        )
        for p in providers
    ])


@app.get("/api/cities", response_model=list[PublicCityOut])
async def list_cities(response: Response, db: AsyncSession = Depends(get_db)) -> list[PublicCityOut]:
    """Все активные города для выбора на главной (решение пользователя
    11.11.2026: клиент видит все города, а не только с мастерами). Город без
    мастеров помечен has_masters=False — клиент видит пометку. lat/lng — для
    выбора «по моей локации» (ближайший город)."""
    response.headers["Cache-Control"] = cache_control()
    cached = public_cache.get("cities")
    if not is_missing(cached):
        return cached
    has_master = set(
        (
            await db.execute(
                select(ProviderCity.city_id)
                .join(Provider, Provider.id == ProviderCity.provider_id)
                .where(Provider.is_active.is_(True))
            )
        ).scalars().all()
    )
    cities = (
        await db.execute(select(City).where(City.is_active.is_(True)).order_by(City.sort_order, City.name_pl))
    ).scalars().all()
    return public_cache.set(
        "cities",
        [
            PublicCityOut(
                id=c.id,
                slug=c.slug,
                name_pl=c.name_pl,
                name_en=c.name_en,
                lat=float(c.lat) if c.lat is not None else None,
                lng=float(c.lng) if c.lng is not None else None,
                has_masters=c.id in has_master,
            )
            for c in cities
        ],
    )


async def _provider_works_in(db: AsyncSession, provider_id: uuid.UUID, city_id: uuid.UUID) -> bool:
    row = (
        await db.execute(
            select(ProviderCity.provider_id)
            .join(City, City.id == ProviderCity.city_id)
            .where(ProviderCity.provider_id == provider_id, ProviderCity.city_id == city_id, City.is_active.is_(True))
        )
    ).scalar_one_or_none()
    return row is not None


# The dispatcher's (separate project) categories this tenant's masters cover,
# and its handyman subcategories -> our Service.category values.
DISPATCHER_CATEGORIES = {"handyman"}
DISPATCHER_SUBCATEGORIES = {
    "plumbing": "plumbing",
    "electrical": "electric",
    "furniture_assembly": "assembly",
    "general_repair": "repair",
}


def _in_service_area(lat: float | None, lng: float | None, city: str | None) -> bool:
    if lat is not None and lng is not None:
        return _distance_km(lat, lng, settings.SERVICE_AREA_LAT, settings.SERVICE_AREA_LNG) <= settings.SERVICE_AREA_RADIUS_KM
    cities = {c.strip() for c in settings.SERVICE_AREA_CITIES.split(",")}
    return bool(city) and city.strip().lower() in cities


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


@app.get("/api/dispatcher/masters", response_model=list[DispatcherMasterOut])
async def dispatcher_masters(
    category: str,
    subcategory: str | None = None,
    city: str | None = None,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    lang: str = Query(default=DEFAULT_LANG),
    db: AsyncSession = Depends(get_db),
) -> list[DispatcherMasterOut]:
    """Our masters for one request of the dispatcher (a separate project that
    only knows this URL): active masters with an active service of the
    request's category, best rated first. Empty for another category or a
    place outside SERVICE_AREA_* — the dispatcher then shows Google Places
    only. A subcategory we don't have (e.g. painting) doesn't narrow the list:
    any handyman can be asked. `lang` is accepted for the dispatcher's sake;
    the booking page picks its own language."""
    if category not in DISPATCHER_CATEGORIES or not _in_service_area(lat, lng, city):
        return []
    stmt = (
        select(Provider)
        .join(ProviderService, ProviderService.provider_id == Provider.id)
        .join(Service, Service.id == ProviderService.service_id)
        .where(Provider.is_active.is_(True), ProviderService.is_active.is_(True), Service.is_active.is_(True))
        .distinct()
    )
    if subcategory in DISPATCHER_SUBCATEGORIES:
        stmt = stmt.where(Service.category == DISPATCHER_SUBCATEGORIES[subcategory])
    providers = (await db.execute(stmt)).scalars().all()
    providers = sorted(providers, key=lambda p: (p.rating is None, -(p.rating or 0), p.name))
    now = datetime.now(timezone.utc)
    out = []
    for p in providers:
        location = await _resolve_provider_location(db, p, now)
        out.append(
            DispatcherMasterOut(
                id=p.id,
                name=p.name,
                phone=p.phone,
                lat=location.lat if location else None,
                lng=location.lng if location else None,
                rating=p.rating,
                reviews=p.rating_count,
                url=f"{settings.WEB_PUBLIC_URL}/",
            )
        )
    return out


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
    await _expire_overdue(db)

    provider = None
    if query.provider_id is not None:
        provider = await db.get(Provider, query.provider_id)
        if provider is None or not provider.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")

    return await get_availability(db, service, query.date_from, query.date_to, provider=provider)


@app.post("/api/bookings", response_model=BookingCreatedOut, status_code=status.HTTP_201_CREATED)
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
        if payload.city_id is not None:
            candidates = [c for c in candidates if await _provider_works_in(db, c.id, payload.city_id)]
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
        if payload.city_id is not None and not await _provider_works_in(db, provider.id, payload.city_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provider does not work in this city")

    end_at = payload.start_at + timedelta(minutes=await provider_service_duration(db, provider.id, service))

    # Real bug found live (2026-09-15): a client booked today's 09:00 slot
    # at 19:25 and it went through — nothing anywhere in the booking path
    # ever compared the requested time to "now". app/slot_engine.py's
    # _slots_for_one_provider now excludes already-started slots from
    # GET /api/availability itself (the root fix — the client only ever
    # renders what that endpoint returns), but this endpoint re-checks
    # independently for the same reason as the two checks below: a client
    # can hold a slot list fetched earlier (page left open, cached response)
    # and POST from it long after the slot has elapsed.
    if payload.start_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slot is in the past")

    # Same defense-in-depth as the provider_offers_service check above: a
    # client could have this slot cached/queued from before the master
    # pressed "начать" (app/slot_engine.py's provider_busy_range) — without
    # this, GET /api/availability would correctly stop offering the slot,
    # but nothing would stop a POST that already has it from going through.
    if overlaps_provider_busy_range(provider, payload.start_at, end_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "Provider is currently busy")

    # Всегда pending: мастер подтверждает каждый заказ сам (таймер, время
    # доезда). Свой переключатель мастера убран 11.11.2026 — пока тик не
    # настроен (free tier), автоподтверждение обходило бы весь этот поток;
    # Provider.requires_booking_confirmation больше не читается.
    initial_status = BookingStatus.pending

    # Таймер подтверждения (app/confirm_timer.py). Заказ вне рабочих часов
    # ждёт их начала: уведомление мастеру уйдёт тогда из тика, не ночью.
    now = datetime.now(timezone.utc)
    deadline = None
    if initial_status == BookingStatus.pending:
        deadline = await confirm_deadline_for(db, provider.id, now=now, start_at=payload.start_at)
    notify_master_now = deadline is None or deadline - CONFIRM_WINDOW <= now

    # Просроченный неподтверждённый заказ на этот же слот держит его в
    # EXCLUDE-констрейнте, пока его не отменил тик — освобождаем.
    await _expire_overdue(db)

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
        manage_token=secrets.token_urlsafe(24),
        city_id=payload.city_id,
        confirm_deadline_at=deadline,
        confirm_notices_sent=1 if deadline is not None and notify_master_now else 0,
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

    await _notify_new_booking(db, booking, service, staff=notify_master_now)

    return booking


def _cabinet_booking_url(booking_id: uuid.UUID) -> str:
    """Deep link пуша: кабинет сразу открывает детали этой брони."""
    return f"/cabinet/?booking={booking_id}"


async def _notify_staff(
    db: AsyncSession, provider_id: uuid.UUID, purpose: str, facts: dict, url: str = "/cabinet/"
) -> None:
    """Уведомление хозяину и менеджерам (кто управляет бронями). Best-effort."""
    staff = (await db.execute(select(MasterUser).where(MasterUser.provider_id == provider_id))).scalars().all()
    recipients = [u for u in staff if "bookings_status" in effective_permissions(u.role, u.permissions)]
    for master_user in recipients:
        subs = (
            await db.execute(select(WebPushSubscription).where(WebPushSubscription.master_user_id == master_user.id))
        ).scalars().all()
        fcm_tokens = (
            await db.execute(select(DevicePushToken.fcm_token).where(DevicePushToken.master_user_id == master_user.id))
        ).scalars().all()
        run_in_background(
            notify_master(
                telegram_chat_id=master_user.telegram_chat_id,
                push_subscriptions=[{"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth} for s in subs],
                purpose=purpose,
                facts=facts,
                fcm_tokens=list(fcm_tokens),
                on_dead_fcm_tokens=_prune_dead_fcm_tokens,
                url=url,
            )
        )


async def _client_fcm_tokens(db: AsyncSession, phone: str | None) -> list[str]:
    if not phone:
        return []
    return list(
        (await db.execute(select(DevicePushToken.fcm_token).where(DevicePushToken.client_phone == phone))).scalars().all()
    )


async def _prune_dead_fcm_tokens(tokens: list[str]) -> None:
    """FCM сказал UNREGISTERED (приложение удалено/переустановлено) — токен
    больше не нужен. Отдельная сессия: запрос, породивший уведомление, уже
    завершён к моменту фоновой отправки."""
    async with async_session_factory() as session:
        await session.execute(delete(DevicePushToken).where(DevicePushToken.fcm_token.in_(tokens)))
        await session.commit()


def _when_facts(at: datetime) -> dict:
    local = at.astimezone(BUSINESS_TZ)
    return {"date": local.date().isoformat(), "weekday": local.strftime("%A"), "time": local.strftime("%H:%M")}


def _minutes_left(booking: Booking, now: datetime) -> int:
    return max(0, math.ceil((booking.confirm_deadline_at - now).total_seconds() / 60))


def _manage_url(booking: Booking) -> str:
    return f"{settings.WEB_PUBLIC_URL}/booking/?id={booking.id}&token={booking.manage_token}"


async def _notify_master_of_booking(db: AsyncSession, booking: Booking, service_name: str, now: datetime) -> None:
    """Уведомление мастеру о новом заказе — сразу при создании или, для
    заказа вне рабочих часов, из тика в начале его рабочего дня."""
    facts = {
        "service": service_name,
        **_when_facts(booking.start_at),
        "client_name": booking.client_name,
        "client_phone": booking.client_phone,
    }
    purpose = (
        "Tell the master that a client has just booked a new job and give the job, the time and how to reach the client."
    )
    if booking.confirm_deadline_at is not None:
        facts["minutes_to_confirm"] = _minutes_left(booking, now)
        purpose += " Say he must confirm it in the app within the given minutes or it is cancelled automatically."
    await _notify_staff(db, booking.provider_id, purpose, facts, url=_cabinet_booking_url(booking.id))


async def _notify_new_booking(db: AsyncSession, booking: Booking, service: Service, *, staff: bool = True) -> None:
    """Best-effort — never raises into the request (see notifications.py docstring).
    Текст пишет LLM (app/llm_text.py) в фоне; здесь только собираются факты —
    plain-значения, а не ORM-объекты, потому что сессия живёт недолго.

    staff=False — заказ пришёл вне рабочих часов мастера: ему напишет тик в
    начале рабочего дня (app/confirm_timer.py), клиенту — сейчас."""
    now = datetime.now(timezone.utc)
    if staff:
        await _notify_master_of_booking(db, booking, service.name, now)

    if booking.client_phone:
        facts = {"service": service.name, **_when_facts(booking.start_at)}
        purpose = (
            "Confirm to the client that the booking request was received for the given service and time, "
            "and give the link to view, cancel or reschedule it."
        )
        start = timer_start(booking)
        if booking.status == BookingStatus.pending and start is not None:
            if start > now:
                facts["master_confirms_after"] = start.astimezone(BUSINESS_TZ).strftime("%H:%M")
                purpose += " Say the master will confirm it after the given time."
            else:
                facts["master_confirms_within_minutes"] = int(CONFIRM_WINDOW.total_seconds() // 60)
                purpose += " Say the master will confirm it within the given minutes."
        run_in_background(
            notify_client(
                phone=booking.client_phone,
                fcm_tokens=await _client_fcm_tokens(db, booking.client_phone),
                on_dead_fcm_tokens=_prune_dead_fcm_tokens,
                purpose=purpose,
                facts=facts,
                must_include=_manage_url(booking),
            )
        )


async def _expire_overdue(db: AsyncSession) -> None:
    """Ленивая автоотмена неподтверждённых заказов (app/confirm_timer.py) +
    сообщение клиенту. Идемпотентна: каждую бронь отменяет и о ней пишет
    ровно один вызов."""
    expired = await expire_overdue_bookings(db, datetime.now(timezone.utc))
    for booking in expired:
        if not booking.client_phone:
            continue
        service = await db.get(Service, booking.service_id)
        run_in_background(
            notify_client(
                phone=booking.client_phone,
                fcm_tokens=await _client_fcm_tokens(db, booking.client_phone),
                on_dead_fcm_tokens=_prune_dead_fcm_tokens,
                purpose=(
                    "Tell the client that the master did not confirm the booking in time, so it was cancelled, "
                    "and invite them to book another master at the given link."
                ),
                facts={"service": service.name if service else "", **_when_facts(booking.start_at)},
                must_include=f"{settings.WEB_PUBLIC_URL}/",
            )
        )


@app.post("/internal/tick")
async def tick(x_tick_secret: str = Header(default=""), db: AsyncSession = Depends(get_db)) -> dict:
    """Раз в минуту от внешнего пингера (Render free tier засыпает, свой
    планировщик в процессе ненадёжен): уведомления мастеру о заказах,
    дождавшихся рабочих часов, напоминания на 5-й и 10-й минуте, автоотмена.
    Повторный вызов в ту же минуту ничего не дублирует."""
    if not settings.TICK_SECRET or not secrets.compare_digest(
        x_tick_secret.encode("utf-8"), settings.TICK_SECRET.encode("utf-8")
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    return {"ok": True, "notices": await _run_confirm_timer(db)}


async def _run_confirm_timer(db: AsyncSession) -> int:
    """Автоотмена + уведомления мастеру, которым пришло время (заказ дождался
    рабочих часов, напоминания). Общая для тика и для «попутного» прогона
    после обычных запросов (_confirm_timer_sweep). Возвращает число
    отправленных уведомлений."""
    await _expire_overdue(db)
    now = datetime.now(timezone.utc)
    claimed = await claim_due_notices(db, now)
    for booking, sent, _due in claimed:
        service = await db.get(Service, booking.service_id)
        service_name = service.name if service else ""
        if sent == 0:
            await _notify_master_of_booking(db, booking, service_name, now)
            continue
        await _notify_staff(
            db,
            booking.provider_id,
            "Remind the master that a client's booking is still waiting for his confirmation in the app "
            "and say how many minutes are left before it is cancelled automatically.",
            {"service": service_name, **_when_facts(booking.start_at), "minutes_left": _minutes_left(booking, now)},
            url=_cabinet_booking_url(booking.id),
        )
    return len(claimed)


_last_sweep = 0.0


async def _confirm_timer_sweep() -> None:
    async with async_session_factory() as session:
        try:
            await _run_confirm_timer(session)
        except Exception:  # best-effort: следующий запрос попробует снова
            logger.exception("confirm_timer_sweep failed")


def _maybe_sweep_confirm_timer() -> None:
    """Без тика (Render free, TICK_SECRET пуст) таймер подтверждения
    прогоняется попутно — в фоне после обычного запроса, не чаще раза в
    CONFIRM_SWEEP_SECONDS. Запросы идут постоянно, пока у мастера включён
    показ местоположения (телефон шлёт точку ~раз в 30 с), так что заказ,
    пришедший ночью, доходит до мастера около начала его рабочего дня, а не
    никогда (решение пользователя 11.11.2026: ночью не будить)."""
    global _last_sweep
    if settings.TICK_SECRET or settings.CONFIRM_SWEEP_SECONDS <= 0:
        return
    now = _time.monotonic()
    if now - _last_sweep < settings.CONFIRM_SWEEP_SECONDS:
        return
    _last_sweep = now
    run_in_background(_confirm_timer_sweep())


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
    await _expire_overdue(db)
    stmt = select(Booking).where(Booking.provider_id == provider.id)
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter)
    stmt = stmt.order_by(Booking.start_at)
    return (await db.execute(stmt)).scalars().all()


async def _previous_job_end(db: AsyncSession, booking: Booking) -> datetime | None:
    """Конец последней работы мастера в тот же день до этой записи —
    откуда он поедет к клиенту. None — до неё в этот день ничего нет."""
    day_start = datetime.combine(booking.start_at.astimezone(BUSINESS_TZ).date(), time.min, tzinfo=BUSINESS_TZ)
    return (
        await db.execute(
            select(func.max(Booking.end_at)).where(
                Booking.provider_id == booking.provider_id,
                Booking.id != booking.id,
                Booking.status != BookingStatus.cancelled,
                Booking.end_at <= booking.start_at,
                Booking.end_at > day_start,
            )
        )
    ).scalar_one_or_none()


async def _expected_arrival(
    db: AsyncSession, booking: Booking, travel_minutes: int | None
) -> tuple[datetime, datetime | None] | None:
    """(расчётный приезд, конец предыдущей работы). Приезд — начало записи
    или «предыдущая работа + дорога», что позже: время доезда сверяется с
    календарём, а не просто обещается (решение пользователя 11.11.2026)."""
    if not travel_minutes:
        return None
    previous_end = await _previous_job_end(db, booking)
    arrival = booking.start_at
    if previous_end is not None:
        arrival = max(arrival, previous_end + timedelta(minutes=travel_minutes))
    return arrival, previous_end


@app.get("/api/bookings/{booking_id}/arrival", response_model=ArrivalPreviewOut)
async def arrival_preview(
    booking_id: uuid.UUID,
    travel_minutes: int = Query(ge=1, le=600),
    db: AsyncSession = Depends(get_db),
    master_user_id: str = Depends(require_master_user_id),
) -> ArrivalPreviewOut:
    """Перед подтверждением: успевает ли мастер к началу с этим временем
    доезда после предыдущей работы. Опоздание он видит и решает сам."""
    provider = await _get_own_provider(master_user_id, db, "bookings_status")
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    arrival, previous_end = await _expected_arrival(db, booking, travel_minutes)
    late = max(0, math.ceil((arrival - booking.start_at).total_seconds() / 60))
    return ArrivalPreviewOut(expected_arrival_at=arrival, previous_end_at=previous_end, late_minutes=late)


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
    provider = await _get_own_provider(master_user_id, db, "bookings_status")
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    # Дедлайн в БД — источник истины, даже если тик ещё не отменил заказ.
    if (
        booking.status == BookingStatus.pending
        and booking.confirm_deadline_at is not None
        and datetime.now(timezone.utc) >= booking.confirm_deadline_at
    ):
        await _expire_overdue(db)
        raise HTTPException(status.HTTP_409_CONFLICT, "Confirmation deadline has passed")
    was_completed = booking.status == BookingStatus.completed
    newly_confirmed = payload.status == BookingStatus.confirmed and booking.status != BookingStatus.confirmed
    booking.status = payload.status
    if payload.price is not None:
        booking.price = payload.price
    if payload.travel_minutes is not None:
        booking.travel_minutes = payload.travel_minutes
    await db.commit()
    await db.refresh(booking)

    if newly_confirmed and booking.client_phone:
        service = await db.get(Service, booking.service_id)
        expected = await _expected_arrival(db, booking, booking.travel_minutes)
        arrival_local = (expected[0] if expected else booking.start_at).astimezone(BUSINESS_TZ).strftime("%H:%M")
        run_in_background(
            notify_client(
                phone=booking.client_phone,
                fcm_tokens=await _client_fcm_tokens(db, booking.client_phone),
                on_dead_fcm_tokens=_prune_dead_fcm_tokens,
                purpose=(
                    "Tell the client that the master confirmed the booking for the given service and time, "
                    "and at what time the master will arrive (it can be later than the booked time)."
                ),
                facts={
                    "service": service.name if service else "",
                    **_when_facts(booking.start_at),
                    "master": provider.name,
                    "travel_minutes": booking.travel_minutes,
                    "master_arrives_at": arrival_local,
                },
                must_include=_manage_url(booking),
            )
        )

    # Отзывы (Этап 3): ссылка уходит ровно в момент, когда мастер отмечает
    # работу сделанной — не раньше (работа ещё не была выполнена, нечего
    # оценивать) и не повторно при каждом PATCH (completed -> completed
    # через повторный клик, или completed -> cancelled -> completed —
    # once-per-booking, не once-per-status-change-into-completed).
    if payload.status == BookingStatus.completed and not was_completed and booking.client_phone:
        await _issue_review_invite(db, booking, provider)

    return booking


@app.post("/api/providers/me/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_manual_booking(
    payload: ManualBookingCreate,
    db: AsyncSession = Depends(get_db),
    master_user_id: str = Depends(require_master_user_id),
) -> Booking:
    """The master adding an appointment himself from the calendar — see
    ManualBookingCreate's docstring for exactly how this differs from the
    public POST /api/bookings (no past-time/is_active/busy-toggle checks:
    this is the master's own record of his own calendar). Still guarded
    against landing on top of an existing booking (the same EXCLUDE
    constraint + 409 translation as create_booking) or his own declared
    block (overlaps_any_provider_block)."""
    provider = await _get_own_provider(master_user_id, db, "bookings_create")
    service = await db.get(Service, payload.service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    duration = (
        payload.duration_minutes
        if payload.duration_minutes is not None
        else await provider_service_duration(db, provider.id, service)
    )
    end_at = payload.start_at + timedelta(minutes=duration)

    if await overlaps_any_provider_block(db, provider.id, payload.start_at, end_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "You have blocked this time on your calendar")

    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=service.tenant_id,
        provider_id=provider.id,
        service_id=service.id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        start_at=payload.start_at,
        end_at=end_at,
        notes=payload.notes,
        status=payload.status,
        travel_minutes=payload.travel_minutes,
    )
    db.add(booking)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "exclusion constraint" in str(exc.orig).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have a booking during this time") from exc
        raise
    await db.refresh(booking)
    return booking


@app.patch("/api/bookings/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule_booking(
    booking_id: uuid.UUID,
    payload: BookingRescheduleUpdate,
    db: AsyncSession = Depends(get_db),
    master_user_id: str = Depends(require_master_user_id),
) -> Booking:
    """Move or resize an existing booking on the calendar (drag-and-drop) —
    same ownership check as update_booking_status (404, not 403, for
    someone else's booking, so a guessed id doesn't even confirm it
    exists), same overlap guards as create_manual_booking."""
    provider = await _get_own_provider(master_user_id, db, "bookings_create")
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    # отменённый/выполненный заказ не двигаем (перетаскивание в календаре
    # раньше это позволяло — решение пользователя 12.11.2026)
    if booking.status not in (BookingStatus.pending, BookingStatus.confirmed):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an active booking can be moved")

    if await overlaps_any_provider_block(db, provider.id, payload.start_at, payload.end_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "You have blocked this time on your calendar")

    old_start = booking.start_at
    booking.start_at = payload.start_at
    booking.end_at = payload.end_at
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "exclusion constraint" in str(exc.orig).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have a booking during this time") from exc
        raise
    await db.refresh(booking)

    # Клиент должен узнать о новом времени — раньше перенос мастером
    # проходил молча (и кнопкой, и перетаскиванием).
    if booking.start_at != old_start and booking.client_phone:
        service = await db.get(Service, booking.service_id)
        old_local = old_start.astimezone(BUSINESS_TZ)
        run_in_background(
            notify_client(
                phone=booking.client_phone,
                fcm_tokens=await _client_fcm_tokens(db, booking.client_phone),
                on_dead_fcm_tokens=_prune_dead_fcm_tokens,
                purpose="Tell the client that the master moved the booking to a new date and time.",
                facts={
                    "service": service.name if service else "",
                    "old_date": old_local.date().isoformat(),
                    "old_time": old_local.strftime("%H:%M"),
                    **_when_facts(booking.start_at),
                    "master": provider.name,
                },
                must_include=_manage_url(booking) if booking.manage_token else None,
            )
        )
    return booking


# ============================================================================
# Auth
# ============================================================================


@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict:
    master_user = (
        await db.execute(select(MasterUser).where(MasterUser.email == payload.email))
    ).scalar_one_or_none()
    if master_user is None or not verify_password(payload.password, master_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    request.session["master_user_id"] = str(master_user.id)
    return {"ok": True, "token": make_token("master", str(master_user.id))}


@app.post("/auth/logout")
async def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@app.get("/auth/me")
async def whoami(master_user_id: str = Depends(require_master_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    user = await db.get(MasterUser, uuid.UUID(master_user_id))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return {
        "master_user_id": master_user_id,
        "name": user.name,
        "role": user.role,
        "permissions": effective_permissions(user.role, user.permissions),
        # Свежий токен при каждой проверке: приложение зовёт /auth/me на
        # каждом запуске, так что вход живёт до «Выход», а не 30 дней с
        # момента ввода пароля (docs/app-auto-open-cabinet-task.md).
        "token": make_token("master", master_user_id),
    }


@app.post("/auth/change-password")
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Rate-limited same as /auth/login — an active session proves *a*
    # correct login happened at some point, not that whoever's at the
    # keyboard right now knows the current password (see
    # ChangePasswordRequest's docstring in app/schemas.py), so this is the
    # same brute-forceable secret check /auth/login already guards.
    master_user = await db.get(MasterUser, uuid.UUID(master_user_id))
    if master_user is None or not verify_password(payload.current_password, master_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    master_user.password_hash = hash_password(payload.new_password)
    db.add(master_user)
    await db.commit()
    return {"ok": True}


# ============================================================================
# Provider settings — a master's own on/off switches. Currently just
# requires_booking_confirmation (Этап 2); resolved from the session, never
# from a provider_id in the URL, so a master can only ever touch his own row.
# ============================================================================


async def _get_own_provider(master_user_id: str, db: AsyncSession, perm: str | None = None) -> Provider:
    """Провайдер текущего сотрудника. perm — ключ права из app/permissions.py;
    без права -> 403 (роль по умолчанию + чекбоксы сотрудника)."""
    master_user = await db.get(MasterUser, uuid.UUID(master_user_id))
    if master_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")
    if perm is not None and perm not in effective_permissions(master_user.role, master_user.permissions):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for your role")
    provider = await db.get(Provider, master_user.provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    return provider


def _busy_until(provider: Provider) -> datetime | None:
    """The finite instant a busy master is expected free again, or None —
    either he isn't busy at all, or he is but hasn't given an estimate yet
    (see app/slot_engine.py's provider_busy_range: no estimate means no
    upper bound, so there's nothing finite to show)."""
    busy = provider_busy_range(provider)
    if busy is None or provider.busy_estimated_minutes is None:
        return None
    return busy[1]


def _provider_settings_out(provider: Provider) -> ProviderSettingsOut:
    return ProviderSettingsOut(
        id=provider.id,
        name=provider.name,
        requires_booking_confirmation=True,  # всегда вручную, см. create_booking
        call_out_fee=float(provider.call_out_fee) if provider.call_out_fee is not None else None,
        share_location=provider.share_location,
        busy_started_at=provider.busy_started_at,
        busy_estimated_minutes=provider.busy_estimated_minutes,
        busy_until=_busy_until(provider),
    )


def _provider_busy_out(provider: Provider) -> ProviderBusyOut:
    return ProviderBusyOut(
        busy_started_at=provider.busy_started_at,
        busy_estimated_minutes=provider.busy_estimated_minutes,
        busy_until=_busy_until(provider),
    )


@app.get("/api/providers/me", response_model=ProviderSettingsOut)
async def get_my_provider_settings(
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderSettingsOut:
    provider = await _get_own_provider(master_user_id, db)
    return _provider_settings_out(provider)


@app.patch("/api/providers/me/settings", response_model=ProviderSettingsOut)
async def update_my_provider_settings(
    payload: ProviderSettingsUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderSettingsOut:
    provider = await _get_own_provider(master_user_id, db, "settings_edit")
    provider.call_out_fee = payload.call_out_fee
    provider.share_location = payload.share_location
    await db.commit()
    await db.refresh(provider)
    return _provider_settings_out(provider)


@app.put("/api/providers/me/location")
@app.post("/api/providers/me/location")
async def update_my_location(
    payload: ProviderLocationUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Called roughly every 30s by the cabinet's foreground geolocation
    watch (web/lib/useLocationSharing.ts) while share_location is on — or,
    in the native app, POSTed straight from native code by
    @capgo/background-geolocation (its own body shape, latitude/longitude —
    see ProviderLocationUpdate), which keeps working with the screen locked.
    Same storage, same publication gates either way — see
    Provider.share_location's docstring in app/models.py. Stores the fix
    unconditionally, even if share_location happens to be off right now
    (harmless: _resolve_provider_location still won't surface it publicly),
    so flipping the toggle back on doesn't have to wait for a brand new fix
    if a recent-enough one is already on file."""
    provider = await _get_own_provider(master_user_id, db, "settings_edit")
    provider.location_lat = payload.lat
    provider.location_lng = payload.lng
    provider.location_updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ============================================================================
# "Занят сейчас" — a manual busy override the master flips himself, on top
# of whatever his actual bookings say (a job running long, or off-app work
# never booked through the site at all). See app/slot_engine.py's
# provider_busy_range for exactly how this turns into a blocked range, and
# Provider.busy_started_at in app/models.py for the field-level docstring.
# ============================================================================


@app.post("/api/providers/me/busy/start", response_model=ProviderBusyOut)
async def start_busy(
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderBusyOut:
    provider = await _get_own_provider(master_user_id, db, "bookings_status")
    if provider.busy_started_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already marked busy")
    provider.busy_started_at = datetime.now(timezone.utc)
    provider.busy_estimated_minutes = None
    await db.commit()
    await db.refresh(provider)
    return _provider_busy_out(provider)


@app.patch("/api/providers/me/busy", response_model=ProviderBusyOut)
async def update_busy_estimate(
    payload: BusyEstimateUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderBusyOut:
    """Sets (or, with estimated_minutes: null, clears back to open-ended)
    how much longer the master expects to be busy. Only meaningful while
    already busy — see start_busy above; 409 rather than silently no-op'ing
    the value so the cabinet can't end up showing an estimate attached to no
    active busy session."""
    provider = await _get_own_provider(master_user_id, db, "bookings_status")
    if provider.busy_started_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not currently marked busy")
    provider.busy_estimated_minutes = payload.estimated_minutes
    await db.commit()
    await db.refresh(provider)
    return _provider_busy_out(provider)


@app.post("/api/providers/me/busy/finish", response_model=ProviderBusyOut)
async def finish_busy(
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderBusyOut:
    provider = await _get_own_provider(master_user_id, db, "bookings_status")
    if provider.busy_started_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not currently marked busy")
    provider.busy_started_at = None
    provider.busy_estimated_minutes = None
    await db.commit()
    await db.refresh(provider)
    return _provider_busy_out(provider)


async def _my_cities_out(db: AsyncSession, provider: Provider) -> list[MyCityOut]:
    mine = set(await _provider_city_ids(db, provider.id))
    stmt = select(City).order_by(City.sort_order, City.name_pl)
    stmt = stmt.where(or_(City.is_active.is_(True), City.id.in_(mine))) if mine else stmt.where(City.is_active.is_(True))
    cities = (await db.execute(stmt)).scalars().all()
    return [
        MyCityOut(id=c.id, slug=c.slug, name_pl=c.name_pl, name_en=c.name_en, selected=c.id in mine) for c in cities
    ]


@app.get("/api/providers/me/cities", response_model=list[MyCityOut])
async def get_my_cities(
    master_user_id: str = Depends(require_master_user_id), db: AsyncSession = Depends(get_db)
) -> list[MyCityOut]:
    """Все активные города с отметкой, в каких мастер работает."""
    provider = await _get_own_provider(master_user_id, db)
    return await _my_cities_out(db, provider)


@app.put("/api/providers/me/cities", response_model=list[MyCityOut])
async def update_my_cities(
    payload: MyCitiesUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[MyCityOut]:
    """Мастер задаёт свои города; минимум один (MyCitiesUpdate). Выключенный
    суперадмином город выбрать нельзя."""
    provider = await _get_own_provider(master_user_id, db, "settings_edit")
    wanted = set(payload.city_ids)
    active = set(
        (await db.execute(select(City.id).where(City.id.in_(wanted), City.is_active.is_(True)))).scalars().all()
    )
    if active != wanted:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or inactive city")
    await _set_provider_cities(db, provider.id, list(wanted))
    await db.commit()
    return await _my_cities_out(db, provider)


@app.get("/api/providers/me/services", response_model=list[ServiceToggleOut])
async def get_my_services(
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """The cabinet's services checklist: every active standard service this
    master hasn't removed from his list, plus his own services — each tagged
    with whether he currently offers it. Standard services the tenant has
    fully retired (Service.is_active=False) don't appear at all; that's an
    admin-only decision, not something a master toggles."""
    lang = _resolve_lang(lang)
    provider = await _get_own_provider(master_user_id, db)
    services, links_by_service = await _my_visible_services(db, provider)
    result = []
    for s in services:
        link = links_by_service.get(s.id)
        result.append(
            ServiceToggleOut(
                service_id=s.id,
                name=_resolve_service_name(s, lang),
                duration_minutes=link.duration_minutes if link and link.duration_minutes else s.duration_minutes,
                price_min=link.price_min if link and link.price_min is not None else s.price_min,
                price_max=link.price_max if link and link.price_max is not None else s.price_max,
                description=link.description if link else None,
                is_offered=bool(link and link.is_active),
                is_custom=s.owner_provider_id is not None,
                category=s.category,
            )
        )
    return result


async def _my_links(db: AsyncSession, provider: Provider) -> dict[uuid.UUID, ProviderService]:
    """Every link this provider has ever had for a service (not just active
    ones) — a previously-set price/description should still prefill the
    form even for a service currently toggled off, see ProviderService's
    docstring in app/models.py."""
    rows = (await db.execute(select(ProviderService).where(ProviderService.provider_id == provider.id))).scalars()
    return {row.service_id: row for row in rows.all()}


async def _my_visible_services(
    db: AsyncSession, provider: Provider
) -> tuple[list[Service], dict[uuid.UUID, ProviderService]]:
    """What this master's cabinet list consists of: active standard services
    he hasn't removed + his own active services (Service.owner_provider_id).
    Another master's own services are never visible here."""
    links = await _my_links(db, provider)
    services = (
        (
            await db.execute(
                select(Service)
                .where(
                    Service.is_active.is_(True),
                    or_(Service.owner_provider_id.is_(None), Service.owner_provider_id == provider.id),
                )
                .order_by(Service.name)
            )
        )
        .scalars()
        .all()
    )
    visible = [s for s in services if not (links.get(s.id) and links[s.id].is_removed)]
    return visible, links


def _own_duration(value: int | None, service: Service) -> int | None:
    """Совпадает с умолчанием услуги -> храним NULL (чтобы смена умолчания подтягивалась)."""
    return None if value is None or value == service.duration_minutes else value


@app.put("/api/providers/me/services", response_model=list[ServiceToggleOut])
async def update_my_services(
    payload: ProviderServicesUpdate,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Replace semantics: payload.services is the FULL set this provider now
    offers, each with his own price/description — anything active-but-not-
    listed gets turned off. Silently ignores entries that don't name an
    active tenant service (typo-safe rather than a hard 404 on a bulk
    checklist save); the response reflects exactly what was actually
    applied, so the client always ends up rendering truth, not what it
    optimistically posted."""
    provider = await _get_own_provider(master_user_id, db, "services_edit")

    # Only what this master's own list shows: no removed standard services,
    # no other master's own services.
    visible, existing_links = await _my_visible_services(db, provider)
    services_by_id = {s.id: s for s in visible}
    desired_items = {item.service_id: item for item in payload.services if item.service_id in services_by_id}

    for service_id, item in desired_items.items():
        link = existing_links.get(service_id)
        if link is None:
            db.add(
                ProviderService(
                    provider_id=provider.id,
                    service_id=service_id,
                    is_active=True,
                    price_min=item.price_min,
                    price_max=item.price_max,
                    description=item.description,
                    duration_minutes=_own_duration(item.duration_minutes, services_by_id[service_id]),
                )
            )
        else:
            link.duration_minutes = _own_duration(item.duration_minutes, services_by_id[service_id])
            link.is_active = True
            link.price_min = item.price_min
            link.price_max = item.price_max
            link.description = item.description

    for service_id, link in existing_links.items():
        if service_id not in desired_items and link.is_active:
            link.is_active = False

    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


# ----------------------------------------------------------------------------
# Свои услуги мастера: создать, переименовать, удалить; стандартные услуги
# каталога у каждого мастера есть всегда, но он может переименовать (это
# создаёт его собственную копию) или убрать их из своего списка — каталог
# для остальных мастеров не меняется, убранное можно вернуть.
# ----------------------------------------------------------------------------


async def _get_my_listed_service(db: AsyncSession, provider: Provider, service_id: uuid.UUID) -> Service:
    """A service in this master's list (standard or his own), else 404."""
    visible, _ = await _my_visible_services(db, provider)
    service = next((s for s in visible if s.id == service_id), None)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


@app.post(
    "/api/providers/me/services/custom", response_model=list[ServiceToggleOut], status_code=status.HTTP_201_CREATED
)
async def create_my_service(
    payload: OwnServiceCreate,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    provider = await _get_own_provider(master_user_id, db, "services_edit")
    service = Service(
        id=uuid.uuid4(),
        tenant_id=provider.tenant_id,
        name=payload.name,
        duration_minutes=payload.duration_minutes,
        category=payload.category,
        owner_provider_id=provider.id,
        is_active=True,
    )
    db.add(service)
    await db.flush()
    db.add(
        ProviderService(
            provider_id=provider.id,
            service_id=service.id,
            is_active=True,
            price_min=payload.price_min,
            price_max=payload.price_max,
            description=payload.description,
        )
    )
    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


@app.patch("/api/providers/me/services/{service_id}", response_model=list[ServiceToggleOut])
async def update_my_service(
    service_id: uuid.UUID,
    payload: OwnServiceUpdate,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Own service — edited in place. Standard service — the catalog row is
    shared by every master, so it's forked instead: a copy owned by this
    master with the new name, carrying over his price/duration/description
    and offered state, while the standard one is removed from his list
    (restorable). Past bookings keep pointing at whichever row they used."""
    provider = await _get_own_provider(master_user_id, db, "services_edit")
    service = await _get_my_listed_service(db, provider, service_id)
    if service.owner_provider_id == provider.id:
        service.name = payload.name
        if payload.category is not None:
            service.category = payload.category
        await db.commit()
        return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)

    links = await _my_links(db, provider)
    old_link = links.get(service.id)
    copy = Service(
        id=uuid.uuid4(),
        tenant_id=service.tenant_id,
        name=payload.name,
        duration_minutes=service.duration_minutes,
        price_min=service.price_min,
        price_max=service.price_max,
        category=payload.category or service.category,
        owner_provider_id=provider.id,
        is_active=True,
    )
    db.add(copy)
    await db.flush()
    db.add(
        ProviderService(
            provider_id=provider.id,
            service_id=copy.id,
            is_active=bool(old_link and old_link.is_active),
            price_min=old_link.price_min if old_link else None,
            price_max=old_link.price_max if old_link else None,
            description=old_link.description if old_link else None,
            duration_minutes=old_link.duration_minutes if old_link else None,
        )
    )
    _mark_removed(db, provider, service, old_link)
    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


def _mark_removed(db: AsyncSession, provider: Provider, service: Service, link: ProviderService | None) -> None:
    if link is None:
        db.add(ProviderService(provider_id=provider.id, service_id=service.id, is_active=False, is_removed=True))
    else:
        link.is_active = False
        link.is_removed = True


@app.delete("/api/providers/me/services/{service_id}", response_model=list[ServiceToggleOut])
async def delete_my_service(
    service_id: uuid.UUID,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Own service — retired (Service.is_active=False, not deleted: past
    bookings still reference it). Standard service — only removed from this
    master's list; restorable via .../removed and .../restore."""
    provider = await _get_own_provider(master_user_id, db, "services_edit")
    service = await _get_my_listed_service(db, provider, service_id)
    links = await _my_links(db, provider)
    if service.owner_provider_id == provider.id:
        service.is_active = False
        if service.id in links:
            links[service.id].is_active = False
    else:
        _mark_removed(db, provider, service, links.get(service.id))
    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


@app.get("/api/providers/me/services/removed", response_model=list[RemovedServiceOut])
async def list_my_removed_services(
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[RemovedServiceOut]:
    """Standard services this master removed from his list (still active in
    the catalog) — the cabinet offers to bring each one back."""
    lang = _resolve_lang(lang)
    provider = await _get_own_provider(master_user_id, db)
    rows = (
        await db.execute(
            select(Service)
            .join(ProviderService, ProviderService.service_id == Service.id)
            .where(
                ProviderService.provider_id == provider.id,
                ProviderService.is_removed.is_(True),
                Service.is_active.is_(True),
                Service.owner_provider_id.is_(None),
            )
            .order_by(Service.name)
        )
    ).scalars().all()
    return [RemovedServiceOut(service_id=s.id, name=_resolve_service_name(s, lang)) for s in rows]


@app.post("/api/providers/me/services/{service_id}/restore", response_model=list[ServiceToggleOut])
async def restore_my_service(
    service_id: uuid.UUID,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceToggleOut]:
    """Back into the list, not offered — he ticks it on himself if he wants
    it bookable again (his old price/description are still there)."""
    provider = await _get_own_provider(master_user_id, db, "services_edit")
    link = (await _my_links(db, provider)).get(service_id)
    if link is None or not link.is_removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    link.is_removed = False
    await db.commit()
    return await get_my_services(lang=lang, master_user_id=master_user_id, db=db)


# ============================================================================
# "Мои рабочие часы" — a master's own weekly template (WorkingHours) plus
# per-date overrides (WorkingHoursException). Both tables have existed since
# day one for slot_engine.py to read (get_availability, is_within_working_hours)
# but until this segment nothing let a master actually edit them himself —
# only seed scripts / hand-written SQL ever touched these two tables.
# ============================================================================


async def _working_hours_out(provider: Provider, db: AsyncSession) -> WorkingHoursOut:
    rows = (
        await db.execute(
            select(WorkingHours)
            .where(WorkingHours.provider_id == provider.id)
            .order_by(WorkingHours.weekday, WorkingHours.start_time)
        )
    ).scalars().all()
    # Only ever show upcoming/current exceptions — a master editing his own
    # schedule has no use for a date that's already passed, and leaving past
    # rows out keeps this response from growing without bound over time
    # (nothing here ever deletes an old exception row itself, this just
    # doesn't surface it).
    today = datetime.now(BUSINESS_TZ).date()
    exceptions = (
        await db.execute(
            select(WorkingHoursException)
            .where(WorkingHoursException.provider_id == provider.id, WorkingHoursException.date >= today)
            .order_by(WorkingHoursException.date)
        )
    ).scalars().all()
    return WorkingHoursOut(
        slots=[WorkingHoursSlot(weekday=r.weekday, start_time=r.start_time, end_time=r.end_time) for r in rows],
        exceptions=[WorkingHoursExceptionOut.model_validate(e) for e in exceptions],
    )


@app.get("/api/providers/me/working-hours", response_model=WorkingHoursOut)
async def get_my_working_hours(
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> WorkingHoursOut:
    provider = await _get_own_provider(master_user_id, db)
    return await _working_hours_out(provider, db)


@app.put("/api/providers/me/working-hours", response_model=WorkingHoursOut)
async def update_my_working_hours(
    payload: WorkingHoursUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> WorkingHoursOut:
    """Replace semantics — the FULL desired weekly template (same shape as
    update_my_services above): every existing WorkingHours row for this
    provider is dropped and replaced with exactly what's posted. Per-date
    overrides (WorkingHoursException) are untouched by this — see the
    dedicated .../exceptions endpoints below."""
    provider = await _get_own_provider(master_user_id, db, "hours_edit")
    await db.execute(delete(WorkingHours).where(WorkingHours.provider_id == provider.id))
    for slot in payload.slots:
        db.add(
            WorkingHours(
                id=uuid.uuid4(),
                provider_id=provider.id,
                weekday=slot.weekday,
                start_time=slot.start_time,
                end_time=slot.end_time,
            )
        )
    await db.commit()
    return await _working_hours_out(provider, db)


@app.put("/api/providers/me/working-hours/exceptions/{exception_date}", response_model=WorkingHoursExceptionOut)
async def upsert_working_hours_exception(
    exception_date: date,
    payload: WorkingHoursExceptionUpsert,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> WorkingHoursExceptionOut:
    """Upsert by (provider_id, date) — db/schema.sql's UNIQUE constraint on
    working_hours_exception matches this exactly, so posting again for a
    date already overridden simply replaces it rather than needing a
    separate edit path."""
    provider = await _get_own_provider(master_user_id, db, "hours_edit")
    existing = (
        await db.execute(
            select(WorkingHoursException).where(
                WorkingHoursException.provider_id == provider.id,
                WorkingHoursException.date == exception_date,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = WorkingHoursException(id=uuid.uuid4(), provider_id=provider.id, date=exception_date)
        db.add(existing)
    existing.is_available = payload.is_available
    # start_time/end_time are only ever non-null when is_available (matches
    # db/schema.sql's comment "null when is_available=false") — the request
    # schema already enforces they're present together with is_available=True
    # (see WorkingHoursExceptionUpsert), this just makes sure a day-off
    # request can't leave stale hours behind from a previous custom-hours
    # override on the same date.
    existing.start_time = payload.start_time if payload.is_available else None
    existing.end_time = payload.end_time if payload.is_available else None
    existing.reason = payload.reason
    await db.commit()
    await db.refresh(existing)
    return WorkingHoursExceptionOut.model_validate(existing)


@app.delete("/api/providers/me/working-hours/exceptions/{exception_date}")
async def delete_working_hours_exception(
    exception_date: date,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Removes the override for that date — the day reverts to whatever the
    weekly template says. 404 if there was nothing to delete (scoped to the
    caller's own provider, same as every .../me/* endpoint, so this can
    never touch another master's exception)."""
    provider = await _get_own_provider(master_user_id, db, "hours_edit")
    result = await db.execute(
        delete(WorkingHoursException).where(
            WorkingHoursException.provider_id == provider.id,
            WorkingHoursException.date == exception_date,
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No exception for that date")
    return {"ok": True}


# ============================================================================
# Master calendar (Букси-style) — visual day/week/month calendar over the
# master's own bookings plus manual time blocks. See ProviderBlock's
# docstring in app/models.py and CalendarOut's in app/schemas.py.
# ============================================================================

MAX_CALENDAR_RANGE_DAYS = 60  # same cap as /api/availability, same reason


@app.get("/api/providers/me/calendar", response_model=CalendarOut)
async def get_my_calendar(
    date_from: date,
    date_to: date,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> CalendarOut:
    if date_to < date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to must be >= date_from")
    if (date_to - date_from).days > MAX_CALENDAR_RANGE_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"range too large, max {MAX_CALENDAR_RANGE_DAYS} days")

    provider = await _get_own_provider(master_user_id, db, "calendar_view")
    await _expire_overdue(db)
    range_start = datetime.combine(date_from, time.min, tzinfo=BUSINESS_TZ)
    range_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=BUSINESS_TZ)

    bookings = (
        (
            await db.execute(
                select(Booking).where(
                    Booking.provider_id == provider.id,
                    Booking.status != BookingStatus.cancelled,
                    Booking.start_at < range_end,
                    Booking.end_at > range_start,
                )
            )
        )
        .scalars()
        .all()
    )
    blocks = (
        (
            await db.execute(
                select(ProviderBlock).where(
                    ProviderBlock.provider_id == provider.id,
                    ProviderBlock.start_at < range_end,
                    ProviderBlock.end_at > range_start,
                )
            )
        )
        .scalars()
        .all()
    )
    return CalendarOut(
        bookings=[BookingOut.model_validate(b) for b in bookings],
        blocks=[ProviderBlockOut.model_validate(b) for b in blocks],
    )


@app.post("/api/providers/me/blocks", response_model=ProviderBlockOut, status_code=status.HTTP_201_CREATED)
async def create_provider_block(
    payload: ProviderBlockCreate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderBlock:
    provider = await _get_own_provider(master_user_id, db, "blocks_manage")

    overlapping_booking = (
        await db.execute(
            select(Booking).where(
                Booking.provider_id == provider.id,
                Booking.status != BookingStatus.cancelled,
                Booking.start_at < payload.end_at,
                Booking.end_at > payload.start_at,
            )
        )
    ).scalar_one_or_none()
    if overlapping_booking is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a booking during this time")

    block = ProviderBlock(
        id=uuid.uuid4(),
        provider_id=provider.id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        reason=payload.reason,
    )
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return block


@app.patch("/api/providers/me/blocks/{block_id}", response_model=ProviderBlockOut)
async def update_provider_block(
    block_id: uuid.UUID,
    payload: ProviderBlockUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> ProviderBlock:
    """Move or resize an existing block (drag-and-drop) — same 404-not-403
    ownership check as every other .../me/* mutation in this file."""
    provider = await _get_own_provider(master_user_id, db, "blocks_manage")
    block = await db.get(ProviderBlock, block_id)
    if block is None or block.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Block not found")

    overlapping_booking = (
        await db.execute(
            select(Booking).where(
                Booking.provider_id == provider.id,
                Booking.status != BookingStatus.cancelled,
                Booking.start_at < payload.end_at,
                Booking.end_at > payload.start_at,
            )
        )
    ).scalar_one_or_none()
    if overlapping_booking is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a booking during this time")

    block.start_at = payload.start_at
    block.end_at = payload.end_at
    block.reason = payload.reason
    await db.commit()
    await db.refresh(block)
    return block


@app.delete("/api/providers/me/blocks/{block_id}")
async def delete_provider_block(
    block_id: uuid.UUID,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    provider = await _get_own_provider(master_user_id, db, "blocks_manage")
    result = await db.execute(delete(ProviderBlock).where(ProviderBlock.id == block_id, ProviderBlock.provider_id == provider.id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Block not found")
    return {"ok": True}


@app.get("/api/providers/{provider_id}/services", response_model=list[ProviderServiceOut])
async def list_provider_services(
    provider_id: uuid.UUID,
    response: Response,
    lang: str = Query(default=DEFAULT_LANG),
    db: AsyncSession = Depends(get_db),
) -> list[ProviderServiceOut]:
    """Public — one master's own offered services with his own price/
    description, for the booking flow once a master has been picked on the
    new master-first home page (see web/components/MasterPicker.tsx). Same
    price fallback as get_my_services above: the master's own
    ProviderService.price_min/max if he set one, else Service.price_min/max
    as the reference default.

    Registered AFTER /api/providers/me/services on purpose — FastAPI matches
    routes in registration order, and a {provider_id}: uuid path param
    placed before the fixed "me" path would otherwise swallow every request
    to it, trying (and failing, 422) to parse the literal "me" as a UUID."""
    lang = _resolve_lang(lang)
    response.headers["Cache-Control"] = cache_control()
    cached = public_cache.get(("provider_services", provider_id, lang))
    if not is_missing(cached):
        return cached
    provider = await db.get(Provider, provider_id)
    if provider is None or not provider.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")

    rows = (
        await db.execute(
            select(Service, ProviderService)
            .join(ProviderService, ProviderService.service_id == Service.id)
            .where(
                ProviderService.provider_id == provider_id,
                ProviderService.is_active.is_(True),
                Service.is_active.is_(True),
            )
            .order_by(Service.name)
        )
    ).all()
    return public_cache.set(("provider_services", provider_id, lang), [
        ProviderServiceOut(
            id=service.id,
            name=_resolve_service_name(service, lang),
            duration_minutes=link.duration_minutes or service.duration_minutes,
            price_min=link.price_min if link.price_min is not None else service.price_min,
            price_max=link.price_max if link.price_max is not None else service.price_max,
            description=link.description,
        )
        for service, link in rows
    ])


# ============================================================================
# "Моя запись" — публичная страница клиента по ссылке из SMS: просмотр,
# отмена/перенос (не позже CLIENT_CHANGE_MIN_HOURS до начала), живая точка
# мастера и история записей по тому же телефону. Доступ — по manage_token
# (секрет из SMS); 404 и для чужого id, и для неверного токена.
# ============================================================================


async def _get_booking_by_token(db: AsyncSession, booking_id: uuid.UUID, token: str) -> Booking:
    booking = await db.get(Booking, booking_id)
    if (
        booking is None
        or not booking.manage_token
        or not secrets.compare_digest(booking.manage_token, token)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


def _change_deadline(booking: Booking) -> datetime:
    return booking.start_at - timedelta(hours=settings.CLIENT_CHANGE_MIN_HOURS)


def _can_change(booking: Booking, now: datetime) -> bool:
    return booking.status in (BookingStatus.pending, BookingStatus.confirmed) and now <= _change_deadline(booking)


async def _my_booking_out(db: AsyncSession, booking: Booking, lang: str = DEFAULT_LANG) -> MyBookingOut:
    """`lang` — язык страницы клиента: название услуги как в каталоге
    (_resolve_service_name), а не внутреннее Service.name (русское)."""
    now = datetime.now(timezone.utc)
    service = await db.get(Service, booking.service_id)
    provider = await db.get(Provider, booking.provider_id)
    location = None
    if (
        provider is not None
        and booking.status in (BookingStatus.pending, BookingStatus.confirmed)
        and booking.start_at - timedelta(hours=settings.TRACK_WINDOW_HOURS) <= now <= booking.end_at
    ):
        location = await _resolve_provider_location(db, provider, now)
    expected = await _expected_arrival(db, booking, booking.travel_minutes)
    return MyBookingOut(
        id=booking.id,
        service_name=_resolve_service_name(service, _resolve_lang(lang)) if service else "",
        provider_name=provider.name if provider else "",
        start_at=booking.start_at,
        end_at=booking.end_at,
        status=booking.status,
        can_change=_can_change(booking, now),
        change_deadline=_change_deadline(booking),
        location=location,
        travel_minutes=booking.travel_minutes,
        cancel_reason=booking.cancel_reason,
        confirm_deadline_at=booking.confirm_deadline_at,
        tracking_from=booking.start_at - timedelta(hours=settings.TRACK_WINDOW_HOURS),
        expected_arrival_at=expected[0] if expected else None,
    )


@app.get("/api/my-booking/{booking_id}", response_model=MyBookingOut)
async def get_my_booking(
    booking_id: uuid.UUID, token: str, lang: str = Query(default=DEFAULT_LANG), db: AsyncSession = Depends(get_db)
) -> MyBookingOut:
    await _expire_overdue(db)
    booking = await _get_booking_by_token(db, booking_id, token)
    return await _my_booking_out(db, booking, lang)


@app.post("/api/my-booking/{booking_id}/cancel", response_model=MyBookingOut)
@limiter.limit("10/minute")
async def cancel_my_booking(
    request: Request,
    booking_id: uuid.UUID,
    token: str,
    lang: str = Query(default=DEFAULT_LANG),
    db: AsyncSession = Depends(get_db),
) -> MyBookingOut:
    booking = await _get_booking_by_token(db, booking_id, token)
    if not _can_change(booking, datetime.now(timezone.utc)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Too late to cancel online — please call the master")
    booking.status = BookingStatus.cancelled
    await db.commit()
    await db.refresh(booking)
    service = await db.get(Service, booking.service_id)
    start_local = booking.start_at.astimezone(BUSINESS_TZ)
    await _notify_staff(
        db,
        booking.provider_id,
        "Tell the master that the client has cancelled this booking, so the time is free again.",
        {
            "service": service.name if service else None,
            "date": start_local.date().isoformat(),
            "time": start_local.strftime("%H:%M"),
            "client_name": booking.client_name,
            "client_phone": booking.client_phone,
        },
        url=_cabinet_booking_url(booking.id),
    )
    return await _my_booking_out(db, booking, lang)


@app.post("/api/my-booking/{booking_id}/reschedule", response_model=MyBookingOut)
@limiter.limit("10/minute")
async def reschedule_my_booking(
    request: Request,
    booking_id: uuid.UUID,
    payload: MyBookingReschedule,
    lang: str = Query(default=DEFAULT_LANG),
    db: AsyncSession = Depends(get_db),
) -> MyBookingOut:
    """Перенос только на реально свободный слот того же мастера: новое время
    должно присутствовать в его актуальной доступности (рабочие часы,
    блокировки, «занят», буфер) — не просто «любое время»."""
    booking = await _get_booking_by_token(db, booking_id, payload.token)
    now = datetime.now(timezone.utc)
    if not _can_change(booking, now):
        raise HTTPException(status.HTTP_409_CONFLICT, "Too late to reschedule online — please call the master")
    provider = await db.get(Provider, booking.provider_id)
    service = await db.get(Service, booking.service_id)
    if provider is None or service is None or not provider.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")

    day = payload.start_at.astimezone(BUSINESS_TZ).date()
    slots = await get_availability(db, service, day, day, provider=provider)
    wanted = payload.start_at.astimezone(timezone.utc)
    if not any(s.start_at.astimezone(timezone.utc) == wanted for s in slots):
        raise HTTPException(status.HTTP_409_CONFLICT, "This time is not available")

    old_start = booking.start_at
    duration = booking.end_at - booking.start_at
    booking.start_at = payload.start_at
    booking.end_at = payload.start_at + duration
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "exclusion constraint" in str(exc.orig).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "Slot was just booked by someone else") from exc
        raise
    await db.refresh(booking)
    new_local = booking.start_at.astimezone(BUSINESS_TZ)
    old_local = old_start.astimezone(BUSINESS_TZ)
    await _notify_staff(
        db,
        booking.provider_id,
        "Tell the master that the client has moved this booking to a new time.",
        {
            "service": service.name,
            "old_date": old_local.date().isoformat(),
            "old_time": old_local.strftime("%H:%M"),
            "new_date": new_local.date().isoformat(),
            "new_time": new_local.strftime("%H:%M"),
            "client_name": booking.client_name,
            "client_phone": booking.client_phone,
        },
        url=_cabinet_booking_url(booking.id),
    )
    return await _my_booking_out(db, booking, lang)


@app.get("/api/my-booking/{booking_id}/slots", response_model=list[SlotOut])
async def my_booking_slots(
    booking_id: uuid.UUID, token: str, date_from: date, date_to: date, db: AsyncSession = Depends(get_db)
) -> list[SlotOut]:
    """Свободные слоты того же мастера и услуги — для выбора нового времени."""
    if date_to < date_from or (date_to - date_from).days > 14:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid date range")
    booking = await _get_booking_by_token(db, booking_id, token)
    provider = await db.get(Provider, booking.provider_id)
    service = await db.get(Service, booking.service_id)
    if provider is None or service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    await _expire_overdue(db)
    return await get_availability(db, service, date_from, date_to, provider=provider)


@app.get("/api/my-booking/{booking_id}/history", response_model=list[MyBookingHistoryItem])
async def my_booking_history(
    booking_id: uuid.UUID, token: str, lang: str = Query(default=DEFAULT_LANG), db: AsyncSession = Depends(get_db)
) -> list[MyBookingHistoryItem]:
    """История заказов этого клиента (по телефону из записи). Владение
    телефоном подтверждено самой ссылкой из SMS; логинов у клиентов нет."""
    booking = await _get_booking_by_token(db, booking_id, token)
    if not booking.client_phone:
        return []
    rows = (
        await db.execute(
            select(Booking, Service, Provider.name)
            .join(Service, Service.id == Booking.service_id)
            .join(Provider, Provider.id == Booking.provider_id)
            .where(Booking.client_phone == booking.client_phone)
            .order_by(Booking.start_at.desc())
            .limit(50)
        )
    ).all()
    return [
        MyBookingHistoryItem(
            id=b.id,
            service_name=_resolve_service_name(svc, _resolve_lang(lang)),
            provider_name=pn,
            start_at=b.start_at,
            status=b.status,
            price=b.price,
            manage_token=b.manage_token,
        )
        for b, svc, pn in rows
    ]


# ============================================================================
# Отзывы (Этап 3, docs/ai-and-reviews.md "Не-AI: рейтинги и отзывы с фото").
# Верификация не по email, а по факту завершённой брони: see
# _issue_review_invite, called from update_booking_status above on
# completed. Все три эндпоинта ниже — публичные (у клиента нет аккаунта),
# защищены только токеном из SMS-ссылки + (на POST) рейт-лимитом.
# ============================================================================


REVIEW_INVITE_VALIDITY_DAYS = 14


async def _issue_review_invite(db: AsyncSession, booking: Booking, provider: Provider) -> None:
    """Выпускает одноразовый токен и шлёт клиенту SMS со ссылкой на форму
    отзыва. Best-effort, как и остальные уведомления в app/notifications.py
    — ошибка здесь не должна откатывать сам PATCH .../status.

    booking_id UNIQUE на review_invite — если бронь уже проходила через
    completed раньше (completed -> cancelled -> completed снова), invite
    уже существует; не плодим второй и не шлём повторную SMS."""
    existing = (
        await db.execute(select(ReviewInvite).where(ReviewInvite.booking_id == booking.id))
    ).scalar_one_or_none()
    if existing is not None:
        return
    service = await db.get(Service, booking.service_id)
    token = secrets.token_urlsafe(24)
    db.add(
        ReviewInvite(
            token=token,
            booking_id=booking.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=REVIEW_INVITE_VALIDITY_DAYS),
        )
    )
    await db.commit()

    # Query-param, not /review/{booking.id} — the frontend is a static
    # export (next.config.ts output: "export"), so a dynamic path segment
    # would need generateStaticParams for every possible booking id ahead
    # of time, which is impossible; app/review/page.tsx reads both from
    # the query string instead.
    link = f"{settings.WEB_PUBLIC_URL}/review/?booking_id={booking.id}&token={token}"
    run_in_background(
        notify_client(
            phone=booking.client_phone,
            fcm_tokens=await _client_fcm_tokens(db, booking.client_phone),
            on_dead_fcm_tokens=_prune_dead_fcm_tokens,
            purpose="Tell the client the job is done and invite them to rate the work using the link.",
            facts={"master": provider.name, "service": service.name if service else None},
            must_include=link,
        )
    )


async def _recompute_provider_rating(db: AsyncSession, provider_id: uuid.UUID) -> None:
    """Пересчитывает Provider.rating/rating_count из реальных отзывов —
    вызывается после каждого нового отзыва. Перекрывает значение, заданное
    вручную через админку (app/models.py Provider.rating docstring): как
    только у мастера появился хоть один настоящий отзыв, ручное значение
    больше не нужно."""
    row = (
        await db.execute(
            select(func.avg(Review.rating), func.count(Review.id)).where(Review.provider_id == provider_id)
        )
    ).one()
    avg_rating, count = row
    provider = await db.get(Provider, provider_id)
    provider.rating = round(float(avg_rating), 1) if avg_rating is not None else None
    provider.rating_count = count or 0
    await db.commit()


@app.get("/api/reviews/invite/{booking_id}", response_model=ReviewInviteOut)
async def get_review_invite(
    booking_id: uuid.UUID,
    token: str,
    lang: str = Query(default=DEFAULT_LANG),
    db: AsyncSession = Depends(get_db),
) -> ReviewInviteOut:
    booking = await db.get(Booking, booking_id)
    invite = await db.get(ReviewInvite, token)
    # Один и тот же 404 для "нет такой брони", "токен не тот" и "просрочен"
    # — не даём угадывающему токены понять, какая часть угадана верно.
    if (
        booking is None
        or invite is None
        or invite.booking_id != booking_id
        or invite.expires_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found or expired")
    if invite.used_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking has already been reviewed")

    provider = await db.get(Provider, booking.provider_id)
    service = await db.get(Service, booking.service_id)
    return ReviewInviteOut(
        provider_name=provider.name if provider else "",
        service_name=_resolve_service_name(service, _resolve_lang(lang)) if service else "",
        start_at=booking.start_at,
        client_name=booking.client_name,
    )


@app.post("/api/reviews/invite/{booking_id}", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def submit_review(
    request: Request,
    booking_id: uuid.UUID,
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
) -> Review:
    booking = await db.get(Booking, booking_id)
    invite = await db.get(ReviewInvite, payload.token)
    if (
        booking is None
        or invite is None
        or invite.booking_id != booking_id
        or invite.expires_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found or expired")
    if invite.used_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This booking has already been reviewed")

    review = Review(
        tenant_id=booking.tenant_id,
        provider_id=booking.provider_id,
        booking_id=booking.id,
        client_name=booking.client_name,
        rating=payload.rating,
        text=payload.text,
        photos=payload.photos,
    )
    invite.used_at = datetime.now(timezone.utc)
    db.add(review)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # booking_id UNIQUE на review — тот же гонка-case, что EXCLUDE на
        # booking: два одновременных сабмита с одним токеном, второй теряет.
        if "unique" in str(exc.orig).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "This booking has already been reviewed") from exc
        raise
    await db.refresh(review)

    await _recompute_provider_rating(db, booking.provider_id)
    return review


@app.get("/api/providers/{provider_id}/reviews", response_model=list[ReviewOut])
async def list_provider_reviews(
    provider_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[Review]:
    provider = await db.get(Provider, provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    stmt = select(Review).where(Review.provider_id == provider_id).order_by(Review.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


# ============================================================================
# Admin auth (superadmin-only — see docs/decisions.md: no public
# self-registration). Session-based, same shape as /auth/login, so the panel
# (web/app/admin/page.tsx) never needs to hold ADMIN_SECRET beyond the login
# call itself — see require_admin's docstring above. The X-Admin-Secret
# header keeps working unchanged for curl/scripts.
# ============================================================================
# Staff (roles + permission checkboxes) and per-service analytics
# ============================================================================


def _staff_out(u: MasterUser) -> StaffOut:
    return StaffOut(
        id=u.id, name=u.name, email=u.email, role=u.role, permissions=effective_permissions(u.role, u.permissions)
    )


def _clean_perms(perms: list[str] | None) -> list[str] | None:
    if perms is None:
        return None
    bad = [p for p in perms if p not in PERMISSIONS]
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown permissions: {bad}")
    return [p for p in PERMISSIONS if p in perms]


@app.get("/api/providers/me/roles", response_model=RolesMetaOut)
async def get_roles_meta(master_user_id: str = Depends(require_master_user_id)) -> RolesMetaOut:
    return RolesMetaOut(roles=ROLE_DEFAULTS, permissions=list(PERMISSIONS))


@app.get("/api/providers/me/staff", response_model=list[StaffOut])
async def list_staff(
    master_user_id: str = Depends(require_master_user_id), db: AsyncSession = Depends(get_db)
) -> list[StaffOut]:
    provider = await _get_own_provider(master_user_id, db, "staff_manage")
    rows = (
        await db.execute(select(MasterUser).where(MasterUser.provider_id == provider.id).order_by(MasterUser.email))
    ).scalars().all()
    return [_staff_out(u) for u in rows]


@app.post("/api/providers/me/staff", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> StaffOut:
    provider = await _get_own_provider(master_user_id, db, "staff_manage")
    if payload.role not in ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown role")
    user = MasterUser(
        id=uuid.uuid4(),
        provider_id=provider.id,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        permissions=None if payload.role == ROLE_OWNER else _clean_perms(payload.permissions),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists") from exc
    return _staff_out(user)


async def _owner_count(db: AsyncSession, provider_id: uuid.UUID) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(MasterUser).where(
                MasterUser.provider_id == provider_id, MasterUser.role == ROLE_OWNER
            )
        )
    ).scalar_one()


async def _get_staff_member(db: AsyncSession, provider: Provider, staff_id: uuid.UUID) -> MasterUser:
    user = await db.get(MasterUser, staff_id)
    if user is None or user.provider_id != provider.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")
    return user


@app.patch("/api/providers/me/staff/{staff_id}", response_model=StaffOut)
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdate,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> StaffOut:
    provider = await _get_own_provider(master_user_id, db, "staff_manage")
    user = await _get_staff_member(db, provider, staff_id)
    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        if payload.role not in ROLES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown role")
        if user.role == ROLE_OWNER and payload.role != ROLE_OWNER and await _owner_count(db, provider.id) <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "Cannot demote the last owner")
        if payload.role != user.role:
            user.role = payload.role
            user.permissions = None  # смена роли = права новой роли по умолчанию
    if payload.reset_permissions:
        user.permissions = None
    elif payload.permissions is not None and user.role != ROLE_OWNER:
        user.permissions = _clean_perms(payload.permissions)
    if payload.new_password is not None:
        user.password_hash = hash_password(payload.new_password)
    await db.commit()
    await db.refresh(user)
    return _staff_out(user)


@app.delete("/api/providers/me/staff/{staff_id}")
async def delete_staff(
    staff_id: uuid.UUID,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    provider = await _get_own_provider(master_user_id, db, "staff_manage")
    user = await _get_staff_member(db, provider, staff_id)
    if str(user.id) == master_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete yourself")
    if user.role == ROLE_OWNER and await _owner_count(db, provider.id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete the last owner")
    await db.delete(user)
    await db.commit()
    return {"ok": True}


async def _collect_analytics(
    db: AsyncSession, date_from: date, date_to: date, provider_id: uuid.UUID | None, lang: str = DEFAULT_LANG
) -> tuple[list[ServiceStatOut], list[MasterStatOut]]:
    """Общий подсчёт для кабинета мастера (provider_id задан) и суперадминки
    (provider_id=None — по всем мастерам или по одному). Возвращает статистику
    по работам и по мастерам за период.

    `lang` picks the service name the same way the public catalog does
    (_resolve_service_name) — Service.name on its own is the internal/
    canonical field (Russian historically, see Service.name/app/models.py's
    docstring), which used to leak into this otherwise-localized screen."""
    range_start = datetime.combine(date_from, time.min, tzinfo=BUSINESS_TZ)
    range_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=BUSINESS_TZ)
    await _expire_overdue(db)
    conds = [
        Booking.start_at >= range_start,
        Booking.start_at < range_end,
        Booking.status.in_([BookingStatus.completed, BookingStatus.cancelled, BookingStatus.no_show]),
    ]
    if provider_id is not None:
        conds.append(Booking.provider_id == provider_id)
    rows = (
        await db.execute(
            select(Booking, Service, Provider.name)
            .join(Service, Service.id == Booking.service_id)
            .join(Provider, Provider.id == Booking.provider_id)
            .where(*conds)
        )
    ).all()

    def blank(name: str) -> dict:
        return {
            "name": name, "completed": 0, "cancelled": 0, "timed_out": 0, "no_show": 0,
            "minutes": 0, "revenue": Decimal(0), "priced": 0,
        }

    by_service: dict[uuid.UUID, dict] = {}
    by_master: dict[uuid.UUID, dict] = {}
    for b, service, provider_name in rows:
        for acc, key, name in (
            (by_service, b.service_id, _resolve_service_name(service, lang)),
            (by_master, b.provider_id, provider_name),
        ):
            a = acc.setdefault(key, blank(name))
            if b.status == BookingStatus.completed:
                a["completed"] += 1
                a["minutes"] += int((b.end_at - b.start_at).total_seconds() // 60)
                if b.price is not None:
                    a["revenue"] += b.price
                    a["priced"] += 1
            elif b.status == BookingStatus.cancelled and b.cancel_reason == PROVIDER_TIMEOUT:
                a["timed_out"] += 1
            elif b.status == BookingStatus.cancelled:
                a["cancelled"] += 1
            else:
                a["no_show"] += 1

    def avg_price(a: dict) -> Decimal | None:
        return (a["revenue"] / a["priced"]).quantize(Decimal("0.01")) if a["priced"] else None

    def avg_min(a: dict) -> float:
        return round(a["minutes"] / a["completed"], 1) if a["completed"] else 0.0

    services = [
        ServiceStatOut(
            service_id=sid, name=a["name"], completed=a["completed"], cancelled=a["cancelled"], no_show=a["no_show"],
            timed_out=a["timed_out"],
            total_minutes=a["minutes"], avg_minutes=avg_min(a), revenue=a["revenue"], priced_jobs=a["priced"],
            avg_price=avg_price(a),
        )
        for sid, a in by_service.items()
    ]
    services.sort(key=lambda x: (-x.completed, x.name))
    masters = [
        MasterStatOut(
            provider_id=pid, name=a["name"], completed=a["completed"], cancelled=a["cancelled"], no_show=a["no_show"],
            timed_out=a["timed_out"],
            total_minutes=a["minutes"], revenue=a["revenue"], priced_jobs=a["priced"], avg_price=avg_price(a),
        )
        for pid, a in by_master.items()
    ]
    masters.sort(key=lambda x: (-x.completed, x.name))
    return services, masters


@app.get("/api/providers/me/analytics", response_model=AnalyticsOut)
async def get_my_analytics(
    date_from: date,
    date_to: date,
    lang: str = Query(default=DEFAULT_LANG),
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsOut:
    """Цифры по каждой работе (услуге) за период: сколько выполнено, часы,
    средняя длительность, выручка и средний чек (по броням с указанной
    итоговой ценой), плюс отмены/неявки."""
    if date_to < date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to must be >= date_from")
    if (date_to - date_from).days > 366:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too large, max 366 days")
    provider = await _get_own_provider(master_user_id, db, "analytics_view")
    services, _ = await _collect_analytics(db, date_from, date_to, provider.id, _resolve_lang(lang))
    return AnalyticsOut(date_from=date_from, date_to=date_to, services=services)


# ============================================================================


@app.post("/admin/login")
@limiter.limit("5/minute")
async def admin_login(request: Request, payload: AdminLoginRequest) -> dict:
    if not secrets.compare_digest(payload.password.encode("utf-8"), settings.ADMIN_SECRET.encode("utf-8")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid password")
    request.session["is_admin"] = True
    return {"ok": True, "token": make_token("admin")}


@app.post("/admin/logout")
async def admin_logout(request: Request) -> dict:
    request.session.pop("is_admin", None)
    return {"ok": True}


@app.get("/admin/me", dependencies=[Depends(require_admin)])
async def admin_whoami() -> dict:
    return {"is_admin": True}


# ============================================================================
# Admin — master management (superadmin-only)
# ============================================================================


@app.get("/admin/analytics", response_model=AdminAnalyticsOut, dependencies=[Depends(require_admin)])
async def admin_analytics(
    date_from: date,
    date_to: date,
    provider_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> AdminAnalyticsOut:
    """Аналитика суперадмина: по каждой работе и по каждому мастеру за период;
    provider_id сужает до одного мастера."""
    if date_to < date_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to must be >= date_from")
    if (date_to - date_from).days > 366:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "range too large, max 366 days")
    # Superadmin screen is hardcoded Russian, but catalog names themselves
    # are maintained in Polish (SUPPORTED_LANGS) — showing the internal
    # Service.name here was the same leak as the master cabinet's, just
    # less visible since it happened to match for Russian-era rows.
    services, masters = await _collect_analytics(db, date_from, date_to, provider_id, DEFAULT_LANG)
    return AdminAnalyticsOut(date_from=date_from, date_to=date_to, services=services, masters=masters)


@app.get("/admin/masters", response_model=list[MasterOut], dependencies=[Depends(require_admin)])
async def list_masters(db: AsyncSession = Depends(get_db)) -> list[MasterOut]:
    rows = (
        await db.execute(
            select(MasterUser, Provider)
            .join(Provider, Provider.id == MasterUser.provider_id)
            .where(MasterUser.role == "owner")
            .order_by(Provider.name)
        )
    ).all()
    cities: dict[uuid.UUID, list[uuid.UUID]] = {}
    for pid, cid in (await db.execute(select(ProviderCity.provider_id, ProviderCity.city_id))).all():
        cities.setdefault(pid, []).append(cid)
    return [
        MasterOut(
            master_user_id=master_user.id,
            provider_id=provider.id,
            name=provider.name,
            email=master_user.email,
            travel_buffer_minutes=provider.travel_buffer_minutes,
            is_active=provider.is_active,
            telegram_linked=master_user.telegram_chat_id is not None,
            rating=provider.rating,
            rating_count=provider.rating_count,
            phone=provider.phone,
            city_ids=cities.get(provider.id, []),
        )
        for master_user, provider in rows
    ]


@app.patch("/admin/masters/{master_user_id}", response_model=MasterOut, dependencies=[Depends(require_admin)])
async def update_master_rating(
    master_user_id: uuid.UUID,
    payload: AdminMasterUpdate,
    db: AsyncSession = Depends(get_db),
) -> MasterOut:
    """Manual stand-in for the not-yet-built reviews system — see
    Provider.rating's docstring in app/models.py — plus the master's phone
    (for the dispatcher). Only the parts sent change (AdminMasterUpdate).
    Not travel_buffer_minutes/is_active — those stay a future extension of
    this same endpoint, not requested yet."""
    master_user = await db.get(MasterUser, master_user_id)
    if master_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")
    provider = await db.get(Provider, master_user.provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")

    sent = payload.model_fields_set
    if sent & {"rating", "rating_count"}:
        provider.rating = payload.rating
        provider.rating_count = payload.rating_count
    if "phone" in sent:
        provider.phone = (payload.phone or "").strip() or None
    await db.commit()

    return MasterOut(
        master_user_id=master_user.id,
        provider_id=provider.id,
        name=provider.name,
        email=master_user.email,
        travel_buffer_minutes=provider.travel_buffer_minutes,
        is_active=provider.is_active,
        telegram_linked=master_user.telegram_chat_id is not None,
        rating=provider.rating,
        rating_count=provider.rating_count,
        phone=provider.phone,
        city_ids=await _provider_city_ids(db, provider.id),
    )


async def _provider_city_ids(db: AsyncSession, provider_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (await db.execute(select(ProviderCity.city_id).where(ProviderCity.provider_id == provider_id))).scalars().all()
    )


async def _set_provider_cities(db: AsyncSession, provider_id: uuid.UUID, city_ids: list[uuid.UUID]) -> None:
    """Заменяет города мастера; неизвестный город — 422."""
    wanted = set(city_ids)
    if wanted:
        known = set((await db.execute(select(City.id).where(City.id.in_(wanted)))).scalars().all())
        if known != wanted:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown city")
    await db.execute(delete(ProviderCity).where(ProviderCity.provider_id == provider_id))
    for cid in wanted:
        db.add(ProviderCity(provider_id=provider_id, city_id=cid))


@app.put("/admin/masters/{master_user_id}/cities", response_model=MasterOut, dependencies=[Depends(require_admin)])
async def set_master_cities(
    master_user_id: uuid.UUID, payload: AdminMasterCitiesUpdate, db: AsyncSession = Depends(get_db)
) -> MasterOut:
    master_user = await db.get(MasterUser, master_user_id)
    provider = await db.get(Provider, master_user.provider_id) if master_user else None
    if master_user is None or provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")
    await _set_provider_cities(db, provider.id, payload.city_ids)
    await db.commit()
    return MasterOut(
        master_user_id=master_user.id,
        provider_id=provider.id,
        name=provider.name,
        email=master_user.email,
        travel_buffer_minutes=provider.travel_buffer_minutes,
        is_active=provider.is_active,
        telegram_linked=master_user.telegram_chat_id is not None,
        rating=provider.rating,
        rating_count=provider.rating_count,
        phone=provider.phone,
        city_ids=await _provider_city_ids(db, provider.id),
    )


@app.get("/admin/cities", response_model=list[AdminCityOut], dependencies=[Depends(require_admin)])
async def admin_list_cities(db: AsyncSession = Depends(get_db)) -> list[City]:
    return list((await db.execute(select(City).order_by(City.sort_order, City.name_pl))).scalars().all())


@app.post(
    "/admin/cities",
    response_model=AdminCityOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def admin_create_city(payload: AdminCityCreate, db: AsyncSession = Depends(get_db)) -> City:
    city = City(id=uuid.uuid4(), is_active=True, **payload.model_dump())
    db.add(city)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A city with this slug already exists") from exc
    return city


@app.patch("/admin/cities/{city_id}", response_model=AdminCityOut, dependencies=[Depends(require_admin)])
async def admin_update_city(city_id: uuid.UUID, payload: AdminCityUpdate, db: AsyncSession = Depends(get_db)) -> City:
    city = await db.get(City, city_id)
    if city is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "City not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(city, field, value)
    await db.commit()
    return city


@app.delete("/admin/masters/{master_user_id}", dependencies=[Depends(require_admin)])
async def delete_master(master_user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Removes a master and everything scoped to him (provider_service,
    working_hours*, telegram_link_token, web_push_subscription — all
    ON DELETE CASCADE off provider/master_user, see db/schema.sql). Blocked
    with 409 if he has any bookings — booking.provider_id has no cascade on
    purpose (a booking must survive even if the provider row later goes
    away), so an unconditional delete would just surface as a raw 500 here;
    checking first gives the superadmin a clear reason instead."""
    master_user = await db.get(MasterUser, master_user_id)
    if master_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master not found")

    has_booking = (
        await db.execute(select(Booking.id).where(Booking.provider_id == master_user.provider_id).limit(1))
    ).first()
    if has_booking is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "У мастера есть бронирования — удаление невозможно, пока они не будут перенесены/отменены",
        )

    # Raw DELETE, not db.delete(provider) — the ORM's own unit-of-work would
    # first try to UPDATE the (NOT NULL) child FKs to null before removing
    # the parent, since Provider.master_user/.working_hours are plain
    # relationships with no cascade="delete"/passive_deletes configured.
    # Going straight to SQL leaves it entirely to Postgres's own
    # ON DELETE CASCADE (db/schema.sql), which is what actually needs to run.
    await db.execute(delete(Provider).where(Provider.id == master_user.provider_id))
    await db.commit()
    return {"ok": True}


@app.post("/admin/masters", dependencies=[Depends(require_admin)])
async def create_master(
    payload: CreateMasterRequest,
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
        name=payload.name,
        travel_buffer_minutes=payload.travel_buffer_minutes,
        phone=(payload.phone or "").strip() or None,
    )
    db.add(provider)
    await db.flush()
    await _set_provider_cities(db, provider.id, payload.city_ids)

    master_user = MasterUser(
        id=uuid.uuid4(),
        provider_id=provider.id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="owner",
    )
    db.add(master_user)
    try:
        await db.commit()
    except IntegrityError as exc:
        # MasterUser.email is unique — without this the panel's "create
        # master" form would surface a raw 500 for a typo'd duplicate email
        # instead of a message the superadmin can act on.
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A master with this email already exists") from exc
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
        run_in_background(
            reply_telegram(
                chat_id=str(chat_id),
                purpose="Tell the user that the link they used to connect notifications is invalid or was already used.",
            )
        )
        return {"ok": True}

    master_user = await db.get(MasterUser, link.master_user_id)
    master_user.telegram_chat_id = str(chat_id)
    link.used_at = datetime.now(timezone.utc)
    await db.commit()

    run_in_background(
        reply_telegram(
            chat_id=str(chat_id),
            purpose="Confirm that booking notifications will now arrive in this chat.",
        )
    )
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


# ============================================================================
# FCM device tokens — нативное приложение (docs/mobile-app-task.md §4)
# ============================================================================


async def _upsert_device_token(
    db: AsyncSession, payload: DeviceTokenRequest, *, master_user_id: uuid.UUID | None, client_phone: str | None
) -> None:
    """Токен уникален: то же устройство под другим владельцем (выход/вход
    другим мастером, клиентская ссылка на том же телефоне) переписывает
    строку."""
    row = (
        await db.execute(select(DevicePushToken).where(DevicePushToken.fcm_token == payload.fcm_token))
    ).scalar_one_or_none()
    if row is None:
        row = DevicePushToken(id=uuid.uuid4(), fcm_token=payload.fcm_token)
        db.add(row)
    row.master_user_id = master_user_id
    row.client_phone = client_phone
    row.platform = payload.platform
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()


@app.put("/api/push/device-token")
async def register_master_device_token(
    payload: DeviceTokenRequest,
    master_user_id: str = Depends(require_master_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _upsert_device_token(db, payload, master_user_id=uuid.UUID(master_user_id), client_phone=None)
    return {"ok": True}


@app.post("/api/push/device-token/unregister")
@limiter.limit("20/minute")
async def unregister_device_token(
    request: Request, payload: DeviceTokenUnregister, db: AsyncSession = Depends(get_db)
) -> dict:
    """Выход из кабинета в приложении. Без авторизации: к этому моменту
    Bearer-токен уже стёрт, а сам FCM-токен — секрет устройства, знающий его
    может разве что отписать это же устройство."""
    await db.execute(delete(DevicePushToken).where(DevicePushToken.fcm_token == payload.fcm_token))
    await db.commit()
    return {"ok": True}


@app.put("/api/my-booking/{booking_id}/device-token")
@limiter.limit("10/minute")
async def register_client_device_token(
    request: Request, booking_id: uuid.UUID, token: str, payload: DeviceTokenRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    booking = await _get_booking_by_token(db, booking_id, token)
    if not booking.client_phone:
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking has no phone number to attach notifications to")
    await _upsert_device_token(db, payload, master_user_id=None, client_phone=booking.client_phone)
    return {"ok": True}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
