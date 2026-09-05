import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/LocaleContext";

// Manrope: UI text and headings — chosen for Cyrillic + Polish-diacritic
// coverage (pl/ru/uk audience, see docs/decisions.md). JetBrains Mono is used
// only for slot times and prices (components/SlotPicker.tsx), so it only
// needs the latin subset those digits render in.
const manrope = Manrope({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-manrope" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

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
    <html lang="pl" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
