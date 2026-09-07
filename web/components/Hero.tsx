import Image from "next/image";

interface Props {
  title: string;
  subtitle: string;
}

// Fixed height, not full-bleed 100vh — services should already be visible
// on load without scrolling past a hero on a booking-funnel page.
export default function Hero({ title, subtitle }: Props) {
  return (
    <section className="relative flex h-[280px] items-end overflow-hidden sm:h-[420px]">
      <Image
        src="/images/hero-workbench.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* --ink at increasing opacity, not black — keeps the shadow warm
          instead of muddying the amber/wood tones underneath. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(32,36,43,0.55) 0%, rgba(32,36,43,0.75) 100%)" }}
      />
      <div className="relative z-10 px-4 pb-6 sm:px-6 sm:pb-10">
        <h1 className="max-w-md text-2xl font-extrabold tracking-[-0.01em] text-bg sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-md text-sm text-bg sm:text-base">{subtitle}</p>}
      </div>
    </section>
  );
}
