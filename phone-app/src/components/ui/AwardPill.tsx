import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { Text, View } from "react-native";
import { Iconify } from "react-native-iconify";

export function AwardPill({
  awarded,
  max,
}: {
  awarded?: number;
  max?: number;
}) {
  const { colors, tokens } = useTheme();
  if (typeof awarded !== "number" || typeof max !== "number") return null;

  const full = awarded >= max && max > 0;
  const partial = awarded > 0 && awarded < max;
  const bg = full
    ? googlePalette.green
    : partial
      ? googlePalette.blue
      : googlePalette.red;
  const fg = "#fff";

  return (
    <View
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: tokens.radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: full
          ? colors.success
          : partial
            ? googlePalette.blue
            : colors.error,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
      }}
    >
      {full ? (
        <Iconify icon="mingcute:check-circle-fill" size={16} color={fg} />
      ) : partial ? (
        <Iconify icon="mingcute:time-fill" size={16} color={fg} />
      ) : (
        <Iconify icon="mingcute:close-circle-fill" size={16} color={fg} />
      )}
      <Text
        style={{
          color: fg,
          fontSize: 19,
          fontWeight: "900",
          lineHeight: 22,
        }}
      >
        {awarded}/{max}
      </Text>
    </View>
  );
}
