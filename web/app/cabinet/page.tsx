"use client";

import Link from "next/link";
import Cabinet from "@/components/Cabinet";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/LocaleContext";

export default function CabinetPage() {
  const { t, ready } = useLocale();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-md justify-end">
        <LanguageSwitcher />
      </div>
      <Cabinet />
      {ready && (
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-700">
          {t.backToBooking}
        </Link>
      )}
    </main>
  );
}
