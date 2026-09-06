"use client";

import Link from "next/link";
import AdminPanel from "@/components/AdminPanel";

export default function AdminPage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-4 px-4 py-10">
      <AdminPanel />
      <Link href="/" className="text-sm text-ink/40 hover:text-ink">
        На главную
      </Link>
    </main>
  );
}
