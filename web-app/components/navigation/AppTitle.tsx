/**
 *   - Displays the application title with an icon/avatar placeholder.
 *   - Provides a consistent header element for dashboards or app layouts.
 */

export function AppTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        "flex items-center h-16",
        compact ? "justify-center" : "gap-3",
      ].join(" ")}
    >
      <div className="w-13 h-13 rounded-full bg-[var(--color-primary)]" />
      {!compact && (
        <div>
          <div className="font-bold text-2xl whitespace-nowrap">
            &lt;App Name&gt;
          </div>
          <div className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
            Teacher’s Dashboard
          </div>
        </div>
      )}
    </div>
  );
}
