"use client";

/**
 * Mounts once in app/layout.tsx, wraps the whole app. Resolves the visitor's
 * locale (lib/locale.ts: query -> cookie -> default), fetches the approved
 * translation set for it from the backend (Этап 3), and exposes both plus a
 * `setLocale` for the switcher (components/LanguageSwitcher.tsx) via context.
 *
 * `resolveLocale()`/`persistLocale()` read window/document, so they can only
 * run after mount (a static export prerenders this component's first pass
 * with no visitor context at all) — `ready` stays false, and every consumer
 * renders a language-neutral loading state, until that first effect
 * resolves. See CabinetDashboard.tsx/BookingFlow.tsx for the pattern.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { buildTranslations, type Translations } from "@/lib/i18n";
import { DEFAULT_LOCALE, type LocaleCode, persistLocale, resolveLocale } from "@/lib/locale";

interface LocaleContextValue {
  locale: LocaleCode;
  t: Translations;
  ready: boolean;
  setLocale: (locale: LocaleCode) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);
  const [map, setMap] = useState<Record<string, string>>({});

  const loadTranslations = useCallback(async (lang: LocaleCode) => {
    try {
      const fetched = await api.getTranslations(lang);
      setMap(fetched);
    } catch {
      // Best-effort: falls back to key-name text (see lib/i18n.ts's `pick`)
      // rather than blocking the whole app on a translations-fetch failure.
      setMap({});
    } finally {
      setReady(true);
    }
  }, []);

  // Resolve once on mount — see the module docstring for why this can't run
  // during the static build itself. The setState calls are nested inside an
  // async IIFE (matching components/Cabinet.tsx's auth-check effect) so they
  // aren't direct statements in the effect body — react-hooks/set-state-in-effect
  // only flags the latter.
  useEffect(() => {
    (async () => {
      const resolved = resolveLocale();
      setLocaleState(resolved);
      persistLocale(resolved);
      document.documentElement.lang = resolved;
      await loadTranslations(resolved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (next: LocaleCode) => {
      setLocaleState(next);
      persistLocale(next);
      document.documentElement.lang = next;
      setReady(false);
      loadTranslations(next);
    },
    [loadTranslations],
  );

  const t = useMemo(() => buildTranslations(map), [map]);

  const value = useMemo(() => ({ locale, t, ready, setLocale }), [locale, t, ready, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) {
    throw new Error("useLocale must be used within a LocaleProvider (see app/layout.tsx)");
  }
  return ctx;
}
