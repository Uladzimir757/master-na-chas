"use client";

/**
 * Публичная страница отзыва — ссылка из SMS, которая уходит клиенту, когда
 * мастер отмечает бронь как completed (app/main.py's _issue_review_invite).
 * Нет роутинга по /review/{bookingId}: фронтенд статически экспортируется
 * (next.config.ts output: "export"), поэтому booking_id и token читаются из
 * query-строки (?booking_id=...&token=...), не из динамического сегмента
 * пути — см. комментарий у ссылки в app/main.py.
 *
 * Токен читается вручную из window.location.search в эффекте (не
 * next/navigation's useSearchParams) по той же причине, по которой
 * lib/LocaleContext.tsx откладывает resolveLocale() до монтирования —
 * статический экспорт пререндерит первый проход без браузерного контекста.
 */

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button, Card, Centered, inputClass } from "@/components/ui";

const MAX_PHOTOS = 3;
// Backend's ReviewCreate caps each data-URL at 4_000_000 chars — stay под
// этим с запасом, а не впритык.
const MAX_PHOTO_DATA_URL_LENGTH = 3_800_000;
const MAX_PHOTO_DIMENSION = 1600;

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: "invalid" | "already" }
  | { status: "ready"; providerName: string; serviceName: string; startAt: string };

export default function ReviewPage() {
  const { t, ready } = useLocale();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("booking_id");
      const tok = params.get("token");
      setBookingId(id);
      setToken(tok);

      if (!id || !tok) {
        setState({ status: "error", message: "invalid" });
        return;
      }

      try {
        const invite = await api.getReviewInvite(id, tok);
        setState({
          status: "ready",
          providerName: invite.provider_name,
          serviceName: invite.service_name,
          startAt: invite.start_at,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setState({ status: "error", message: "already" });
        } else {
          setState({ status: "error", message: "invalid" });
        }
      }
    })();
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setPhotoError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setPhotoError(ready ? t.reviewPhotosMax : "");
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    for (const file of files) {
      try {
        const dataUrl = await compressImageToDataUrl(file);
        if (dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
          setPhotoError(ready ? t.reviewPhotoTooBig : "");
          continue;
        }
        setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, dataUrl]));
      } catch {
        setPhotoError(ready ? t.reviewPhotoTooBig : "");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!bookingId || !token) return;
    if (rating < 1) {
      setSubmitError(ready ? t.reviewRatingRequired : "");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitReview(bookingId, { token, rating, text: text.trim() || null, photos });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setState({ status: "error", message: "already" });
      } else {
        setSubmitError(ready ? t.reviewSubmitError : "");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-md justify-end">
        <LanguageSwitcher />
      </div>

      <Card>
        {state.status === "loading" && <Centered>{ready ? t.loading : ""}</Centered>}

        {state.status === "error" && (
          <Centered>{ready ? (state.message === "already" ? t.reviewAlreadySubmitted : t.reviewInviteLoadError) : ""}</Centered>
        )}

        {state.status === "ready" && !submitted && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold">{ready ? t.reviewPageTitle : ""}</h1>
              {ready && (
                <p className="mt-1 text-sm text-ink/60">
                  {t.reviewPageSubtitle(state.providerName, state.serviceName, new Date(state.startAt).toLocaleDateString())}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 text-sm font-medium">{ready ? t.reviewRatingLabel : ""}</div>
              <div className="flex gap-1" role="radiogroup" aria-label={ready ? t.reviewRatingLabel : "rating"}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    onClick={() => setRating(n)}
                    className={`text-3xl leading-none ${n <= rating ? "text-accent" : "text-ink/20"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className={inputClass}
              rows={4}
              placeholder={ready ? t.reviewTextPlaceholder : ""}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
            />

            <div>
              <div className="mb-1 text-sm font-medium">{ready ? t.reviewPhotosLabel : ""}</div>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs, not a next/image candidate */}
                    <img src={photo} alt="" className="h-20 w-20 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -right-1 -top-1 rounded-full bg-ink px-1.5 text-xs text-bg"
                      aria-label={ready ? t.reviewRemovePhoto : "remove"}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-line text-2xl text-ink/40"
                  >
                    +
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {photoError && <p className="mt-1 text-sm text-red-600">{photoError}</p>}
            </div>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <Button onClick={handleSubmit} disabled={submitting}>
              {ready ? (submitting ? t.reviewSubmitting : t.reviewSubmitButton) : ""}
            </Button>
          </div>
        )}

        {state.status === "ready" && submitted && <Centered>{ready ? t.reviewThankYou : ""}</Centered>}
      </Card>
    </main>
  );
}
