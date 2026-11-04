import type { ButtonHTMLAttributes } from "react";

/** The one card shape on the site: soft corners, light shadow. */
export const surfaceClass =
  "rounded-2xl border border-line-soft bg-surface p-5 shadow-card sm:p-6";

// `surface` puts the content on a white rounded panel; without it Card is only
// the page gutter (the cabinet and calendar use the full width).
export function Card({
  children,
  surface = false,
}: {
  children: React.ReactNode;
  surface?: boolean;
}) {
  return (
    <div className="w-full px-3 py-4 sm:px-6">
      {surface ? <div className={surfaceClass}>{children}</div> : children}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-ink-2">{children}</div>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

// One shape for every button on the site: a pill, same as the zlecai
// dispatcher, at least 48px tall so it's easy to hit on a phone. Hover is a
// flat brightness shift (no shadow/motion) — the only intentional motion
// elsewhere is the slot-chip settle animation in SlotPicker.tsx.
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-accent-2"
      : "border border-accent bg-surface text-accent hover:bg-bg";

  return (
    <button
      className={`min-h-12 rounded-full px-6 py-2 text-base font-semibold transition disabled:opacity-40 ${variantClass} ${className}`}
      {...props}
    />
  );
}

// A slightly smaller Button for tight spaces (inside a modal, next to a
// single input) — same shape/tokens as Button above, just less padding, so
// controls that sit close together (a form's submit+close row, say) don't
// force the whole modal wider than it needs to be.
export function CompactButton({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-accent text-on-accent hover:brightness-90"
      : "border border-accent bg-surface text-accent hover:bg-bg";

  return (
    <button
      className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${variantClass} ${className}`}
      {...props}
    />
  );
}

/** One shared shape for every text/number/time/tel input on the site
 * (previously duplicated ad hoc per component, with drifting radius/padding
 * — see components/AdminPanel.tsx's own local `inputClass`). */
export const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink placeholder:text-ink-3";

export interface Tab<T extends string> {
  id: T;
  label: string;
}

/** Simple tab strip — one visible section at a time instead of one long
 * scrolling page (see components/CabinetDashboard.tsx). Deliberately dumb:
 * the parent owns which tab is active and what each renders; this is just
 * the row of buttons plus the ARIA wiring. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line-soft bg-surface p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            active === tab.id
              ? "bg-accent text-on-accent"
              : "text-ink-2 hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
