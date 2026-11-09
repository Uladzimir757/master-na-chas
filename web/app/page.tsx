"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BookingFlow, { BOOKING_ID } from "@/components/BookingFlow";
import Hero from "@/components/Hero";
import { HowItWorks, TrustBar } from "@/components/HomeSections";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { WrenchIcon } from "@/components/icons";
import { useLocale } from "@/lib/LocaleContext";
import { shouldAutoOpenCabinet } from "@/lib/autoOpenCabinet";

export default function Home() {
  const { t, ready } = useLocale();
  const router = useRouter();
  const [openingCabinet, setOpeningCabinet] = useState(false);

  // A master signed in on this device lands in the cabinet, not on the
  // client's booking page.
  useEffect(() => {
    if (shouldAutoOpenCabinet()) {
      // localStorage is only readable after hydration (static export), so
      // this can't be a lazy initial state; blanks the page during the hop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpeningCabinet(true);
      router.replace("/cabinet/");
    }
  }, [router]);

  if (openingCabinet) return <main className="min-h-screen" />;

  return (
    <main className="theme-warm flex min-h-screen flex-col">
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
        {/* Above the booking flow, not below it: that flow's master/service
            lists grow with the catalog (already 25+ services, more masters
            to come) and used to push this block an unreachable scroll away. */}
        <div className="w-full px-3 sm:px-6">
          <HowItWorks />
        </div>
        <div id={BOOKING_ID} className="w-full scroll-mt-4">
          <BookingFlow />
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
