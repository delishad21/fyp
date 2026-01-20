"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type VersionSelectorProps = {
  mode: "create" | "edit";
  versions?: number[];
  /** The version currently loaded into the form */
  currentVersion?: number;
};

export default function VersionSelector({
  mode,
  versions,
  currentVersion,
}: VersionSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // Only show in edit mode, when we actually have versions
  if (mode !== "edit" || !versions || versions.length === 0) {
    return null;
  }

  const effectiveCurrent = currentVersion ?? versions[versions.length - 1] ?? 1;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("version", next);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-sm text-[var(--color-text-primary)]">
        Select Version:
      </span>
      <select
        className="h-11 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
        value={String(effectiveCurrent)}
        onChange={handleChange}
        disabled={isPending}
      >
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-xs text-[var(--color-text-secondary)]">
          Loading…
        </span>
      )}
    </div>
  );
}
