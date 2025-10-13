import { SILVER, GOLD, BRONZE } from "@/services/class/helpers/class-helpers";
import { WinnerLite } from "@/services/class/types/class-types";
import { OnePlace } from "./OnePlace";

export type PodiumProps = {
  title: string;
  left?: WinnerLite; // 2nd place
  center?: WinnerLite; // 1st place
  right?: WinnerLite; // 3rd place
  badgeIcon?: React.ReactNode;
};

export default function PodiumCard({
  title,
  left,
  center,
  right,
  badgeIcon,
}: PodiumProps) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </h3>
        {badgeIcon}
      </div>

      {/* LTR podium, centered, equal baseline */}
      <div className="grid grid-cols-3 items-end justify-items-center gap-1">
        <OnePlace
          winner={left}
          size={80}
          medalEmoji="🥈"
          borderColor={SILVER}
        />
        <OnePlace
          winner={center}
          size={100}
          medalEmoji="🥇"
          borderColor={GOLD}
          crown
        />
        <OnePlace
          winner={right}
          size={70}
          medalEmoji="🥉"
          borderColor={BRONZE}
        />
      </div>
    </div>
  );
}
