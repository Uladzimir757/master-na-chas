"""Password hashing + session-cookie auth. Cookie-based on purpose (see
docs/mvp-task.md #4) — JWT would be pure ceremony for two users."""

import bcrypt
from fastapi import HTTPException, Request, status


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))


def require_master_user_id(request: Request) -> str:
    """Dependency: raises 401 unless a master is logged in. Returns the
    master_user.id (as a string) stashed in the session at login time."""
    master_user_id = request.session.get("master_user_id")
    if not master_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return master_user_id
