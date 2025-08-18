export function AppTitle() {
  return (
    <div className=" flex items-center gap-3 h-16">
      <div className="w-13 h-13 rounded-full bg-[var(--color-primary)]" />
      <div>
        <div className="font-bold text-2xl">&lt;App Name&gt;</div>
        <div className="text-sm text-[var(--color-text-secondary)]">
          Teacher’s Dashboard
        </div>
      </div>
    </div>
  );
}
