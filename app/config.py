"""
Settings — everything that's genuinely platform-level configuration (secrets,
connection strings, one bot token for the whole project) lives here, loaded
from env vars. Per-master data (telegram_chat_id, push subscriptions) is
explicitly NOT here — see docs/mvp-task.md #5, "никакого хардкода".
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres@localhost/master_na_chas"

    SESSION_SECRET: str = "change-me-in-prod"  # itsdangerous signing key for the session cookie
    ADMIN_SECRET: str = "change-me-in-prod"  # shared secret for /admin/* — you're the only superadmin

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


settings = Settings()
