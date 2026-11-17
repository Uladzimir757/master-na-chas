"use client";

/**
 * A date field whose text follows the page language. A native
 * <input type="date"> prints the date in the phone's system language — on
 * a Russian iPhone the Polish cabinet showed «19 окт. 2026 г.» (tester,
 * 17.11.2026) — and the site can't change that. So the visible text is
 * formatted here (Intl, page locale) and the native input lies on top,
 * transparent: tapping still opens the phone's own date picker.
 */

import { useLocale } from "@/lib/LocaleContext";
import { inputClass } from "@/components/ui";

export default function DateField({
  value,
  onChange,
  min,
  required,
  className = "",
  ariaLabel,
}: {
  value: string; // YYYY-MM-DD, as a native date input gives it
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { locale } = useLocale();
  const shown = value
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "—";

  return (
    <span className={`relative block ${className}`}>
      <span aria-hidden className={`${inputClass} flex items-center`}>
        {shown}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        required={required}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
