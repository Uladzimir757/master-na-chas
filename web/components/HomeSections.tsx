"use client";

import { useLocale } from "@/lib/LocaleContext";
import { homeCopy } from "@/lib/homeCopy";
import {
  CalendarIcon,
  CheckIcon,
  IconBadge,
  StarIcon,
  UserIcon,
} from "@/components/icons";

const TRUST_ICONS = [CalendarIcon, UserIcon, StarIcon];
const STEP_ICONS = [UserIcon, CalendarIcon, CheckIcon];

export function TrustBar() {
  const { locale } = useLocale();
  const { trust } = homeCopy(locale);

  return (
    <ul className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
      {trust.map((item, i) => {
        const Glyph = TRUST_ICONS[i];
        return (
          <li key={item} className="flex items-center gap-2.5 text-base font-medium text-ink-2">
            <Glyph className="h-5 w-5 shrink-0 text-amber" />
            {item}
          </li>
        );
      })}
    </ul>
  );
}

export function HowItWorks() {
  const { locale } = useLocale();
  const { howTitle, steps } = homeCopy(locale);

  return (
    <section className="w-full">
      <h2 className="mb-6 text-[1.75rem] leading-tight font-extrabold tracking-[-0.015em] sm:text-4xl">{howTitle}</h2>
      <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
        {steps.map((step, i) => {
          const Glyph = STEP_ICONS[i];
          return (
            <li
              key={step.title}
              className="flex items-start gap-4 rounded-2xl border border-line-soft bg-surface p-5 shadow-card md:flex-col"
            >
              <IconBadge>
                <Glyph />
              </IconBadge>
              <div>
                <h3 className="text-lg font-semibold">
                  {i + 1}. {step.title}
                </h3>
                <p className="mt-1 text-base text-ink-2">{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
