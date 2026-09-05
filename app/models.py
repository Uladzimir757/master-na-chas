"""SQLAlchemy models — mirrors db/schema.sql exactly. Keep the two in sync by hand;
there are few enough tables that a migration tool (alembic) is not worth the
ceremony yet at this scale (same "right complexity for current scale" call as
elsewhere in this project)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# All timestamptz columns in schema.sql must map through this, not bare
# `Mapped[datetime]` — SQLAlchemy otherwise infers a naive DateTime() and
# asyncpg then refuses any tz-aware Python datetime written to it (caught by
# an actual run, not by inspection — see the telegram_link_token.used_at fix
# this uncovered).
TZDateTime = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


def _uuid_col(*, primary_key: bool = False, fk: str | None = None):
    kwargs = {}
    if fk:
        return mapped_column(PgUUID(as_uuid=True), ForeignKey(fk), primary_key=primary_key, **kwargs)
    return mapped_column(PgUUID(as_uuid=True), primary_key=primary_key, default=uuid.uuid4)


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class Tenant(Base):
    __tablename__ = "tenant"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    slug: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)


class Provider(Base):
    __tablename__ = "provider"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    travel_buffer_minutes: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    # master's own on/off switch (Этап 2): true = new bookings start
    # `pending`, master confirms via PATCH /api/bookings/{id}/status before
    # it's real (current behavior, safe default). false = auto-confirm on
    # creation — no manual step. Per-provider, not global: each master
    # decides for themself, matches "у мастера есть график" — his booking,
    # his call.
    requires_booking_confirmation: Mapped[bool] = mapped_column(default=True)
    # Flat "выезд" fee shown as its own line on top of the service price
    # once a client has picked a slot with this provider (Провайдер, not
    # Service, because two providers can charge different travel costs for
    # the same service — see web/components/SlotPicker.tsx). Null/0 = no
    # separate line shown. Purely informational right now: the app has no
    # billing/payment flow at all, so this never changes what gets charged
    # anywhere — it only changes what text is displayed before booking.
    call_out_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    working_hours: Mapped[list["WorkingHours"]] = relationship(back_populates="provider")
    master_user: Mapped["MasterUser | None"] = relationship(back_populates="provider", uselist=False)


class Service(Base):
    __tablename__ = "service"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    duration_minutes: Mapped[int] = mapped_column(CheckConstraint("duration_minutes > 0"))
    # schema.sql has had these since Этап 1; only wiring them into the ORM
    # now that the booking page actually needs to show a price.
    price_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(default=True)
    # Per-locale display name (Этап 3, docs/ai-and-reviews.md §1 — dedicated
    # columns, not translation_entry: domain data, not a UI string, the same
    # split Garage System uses for its own Service.display_name_pl/_en).
    # `name` above stays the internal/canonical value (Russian today — what
    # app/main.py's _notify_new_booking sends the two masters, who both read
    # Russian); name_pl/name_ru/name_uk are what a *client* sees, resolved by
    # requested lang with name_ru -> name as the fallback chain — see
    # app/main.py's _resolve_service_name.
    name_pl: Mapped[str | None] = mapped_column(String)
    name_ru: Mapped[str | None] = mapped_column(String)
    name_uk: Mapped[str | None] = mapped_column(String)


class ProviderService(Base):
    """Which provider offers which service — now toggleable per-master from
    the cabinet (PUT /api/providers/me/services), not just seed-script-only.

    is_active flips instead of the row being deleted on toggle-off: keeps
    the row's identity stable (no repeated insert/delete churn from a master
    clicking a checkbox on and off), and is the "правильно" call over
    delete-and-recreate — see docs/decisions.md discussion. Every read that
    decides whether a provider can actually be booked for a service MUST
    filter on is_active — see app/slot_engine.py's list_providers_for_service
    and get_availability, and app/main.py's create_booking."""

    __tablename__ = "provider_service"

    provider_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True, fk="provider.id")
    service_id: Mapped[uuid.UUID] = _uuid_col(primary_key=True, fk="service.id")
    is_active: Mapped[bool] = mapped_column(default=True)


