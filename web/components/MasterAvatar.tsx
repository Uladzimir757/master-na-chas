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
 * 56 px circle: the master's photo if he set one in the cabinet
 * (components/MyAvatar.tsx), else his initials on a stable colour. The small
 * category badge in the corner is gone (15.11.2026: testers read it as a
 * stray LED-like icon, not as "his main trade").
 */
export default function MasterAvatar({ name, photo }: { name: string; photo?: string | null }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL, not a next/image candidate
      <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold tracking-wide text-white"
      style={{ backgroundColor: colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}
