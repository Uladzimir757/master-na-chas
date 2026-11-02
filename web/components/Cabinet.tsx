"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Card, Centered, inputClass } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import CabinetDashboard from "@/components/CabinetDashboard";
import { unregisterNativePush } from "@/lib/native";
import { stopNativeLocationSharing } from "@/lib/useLocationSharing";

type AuthState = "checking" | "anon" | "authed";

export default function Cabinet() {
  const { t, ready } = useLocale();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Checks once whether the session cookie (if any) is still valid — this is
  // the same GET /auth/me the login form's own submit relies on, just fired
  // up front so a returning master skips straight past the login form.
  useEffect(() => {
    (async () => {
      try {
        await api.me();
        setAuthState("authed");
      } catch {
        setAuthState("anon");
      }
    })();
  }, []);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError(null);
      setLoggingIn(true);
      try {
        try {
          await api.login(email, password);
        } catch (err) {
          setLoginError(
            err instanceof ApiError && err.status === 401
              ? t.loginError
              : t.loginGenericError,
          );
          return;
        }
        // Пароль верный, но сессия могла не сохраниться (cookie/токен) —
        // тогда кабинет стартовал бы без неё и падал на загрузке. Это не
        // «неверный пароль», поэтому показываем общую ошибку, а не loginError.
        try {
          await api.me();
        } catch {
          setLoginError(t.loginGenericError);
          return;
        }
        setAuthState("authed");
      } finally {
        setLoggingIn(false);
      }
    },
    [email, password, t],
  );

  const handleLogout = useCallback(async () => {
    // Best-effort — even if the network call fails, dropping back to the
    // login form is the right UI outcome either way.
    await stopNativeLocationSharing();
    await unregisterNativePush();
    await api.logout().catch(() => {});
    setAuthState("anon");
  }, []);

  if (!ready) {
    return <Centered>…</Centered>;
  }

  if (authState === "checking") {
    return <Centered>{t.cabinetLoading}</Centered>;
  }

  if (authState === "authed") {
    return <CabinetDashboard onLogout={handleLogout} />;
  }

  return (
    <div className="w-full max-w-md">
      <Card surface>
        <h1 className="mb-4 text-2xl font-bold tracking-[-0.01em]">{t.cabinetLoginTitle}</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder={t.emailPlaceholder}
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            placeholder={t.passwordPlaceholder}
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
          />
          {loginError && <p className="text-sm text-danger">{loginError}</p>}
          <button
            type="submit"
            disabled={loggingIn}
            className="mt-1 min-h-12 rounded-full bg-accent px-6 py-2 text-base font-semibold text-on-accent transition hover:brightness-90 disabled:opacity-40"
          >
            {loggingIn ? t.loggingIn : t.loginButton}
          </button>
        </form>
      </Card>
    </div>
  );
}
