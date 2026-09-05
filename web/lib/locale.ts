/**
 * Locale resolution — Этап 3 (docs/ai-and-reviews.md §1). Priority order
 * copied 1:1 from Garage System's own app/core/language_middleware.py, per
 * that decision doc: `lang` query param -> `lang` cookie -> default.
 *
 * Garage System does this server-side (FastAPI + Jinja2 SSR) — this app is
 * a static export (docs/decisions.md: Next.js, `next build && serve`, no
 * per-request server), so there is no request to inspect at render time.
 * The priority order transfers fine; WHERE it runs doesn't — here it's
 * client-side, after hydration, which is why every consumer of this module
 * is a "use client" component and nothing here may run at module-eval time
 * during the static build (see the `typeof window` guards below).
 */

export const SUPPORTED_LOCALES = ["pl", "ru", "uk"] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

// pl, not ru: the business is in Gdynia, Poland — see docs/ai-and-reviews.md
// §1 ("твоя реальная аудитория").
export const DEFAULT_LOCALE: LocaleCode = "pl";

// Full BCP-47 tags for Intl.DateTimeFormat (lib/format.ts) — our short
// codes are the app's own vocabulary, not something Intl understands directly.
const INTL_TAGS: Record<LocaleCode, string> = {
  pl: "pl-PL",
  ru: "ru-RU",
  uk: "uk-UA",
};

export function toIntlTag(locale: LocaleCode): string {
  return INTL_TAGS[locale];
}

function isSupported(v: string | null): v is LocaleCode {
  return v !== null && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

const COOKIE_NAME = "lang";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** query param -> cookie -> default. Browser-only (reads window/document) —
 * never call this during the static build. */
export function resolveLocale(): LocaleCode {
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (isSupported(fromQuery)) return fromQuery;

  const fromCookie = readCookie(COOKIE_NAME);
  if (isSupported(fromCookie)) return fromCookie;

  return DEFAULT_LOCALE;
}

/** Rewritten on every resolve (mirrors Garage System's "cookie
 * перезаписывается на каждый ответ" — the client-side equivalent of that,
 * since there's no server response here to attach it to). Not httponly —
 * the switcher itself reads/writes it via JS, same as Garage System's. */
export function persistLocale(locale: LocaleCode): void {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${oneYear}; samesite=lax`;
}
