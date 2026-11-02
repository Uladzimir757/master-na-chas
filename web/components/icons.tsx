import type { ReactNode, SVGProps } from "react";

// One line-icon style for the whole public page: 24px grid, 2px rounded stroke,
// color taken from the surrounding text. Inline, so there's no icon dependency.
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Icon>
);

export const DropIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12z" />
  </Icon>
);

// A shelf on two brackets — the assembly/mounting category.
export const ShelfIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 14h18M7 14v6l3-6M17 14v6l-3-6" />
    <rect x="6" y="6" width="5" height="8" rx="1" />
    <rect x="13" y="9" width="5" height="5" rx="1" />
  </Icon>
);

export const WrenchIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.7 6.3a4 4 0 0 1 5.3-1l-3 3 1.7 1.7 3-3a4 4 0 0 1-5.5 5.3L8.5 20a2.1 2.1 0 0 1-3-3l7.7-7.7a4 4 0 0 1 1.5-3z" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Icon>
);

export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

/** Master/service category -> its icon. Unknown or missing categories get the
 * generic wrench. */
export function CategoryIcon({ category, ...p }: IconProps & { category?: string }) {
  switch (category) {
    case "electric":
      return <BoltIcon {...p} />;
    case "plumbing":
      return <DropIcon {...p} />;
    case "assembly":
      return <ShelfIcon {...p} />;
    default:
      return <WrenchIcon {...p} />;
  }
}

/** The rounded tinted square every icon on the public page sits in. */
export function IconBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg text-accent [&>svg]:h-6 [&>svg]:w-6 ${className}`}
    >
      {children}
    </span>
  );
}
