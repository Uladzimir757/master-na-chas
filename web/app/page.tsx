"use client";

import Link from "next/link";
import BookingFlow from "@/components/BookingFlow";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/LocaleContext";

export default function Home() {
  const { t, ready } = useLocale();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-md justify-end">
        <LanguageSwitcher />
      </div>
      <BookingFlow />
      {ready && (
        <Link href="/cabinet/" className="text-sm text-neutral-400 hover:text-neutral-700">
          {t.cabinetLink}
        </Link>
      )}
    </main>
  );
}
