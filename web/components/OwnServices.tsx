"use client";

/**
 * Свои услуги мастера (вкладка «Moje usługi» в CabinetDashboard): правка
 * названия/категории и удаление прямо в строке услуги, форма новой услуги и
 * список убранных стандартных услуг с возвратом. Стандартные услуги каталога
 * у мастера есть всегда; переименование стандартной создаёт его собственную
 * копию, удаление — только убирает из его списка (app/main.py,
 * update_my_service / delete_my_service). Каждое действие возвращает
 * обновлённый список, который уходит наверх через onUpdated.
 */

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type RemovedService,
  type ServiceCategory,
  type ServiceToggle,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { Translations } from "@/lib/i18n";
import { CompactButton, inputClass } from "@/components/ui";

const CATEGORIES: ServiceCategory[] = [
  "assembly",
  "electric",
  "plumbing",
  "repair",
  "other",
];

function categoryLabel(c: ServiceCategory, t: Translations): string {
  return {
    electric: t.catElectric,
    plumbing: t.catPlumbing,
    assembly: t.catAssembly,
    repair: t.catRepair,
    other: t.catOther,
  }[c];
}

function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: ServiceCategory;
  onChange: (c: ServiceCategory) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ServiceCategory)}
      className={inputClass}
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {categoryLabel(c, t)}
        </option>
      ))}
    </select>
  );
}

type Updated = (services: ServiceToggle[]) => void;

