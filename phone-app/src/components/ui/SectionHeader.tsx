import { useTheme } from "@/src/theme";
import { Text, View } from "react-native";

export function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontWeight: "900",
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        {title.toUpperCase()}
      </Text>
    </View>
  );
}
