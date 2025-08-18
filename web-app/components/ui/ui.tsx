// no "use client" (server-compatible)

export function ClassBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    "4B": "bg-[#FF4D4F]",
    "3A": "bg-[#8E59FF]",
    "4C": "bg-[#2ECC71]",
  };
  const bg = map[label] ?? "bg-[var(--color-primary)]";
  return (
    <span
      className={`inline-flex items-center justify-center min-w-9 px-2 h-6 text-xs font-semibold rounded-full ${bg} text-white`}
    >
      {label}
    </span>
  );
}

export function ThinProgress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-[var(--color-bg4)] overflow-hidden">
      <div
        className="h-full rounded-full bg-[var(--color-primary)]"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--color-bg3)] rounded-lg p-4 drop-shadow-gray-500 drop-shadow-sm/45">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function Pill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full border border-[var(--color-bg4)] bg-[var(--color-bg1)] truncate max-w-full">
      {text}
    </span>
  );
}
