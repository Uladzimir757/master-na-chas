import { useId } from "react";
import type { Translations } from "@/lib/i18n";

// What the client is ordering, in plain rows — before «Potwierdź rezerwację»
// and on the «Rezerwacja utworzona» screen. Replaced one grey line
// («Jutro, 15 lis, 14:45 · Uladzimir») that testers couldn't read and that
// left out the service and the price (feedback 14.11.2026).
export function OrderSummary({
  t,
  service,
  master,
  when,
  price,
  callOutFee,
}: {
  t: Translations;
  service: string;
  master: string;
  when: React.ReactNode;
  price: string | null;
  callOutFee: number | null;
}) {
  const titleId = useId();
  const rows: [string, React.ReactNode][] = [
    [t.summaryService, service],
    [t.summaryMaster, master],
    [t.summaryWhen, when],
    [
      t.summaryPrice,
      <>
        <span className="tabular-nums">{price ?? t.priceToAgree}</span>
        {callOutFee ? (
          <span className="block text-base font-normal text-ink-2">
            {t.callOutFeeLine(callOutFee)}
          </span>
        ) : null}
      </>,
    ],
  ];
  return (
    <section aria-labelledby={titleId} className="w-full rounded-2xl border border-accent/40 bg-accent/5 p-4 text-left">
      <h2 id={titleId} className="mb-3 text-lg font-bold">{t.orderSummaryTitle}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-base text-ink-2">{label}</dt>
            <dd className="text-lg font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
