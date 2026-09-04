"""DB engine/session — mvp-task.md #1 (get_db() was NotImplementedError; this is the real thing)."""

from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def _prepare_asyncpg_url(url: str) -> tuple[str, dict]:
    """Neon's own connection strings carry libpq-style query params
    (sslmode=require, channel_binding=require). SQLAlchemy's asyncpg dialect
    dumps every URL query param straight into asyncpg.connect() as a kwarg
    (see create_connect_args: `opts.update(url.query)`), and asyncpg.connect()
    does not accept `sslmode` or `channel_binding` — only `ssl` — so passing
    a raw Neon URL through as-is raises TypeError on first connection
    (confirmed by reading both sources, not by a live test — this sandbox and
    the dev VM both lack network access to Neon's Postgres port, see
    docs/decisions.md). Strip the libpq-only params and translate sslmode to
    the connect_args asyncpg actually understands.
    """
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("channel_binding", None)
    sslmode = query.pop("sslmode", None)
    clean_url = urlunsplit(parts._replace(query=urlencode(query)))

    connect_args: dict = {}
    if sslmode == "disable":
        pass
    else:
        # Neon requires TLS regardless; default to "require" if the URL
        # didn't say, and otherwise pass through whatever mode was given
        # (require / verify-ca / verify-full are all valid `ssl` values too).
        connect_args["ssl"] = sslmode or "require"
    return clean_url, connect_args


_clean_database_url, _connect_args = _prepare_asyncpg_url(settings.DATABASE_URL)
engine = create_async_engine(_clean_database_url, pool_pre_ping=True, connect_args=_connect_args)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
