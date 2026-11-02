"use client";

import Link from "next/link";
import BookingFlow, { BOOKING_ID } from "@/components/BookingFlow";
import Hero from "@/components/Hero";
import { HowItWorks, TrustBar } from "@/components/HomeSections";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { WrenchIcon } from "@/components/icons";
import { useLocale } from "@/lib/LocaleContext";

export default function Home() {
  const { t, ready } = useLocale();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-line-soft bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="flex min-h-10 items-center gap-2 text-lg font-bold tracking-[-0.01em]">
            <WrenchIcon className="h-6 w-6 text-accent" />
            {ready ? t.brandName : ""}
          </span>
          <LanguageSwitcher />
        </div>
      </header>

      <Hero targetId={BOOKING_ID} />
      <TrustBar />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-14 px-1 pt-4 pb-14 sm:px-0 sm:pb-20">
        <div id={BOOKING_ID} className="w-full scroll-mt-4">
          <BookingFlow />
        </div>
        <div className="w-full px-3 sm:px-6">
          <HowItWorks />
        </div>
        {ready && (
          <Link
            href="/cabinet/"
            className="flex min-h-11 items-center text-base text-ink-3 underline-offset-4 hover:text-accent-2 hover:underline"
          >
            {t.cabinetLink}
          </Link>
        )}
      </div>
    </main>
  );
}
