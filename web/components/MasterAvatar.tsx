import { CategoryIcon } from "@/components/icons";

// Warm avatar palette from the client redesign brief; white initials on top.
const AVATAR_COLORS = [
  "#D9825B", // terracotta
  "#7FA58F", // sage
  "#E2B04A", // mustard
  "#6B93B8", // warm blue
  "#A66A8C", // plum
  "#98A35A", // olive
];

/** Same name → same color on every visit (a stable string hash, not random). */
function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** «Jan Kowalski» → «JK»; one word: first letter + its first digit, if any
 * («Ros1» → «R1»), else its second letter («Ros» → «RO»). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0];
  const digit = w.slice(1).match(/\d/)?.[0];
  return (w[0] + (digit ?? w[1] ?? "")).toUpperCase();
}

/**
 * 56 px circle with the master's initials; a small corner badge carries the
 * icon of his main work category, so the service icon no longer stands in
 * for the master himself.
 */
export default function MasterAvatar({
  name,
  category,
}: {
  name: string;
  category?: string;
}) {
  return (
    <span className="relative inline-flex h-14 w-14 shrink-0">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold tracking-wide text-white"
        style={{ backgroundColor: colorFor(name) }}
      >
        {initials(name)}
      </span>
      {category && (
        <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-amber-soft text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">
          <CategoryIcon category={category} />
        </span>
      )}
    </span>
  );
}
