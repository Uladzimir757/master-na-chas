"use client";

import { useMemo, useState } from "react";
import type { Provider } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Button, Card, inputClass } from "@/components/ui";
import { StarIcon } from "@/components/icons";
import MasterAvatar from "@/components/MasterAvatar";

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
  const { t, locale } = useLocale();
  const ratingFmt = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
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
    `min-h-11 rounded-full border px-4 py-1.5 text-base transition ${
      active
        ? "border-accent bg-accent text-on-accent"
        : "border-line bg-surface text-ink-2 hover:border-accent"
    }`;

  return (
    <Card>
      <h1 className="mb-5 text-[1.75rem] leading-tight font-extrabold tracking-[-0.015em] sm:text-4xl">
        {t.pickMasterTitle}
      </h1>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.pickMasterSearch}
          className={inputClass}
        />
        <select
          aria-label={t.pickMasterSortLabel}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="min-h-12 rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink"
        >
          <option value="rating">{t.pickMasterSortRating}</option>
          <option value="price">{t.pickMasterSortPrice}</option>
          <option value="name">{t.pickMasterSortName}</option>
        </select>
      </div>

      {allCategories.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
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

      <div className="flex flex-col gap-3">
        {shown.length === 0 && (
          <p className="text-base text-ink-2">{t.pickMasterNone}</p>
        )}
        {shown.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(43_38_34/0.06),0_14px_32px_rgb(43_38_34/0.10)] sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <MasterAvatar name={p.name} category={p.categories?.[0]} />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold">{p.name}</div>
                <div className="flex items-center gap-1.5 text-base text-ink-2">
                  {p.rating != null ? (
                    <>
                      <StarIcon className="h-4 w-4 shrink-0 fill-current text-amber" />
                      <span className="font-semibold text-ink">
                        {ratingFmt.format(p.rating)}
                      </span>
                      <span>· {t.reviewsCount(p.rating_count)}</span>
                    </>
                  ) : (
                    <span>{t.newMaster}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              {p.price_from != null && (
                <span className="rounded-full bg-amber-soft px-3 py-1 text-base font-semibold whitespace-nowrap text-ink">
                  {t.pickMasterPriceFrom} {p.price_from} zł
                </span>
              )}
              <Button
                className="min-w-32 rounded-full sm:min-w-36"
                onClick={() => onSelect(p)}
              >
                {t.chooseMasterButton}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
