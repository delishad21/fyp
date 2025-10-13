export default function LoadingClasses() {
  return (
    <div className="px-6 py-6">
      <div className="mb-6 h-7 w-40 rounded bg-[var(--color-bg3)]" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[10rem] animate-pulse rounded-2xl bg-[var(--color-bg3)]"
          />
        ))}
      </div>
    </div>
  );
}
