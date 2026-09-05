import Link from "next/link";
import BookingFlow from "@/components/BookingFlow";
import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <BookingFlow />
      <Link href="/cabinet/" className="text-sm text-neutral-400 hover:text-neutral-700">
        {t.cabinetLink}
      </Link>
    </main>
  );
}
