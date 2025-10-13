export function ScheduleTabs({
  active,
  onChange,
}: {
  active: "attempts" | "statistics";
  onChange: (t: "attempts" | "statistics") => void;
}) {
  const btn = (slug: "attempts" | "statistics", label: string) => {
    const isActive = active === slug;
    return (
      <button
        key={slug}
        onClick={() => onChange(slug)}
        className={[
          "inline-flex items-center rounded-sm px-3 py-1.5 text-md transition",
          isActive
            ? "bg-[var(--color-primary)] text-[var(--color-text-primary)]"
            : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <nav className="mb-3">
      <div className="flex flex-wrap gap-2 py-2 px-3">
        {btn("attempts", "Attempts")}
        {btn("statistics", "Statistics")}
      </div>
    </nav>
  );
}
