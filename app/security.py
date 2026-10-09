"""Password hashing + session-cookie auth. Cookie-based on purpose (see
docs/mvp-task.md #4) — JWT would be pure ceremony for two users."""

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from fastapi import HTTPException, Request, status

from app.config import settings


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))


# --- Токен-вход (запасной путь рядом с cookie-сессией) ----------------------
# Фронт и API — два разных *.onrender.com, т.е. разные «сайты». Safari/iOS
# (ITP) режет такие межсайтовые cookie, поэтому вход по cookie там «успешен»,
# но следующий запрос уже без сессии. Токен в заголовке Authorization от
# cookie не зависит. Подписан SESSION_SECRET, с ограниченным сроком.
MASTER_TOKEN_MAX_AGE = 30 * 24 * 3600
ADMIN_TOKEN_MAX_AGE = 12 * 3600


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.SESSION_SECRET, salt="auth-token-v1")


def make_token(kind: str, subject: str = "") -> str:
    return _serializer().dumps({"k": kind, "s": subject})


def read_token(request: Request, kind: str, max_age: int) -> str | None:
    """Subject из Bearer-токена нужного вида или None (нет/битый/просрочен)."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    try:
        data = _serializer().loads(header[7:].strip(), max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or data.get("k") != kind:
        return None
    return str(data.get("s", ""))


def require_master_user_id(request: Request) -> str:
    """Dependency: raises 401 unless a master is logged in. Returns the
    master_user.id (as a string) — из cookie-сессии либо из Bearer-токена."""
    master_user_id = request.session.get("master_user_id") or read_token(request, "master", MASTER_TOKEN_MAX_AGE)
    if not master_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return master_user_id
