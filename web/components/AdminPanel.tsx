"use client";

/**
 * Superadmin panel — replaces the old workflow of hand-writing a curl call
 * to POST /admin/masters with the password sitting in a query string (see
 * app/schemas.py's CreateMasterRequest docstring in the backend repo for why
 * that shape was fixed at the same time). Deliberately not wired into the
 * pl/ru/uk translation system (lib/i18n.ts) — this page is for one person
 * (the superadmin), not for clients or masters, so hardcoded Russian copy is
 * the right amount of ceremony here, unlike the rest of the site.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminMaster } from "@/lib/api";
import { Card, Centered, Button } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

type AuthState = "checking" | "anon" | "authed";

const inputClass = "w-full rounded-md border border-line bg-bg px-3 py-2 text-ink placeholder:text-ink/40";
const passwordClass = `${inputClass} pr-10`;

export default function AdminPanel() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    (async () => {
      try {
        await api.adminMe();
        setAuthState("authed");
      } catch {
        setAuthState("anon");
      }
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    await api.adminLogout().catch(() => {});
    setAuthState("anon");
  }, []);

  if (authState === "checking") {
    return <Centered>Загрузка…</Centered>;
  }

  if (authState === "anon") {
    return <AdminLogin onLoggedIn={() => setAuthState("authed")} />;
  }

  return <AdminDashboard onLogout={handleLogout} />;
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await api.adminLogin(password);
        onLoggedIn();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setError("Неверный пароль");
        } else if (err instanceof ApiError && err.status === 429) {
          setError("Слишком много попыток — подождите минуту");
        } else {
          setError("Не получилось войти, попробуйте ещё раз");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [password, onLoggedIn],
  );

  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Админ-панель</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <PasswordInput
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
          placeholder="Пароль администратора"
          className={passwordClass}
          showLabel="Показать пароль"
          hideLabel="Скрыть пароль"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Входим…" : "Войти"}
        </Button>
      </form>
    </Card>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [masters, setMasters] = useState<AdminMaster[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [linkByMaster, setLinkByMaster] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState<string | null>(null);

  // Manual stand-in for the not-yet-built reviews system (Provider.rating's
  // docstring in app/models.py) — until real client reviews feed this, the
  // superadmin sets it by hand here. Both fields save together (PATCH
  // /admin/masters/{id} always sends the full rating+rating_count pair), so
  // editing one blurs-and-sends the other's current value unchanged.
  const [savingRatingFor, setSavingRatingFor] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // Two-step (arm, then confirm) instead of window.confirm — matches the
  // rest of the site not using native dialogs, and keeps this reliably
  // clickable from Playwright.
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);
  const [deletingFor, setDeletingFor] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMasters(await api.listMasters());
      setLoadError(null);
    } catch {
      setLoadError("Не удалось загрузить список мастеров");
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const handleGetTelegramLink = useCallback(async (masterUserId: string) => {
    setLinkError(null);
    try {
      const { deep_link } = await api.createTelegramLink(masterUserId);
      setLinkByMaster((prev) => ({ ...prev, [masterUserId]: deep_link }));
    } catch {
      setLinkError("Не удалось создать ссылку — попробуйте ещё раз");
    }
  }, []);

  const handleRatingBlur = useCallback(async (master: AdminMaster, raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const nextRating = parsed !== null && Number.isNaN(parsed) ? null : parsed;
    if (nextRating === master.rating) return;
    setRatingError(null);
    setSavingRatingFor(master.master_user_id);
    try {
      const updated = await api.updateMasterRating(master.master_user_id, nextRating, master.rating_count);
      setMasters((prev) => prev?.map((m) => (m.master_user_id === updated.master_user_id ? updated : m)) ?? prev);
    } catch {
      setRatingError("Не удалось сохранить оценку — попробуйте ещё раз");
    } finally {
      setSavingRatingFor(null);
    }
  }, []);

  const handleRatingCountBlur = useCallback(async (master: AdminMaster, raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? 0 : Math.trunc(Number(trimmed));
    const nextCount = Number.isNaN(parsed) ? master.rating_count : Math.max(0, parsed);
    if (nextCount === master.rating_count) return;
    setRatingError(null);
    setSavingRatingFor(master.master_user_id);
    try {
      const updated = await api.updateMasterRating(master.master_user_id, master.rating, nextCount);
      setMasters((prev) => prev?.map((m) => (m.master_user_id === updated.master_user_id ? updated : m)) ?? prev);
    } catch {
      setRatingError("Не удалось сохранить оценку — попробуйте ещё раз");
    } finally {
      setSavingRatingFor(null);
    }
  }, []);

  const handleDeleteMaster = useCallback(async (master: AdminMaster) => {
    setDeleteError(null);
    setDeletingFor(master.master_user_id);
    try {
      await api.deleteMaster(master.master_user_id);
      setMasters((prev) => prev?.filter((m) => m.master_user_id !== master.master_user_id) ?? prev);
      setConfirmDeleteFor(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(`${master.name}: есть бронирования — сначала перенесите или отмените их`);
      } else {
        setDeleteError("Не удалось удалить мастера — попробуйте ещё раз");
      }
    } finally {
      setDeletingFor(null);
    }
  }, []);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Админ-панель</h1>
        <Button variant="secondary" onClick={onLogout}>
          Выйти
        </Button>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Мастера</h2>
        {loadError && <p className="mb-3 text-sm text-danger">{loadError}</p>}
        {masters === null && !loadError && <Centered>Загрузка…</Centered>}
        {masters !== null && masters.length === 0 && <p className="text-sm text-ink/60">Мастеров пока нет</p>}
        {masters !== null && masters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink/60">
                  <th className="py-2 pr-3 font-normal">Имя</th>
                  <th className="py-2 pr-3 font-normal">Email</th>
                  <th className="py-2 pr-3 font-normal">Буфер выезда</th>
                  <th className="py-2 pr-3 font-normal">Рейтинг</th>
                  <th className="py-2 pr-3 font-normal">Telegram</th>
                  <th className="py-2 pr-3 font-normal">&nbsp;</th>
                  <th className="py-2 font-normal">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {masters.map((m) => (
                  <tr key={m.master_user_id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{m.name}</td>
                    <td className="py-2 pr-3">{m.email}</td>
                    <td className="py-2 pr-3">{m.travel_buffer_minutes} мин</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <input
                          key={`${m.master_user_id}-rating-${m.rating ?? "empty"}`}
                          type="number"
                          min={0}
                          max={5}
                          step="0.1"
                          aria-label={`Рейтинг — ${m.name}`}
                          defaultValue={m.rating ?? ""}
                          placeholder="—"
                          disabled={savingRatingFor === m.master_user_id}
                          onBlur={(e) => handleRatingBlur(m, e.target.value)}
                          className="w-16 rounded-md border border-line bg-bg px-2 py-1 text-ink"
                        />
                        <span className="text-ink/40">/</span>
                        <input
                          key={`${m.master_user_id}-count-${m.rating_count}`}
                          type="number"
                          min={0}
                          step="1"
                          aria-label={`Число оценок — ${m.name}`}
                          defaultValue={m.rating_count}
                          disabled={savingRatingFor === m.master_user_id}
                          onBlur={(e) => handleRatingCountBlur(m, e.target.value)}
                          className="w-16 rounded-md border border-line bg-bg px-2 py-1 text-ink"
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-3">{m.telegram_linked ? "привязан" : "не привязан"}</td>
                    <td className="py-2">
                      {!m.telegram_linked &&
                        (linkByMaster[m.master_user_id] ? (
                          <a
                            href={linkByMaster[m.master_user_id]}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                          >
                            открыть ссылку
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGetTelegramLink(m.master_user_id)}
                            className="text-accent underline"
                          >
                            получить ссылку
                          </button>
                        ))}
                    </td>
                    <td className="py-2">
                      {confirmDeleteFor === m.master_user_id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteMaster(m)}
                            disabled={deletingFor === m.master_user_id}
                            className="text-danger underline"
                          >
                            {deletingFor === m.master_user_id ? "Удаляем…" : "Да, удалить"}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteFor(null)} className="text-ink/60 underline">
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFor(m.master_user_id)}
                          className="text-danger underline"
                        >
                          Удалить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {linkError && <p className="mt-2 text-sm text-danger">{linkError}</p>}
        {ratingError && <p className="mt-2 text-sm text-danger">{ratingError}</p>}
        {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
      </Card>

      <CreateMasterForm onCreated={load} />
    </div>
  );
}

function CreateMasterForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [travelBufferMinutes, setTravelBufferMinutes] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);
      setSubmitting(true);
      try {
        await api.createMaster({
          name,
          email,
          password,
          travel_buffer_minutes: Number(travelBufferMinutes) || 0,
        });
        setName("");
        setEmail("");
        setPassword("");
        setTravelBufferMinutes("30");
        setSuccess(true);
        onCreated();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("Мастер с таким email уже существует");
        } else if (err instanceof ApiError && err.status === 422) {
          setError("Проверьте поля — пароль должен быть не короче 8 символов");
        } else {
          setError("Не удалось создать мастера, попробуйте ещё раз");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [name, email, password, travelBufferMinutes, onCreated],
  );

  return (
    <Card>
      <h2 className="mb-3 text-lg font-medium">Создать мастера</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          placeholder="Имя (как будет видно клиентам)"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          required
          autoComplete="off"
          placeholder="Email для входа в личный кабинет"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          value={password}
          onChange={setPassword}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Пароль (минимум 8 символов)"
          className={passwordClass}
          showLabel="Показать пароль"
          hideLabel="Скрыть пароль"
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          Буфер на дорогу между заказами (мин)
          <input
            type="number"
            min={0}
            className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-ink"
            value={travelBufferMinutes}
            onChange={(e) => setTravelBufferMinutes(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        {success && <p className="text-sm text-accent-2">Мастер создан. Не забудьте выдать ему email и пароль.</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Создаём…" : "Создать мастера"}
        </Button>
      </form>
    </Card>
  );
}
