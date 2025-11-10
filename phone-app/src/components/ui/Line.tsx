import { useTheme } from "@/src/theme";
import { StyleSheet, Text, View } from "react-native";

export function Line({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[styles.lineValue, { color: valueColor || colors.textPrimary }]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "baseline",
  },
  lineLabel: { fontSize: 12, fontWeight: "800" },
  lineValue: { fontSize: 14, fontWeight: "700" },
});
