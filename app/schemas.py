"""Pydantic request/response models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import BookingStatus


class BookingCreate(BaseModel):
    service_id: uuid.UUID
    start_at: datetime
    client_name: str = Field(min_length=1, max_length=200)
    client_phone: str | None = None
    notes: str | None = None
    # None = "любой доступный мастер" (docs/mvp-task.md #3)
    provider_id: uuid.UUID | None = None

    @field_validator("start_at")
    @classmethod
    def start_at_must_be_tz_aware(cls, v: datetime) -> datetime:
        # booking.start_at is timestamptz (see models.TZDateTime) — a naive
        # value here is ambiguous (client's local time? server's? UTC?) and
        # asyncpg will reject it outright once it reaches the DB anyway.
        # Reject it explicitly at the API boundary with a clear message
        # instead of letting it surface as an opaque 500 from asyncpg.
        if v.tzinfo is None:
            raise ValueError(
                "start_at must include a timezone offset (e.g. '2026-09-08T09:00:00+02:00' "
                "or '...Z'), not a naive datetime"
            )
        return v


class BookingOut(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    service_id: uuid.UUID
    client_name: str
    client_phone: str | None
    start_at: datetime
    end_at: datetime
    status: BookingStatus

    class Config:
        from_attributes = True


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginRequest(BaseModel):
    """Superadmin panel login (app/main.py's POST /admin/login) — checked
    against the same ADMIN_SECRET that /admin/* already accepts as an
    X-Admin-Secret header (docs/decisions.md: one superadmin, no separate
    password to keep in sync). Success sets session["is_admin"], so the
    panel doesn't have to hold the raw secret in browser JS for the rest of
    the visit — see require_admin in app/main.py."""

    password: str


class CreateMasterRequest(BaseModel):
    """Body for POST /admin/masters — replaces the old query-parameter
    shape (name/email/password were being read off the URL, which meant the
    password ended up in server/proxy access logs and browser history; see
    app/main.py's create_master)."""

    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8)
    travel_buffer_minutes: int = 30


class MasterOut(BaseModel):
    """One row of the admin panel's master list (GET /admin/masters) — just
    enough to tell masters apart and see who still needs a Telegram link,
    not a full provider dump."""

    master_user_id: uuid.UUID
    provider_id: uuid.UUID
    name: str
    email: str
    travel_buffer_minutes: int
    is_active: bool
    telegram_linked: bool


class TelegramLinkOut(BaseModel):
    deep_link: str
    token: str
    expires_note: str = "одноразовый — сгорает после первого /start"


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class ServiceOut(BaseModel):
    """Public — what a client picks from on the booking page. No tenant_id
    (single-tenant, docs/decisions.md) and no is_active (only active ones
    are ever listed)."""

    id: uuid.UUID
    name: str
    duration_minutes: int
    price_min: float | None = None
    price_max: float | None = None

    class Config:
        from_attributes = True


class ProviderLocationOut(BaseModel):
    """The public live-location dot (Этап 4) — only ever constructed by
    app/main.py's _resolve_provider_location once all three gates (opted in,
    fresh, within working hours) already passed, so its mere presence on a
    ProviderOut IS the "show the dot" signal; there's no separate boolean to
    check. `updated_at` is included so the client can show a relative "N мин
    назад" instead of pretending this is truly live."""

    lat: float
    lng: float
    updated_at: datetime


class ProviderOut(BaseModel):
    """Public — just enough for the booking page to show which master a
    slot belongs to, and (once a client has picked a slot) what that
    provider's own call-out fee is. No phone/email (docs/decisions.md: no
    client accounts, no reason to expose that here)."""

    id: uuid.UUID
    name: str
    call_out_fee: float | None = None
    location: ProviderLocationOut | None = None

    class Config:
        from_attributes = True


class ProviderSettingsOut(BaseModel):
    id: uuid.UUID
    name: str
    requires_booking_confirmation: bool
    call_out_fee: float | None = None
    share_location: bool
    # "Занят сейчас" — read-only here (see ProviderBusyOut/the dedicated
    # /api/providers/me/busy/* endpoints below for changing it); included on
    # the settings GET so the cabinet knows the current state on page load
    # without a second round trip.
    busy_started_at: datetime | None = None
    busy_estimated_minutes: int | None = None
    # Computed, not a column — see app/main.py's _busy_until. Only ever set
    # when an estimate has been given; open-ended busy (no estimate) has no
    # finite "until" to show.
    busy_until: datetime | None = None

    class Config:
        from_attributes = True


class ProviderSettingsUpdate(BaseModel):
    requires_booking_confirmation: bool
    # Required (not Optional-with-a-default) so a PATCH always states the
    # full desired value explicitly — sending null clears a previously-set
    # fee back to "none", same as any other value would set it. Matches
    # requires_booking_confirmation's own always-send-the-full-value shape.
    call_out_fee: float | None
    # Same always-send-the-full-value shape — see Provider.share_location's
    # docstring in app/models.py.
    share_location: bool


class ProviderLocationUpdate(BaseModel):
    """PUT /api/providers/me/location body — one fresh GPS fix from the
    cabinet's foreground geolocation watch (web/lib/useLocationSharing.ts)."""

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ProviderBusyOut(BaseModel):
    """Response for all three /api/providers/me/busy/* endpoints. Built
    manually by app/main.py (not from_attributes off the ORM row) because
    busy_until is computed, not a column — see app/slot_engine.py's
    provider_busy_range for how it's derived, and app/main.py's
    _busy_until. null busy_until with busy_started_at set means open-ended
    (no estimate given yet)."""

    busy_started_at: datetime | None
    busy_estimated_minutes: int | None
    busy_until: datetime | None = None


class BusyEstimateUpdate(BaseModel):
    """PATCH /api/providers/me/busy body. null explicitly clears a
    previously-set estimate (back to open-ended) — same
    always-send-the-full-value shape as ProviderSettingsUpdate."""

    estimated_minutes: int | None = Field(default=None, ge=1, le=24 * 60)


class ServiceToggleOut(BaseModel):
    """One row of 'which services do I currently offer' for the cabinet's
    services checklist — GET/PUT /api/providers/me/services."""

    service_id: uuid.UUID
    name: str
    duration_minutes: int
    price_min: float | None = None
    price_max: float | None = None
    is_offered: bool


class ProviderServicesUpdate(BaseModel):
    """PUT body for /api/providers/me/services — the full desired set of
    service ids this provider offers (replace semantics: anything not
    listed here gets turned off, nothing is inferred as "unchanged")."""

    service_ids: list[uuid.UUID]


class AvailabilityQuery(BaseModel):
    service_id: uuid.UUID
    provider_id: uuid.UUID | None = None
    date_from: date
    date_to: date


# ============================================================================
# Translations (Этап 3) — admin-only management of translation_entry rows.
# See app/translations.py's module docstring for the draft/approve split.
# ============================================================================


class TranslationEntryOut(BaseModel):
    id: uuid.UUID
    namespace: str
    key: str
    lang: str
    text: str
    status: str

    class Config:
        from_attributes = True


class TranslationUpsert(BaseModel):
    """PUT /admin/translations body — upserts one (namespace, key, lang) row.
    Deliberately does NOT go live on its own (see app/translations.py) —
    `status` here just records where the row sits in the review pipeline;
    only a separate POST /admin/translations/approve makes it visible."""

    namespace: str = Field(min_length=1, max_length=100)
    key: str = Field(min_length=1, max_length=200)
    lang: str
    text: str = Field(min_length=1)
    status: str = "draft"

    @field_validator("lang")
    @classmethod
    def lang_supported(cls, v: str) -> str:
        from app.translations import SUPPORTED_LANGS

        if v not in SUPPORTED_LANGS:
            raise ValueError(f"lang must be one of {SUPPORTED_LANGS}")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: str) -> str:
        if v not in ("draft", "reviewed", "approved"):
            raise ValueError("status must be draft, reviewed, or approved")
        return v


class TranslationRef(BaseModel):
    namespace: str
    key: str
    lang: str


class TranslationApproveRequest(BaseModel):
    """POST /admin/translations/approve body — an explicit list of entries to
    approve, never "approve everything draft": a batch call can't accidentally
    publish something nobody actually reviewed."""

    entries: list[TranslationRef] = Field(min_length=1)
