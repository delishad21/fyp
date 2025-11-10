import { useTheme } from "@/src/theme";
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

  if (answersAvailable && isCorrect)
    chips.push({ text: "Correct", bg: colors.success, fg: "#fff" });
  if (isSelected) {
    chips.push({
      text: answersAvailable
        ? isCorrect
          ? "Your answer ✓"
          : "Your answer ✗"
        : "Your answer",
      bg: answersAvailable
        ? isCorrect
          ? colors.success
          : colors.error
        : colors.primary,
      fg: "#fff",
    });
  }

  return (
    <View
      style={[
        styles.optRow,
        {
          backgroundColor: colors.bg2,
          borderColor: answersAvailable
            ? isCorrect
              ? colors.success
              : isSelected
              ? colors.error
              : colors.bg3
            : isSelected
            ? colors.primary
            : colors.bg3,
          borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  optText: { fontSize: 14, fontWeight: "700" },
});
