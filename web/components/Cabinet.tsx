"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { Card, Centered } from "@/components/ui";
import CabinetDashboard from "@/components/CabinetDashboard";

type AuthState = "checking" | "anon" | "authed";

export default function Cabinet() {
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
        await api.login(email, password);
        setAuthState("authed");
      } catch (err) {
        setLoginError(err instanceof ApiError && err.status === 401 ? t.loginError : t.loginGenericError);
      } finally {
        setLoggingIn(false);
      }
    },
    [email, password],
  );

  const handleLogout = useCallback(async () => {
    // Best-effort — even if the network call fails, dropping back to the
    // login form is the right UI outcome either way.
    await api.logout().catch(() => {});
    setAuthState("anon");
  }, []);

  if (authState === "checking") {
    return <Centered>{t.cabinetLoading}</Centered>;
  }

  if (authState === "authed") {
    return <CabinetDashboard onLogout={handleLogout} />;
  }

  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">{t.cabinetLoginTitle}</h1>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="username"
          placeholder={t.emailPlaceholder}
          className="rounded-lg border border-neutral-300 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t.passwordPlaceholder}
          className="rounded-lg border border-neutral-300 px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {loginError && <p className="text-sm text-red-600">{loginError}</p>}
        <button
          type="submit"
          disabled={loggingIn}
          className="mt-1 rounded-lg bg-neutral-900 px-5 py-2.5 text-white disabled:opacity-40"
        >
          {loggingIn ? t.loggingIn : t.loginButton}
        </button>
      </form>
    </Card>
  );
}
