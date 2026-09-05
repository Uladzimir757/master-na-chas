"use client";

import Link from "next/link";
import BookingFlow from "@/components/BookingFlow";
import Hero from "@/components/Hero";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/LocaleContext";

export default function Home() {
  const { t, ready } = useLocale();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-6">
        <span className="font-extrabold tracking-[-0.01em]">{ready ? t.brandName : ""}</span>
        <LanguageSwitcher />
      </header>

      <Hero title={ready ? t.heroTitle : ""} subtitle={ready ? t.heroSubtitle : ""} />

      <div className="flex flex-1 flex-col items-center gap-16 px-4 py-16 sm:px-6">
        <BookingFlow />
        {ready && (
          <Link href="/cabinet/" className="text-sm text-ink/50 hover:text-accent-2">
            {t.cabinetLink}
          </Link>
        )}
      </div>
    </main>
  );
}
