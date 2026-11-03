"use client";

import { useLocale } from "@/lib/LocaleContext";
import { homeCopy } from "@/lib/homeCopy";
import { CategoryIcon, IconBadge } from "@/components/icons";

interface Props {
  // The element the call-to-action scrolls to.
  targetId: string;
}

// Compact on purpose, not 100vh — masters should already be close on load on a
// booking-funnel page. Falls back to local copy until translations arrive: the
// API can take a while to wake on a cold start, and a blank hero looks broken.
export default function Hero({ targetId }: Props) {
  const { locale, t, ready } = useLocale();
  const copy = homeCopy(locale);

  const categories = [
    { id: "electric", label: t.catElectric },
    { id: "plumbing", label: t.catPlumbing },
    { id: "assembly", label: t.catAssembly },
    { id: "repair", label: t.catRepair },
  ];

  return (
    <section className="border-b border-line-soft bg-surface">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 sm:py-16 md:grid-cols-[1.4fr_1fr] md:items-center md:gap-12">
        <div>
          <p className="mb-3 text-sm font-semibold tracking-[0.08em] text-kicker uppercase">
            {copy.kicker}
          </p>
          <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-[-0.02em] sm:text-6xl">
            {ready ? t.heroTitle : copy.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
            {ready ? t.heroSubtitle : copy.heroSubtitle}
          </p>
          {/* A link, not location.hash: BookingFlow treats popstate as "step
              back", so this must not add a history entry. */}
          <a
            href={`#${targetId}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-accent px-8 text-lg font-semibold text-on-accent transition hover:bg-accent-2 sm:w-auto"
          >
            {ready ? t.pickMasterTitle : copy.cta}
          </a>
        </div>

        <ul className="grid grid-cols-4 gap-2 md:grid-cols-2 md:gap-3">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line-soft bg-surface p-2 py-3 text-center shadow-card md:p-5"
            >
              <IconBadge>
                <CategoryIcon category={c.id} />
              </IconBadge>
              <span className="min-h-5 text-xs font-medium text-ink-2 sm:text-sm">
                {ready ? c.label : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
