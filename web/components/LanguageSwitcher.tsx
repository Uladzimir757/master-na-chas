"use client";

import { useLocale } from "@/lib/LocaleContext";
import { SUPPORTED_LOCALES } from "@/lib/locale";

const LABELS: Record<string, string> = { pl: "PL", en: "EN" };

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex gap-1 text-sm">
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          aria-current={code === locale}
          className={`min-h-10 min-w-10 rounded-full px-2 py-1 font-medium ${
            code === locale ? "bg-accent text-on-accent" : "text-ink-3 hover:text-accent-2"
          }`}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
