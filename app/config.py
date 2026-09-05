"""
Settings — everything that's genuinely platform-level configuration (secrets,
connection strings, one bot token for the whole project) lives here, loaded
from env vars. Per-master data (telegram_chat_id, push subscriptions) is
explicitly NOT here — see docs/mvp-task.md #5, "никакого хардкода".
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres@localhost/master_na_chas"

    SESSION_SECRET: str = "change-me-in-prod"  # itsdangerous signing key for the session cookie
    ADMIN_SECRET: str = "change-me-in-prod"  # shared secret for /admin/* — you're the only superadmin

    # The master's login cookie (app/main.py's SessionMiddleware). Local dev
    # keeps the browser default (Lax, not Secure) because `npm run dev`'s
    # frontend and `uvicorn`'s backend share the hostname "localhost" (only
    # the port differs), which browsers treat as the same site — Lax cookies
    # are sent on same-site fetches just fine.
    #
    # Production is NOT the same site: the frontend and API are two separate
    # *.onrender.com services, i.e. two different sites for cookie purposes
    # (different subdomain, and onrender.com itself is the kind of shared
    # hosting domain browsers refuse to treat as one registrable domain — the
    # same reason *.github.io or *.vercel.app apps are cookie-isolated from
    # each other). A Lax cookie set by the API in response to the frontend's
    # login fetch() would never be sent back on the frontend's later fetch()
    # calls — logins would silently "succeed" and then look logged-out on
    # the very next request. SESSION_COOKIE_SAME_SITE=none (with ...HTTPS_ONLY
    # forced on alongside it — see the validator below, browsers drop
    # SameSite=None cookies outright if they aren't also Secure) is what the
    # Render env vars for master-na-chas-api must set; both onrender.com
    # services are HTTPS-only so Secure is never a problem there.
    SESSION_COOKIE_SAME_SITE: str = "lax"
    SESSION_COOKIE_HTTPS_ONLY: bool = False

    @model_validator(mode="after")
    def _validate_session_cookie_config(self) -> "Settings":
        if self.SESSION_COOKIE_SAME_SITE == "none" and not self.SESSION_COOKIE_HTTPS_ONLY:
            raise ValueError(
                "SESSION_COOKIE_SAME_SITE=none requires SESSION_COOKIE_HTTPS_ONLY=true — "
                "browsers silently drop SameSite=None cookies that aren't also Secure, which "
                "would otherwise fail exactly the way this setting exists to prevent."
            )
        return self

    # Telegram — one bot for the whole platform. chat_id per master lives in
    # master_user.telegram_chat_id (DB), filled via the /telegram/webhook
    # deep-link handshake, never here.
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""  # for building the t.me/<username>?start=<token> deep link

    # Web Push — VAPID keypair for the whole platform (not per-master).
    WEB_PUSH_VAPID_PRIVATE_KEY: str = ""
    WEB_PUSH_VAPID_PUBLIC_KEY: str = ""
    WEB_PUSH_SUBJECT: str = "mailto:admin@example.com"
    WEB_PUSH_ENABLED: bool = False

    # Twilio — platform account credentials + the Alphanumeric Sender ID
    # (see docs/mvp-task.md #6 for why Twilio, not a Polish SMS gateway, for now)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_SENDER_ID: str = "MasterNaChas"  # <=11 latin chars, decide the real brand name later
    SMS_ENABLED: bool = False

    # Этап 2: the Next.js frontend is a separate deploy (separate origin), so
    # the browser enforces CORS on every fetch() it makes to this API.
    # Comma-separated list, no trailing slashes. localhost:3000 by default so
    # `npm run dev` works out of the box; add the real frontend URL once it's
    # deployed (Render env var, not a code change).
    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Root logging level for the whole app (see app/main.py's logging.basicConfig
    # call, which reads this). INFO by default — set to DEBUG via the Render env
    # var when you actually need to see the "channel disabled" notices from
    # app/notifications.py, no code change needed.
    LOG_LEVEL: str = "INFO"

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
