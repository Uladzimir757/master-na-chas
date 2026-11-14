"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { isValidPhone } from "@/lib/phone";
import { Button, Card, inputClass } from "@/components/ui";

// «Masz już zamówienie?» — the client without the SMS link (new phone,
// deleted the message) types the number they booked with, and the link to
// their bookings is texted to that number. Nothing is shown on screen, so a
// stranger's number opens nothing (decision 14.11.2026). The answer is the
// same whether the number has bookings or not.
export default function FindMyBookings() {
  const { t, ready } = useLocale();
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;

  const bad = phone.trim() !== "" && !isValidPhone(phone);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api.sendMyBookingsLink(phone.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? t.phoneInvalid : t.jobAnswerError);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <section aria-labelledby="find-bookings-title" className="flex flex-col gap-3">
        <h2 id="find-bookings-title" className="text-lg font-bold">
          {t.findBookingsTitle}
        </h2>
        {sent ? (
          <p className="text-base" role="status">
            {t.findBookingsSent}
          </p>
        ) : (
          <>
            <p className="text-base text-ink-2">{t.findBookingsHint}</p>
            <input
              className={inputClass}
              type="tel"
              placeholder={t.findBookingsPhonePlaceholder}
              value={phone}
              aria-invalid={bad}
              onChange={(e) => setPhone(e.target.value)}
            />
            {bad && <p className="text-sm text-danger">{t.phoneInvalid}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button disabled={phone.trim() === "" || bad || sending} onClick={() => void send()}>
              {t.findBookingsButton}
            </Button>
          </>
        )}
      </section>
    </Card>
  );
}