class WorkingHours(Base):
    __tablename__ = "working_hours"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    weekday: Mapped[int]  # 0=Monday .. 6=Sunday, matches date.weekday()
    start_time: Mapped[time]
    end_time: Mapped[time]

    provider: Mapped["Provider"] = relationship(back_populates="working_hours")


class WorkingHoursException(Base):
    __tablename__ = "working_hours_exception"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    date: Mapped[date]
    is_available: Mapped[bool]
    start_time: Mapped[time | None]
    end_time: Mapped[time | None]


class Client(Base):
    __tablename__ = "client"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    name: Mapped[str] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)


class Booking(Base):
    __tablename__ = "booking"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    tenant_id: Mapped[uuid.UUID] = _uuid_col(fk="tenant.id")
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    service_id: Mapped[uuid.UUID] = _uuid_col(fk="service.id")
    client_name: Mapped[str] = mapped_column(String)
    client_phone: Mapped[str | None] = mapped_column(String)
    start_at: Mapped[datetime] = mapped_column(TZDateTime)
    end_at: Mapped[datetime] = mapped_column(TZDateTime)
    status: Mapped[BookingStatus] = mapped_column(
        PgEnum(BookingStatus, name="booking_status", create_type=False),
        default=BookingStatus.pending,
    )
    notes: Mapped[str | None] = mapped_column(Text)


class MasterUser(Base):
    """Login for a provider. Deliberately minimal — see docs/mvp-task.md #4:
    this is the right size for 2 users, not the final architecture."""

    __tablename__ = "master_user"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    provider_id: Mapped[uuid.UUID] = _uuid_col(fk="provider.id")
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    # nullable, filled only by the /telegram/webhook deep-link handshake —
    # never set by hand, never in config. See TelegramLinkToken below.
    telegram_chat_id: Mapped[str | None] = mapped_column(String)

    provider: Mapped["Provider"] = relationship(back_populates="master_user")

    __table_args__ = (UniqueConstraint("provider_id"),)


class TelegramLinkToken(Base):
    """One-shot token for the no-hardcode Telegram linking flow (mvp-task.md #5):
    superadmin creates a row, hands the master `t.me/<bot>?start=<token>`; the
    webhook consumes it and writes chat_id onto MasterUser itself."""

    __tablename__ = "telegram_link_token"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    master_user_id: Mapped[uuid.UUID] = _uuid_col(fk="master_user.id")
    used_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class WebPushSubscription(Base):
    __tablename__ = "web_push_subscription"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    master_user_id: Mapped[uuid.UUID] = _uuid_col(fk="master_user.id")
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String)
    auth: Mapped[str] = mapped_column(String)


class TranslationEntry(Base):
    """UI-string translations (Этап 3, docs/ai-and-reviews.md §1) —
    deliberately NOT in-code dictionaries: that's the exact trap already hit
    once on Garage System (~10k lines of `{% if lang %}` blocks scattered
    through templates, documented as unmanageable there). Domain data
    (service names) does NOT go through this table either — see
    Service.name_pl/name_ru/name_uk; that split is intentional, not
    half-measured (see the model above and _resolve_service_name in
    app/main.py).

    Only status='approved' rows are ever served to a visitor — via
    app/translations.py's in-memory TranslationCache, populated at app
    startup and refreshed ONLY by POST /admin/translations/approve. A plain
    PUT /admin/translations upsert deliberately does not touch the cache —
    mirrors Garage System's own documented /approve-not-/update discipline
    (their /update saves to DB but forgets to call refresh(), so an edit
    looks live to whoever made it but isn't, for anyone else, until someone
    remembers to hit /approve separately). Editing a draft must never be
    observable to a real visitor before an explicit approve."""

    __tablename__ = "translation_entry"

    id: Mapped[uuid.UUID] = _uuid_col(primary_key=True)
    namespace: Mapped[str] = mapped_column(String)
    key: Mapped[str] = mapped_column(String)
    lang: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="draft")
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("namespace", "key", "lang"),)
