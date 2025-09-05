import React from "react";

export default function Renderer() {
  return (
    <div className="lg:col-span-4">
      <div className="sticky top-6 h-[520px] rounded-xl border border-[var(--color-bg3)] bg-[var(--color-bg2)] p-4 text-sm text-[var(--color-text-secondary)]">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-[var(--color-text-primary)]">
            Preview
          </span>
          <span className="text-xs opacity-70">renderer stub</span>
        </div>
        <div className="grid h-[calc(100%-2rem)] place-items-center rounded-lg border border-[var(--color-bg3)] bg-[var(--color-bg1)]">
          preview component goes here.
        </div>
      </div>
    </div>
  );
}
