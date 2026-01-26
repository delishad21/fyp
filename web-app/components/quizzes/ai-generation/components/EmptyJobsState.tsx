import { Icon } from "@iconify/react";

export default function EmptyJobsState() {
  return (
    <div className="text-center py-8 bg-[var(--color-bg2)] rounded-lg">
      <Icon
        icon="mdi:clipboard-text-outline"
        className="w-12 h-12 mx-auto mb-2 text-[var(--color-text-tertiary)]"
      />
      <p className="text-sm text-[var(--color-text-secondary)]">
        No generation jobs yet
      </p>
    </div>
  );
}
