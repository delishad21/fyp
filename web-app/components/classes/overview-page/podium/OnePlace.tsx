import AvatarOrInitials from "@/components/ui/AvatarOrInitials";
import { CAPTION_H } from "@/services/class/helpers/class-helpers";
import { WinnerLite } from "@/services/class/types/class-types";
import { NameAndStats } from "./NameAndStats";

export function OnePlace({
  winner,
  size,
  crown = false,
  medalEmoji,
  borderColor,
  borderWidth = 6,
}: {
  winner?: WinnerLite;
  size: number;
  crown?: boolean;
  medalEmoji: string;
  borderColor: string;
  borderWidth?: number;
}) {
  if (!winner) {
    return (
      <div className="flex flex-col items-center justify-end gap-2 opacity-0">
        <div className="relative" style={{ height: size }}>
          <AvatarOrInitials
            name="-"
            size={size}
            borderColor={borderColor}
            borderWidth={borderWidth}
          />
        </div>
        <div className={CAPTION_H} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-end gap-2 min-w-0">
      <div className="relative" style={{ height: size }}>
        {crown && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl">
            👑
          </div>
        )}
        <AvatarOrInitials
          src={winner.photoUrl || undefined}
          name={winner.displayName}
          size={size}
          borderColor={borderColor}
          borderWidth={borderWidth}
        />
        <div className="absolute -right-2 -bottom-2 text-xl drop-shadow">
          {medalEmoji}
        </div>
      </div>

      <NameAndStats
        displayName={winner.displayName}
        rightText={winner.rightText}
        subText={winner.subText}
      />
    </div>
  );
}
