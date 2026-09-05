"use client";

import { useLocale } from "@/lib/LocaleContext";
import { SUPPORTED_LOCALES } from "@/lib/locale";

const LABELS: Record<string, string> = { pl: "PL", ru: "RU", uk: "UK" };

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex gap-1 text-sm">
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          aria-current={code === locale}
          className={`rounded-md px-2 py-1 ${
            code === locale ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-700"
          }`}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
