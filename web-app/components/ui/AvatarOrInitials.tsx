"use client";

export function nameInitials(fullName?: string) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function AvatarOrInitials({
  src,
  name,
  size = 72,
  className = "",
  borderColor,
  borderWidth = 0,
}: {
  src?: string | null;
  name: string;
  size?: number; // px
  className?: string;
  borderColor?: string; // any CSS color (e.g. "#f59e0b")
  borderWidth?: number; // px
}) {
  const initials = nameInitials(name);
  const dim = `${size}px`;

  // outer wrapper makes border consistent for both image and fallback
  return (
    <div
      className={`relative grid place-items-center rounded-full ${className}`}
      style={{
        width: dim,
        height: dim,
        border: borderWidth
          ? `${borderWidth}px solid ${borderColor ?? "transparent"}`
          : undefined,
      }}
      title={name}
    >
      {src ? (
        <>
          <img
            src={src}
            alt={name}
            width={size}
            height={size}
            className="h-full w-full rounded-full object-cover"
            onError={(e) => {
              // graceful fallback if image fails — hide img, show fallback
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = "none";
              const sib = el.nextElementSibling as HTMLElement | null;
              if (sib) sib.style.display = "flex";
            }}
          />
          {/* fallback (hidden until error) */}
          <div
            className="hidden items-center justify-center rounded-full bg-[var(--color-bg3)] text-[var(--color-text-primary)] font-semibold select-none"
            style={{ width: "100%", height: "100%" }}
          >
            <span className="text-lg">{initials}</span>
          </div>
        </>
      ) : (
        <div
          className="flex items-center justify-center rounded-full bg-[var(--color-bg3)] text-[var(--color-text-primary)] font-semibold select-none"
          style={{ width: "100%", height: "100%" }}
        >
          <span className="text-lg">{initials}</span>
        </div>
      )}
    </div>
  );
}
