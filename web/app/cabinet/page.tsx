"use client";

import Link from "next/link";
import Cabinet from "@/components/Cabinet";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/LocaleContext";
import { backButtonClass } from "@/components/ui";

export default function CabinetPage() {
  const { t, ready } = useLocale();

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-4 px-4 py-6">
      {/* At the top, not under the calendar: there the sticky day strip
          covered it and it couldn't be tapped (tester, 17.11.2026). */}
      <div className="flex w-full max-w-md items-center justify-between gap-3">
        {ready ? (
          <Link href="/" className={backButtonClass}>
            {t.backToBooking}
          </Link>
        ) : (
          <span />
        )}
        <LanguageSwitcher />
      </div>
      <Cabinet />
    </main>
  );
}
