import { useTheme } from "@/src/theme";
import { Text, View } from "react-native";

export function SectionHeader({
  title,
  accentColor,
}: {
  title: string;
  accentColor?: string;
}) {
  const { colors } = useTheme();
  const accent = accentColor || colors.primary;
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <View
        style={{
          width: 4,
          height: 16,
          borderRadius: 2,
          backgroundColor: accent,
        }}
      />
      <Text
        style={{
          color: colors.textSecondary,
          fontWeight: "900",
          fontSize: 13,
          letterSpacing: 0.3,
        }}
      >
        {title.toUpperCase()}
      </Text>
    </View>
  );
}
