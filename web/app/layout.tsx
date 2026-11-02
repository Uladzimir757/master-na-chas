import type { Metadata, Viewport } from "next";
import { Manrope, Work_Sans } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/LocaleContext";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";

// Work Sans: all UI text and headings, same body font as the zlecai
// dispatcher. It has no Cyrillic, and the admin panel and some master names
// do — Manrope's Cyrillic subset covers just those glyphs (unicode-range, so
// Latin-only pages never download it). adjustFontFallback is off because that
// fallback is a metrics-tuned Arial, which would claim the Cyrillic first.
const workSans = Work_Sans({
  subsets: ["latin", "latin-ext"],
  adjustFontFallback: false,
  variable: "--font-work-sans",
});
const manrope = Manrope({
  subsets: ["cyrillic"],
  preload: false,
  variable: "--font-manrope",
});

// Static build-time defaults (Polish — the default locale, see
// lib/locale.ts's DEFAULT_LOCALE) — a static export has no per-request
// server to resolve these per visitor. LocaleProvider overrides
// <html lang> client-side once the real locale resolves; <title> stays as
// shipped (search engines/link-preview crawlers see this default).
export const metadata: Metadata = {
  title: "Złota Rączka — rezerwacja",
  description:
    "Rezerwacja online usług fachowca — terminy w czasie rzeczywistym",
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
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZR",
  },
  // Next.js's appleWebApp.capable only emits the modern unprefixed
  // "mobile-web-app-capable" tag — Safari didn't honor that one until
  // iOS 17.4 (WebKit release notes). Without the legacy Apple-prefixed
  // tag too, "Dodaj do ekranu głównego" on an older iPhone opens the site
  // back in Safari chrome (address bar and all) instead of standalone,
  // silently defeating the whole point of installing it.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#3F7F72",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className={`${workSans.variable} ${manrope.variable}`}>
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
