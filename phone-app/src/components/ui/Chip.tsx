import { useTheme } from "@/src/theme";
import { Text, View } from "react-native";

export function Chip({
  text,
  bg,
  fg,
}: {
  text: string;
  bg: string;
  fg: string;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        height: 24,
        borderRadius: tokens.radius.sm,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>
        {text}
      </Text>
    </View>
  );
}
