import type { Metadata } from "next";
import "./globals.css";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t.pageTitle,
  description: t.pageDescription,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={t.htmlLang}>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