/** «Edytuj» / «Usuń» справа от названия услуги + форма правки под ней. */
export function ServiceRowActions({
  svc,
  disabled,
  onUpdated,
}: {
  svc: ServiceToggle;
  disabled: boolean;
  onUpdated: Updated;
}) {
  const { t, locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(svc.name);
  const [category, setCategory] = useState<ServiceCategory>(
    svc.category ?? "other",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(
    async (action: () => Promise<ServiceToggle[]>) => {
      setBusy(true);
      setError(false);
      try {
        onUpdated(await action());
        setEditing(false);
        setConfirmDelete(false);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [onUpdated],
  );

  const off = disabled || busy;

  return (
    // editing: full row width (wraps under the name in the parent's
    // flex-wrap), otherwise a compact column of buttons on the right
    <div
      className={
        editing ? "flex w-full flex-col gap-1" : "flex flex-col items-end gap-1"
      }
    >
      {!editing && (
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            disabled={off}
            className="text-ink-2 hover:text-ink disabled:opacity-40"
            onClick={() => {
              setName(svc.name);
              setCategory(svc.category ?? "other");
              setConfirmDelete(false);
              setEditing(true);
            }}
          >
            {t.serviceEditButton}
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                disabled={off}
                className="font-medium text-danger disabled:opacity-40"
                onClick={() =>
                  void run(() => api.deleteMyService(svc.service_id, locale))
                }
              >
                {t.serviceDeleteConfirm}
              </button>
              <button
                type="button"
                disabled={off}
                className="text-ink-2 hover:text-ink"
                onClick={() => setConfirmDelete(false)}
              >
                {t.serviceCancelButton}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={off}
              className="text-ink-2 hover:text-danger disabled:opacity-40"
              onClick={() => setConfirmDelete(true)}
            >
              {t.serviceDeleteButton}
            </button>
          )}
        </div>
      )}
      {editing && (
        <form
          className="mt-2 flex w-full flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void run(() =>
              api.renameMyService(svc.service_id, name.trim(), category, locale),
            );
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            <span>{t.serviceNameLabel}</span>
            <input
              type="text"
              required
              maxLength={200}
              value={name}
              disabled={off}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            <span>{t.serviceCategoryLabel}</span>
            <CategorySelect
              value={category}
              onChange={setCategory}
              disabled={off}
            />
          </label>
          {!svc.is_custom && (
            <p className="text-xs text-ink-2">{t.serviceRenameStandardHint}</p>
          )}
          <div className="flex gap-2">
            <CompactButton type="submit" disabled={off || !name.trim()}>
              {t.serviceSaveButton}
            </CompactButton>
            <CompactButton
              type="button"
              variant="secondary"
              disabled={off}
              onClick={() => setEditing(false)}
            >
              {t.serviceCancelButton}
            </CompactButton>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-danger">{t.servicesSaveError}</p>}
    </div>
  );
}

/** Форма «Dodaj własną usługę» под списком. */
export function AddOwnService({
  disabled,
  onUpdated,
}: {
  disabled: boolean;
  onUpdated: Updated;
}) {
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("60");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const minutes = Math.round(Number(duration));
  const valid = name.trim() !== "" && Number.isFinite(minutes) && minutes > 0;
  const price = (raw: string) =>
    raw.trim() === "" || Number.isNaN(Number(raw)) ? null : Number(raw);

  return (
    <form
      className="mt-4 flex flex-col gap-2 rounded-md border border-dashed border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setError(false);
        try {
          onUpdated(
            await api.createMyService(
              {
                name: name.trim(),
                duration_minutes: minutes,
                price_min: price(priceMin),
                price_max: price(priceMax),
                category,
              },
              locale,
            ),
          );
          setName("");
          setPriceMin("");
          setPriceMax("");
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-medium">{t.serviceAddTitle}</h3>
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        <span>{t.serviceNameLabel}</span>
        <input
          type="text"
          required
          maxLength={200}
          value={name}
          disabled={disabled || busy}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          <span>{t.serviceDurationLabel}</span>
          <input
            type="number"
            required
            min={5}
            step={5}
            inputMode="numeric"
            value={duration}
            disabled={disabled || busy}
            onChange={(e) => setDuration(e.target.value)}
            className={`sm:w-28 ${inputClass}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          <span>{t.servicePriceMinLabel}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={priceMin}
            disabled={disabled || busy}
            onChange={(e) => setPriceMin(e.target.value)}
            className={`sm:w-32 ${inputClass}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          <span>{t.servicePriceMaxLabel}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={priceMax}
            disabled={disabled || busy}
            onChange={(e) => setPriceMax(e.target.value)}
            className={`sm:w-32 ${inputClass}`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-2">
        <span>{t.serviceCategoryLabel}</span>
        <CategorySelect
          value={category}
          onChange={setCategory}
          disabled={disabled || busy}
        />
      </label>
      <div>
        <CompactButton type="submit" disabled={disabled || busy || !valid}>
          {t.serviceAddButton}
        </CompactButton>
      </div>
      {error && <p className="text-sm text-danger">{t.serviceAddError}</p>}
    </form>
  );
}

/**
 * Стандартные услуги, которые мастер убрал из своего списка, — с кнопкой
 * «Przywróć». refreshKey меняется после каждого изменения списка услуг.
 */
export function RemovedServices({
  refreshKey,
  disabled,
  onUpdated,
}: {
  refreshKey: number;
  disabled: boolean;
  onUpdated: Updated;
}) {
  const { t, locale } = useLocale();
  const [removed, setRemoved] = useState<RemovedService[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listMyRemovedServices(locale)
      .then((rows) => {
        if (!cancelled) setRemoved(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale, refreshKey]);

  if (removed.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium text-ink-2">
        {t.servicesRemovedTitle}
      </h3>
      <ul className="flex flex-col gap-1">
        {removed.map((r) => (
          <li
            key={r.service_id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-ink-2">{r.name}</span>
            <CompactButton
              type="button"
              variant="secondary"
              disabled={disabled || busy}
              onClick={async () => {
                setBusy(true);
                setError(false);
                try {
                  onUpdated(await api.restoreMyService(r.service_id, locale));
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t.serviceRestoreButton}
            </CompactButton>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-sm text-danger">{t.servicesSaveError}</p>}
    </div>
  );
}
