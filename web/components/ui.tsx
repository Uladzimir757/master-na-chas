import type { ButtonHTMLAttributes } from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[90%] rounded-md border border-line bg-bg p-4 sm:p-6">
      {children}
    </div>
  );
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
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
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
