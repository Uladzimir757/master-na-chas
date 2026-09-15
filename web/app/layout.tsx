import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/LocaleContext";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";

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
  // PWA installability. Placeholder-brand build: manifest name/short_name
  // and the icon set (public/icons/) use a neutral "ZR" monogram pending
  // the brand-naming decision (see project memory) — swap both together
  // once a name is picked, nothing else here needs to change.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZR",
  },
};

export const viewport: Viewport = {
  themeColor: "#C97A2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <LocaleProvider>
          {children}
          <InstallPrompt />
        </LocaleProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
