import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { hexToRgba } from "@/src/lib/color-utils";
import { StyleSheet, Text, View } from "react-native";
import { Chip } from "./Chip";

export function OptionRow({
  label,
  isSelected,
  isCorrect,
  answersAvailable,
}: {
  label: string;
  isSelected: boolean;
  isCorrect: boolean;
  answersAvailable: boolean;
}) {
  const { colors } = useTheme();
  const chips: Array<{ text: string; bg: string; fg: string }> = [];

  let rowBorder = colors.bg3;
  let rowBg = colors.bg2;
  if (answersAvailable) {
    if (isCorrect && isSelected) {
      rowBorder = googlePalette.green;
      rowBg = hexToRgba(googlePalette.green, 0.12);
      chips.push({ text: "Correct", bg: googlePalette.green, fg: "#fff" });
      chips.push({ text: "Your answer", bg: googlePalette.blue, fg: "#fff" });
    } else if (isCorrect && !isSelected) {
      rowBorder = googlePalette.green;
      rowBg = colors.bg2;
      chips.push({
        text: "Correct answer",
        bg: googlePalette.green,
        fg: "#fff",
      });
    } else if (!isCorrect && isSelected) {
      rowBorder = googlePalette.red;
      rowBg = hexToRgba(googlePalette.red, 0.1);
      chips.push({ text: "Your answer", bg: googlePalette.red, fg: "#fff" });
    }
  } else if (isSelected) {
    rowBorder = googlePalette.blue;
    rowBg = hexToRgba(googlePalette.blue, 0.1);
    chips.push({ text: "Selected", bg: googlePalette.blue, fg: "#fff" });
  }

  return (
    <View
      style={[
        styles.optRow,
        {
          backgroundColor: rowBg,
          borderColor: rowBorder,
          borderWidth: 2,
        },
      ]}
    >
      <Text style={[styles.optText, { color: colors.textPrimary }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {chips.map((c, i) => (
          <Chip key={i} text={c.text} bg={c.bg} fg={c.fg} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  optRow: {
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  optText: { fontSize: 15, fontWeight: "800" },
});
