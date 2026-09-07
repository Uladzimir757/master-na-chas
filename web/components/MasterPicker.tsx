"use client";

import type { Provider } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { Button, Card } from "@/components/ui";

// The home page now opens here first (this segment) — a client picks a
// master before seeing any calendar, not the other way around. Providers
// arrive already sorted by rating (best first, unrated last — see
// app/main.py's list_providers); this component renders that order as-is,
// no client-side re-sort.
//
// Full-text search ("в планах") is deliberately not built here yet — just
// this sorted list, per the request.
export default function MasterPicker({ providers, onSelect }: { providers: Provider[]; onSelect: (p: Provider) => void }) {
  const { t } = useLocale();

  return (
    <Card>
      <h1 className="mb-4 text-xl font-extrabold tracking-[-0.01em]">{t.pickMasterTitle}</h1>
      <div className="flex flex-col gap-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border border-line px-4 py-4 hover:border-accent-2"
          >
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-ink/60">
                {p.rating != null ? t.ratingValue(p.rating, p.rating_count) : t.noRatingYet}
              </div>
            </div>
            <Button onClick={() => onSelect(p)}>{t.chooseMasterButton}</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
