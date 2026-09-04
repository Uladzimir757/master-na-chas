export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 sm:p-6">
      {children}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-neutral-500">{children}</div>;
}
