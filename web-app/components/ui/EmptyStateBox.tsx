import React from "react";

export default function EmptyStateBox({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-[var(--color-bg2)] p-5 space-y-1 shadow-md">
      <h3 className="text-md text-[var(--color-text-primary)]">{title}</h3>

      {description && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {description}
        </p>
      )}

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
