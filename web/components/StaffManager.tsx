"use client";

/**
 * «Команда»: сотрудники мастера. Четыре роли — кнопки (набор прав по
 * умолчанию), под ними чекбоксы для гибкой донастройки. Владелец всегда
 * имеет все права и не редактируется (см. app/permissions.py).
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type RolesMeta, type StaffMember } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { Translations } from "@/lib/i18n";
import { CompactButton, inputClass } from "@/components/ui";

const ROLE_ORDER = ["worker_limited", "worker", "manager", "owner"] as const;

function roleLabel(t: Translations, role: string): string {
  switch (role) {
    case "worker_limited":
      return t.roleWorkerLimited;
    case "worker":
      return t.roleWorker;
    case "manager":
      return t.roleManager;
    default:
      return t.roleOwner;
  }
}

function permLabel(t: Translations, perm: string): string {
  const map: Record<string, string> = {
    calendar_view: t.permCalendarView,
    bookings_status: t.permBookingsStatus,
    bookings_create: t.permBookingsCreate,
    blocks_manage: t.permBlocksManage,
    services_edit: t.permServicesEdit,
    hours_edit: t.permHoursEdit,
    settings_edit: t.permSettingsEdit,
    analytics_view: t.permAnalyticsView,
    staff_manage: t.permStaffManage,
  };
  return map[perm] ?? perm;
}

function RoleButtons({
  value,
  onPick,
  disabled,
}: {
  value: string;
  onPick: (r: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap gap-1">
      {ROLE_ORDER.map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onPick(r)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            value === r
              ? "border-accent bg-accent text-white"
              : "border-line text-ink/70 hover:border-accent"
          }`}
        >
          {roleLabel(t, r)}
        </button>
      ))}
    </div>
  );
}

function PermChecks({
  all,
  value,
  onToggle,
  disabled,
}: {
  all: string[];
  value: string[];
  onToggle: (perm: string, on: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {all.map((p) => (
        <label key={p} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.includes(p)}
            onChange={(e) => onToggle(p, e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {permLabel(t, p)}
        </label>
      ))}
    </div>
  );
}

function StaffRow({
  member,
  meta,
  onChanged,
}: {
  member: StaffMember;
  meta: RolesMeta;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = member.role === "owner";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError && typeof err.detail === "string"
          ? err.detail
          : t.staffSaveError,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className="font-medium text-ink">
            {member.name || member.email}
          </div>
          <div className="text-xs text-ink/60">{member.email}</div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => api.deleteStaff(member.id))}
          className="text-sm text-danger hover:underline"
        >
          {t.staffDeleteButton}
        </button>
      </div>
      <RoleButtons
        value={member.role}
        disabled={busy}
        onPick={(r) =>
          r !== member.role &&
          run(() => api.updateStaff(member.id, { role: r }))
        }
      />
      <div className="mt-3">
        {isOwner ? (
          <p className="text-sm text-ink/60">{t.staffOwnerFixed}</p>
        ) : (
          <>
            <PermChecks
              all={meta.permissions}
              value={member.permissions}
              disabled={busy}
              onToggle={(perm, on) =>
                run(() =>
                  api.updateStaff(member.id, {
                    permissions: on
                      ? [...member.permissions, perm]
                      : member.permissions.filter((p) => p !== perm),
                  }),
                )
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  api.updateStaff(member.id, { reset_permissions: true }),
                )
              }
              className="mt-2 text-xs text-ink/60 underline hover:text-ink"
            >
              {t.staffResetPerms}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

const DEFAULT_ROLE = "worker";

export default function StaffManager() {
  const { t } = useLocale();
  const [meta, setMeta] = useState<RolesMeta | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(DEFAULT_ROLE);
  const [perms, setPerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([api.rolesMeta(), api.listStaff()]);
      setMeta(m);
      setStaff(s);
      // load() срабатывает один раз при монтировании — роль ещё стартовая
      setPerms(m.roles[DEFAULT_ROLE] ?? []);
    } catch {
      setError(t.staffSaveError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // новый сотрудник стартует с правами выбранной роли — их можно править
  const pickRole = (next: string) => {
    setRole(next);
    setPerms(meta?.roles[next] ?? []);
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.createStaff({
        name,
        email,
        password,
        role,
        permissions: role === "owner" ? null : perms,
      });
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError && typeof err.detail === "string"
          ? err.detail
          : t.staffSaveError,
      );
    } finally {
      setCreating(false);
    }
  };

  if (!meta)
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <p className="text-sm text-ink/60">{t.loading}</p>
    );

  return (
    <section>
      {staff.map((m) => (
        <StaffRow key={m.id} member={m} meta={meta} onChanged={load} />
      ))}

      <div className="mt-2 border-t border-line pt-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">
          {t.staffAddTitle}
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className={inputClass}
            placeholder={t.staffNameLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder={t.staffEmailLabel}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder={t.staffPasswordLabel}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="mt-3 text-xs text-ink/60">{t.staffRoleLabel}</div>
        <div className="mt-1">
          <RoleButtons value={role} onPick={pickRole} />
        </div>
        {role !== "owner" && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-ink/60">
              {t.staffPermissionsLabel}
            </div>
            <PermChecks
              all={meta.permissions}
              value={perms}
              onToggle={(p, on) =>
                setPerms((cur) =>
                  on ? [...cur, p] : cur.filter((x) => x !== p),
                )
              }
            />
          </div>
        )}
        <div className="mt-3">
          <CompactButton
            disabled={creating || !name || !email || password.length < 8}
            onClick={create}
          >
            {t.staffCreateButton}
          </CompactButton>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </section>
  );
}
