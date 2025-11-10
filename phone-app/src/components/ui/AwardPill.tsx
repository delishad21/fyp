import { useTheme } from "@/src/theme";
import { Chip } from "./Chip";

export function AwardPill({
  awarded,
  max,
}: {
  awarded?: number;
  max?: number;
}) {
  const { colors } = useTheme();
  if (typeof awarded !== "number" || typeof max !== "number") return null;

  const full = awarded >= max && max > 0;
  const partial = awarded > 0 && awarded < max;

  const bg = full ? colors.success : partial ? colors.warning : colors.error;
  return <Chip text={`${awarded}/${max}`} bg={bg} fg="#fff" />;
}
