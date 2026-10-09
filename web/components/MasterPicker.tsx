"use client";

import { useMemo, useState } from "react";
import type { Provider } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Button, Card } from "@/components/ui";

// Список приходит отсортированным по рейтингу (app/main.py list_providers);
// здесь поиск по имени, фильтр по категории работ и смена сортировки —
// всё на клиенте, мастеров немного.
type SortMode = "rating" | "price" | "name";

export default function MasterPicker({
  providers,
  onSelect,
}: {
  providers: Provider[];
  onSelect: (p: Provider) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("rating");

  const catLabel = (c: string) =>
    ({
      electric: t.catElectric,
      plumbing: t.catPlumbing,
      assembly: t.catAssembly,
      repair: t.catRepair,
    })[c] ?? t.catOther;

  const allCategories = useMemo(
    () =>
      Array.from(new Set(providers.flatMap((p) => p.categories ?? []))).sort(),
    [providers],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = providers.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (!category || (p.categories ?? []).includes(category)),
    );
    const byRating = (a: Provider, b: Provider) =>
      (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "price")
      list.sort(
        (a, b) =>
          (a.price_from ?? Infinity) - (b.price_from ?? Infinity) ||
          byRating(a, b),
      );
    else list.sort(byRating);
    return list;
  }, [providers, query, category, sort]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${
      active
        ? "border-accent bg-accent text-white"
        : "border-line text-ink/70 hover:border-accent"
    }`;

  return (
    <Card>
      <h1 className="mb-4 text-xl font-extrabold tracking-[-0.01em]">
        {t.pickMasterTitle}
      </h1>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.pickMasterSearch}
          className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink/40"
        />
        <select
          aria-label={t.pickMasterSortLabel}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink"
        >
          <option value="rating">{t.pickMasterSortRating}</option>
          <option value="price">{t.pickMasterSortPrice}</option>
          <option value="name">{t.pickMasterSortName}</option>
        </select>
      </div>

      {allCategories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chip(category === null)}
            onClick={() => setCategory(null)}
          >
            {t.pickMasterAllCategories}
          </button>
          {allCategories.map((c) => (
            <button
              key={c}
              type="button"
              className={chip(category === c)}
              onClick={() => setCategory(c)}
            >
              {catLabel(c)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {shown.length === 0 && (
          <p className="text-sm text-ink/60">{t.pickMasterNone}</p>
        )}
        {shown.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border border-line px-4 py-4 hover:border-accent-2"
          >
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-ink/60">
                {p.rating != null
                  ? t.ratingValue(p.rating, p.rating_count)
                  : t.noRatingYet}
                {p.price_from != null &&
                  ` · ${t.pickMasterPriceFrom} ${p.price_from} zł`}
              </div>
            </div>
            <Button onClick={() => onSelect(p)}>{t.chooseMasterButton}</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
