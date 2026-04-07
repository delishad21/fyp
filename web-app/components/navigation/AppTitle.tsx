/**
 *   - Displays the application title with an icon/avatar placeholder.
 *   - Provides a consistent header element for dashboards or app layouts.
 */
import Image from "next/image";

export function AppTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        "flex items-center h-16",
        compact ? "justify-center" : "gap-3",
      ].join(" ")}
    >
      <div className="relative w-13 h-13 shrink-0">
        <Image
          src="/images/ember-logo.png"
          alt="Ember logo"
          fill
          className="object-contain"
          sizes="52px"
        />
      </div>
      {!compact && (
        <div>
          <div className="font-bold text-2xl whitespace-nowrap">
            Ember
          </div>
          <div className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
            Teacher’s Dashboard
          </div>
        </div>
      )}
    </div>
  );
}
