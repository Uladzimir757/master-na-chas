import { formatPriceRange } from "@/lib/format";
import type { Translations } from "@/lib/i18n";

// Prices are numbers-first content (see design brief's type tokens) — set in
// JetBrains Mono, unlike the surrounding prose which stays in Manrope.
export function PriceLabel({ min, max, t }: { min: number | null; max: number | null; t: Translations }) {
  const text = formatPriceRange(min, max, t);
  return text ? <span className="font-mono">{text}</span> : null;
}
