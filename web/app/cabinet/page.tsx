import Link from "next/link";
import Cabinet from "@/components/Cabinet";
import { t } from "@/lib/i18n";

export default function CabinetPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <Cabinet />
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-700">
        {t.backToBooking}
      </Link>
    </main>
  );
}
