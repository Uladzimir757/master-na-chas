/**
 * Bearer-токены входа (мастер / суперадмин). Safari/iOS блокирует cookie между
 * фронтом и API (два разных *.onrender.com), поэтому рядом с cookie-сессией
 * бэкенд выдаёт подписанный токен, а фронт шлёт его в Authorization.
 * localStorage может быть недоступен (приватный режим) — тогда остаётся только
 * cookie, как раньше.
 */

export type TokenKind = "master" | "admin";

const KEYS: Record<TokenKind, string> = {
  master: "zr_master_token",
  admin: "zr_admin_token",
};

export function getToken(kind: TokenKind): string | null {
  try {
    return window.localStorage.getItem(KEYS[kind]);
  } catch {
    return null;
  }
}

export function setToken(
  kind: TokenKind,
  token: string | null | undefined,
): void {
  try {
    if (token) window.localStorage.setItem(KEYS[kind], token);
    else window.localStorage.removeItem(KEYS[kind]);
  } catch {
    /* ignore */
  }
}

/** Какой токен нужен для пути API: /admin/* — админский, остальное — мастера. */
export function kindForPath(path: string): TokenKind {
  return path.startsWith("/admin") ? "admin" : "master";
}
