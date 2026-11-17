"use client";

/**
 * «O mistrzu i opinie» — the master's profile over the master list (tester
 * 17.11.2026: you could only call the master, not read about him or his
 * reviews). Photo, rating, «O mnie», price from, phone (only if he chose to
 * show it) and the reviews from completed bookings, newest first. The
 * reviewer is shown as «Jan K.», not by full name.
 */

import { useEffect, useState } from "react";
import { api, type Provider, type Review } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import MasterAvatar from "@/components/MasterAvatar";
import { StarIcon } from "@/components/icons";
import { Button } from "@/components/ui";

function shortName(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  return words.length > 1 ? `${words[0]} ${words[1][0].toUpperCase()}.` : words[0];
}

export default function MasterProfile({
  provider,
  onClose,
  onSelect,
}: {
  provider: Provider;
  onClose: () => void;
  onSelect: (p: Provider) => void;
}) {
  const { t, locale } = useLocale();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listProviderReviews(provider.id)
      .then((r) => !cancelled && setReviews(r))
      .catch(() => !cancelled && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [provider.id, onClose]);

  const tag = locale === "en" ? "en-GB" : "pl-PL";
  const ratingFmt = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-profile-name"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-card sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-4">
          <MasterAvatar name={provider.name} photo={provider.avatar} />
          <div className="min-w-0 flex-1">
            <h2 id="master-profile-name" className="text-xl font-bold">
              {provider.name}
            </h2>
            <div className="flex items-center gap-1.5 text-base text-ink-2">
              {provider.rating != null ? (
                <>
                  <StarIcon className="h-4 w-4 shrink-0 fill-current text-amber" />
                  <span className="font-semibold text-ink">{ratingFmt.format(provider.rating)}</span>
                  <span>· {t.reviewsCount(provider.rating_count)}</span>
                </>
              ) : (
                <span>{t.newMaster}</span>
              )}
            </div>
            {provider.price_from != null && (
              <div className="text-base text-ink">
                {t.pickMasterPriceFrom} {provider.price_from} zł
              </div>
            )}
            {provider.phone && (
              <a className="text-base font-semibold text-accent underline" href={`tel:${provider.phone}`}>
                {provider.phone}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.masterProfileClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl text-ink"
          >
            ✕
          </button>
        </div>

        {provider.about && (
          <section className="mb-4">
            <h3 className="mb-1 text-base font-bold">{t.masterAboutTitle}</h3>
            <p className="whitespace-pre-line text-base text-ink">{provider.about}</p>
          </section>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-base font-bold">{t.masterReviewsTitle}</h3>
          {failed && <p className="text-base text-danger">{t.masterReviewsLoadError}</p>}
          {!failed && reviews === null && <p className="text-base text-ink-2">{t.loading}</p>}
          {reviews !== null && reviews.length === 0 && <p className="text-base text-ink-2">{t.masterNoReviews}</p>}
          {reviews !== null && reviews.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {reviews.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{shortName(r.client_name)}</span>
                    <span className="text-sm text-ink-2">{dateFmt.format(new Date(r.created_at))}</span>
                  </div>
                  <div className="text-amber" aria-label={`${r.rating}/5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
                  </div>
                  {r.text && <p className="mt-1 whitespace-pre-line text-base text-ink">{r.text}</p>}
                  {r.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.photos.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs */}
                          <img src={src} alt="" className="h-20 w-20 rounded-md object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button className="w-full rounded-full" onClick={() => onSelect(provider)}>
          {t.chooseMasterButton}
        </Button>
      </div>
    </div>
  );
}
