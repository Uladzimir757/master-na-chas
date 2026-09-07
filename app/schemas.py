"""Pydantic request/response models."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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


class ChangePasswordRequest(BaseModel):
    """POST /auth/change-password body — a logged-in master changing their
    own password (previously only the superadmin could ever set one, at
    creation time — see app/main.py's create_master). Requires the current
    password (not just an active session) so a browser left logged in on a
    shared computer can't have its password silently swapped by whoever
    walks up to it."""

    current_password: str
    new_password: str = Field(min_length=8)


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
    rating: float | None = None
    rating_count: int = 0


class AdminMasterUpdate(BaseModel):
    """PATCH /admin/masters/{master_user_id} body — currently just the
    manual rating stand-in (see Provider.rating's docstring in
    app/models.py). Always-send-the-full-value shape: null explicitly clears
    a previously-set rating back to "no rating", same convention as
    ProviderSettingsUpdate.call_out_fee."""

    rating: float | None = Field(default=None, ge=0, le=5)
    rating_count: int = Field(default=0, ge=0)


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
    """Public — just enough for the master-picker screen and booking page:
    which master a slot belongs to, his rating (if any — see Provider.rating
    in app/models.py), and (once a client has picked a slot) his own
    call-out fee. No phone/email (docs/decisions.md: no client accounts, no
    reason to expose that here)."""

    id: uuid.UUID
    name: str
    rating: float | None = None
    rating_count: int = 0
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
    services checklist — GET/PUT /api/providers/me/services. price_min/
    price_max/description are THIS provider's own values
    (ProviderService.price_min/max/description) when he has set them,
    falling back to Service's reference range when he hasn't yet — see
    app/main.py's get_my_services. is_offered=false rows can still carry a
    previously-set price/description (kept, not cleared, on toggle-off)."""

    service_id: uuid.UUID
    name: str
    duration_minutes: int
    price_min: float | None = None
    price_max: float | None = None
    description: str | None = None
    is_offered: bool


class ProviderServiceUpdateItem(BaseModel):
    """One entry of the PUT /api/providers/me/services payload — a service
    this provider now offers, with his own approximate price (optional —
    "цены приблизительные") and an optional free-text description."""

    service_id: uuid.UUID
    price_min: float | None = None
    price_max: float | None = None
    description: str | None = Field(default=None, max_length=2000)


class ProviderServicesUpdate(BaseModel):
    """PUT body for /api/providers/me/services — the full desired set of
    services this provider offers, each with his own price/description
    (replace semantics: any service not listed here gets turned off —
    nothing is inferred as "unchanged" — same as the previous service_ids
    shape, just carrying price/description alongside each id now)."""

    services: list[ProviderServiceUpdateItem]


class ProviderServiceOut(BaseModel):
    """Public — one service a specific master offers, for the booking flow
    once a master has been picked (GET /api/providers/{id}/services). Same
    price/description-with-fallback shape as ServiceToggleOut, just without
    is_offered (every row here is, by definition, offered)."""

    id: uuid.UUID
    name: str
    duration_minutes: int
    price_min: float | None = None
    price_max: float | None = None
    description: str | None = None


class AvailabilityQuery(BaseModel):
    service_id: uuid.UUID
    provider_id: uuid.UUID | None = None
    date_from: date
    date_to: date


# ============================================================================
# "Мои рабочие часы" — a master's own weekly template (WorkingHours) plus
# per-date overrides (WorkingHoursException), the same tables
# app/slot_engine.py has been reading from since day one for slot generation
# and the is_within_working_hours gate on the public location dot (Этап 4) —
# there was simply no way for a master to edit either one himself before
# this segment; only seed scripts / hand-written SQL ever touched them.
# ============================================================================


class WorkingHoursSlot(BaseModel):
    """One contiguous open window on a given weekday (0=Monday..6=Sunday,
    matches date.weekday() and db/schema.sql's CHECK). Multiple rows per
    weekday are allowed by the schema (e.g. 9-13 and 15-19, a lunch gap) —
    the shape here carries that through rather than collapsing to one
    window per day."""

    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _end_after_start(self) -> "WorkingHoursSlot":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class WorkingHoursUpdate(BaseModel):
    """PUT /api/providers/me/working-hours body — the FULL desired weekly
    template, replace semantics (same shape as ProviderServicesUpdate):
    every existing WorkingHours row for this provider is replaced with
    exactly what's posted here. Rejects windows that overlap each other on
    the same weekday — slot_engine.py's day_windows has no defined ordering
    for overlapping ranges, so this catches an ambiguous schedule at the API
    boundary instead of silently generating confusing/duplicate slots."""

    slots: list[WorkingHoursSlot]

    @field_validator("slots")
    @classmethod
    def _no_overlaps_per_weekday(cls, v: list[WorkingHoursSlot]) -> list[WorkingHoursSlot]:
        by_weekday: dict[int, list[WorkingHoursSlot]] = {}
        for slot in v:
            by_weekday.setdefault(slot.weekday, []).append(slot)
        for weekday, windows in by_weekday.items():
            windows = sorted(windows, key=lambda w: w.start_time)
            for a, b in zip(windows, windows[1:]):
                if b.start_time < a.end_time:
                    raise ValueError(f"overlapping working-hours windows on weekday {weekday}")
        return v


class WorkingHoursExceptionOut(BaseModel):
    id: uuid.UUID
    date: date
    is_available: bool
    start_time: time | None
    end_time: time | None
    reason: str | None

    class Config:
        from_attributes = True


class WorkingHoursExceptionUpsert(BaseModel):
    """PUT /api/providers/me/working-hours/exceptions/{date} body — one-off
    override for a specific date: a day off (is_available=False, no hours)
    or custom hours that day (is_available=True, start_time/end_time
    required). Upsert by date (db/schema.sql's UNIQUE (provider_id, date)),
    so posting again for a date already overridden just replaces it — no
    separate "edit" endpoint needed."""

    is_available: bool
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _hours_required_when_available(self) -> "WorkingHoursExceptionUpsert":
        if self.is_available:
            if self.start_time is None or self.end_time is None:
                raise ValueError("start_time and end_time are required when is_available is true")
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be after start_time")
        return self


class WorkingHoursOut(BaseModel):
    """GET/PUT /api/providers/me/working-hours response — the weekly
    template plus every upcoming exception (date >= today in
    app/slot_engine.py's BUSINESS_TZ; past ones aren't useful to a master
    editing his own schedule, so they're left out rather than growing this
    response forever)."""

    slots: list[WorkingHoursSlot]
    exceptions: list[WorkingHoursExceptionOut]


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
