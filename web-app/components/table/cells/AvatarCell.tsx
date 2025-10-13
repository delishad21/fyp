// components/table/cells/AvatarCell.tsx
"use client";

import { useState } from "react";

type Props = {
  variant: "avatar";
  data: { src?: string; name?: string; size?: number };
};

export default function AvatarCell({ data }: Props) {
  const { src, name, size = 36 } = data;
  const [err, setErr] = useState(false);

  const initials =
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div
      className="grid place-items-center rounded-full bg-[var(--color-bg4)] ring-1 ring-black/10"
      style={{ width: size, height: size }}
      title={name}
    >
      {!err && src ? (
        <img
          src={src}
          alt={name ? `${name} avatar` : "avatar"}
          className="h-full w-full rounded-full object-cover"
          onError={() => setErr(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          {initials}
        </span>
      )}
    </div>
  );
}
