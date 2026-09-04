import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мастер на час — запись",
  description: "Онлайн-запись на услуги мастера — слоты в реальном времени",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
