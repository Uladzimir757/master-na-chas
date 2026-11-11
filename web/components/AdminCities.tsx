"use client";

/**
 * Города в суперадминке (docs/confirm-timer-travel-cities-task.md):
 * справочник городов, города при создании мастера и правка городов
 * существующего мастера. Как и вся админка — только по-русски.
 */

import { useState } from "react";
import { api, ApiError, type AdminCity, type AdminMaster } from "@/lib/api";
import { Button, Card } from "@/components/ui";

const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3";

/** Галочки городов. Выключенный город виден, только если уже отмечен. */
export function CityCheckboxes({
  cities,
  value,
  onChange,
  disabled,
}: {
  cities: AdminCity[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const shown = cities.filter((c) => c.is_active || value.includes(c.id));
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {shown.map((c) => (
        <label key={c.id} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, c.id]
                  : value.filter((id) => id !== c.id),
              )
            }
          />
          {c.name_pl}
          {!c.is_active && <span className="text-ink-3">(выкл.)</span>}
        </label>
      ))}
    </div>
  );
}

export function MasterCitiesEditor({
  master,
  cities,
  onSaved,
}: {
  master: AdminMaster;
  cities: AdminCity[];
  onSaved: (m: AdminMaster) => void;
}) {
  const [value, setValue] = useState<string[]>(master.city_ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    value.length !== master.city_ids.length ||
    value.some((id) => !master.city_ids.includes(id));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.setMasterCities(master.master_user_id, value));
    } catch {
      setError("Не удалось сохранить города");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="mb-1 text-ink-2">
        Города{master.city_ids.length === 0 && " — не выбраны, клиенты мастера не видят"}
      </div>
      <CityCheckboxes cities={cities} value={value} onChange={setValue} disabled={busy} />
      {dirty && (
        <button type="button" onClick={save} disabled={busy} className="mt-1 text-accent underline">
          {busy ? "Сохраняем…" : "Сохранить города"}
        </button>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function CityDirectory({
  cities,
  onChanged,
}: {
  cities: AdminCity[];
  onChanged: (cities: AdminCity[]) => void;
}) {
  const [slug, setSlug] = useState("");
  const [namePl, setNamePl] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (c: AdminCity) => {
    setError(null);
    try {
      const updated = await api.adminUpdateCity(c.id, { is_active: !c.is_active });
      onChanged(cities.map((x) => (x.id === c.id ? updated : x)));
    } catch {
      setError("Не удалось изменить город");
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.adminCreateCity({
        slug: slug.trim(),
        name_pl: namePl.trim(),
        name_en: nameEn.trim() || namePl.trim(),
      });
      onChanged([...cities, created]);
      setSlug("");
      setNamePl("");
      setNameEn("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Город с таким slug уже есть"
          : err instanceof ApiError && err.status === 422
            ? "Slug — только латиница в нижнем регистре, цифры и дефис"
            : "Не удалось добавить город",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-1 text-lg font-medium">Города</h2>
      <p className="mb-3 text-sm text-ink-2">
        Клиент видит город, только если он включён и в нём есть хотя бы один мастер.
      </p>
      <ul className="mb-4 flex flex-col gap-1 text-sm">
        {cities.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3">
            <span className={c.is_active ? "" : "text-ink-3"}>
              {c.name_pl}
              {c.name_en !== c.name_pl && <span className="text-ink-3"> / {c.name_en}</span>}
            </span>
            <button type="button" onClick={() => toggle(c)} className="text-accent underline">
              {c.is_active ? "выключить" : "включить"}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <input
          required
          placeholder="slug (rumia)"
          pattern="[a-z0-9-]+"
          className={inputClass}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <input
          required
          placeholder="Название (pl)"
          className={inputClass}
          value={namePl}
          onChange={(e) => setNamePl(e.target.value)}
        />
        <input
          placeholder="Название (en)"
          className={inputClass}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          Добавить
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
