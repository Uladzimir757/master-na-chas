import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/lib/LocaleContext";

// Static build-time defaults (Polish — the default locale, see
// lib/locale.ts's DEFAULT_LOCALE) — a static export has no per-request
// server to resolve these per visitor. LocaleProvider overrides
// <html lang> client-side once the real locale resolves; <title> stays as
// shipped (search engines/link-preview crawlers see this default).
export const metadata: Metadata = {
  title: "Złota Rączka — rezerwacja",
  description: "Rezerwacja online usług fachowca — terminy w czasie rzeczywistym",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
