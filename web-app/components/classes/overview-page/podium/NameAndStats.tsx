import { CAPTION_H } from "@/services/class/helpers/class-helpers";

export function NameAndStats({
  displayName,
  rightText,
  subText,
}: {
  displayName: string;
  rightText: string;
  subText?: string;
}) {
  return (
    <div className={`min-w-0 text-center ${CAPTION_H} overflow-hidden`}>
      <div
        className="mx-auto text-sm font-medium text-[var(--color-text-primary)] leading-snug"
        style={{
          maxWidth: "11rem",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={displayName}
      >
        {displayName}
      </div>
      <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
        <span>{rightText}</span>
        {subText ? <span className="ml-1 opacity-80">• {subText}</span> : null}
      </div>
    </div>
  );
}
