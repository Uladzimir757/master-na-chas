import type { ButtonHTMLAttributes } from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-full px-3 py-4 sm:px-6">{children}</div>;
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-ink/60">{children}</div>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

// One shape for every button on the site: 6px radius, no pill effect. Hover
// is a flat brightness shift (no shadow/motion) — the only intentional
// motion elsewhere is the slot-chip settle animation in SlotPicker.tsx.
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-accent text-bg hover:brightness-90"
      : "border border-ink bg-transparent text-ink hover:brightness-90";

  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${variantClass} ${className}`}
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
      ? "bg-accent text-bg hover:brightness-90"
      : "border border-ink bg-transparent text-ink hover:brightness-90";

  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${variantClass} ${className}`}
      {...props}
    />
  );
}

/** One shared shape for every text/number/time/tel input on the site
 * (previously duplicated ad hoc per component, with drifting radius/padding
 * — see components/AdminPanel.tsx's own local `inputClass`). */
export const inputClass =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink/40";

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
      className="mb-5 flex flex-wrap gap-1 rounded-md border border-line bg-line/20 p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            active === tab.id
              ? "bg-bg text-ink shadow-sm"
              : "text-ink/60 hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
